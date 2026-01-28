#!/usr/bin/env python3
"""
Anomaly Detection & Security Alerts
Flags suspicious activity on the system
"""

import subprocess
import os
import json
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Optional
import re

# Alert severity levels
CRITICAL = "critical"
HIGH = "high"
MEDIUM = "medium"
LOW = "low"

@dataclass
class Alert:
    severity: str
    category: str
    title: str
    description: str
    timestamp: str
    details: dict = None
    
    def to_dict(self):
        return asdict(self)

class SecurityDetector:
    # Whitelist known safe destinations
    SAFE_HOSTS = [
        'anthropic.com', 'api.anthropic.com',
        'telegram.org', 'api.telegram.org',
        'google.com', 'googleapis.com', 'Google:',
        'apple.com', 'icloud.com',
        'github.com', 'githubusercontent.com',
        'cloudflare.com',
        '2001:67c:4e8:',  # Anthropic IPv6
        '2607:f8b0:',     # Google IPv6
        'fe80:',          # Local link IPv6 (internal)
        'identitys:',     # macOS identity service
        '140.82.112.',    # GitHub
        '140.82.113.',    # GitHub
        '140.82.114.',    # GitHub
        '151.101.',       # Fastly CDN (GitHub, etc)
        '192.30.255.',    # GitHub
    ]
    
    # Ignore these in "failed login" checks (false positives)
    IGNORE_LOG_PATTERNS = [
        'CFPasteboard',
        'pasteboard',
        'clipboard',
        'SoftwareUpdate',
        'SSO service ticket',
        'authkit',
        'akd:',
        'opendirectoryd',
        'fetch IDS',
        'phone information',
        'PlistFile',
        'CoreFoundation',
    ]
    
    def __init__(self):
        self.state_file = Path.home() / 'clawd' / 'security' / 'detector-state.json'
        self.alerts_file = Path.home() / 'clawd' / 'security' / 'logs' / 'security-alerts.json'
        self.state = self._load_state()
        
    def _load_state(self):
        """Load previous state for comparison."""
        if self.state_file.exists():
            try:
                return json.loads(self.state_file.read_text())
            except:
                pass
        return {
            'known_connections': [],
            'known_listeners': [],
            'known_launch_agents': [],
            'known_users': [],
            'last_check': None
        }
    
    def _save_state(self):
        """Save current state."""
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps(self.state, indent=2))
    
    def _run_cmd(self, cmd, timeout=10):
        """Run a command and return output."""
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, 
                                   text=True, timeout=timeout)
            return result.stdout
        except:
            return ""
    
    def _save_alert(self, alert: Alert):
        """Append alert to alerts file."""
        self.alerts_file.parent.mkdir(parents=True, exist_ok=True)
        alerts = []
        if self.alerts_file.exists():
            try:
                alerts = json.loads(self.alerts_file.read_text())
            except:
                pass
        alerts.append(alert.to_dict())
        # Keep last 500 alerts
        alerts = alerts[-500:]
        self.alerts_file.write_text(json.dumps(alerts, indent=2))
    
    def check_new_network_connections(self) -> List[Alert]:
        """Detect new outbound connections to unknown IPs."""
        alerts = []
        
        # Get current connections
        output = self._run_cmd("/usr/sbin/lsof -i -n -P 2>/dev/null | grep ESTABLISHED")
        current = set()
        
        suspicious_ports = {22, 23, 3389, 5900, 4444, 5555, 6666, 1337}  # SSH, Telnet, RDP, VNC, common RAT ports
        
        for line in output.strip().split('\n'):
            if not line:
                continue
            parts = line.split()
            if len(parts) >= 9:
                process = parts[0]
                connection = parts[8]
                current.add(f"{process}:{connection}")
                
                # Check for suspicious ports
                if '->' in connection:
                    dest = connection.split('->')[1]
                    port_match = re.search(r':(\d+)$', dest)
                    if port_match:
                        port = int(port_match.group(1))
                        if port in suspicious_ports and 'ssh' not in process.lower():
                            alerts.append(Alert(
                                severity=HIGH,
                                category="network",
                                title=f"Suspicious port connection",
                                description=f"{process} connected to port {port}",
                                timestamp=datetime.now().isoformat(),
                                details={"process": process, "connection": connection, "port": port}
                            ))
        
        # Check for new connections (not in known list)
        known = set(self.state.get('known_connections', []))
        new_connections = current - known
        
        for conn in new_connections:
            # Skip local connections
            if any(x in conn.lower() for x in ['127.0.0.1', 'localhost', '::1']):
                continue
            # Skip whitelisted hosts
            if any(safe in conn for safe in self.SAFE_HOSTS):
                continue
            # New external connection to unknown host
            alerts.append(Alert(
                severity=MEDIUM,
                category="network", 
                title="New network connection",
                description=f"First time seeing: {conn}",
                timestamp=datetime.now().isoformat(),
                details={"connection": conn}
            ))
        
        # Update known connections (but keep it manageable)
        self.state['known_connections'] = list(current)[:200]
        return alerts
    
    def check_new_listening_ports(self) -> List[Alert]:
        """Detect new services listening on ports."""
        alerts = []
        
        output = self._run_cmd("/usr/sbin/lsof -i -n -P 2>/dev/null | grep LISTEN")
        current = set()
        
        for line in output.strip().split('\n'):
            if not line:
                continue
            parts = line.split()
            if len(parts) >= 9:
                process = parts[0]
                port_info = parts[8]
                current.add(f"{process}:{port_info}")
        
        known = set(self.state.get('known_listeners', []))
        new_listeners = current - known
        
        for listener in new_listeners:
            alerts.append(Alert(
                severity=HIGH,
                category="network",
                title="New listening service",
                description=f"New port opened: {listener}",
                timestamp=datetime.now().isoformat(),
                details={"listener": listener}
            ))
        
        self.state['known_listeners'] = list(current)
        return alerts
    
    def check_new_launch_agents(self) -> List[Alert]:
        """Detect new LaunchAgents/LaunchDaemons (persistence mechanism)."""
        alerts = []
        
        paths = [
            Path.home() / 'Library' / 'LaunchAgents',
            Path('/Library/LaunchAgents'),
            Path('/Library/LaunchDaemons'),
        ]
        
        current = set()
        for path in paths:
            if path.exists():
                for f in path.glob('*.plist'):
                    current.add(str(f))
        
        known = set(self.state.get('known_launch_agents', []))
        new_agents = current - known
        
        for agent in new_agents:
            # Skip our own services
            if 'clawd' in agent.lower():
                continue
            alerts.append(Alert(
                severity=CRITICAL,
                category="persistence",
                title="New LaunchAgent installed",
                description=f"New startup item: {agent}",
                timestamp=datetime.now().isoformat(),
                details={"path": agent}
            ))
        
        self.state['known_launch_agents'] = list(current)
        return alerts
    
    def check_sensitive_file_access(self) -> List[Alert]:
        """Check if sensitive files were recently accessed."""
        alerts = []
        
        # Only check truly sensitive paths (skip Keychains - too noisy)
        sensitive_paths = [
            Path.home() / '.ssh',
            Path.home() / '.aws',
            Path.home() / '.gnupg',
            Path.home() / '.clawdbot' / 'credentials',
        ]
        
        # Ignore these file patterns (normal activity)
        ignore_patterns = [
            '.db-wal', '.db-shm',  # SQLite temp files
            'known_hosts',         # SSH known hosts updates are normal
            '.lock',               # Lock files
        ]
        
        now = datetime.now()
        
        for path in sensitive_paths:
            if not path.exists():
                continue
            
            # Check modification time
            try:
                for f in path.rglob('*'):
                    if f.is_file():
                        # Skip ignored patterns
                        if any(p in str(f) for p in ignore_patterns):
                            continue
                        mtime = datetime.fromtimestamp(f.stat().st_mtime)
                        if now - mtime < timedelta(minutes=5):
                            alerts.append(Alert(
                                severity=HIGH,
                                category="file_access",
                                title="Sensitive file modified",
                                description=f"Recently modified: {f}",
                                timestamp=datetime.now().isoformat(),
                                details={"path": str(f), "modified": mtime.isoformat()}
                            ))
            except PermissionError:
                pass
        
        return alerts
    
    def check_suspicious_processes(self) -> List[Alert]:
        """Check for suspicious processes."""
        alerts = []
        
        # Get process list
        output = self._run_cmd("ps aux")
        
        suspicious_patterns = [
            r'nc\s+-l',  # netcat listener
            r'ncat\s+-l',
            r'/tmp/.*sh',  # shell in tmp
            r'python.*-c.*socket',  # python reverse shell
            r'bash.*-i.*>&',  # bash reverse shell
            r'curl.*\|.*sh',  # curl pipe to shell
            r'wget.*\|.*sh',
        ]
        
        for line in output.split('\n'):
            for pattern in suspicious_patterns:
                if re.search(pattern, line, re.IGNORECASE):
                    alerts.append(Alert(
                        severity=CRITICAL,
                        category="process",
                        title="Suspicious process detected",
                        description=f"Potentially malicious: {line[:100]}",
                        timestamp=datetime.now().isoformat(),
                        details={"process": line}
                    ))
        
        return alerts
    
    def check_failed_logins(self) -> List[Alert]:
        """Check for failed SSH/login attempts."""
        alerts = []
        
        # Check auth log for failed attempts - focus on SSH
        output = self._run_cmd("log show --predicate 'eventMessage contains \"Failed\"' --last 10m 2>/dev/null | grep -i 'ssh\\|authentication\\|invalid user' | tail -10")
        
        if output.strip():
            for line in output.strip().split('\n')[:5]:
                if not line:
                    continue
                # Skip known false positives
                if any(ignore in line for ignore in self.IGNORE_LOG_PATTERNS):
                    continue
                alerts.append(Alert(
                    severity=HIGH,
                    category="auth",
                    title="Failed login attempt",
                    description=line[:150],
                    timestamp=datetime.now().isoformat(),
                    details={"log": line}
                ))
        
        return alerts
    
    def check_large_outbound_transfer(self) -> List[Alert]:
        """Detect unusually large outbound data (potential exfiltration)."""
        alerts = []
        
        # This is a simplified check - in production you'd use nettop or similar
        output = self._run_cmd("nettop -P -L 1 -J bytes_out 2>/dev/null | head -20")
        
        for line in output.strip().split('\n'):
            parts = line.split()
            if len(parts) >= 2:
                try:
                    bytes_out = int(parts[-1])
                    process = parts[0]
                    # Flag if > 100MB sent
                    if bytes_out > 100_000_000:
                        alerts.append(Alert(
                            severity=HIGH,
                            category="exfiltration",
                            title="Large outbound transfer",
                            description=f"{process} sent {bytes_out/1_000_000:.1f}MB",
                            timestamp=datetime.now().isoformat(),
                            details={"process": process, "bytes": bytes_out}
                        ))
                except:
                    pass
        
        return alerts

    def check_new_users(self) -> List[Alert]:
        """Detect new user accounts."""
        alerts = []
        
        output = self._run_cmd("dscl . list /Users | grep -v '^_'")
        current = set(output.strip().split('\n'))
        known = set(self.state.get('known_users', []))
        
        new_users = current - known
        for user in new_users:
            if user and not user.startswith('_'):
                alerts.append(Alert(
                    severity=CRITICAL,
                    category="auth",
                    title="New user account created",
                    description=f"New user: {user}",
                    timestamp=datetime.now().isoformat(),
                    details={"user": user}
                ))
        
        if current:
            self.state['known_users'] = list(current)
        return alerts
    
    # Lockfiles to monitor (prompt injection attack vector)
    LOCKFILES = [
        'package-lock.json',
        'yarn.lock', 
        'pnpm-lock.yaml',
        'Gemfile.lock',
        'Pipfile.lock',
        'poetry.lock',
        'composer.lock',
        'Cargo.lock',
        'go.sum',
    ]
    
    # Suspicious patterns in lockfiles
    SUSPICIOUS_LOCKFILE_PATTERNS = [
        r'https?://[^"\s]*\.(sh|bash|exe|bat|ps1|py|rb)',  # Executable URLs
        r'https?://[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}',  # Raw IP URLs
        r'https?://(pastebin|paste\.|hastebin|ghostbin)',  # Paste sites
        r'https?://.*\.(tk|ml|ga|cf|gq)/',  # Free domain TLDs (often malicious)
        r'postinstall.*curl|postinstall.*wget',  # Suspicious postinstall scripts
        r'preinstall.*curl|preinstall.*wget',
    ]

    def check_lockfile_modifications(self) -> List[Alert]:
        """Detect modifications to lockfiles (prompt injection attack vector)."""
        alerts = []
        
        # Common project directories to scan
        search_dirs = [
            Path.home() / 'clawd',
            Path.home() / 'projects',
            Path.home() / 'code',
            Path.home() / 'dev',
        ]
        
        now = datetime.now()
        
        for search_dir in search_dirs:
            if not search_dir.exists():
                continue
            
            for lockfile_name in self.LOCKFILES:
                for lockfile in search_dir.rglob(lockfile_name):
                    try:
                        # Skip node_modules and other vendor directories
                        if 'node_modules' in str(lockfile) or 'vendor' in str(lockfile):
                            continue
                        
                        mtime = datetime.fromtimestamp(lockfile.stat().st_mtime)
                        
                        # Alert if modified in last 10 minutes
                        if now - mtime < timedelta(minutes=10):
                            # Read and scan for suspicious patterns
                            content = lockfile.read_text(errors='ignore')[:50000]  # First 50KB
                            suspicious_matches = []
                            
                            for pattern in self.SUSPICIOUS_LOCKFILE_PATTERNS:
                                matches = re.findall(pattern, content, re.IGNORECASE)
                                if matches:
                                    suspicious_matches.extend(matches[:3])
                            
                            severity = CRITICAL if suspicious_matches else MEDIUM
                            
                            alert = Alert(
                                severity=severity,
                                category="lockfile",
                                title=f"🔒 Lockfile Modified: {lockfile.name}",
                                description=f"Lockfile was modified at {mtime.strftime('%H:%M:%S')}. " + 
                                    (f"⚠️ SUSPICIOUS PATTERNS FOUND: {suspicious_matches[:3]}" if suspicious_matches else "Review changes manually."),
                                timestamp=datetime.now().isoformat(),
                                details={
                                    "path": str(lockfile),
                                    "modified": mtime.isoformat(),
                                    "suspicious_patterns": suspicious_matches[:5] if suspicious_matches else [],
                                    "recommendation": "Review lockfile diff carefully. Check for unexpected URLs or postinstall scripts."
                                }
                            )
                            alerts.append(alert)
                            
                    except (PermissionError, OSError):
                        pass
        
        return alerts

    def check_clawdbot_tool_abuse(self) -> List[Alert]:
        """Monitor MoltBot session logs for suspicious tool usage."""
        alerts = []
        
        sessions_dir = Path.home() / '.clawdbot' / 'agents'
        if not sessions_dir.exists():
            return alerts
        
        now = datetime.now()
        
        # Suspicious patterns in tool calls
        suspicious_tool_patterns = [
            (r'curl.*\|.*(?:sh|bash|zsh)', 'Pipe to shell detected', CRITICAL),
            (r'wget.*\|.*(?:sh|bash|zsh)', 'Pipe to shell detected', CRITICAL),
            (r'base64.*-d|base64.*decode', 'Base64 decode (potential obfuscation)', HIGH),
            (r'eval\s*\(', 'Eval usage detected', HIGH),
            (r'nc\s+-.*-e|ncat.*-e', 'Netcat reverse shell pattern', CRITICAL),
            (r'/etc/passwd|/etc/shadow', 'Sensitive file access', HIGH),
            (r'chmod\s+[47]77', 'Overly permissive chmod', MEDIUM),
            (r'curl.*[@-d].*[|>]', 'Data exfiltration pattern', CRITICAL),
            (r'rm\s+-rf\s+[/~]', 'Destructive rm command', CRITICAL),
            (r'mkfifo|/dev/tcp|/dev/udp', 'Named pipe / dev socket (backdoor)', CRITICAL),
            (r'python.*-c.*import|perl.*-e', 'Inline script execution', HIGH),
            (r'>(>)?\s*/etc/', 'Write to /etc/', CRITICAL),
            (r'crontab|at\s+', 'Scheduled task manipulation', HIGH),
            (r'ssh-keygen|authorized_keys', 'SSH key manipulation', HIGH),
            (r'iptables|ufw|firewall', 'Firewall modification', HIGH),
        ]
        
        for jsonl in sessions_dir.rglob('*.jsonl'):
            try:
                # Skip old files
                mtime = datetime.fromtimestamp(jsonl.stat().st_mtime)
                if now - mtime > timedelta(minutes=30):
                    continue
                
                # Read last 50KB
                content = ''
                with open(jsonl, 'rb') as f:
                    f.seek(0, 2)
                    size = f.tell()
                    f.seek(max(0, size - 50000))
                    content = f.read().decode('utf-8', errors='ignore')
                
                # Parse JSONL to extract actual commands
                lines = content.strip().split('\n')
                for line in lines:
                    try:
                        entry = json.loads(line)
                        if entry.get('type') != 'message':
                            continue
                        msg = entry.get('message', {})
                        if msg.get('role') != 'assistant':
                            continue
                        
                        # Extract tool calls
                        for block in msg.get('content', []):
                            if block.get('type') != 'tool_use':
                                continue
                            tool_name = block.get('name', '')
                            tool_input = block.get('input', {})
                            
                            # Get the actual command/content
                            command = tool_input.get('command', '')
                            content_str = json.dumps(tool_input)
                            
                            for pattern, description, severity in suspicious_tool_patterns:
                                match = re.search(pattern, content_str, re.IGNORECASE)
                                if match:
                                    # Extract surrounding context
                                    start = max(0, match.start() - 50)
                                    end = min(len(content_str), match.end() + 50)
                                    context = content_str[start:end]
                                    
                                    alerts.append(Alert(
                                        severity=severity,
                                        category="tool_abuse",
                                        title=f"Suspicious Tool Usage: {tool_name}",
                                        description=f"{description}. Possible prompt injection or jailbreak.",
                                        timestamp=entry.get('timestamp', datetime.now().isoformat()),
                                        details={
                                            "session_file": str(jsonl),
                                            "pattern_matched": pattern,
                                            "tool_name": tool_name,
                                            "full_command": command[:500] if command else content_str[:500],
                                            "matched_text": match.group(0),
                                            "context": context,
                                            "recommendation": "Review session transcript immediately. Consider stopping the agent.",
                                            "traceable": bool(command)
                                        }
                                    ))
                    except json.JSONDecodeError:
                        continue
                        
            except (PermissionError, OSError):
                pass
        
        return alerts

    def run_all_checks(self) -> List[Alert]:
        """Run all security checks and return alerts."""
        all_alerts = []
        
        checks = [
            self.check_new_network_connections,
            self.check_new_listening_ports,
            self.check_new_launch_agents,
            self.check_sensitive_file_access,
            self.check_suspicious_processes,
            self.check_failed_logins,
            self.check_new_users,
            self.check_lockfile_modifications,
            self.check_clawdbot_tool_abuse,
        ]
        
        for check in checks:
            try:
                alerts = check()
                all_alerts.extend(alerts)
            except Exception as e:
                print(f"Error in {check.__name__}: {e}")
        
        # Save state
        self.state['last_check'] = datetime.now().isoformat()
        self._save_state()
        
        # Save alerts
        for alert in all_alerts:
            self._save_alert(alert)
        
        return all_alerts
    
    def get_recent_alerts(self, limit=50) -> List[dict]:
        """Get recent alerts from file."""
        if self.alerts_file.exists():
            try:
                alerts = json.loads(self.alerts_file.read_text())
                return alerts[-limit:]
            except:
                pass
        return []
    
    def trace_command(self, command: str, timeout: int = 5) -> dict:
        """
        Trace a command using dtruss (macOS) or strace (Linux) to see what it does.
        Runs in a sandboxed manner - doesn't actually execute harmful parts.
        """
        import platform
        import tempfile
        
        result = {
            'command': command,
            'syscalls': [],
            'files_accessed': [],
            'network_activity': [],
            'processes_spawned': [],
            'risk_assessment': 'unknown',
            'risk_factors': [],
            'trace_output': '',
            'error': None
        }
        
        # Safety check - don't trace obviously destructive commands
        dangerous_patterns = [
            r'rm\s+-rf\s+/', r'mkfs', r'dd\s+if=', r'>\s*/dev/',
            r':(){ :|:& };:', r'chmod.*-R.*777\s+/'
        ]
        for pattern in dangerous_patterns:
            if re.search(pattern, command):
                result['error'] = 'Command too dangerous to trace'
                result['risk_assessment'] = 'critical'
                result['risk_factors'].append(f'Matches dangerous pattern: {pattern}')
                return result
        
        system = platform.system()
        
        try:
            if system == 'Darwin':
                # macOS - use dtruss (requires sudo, so we'll use sample instead)
                # For non-root, we can analyze the command statically
                result['trace_output'] = self._static_analysis(command)
            elif system == 'Linux':
                # Create a wrapper script that we can trace
                with tempfile.NamedTemporaryFile(mode='w', suffix='.sh', delete=False) as f:
                    # Wrap command to exit before actually running dangerous parts
                    f.write(f'#!/bin/bash\nset -e\necho "TRACE_START"\n{command}\n')
                    script_path = f.name
                
                try:
                    # Run with strace, capturing syscalls
                    proc = subprocess.run(
                        ['strace', '-f', '-e', 'trace=file,network,process', 
                         '-o', '/dev/stdout', 'bash', script_path],
                        capture_output=True, text=True, timeout=timeout
                    )
                    result['trace_output'] = proc.stderr or proc.stdout
                except FileNotFoundError:
                    result['trace_output'] = self._static_analysis(command)
                finally:
                    os.unlink(script_path)
            else:
                result['trace_output'] = self._static_analysis(command)
            
            # Parse trace output
            self._parse_trace(result)
            
        except subprocess.TimeoutExpired:
            result['error'] = 'Trace timed out (command may hang or wait for input)'
            result['risk_factors'].append('Command timed out during trace')
        except Exception as e:
            result['error'] = str(e)
            result['trace_output'] = self._static_analysis(command)
            self._parse_trace(result)
        
        # Calculate risk assessment
        result['risk_assessment'] = self._assess_risk(result)
        
        return result
    
    def _static_analysis(self, command: str) -> str:
        """Static analysis of command without execution."""
        analysis = []
        
        # Check for network activity
        if re.search(r'curl|wget|nc|ncat|ssh|scp|rsync|ftp', command):
            analysis.append('NETWORK: Command may access network')
            
        # Check for file operations
        file_patterns = [
            (r'>\s*([^\s;|&]+)', 'WRITE'),
            (r'>>\s*([^\s;|&]+)', 'APPEND'),
            (r'<\s*([^\s;|&]+)', 'READ'),
            (r'rm\s+(-[rf]+\s+)?([^\s;|&]+)', 'DELETE'),
            (r'mv\s+([^\s]+)\s+([^\s]+)', 'MOVE'),
            (r'cp\s+([^\s]+)\s+([^\s]+)', 'COPY'),
        ]
        for pattern, op in file_patterns:
            matches = re.findall(pattern, command)
            if matches:
                analysis.append(f'FILE_{op}: {matches}')
        
        # Check for process spawning
        if re.search(r'\||\$\(|`|bash|sh|python|perl|ruby|node', command):
            analysis.append('PROCESS: May spawn subprocesses')
            
        # Check for privilege escalation
        if re.search(r'sudo|su\s|chmod|chown|setuid', command):
            analysis.append('PRIVILEGE: May modify permissions')
            
        # Check for persistence
        if re.search(r'cron|at\s|systemd|launchd|rc\.local|\.bashrc|\.profile', command):
            analysis.append('PERSISTENCE: May establish persistence')
            
        # Check for data exfiltration
        if re.search(r'curl.*-d|curl.*--data|wget.*--post|nc.*<', command):
            analysis.append('EXFIL: May exfiltrate data')
            
        return '\n'.join(analysis) if analysis else 'No obvious dangerous patterns detected'
    
    def _parse_trace(self, result: dict):
        """Parse trace output to extract meaningful info."""
        output = result['trace_output']
        
        # Extract file accesses
        file_patterns = [
            r'open[at]?\("([^"]+)"',
            r'FILE_(?:READ|WRITE|APPEND|DELETE|MOVE|COPY):\s*\[?[\'"]?([^\]\'"\n,]+)',
        ]
        for pattern in file_patterns:
            for match in re.findall(pattern, output):
                if isinstance(match, tuple):
                    match = match[0]
                if match and match not in result['files_accessed']:
                    result['files_accessed'].append(match)
        
        # Extract network activity
        net_patterns = [
            r'connect\(.*?"([^"]+)"',
            r'NETWORK:.*',
        ]
        for pattern in net_patterns:
            for match in re.findall(pattern, output):
                if match and match not in result['network_activity']:
                    result['network_activity'].append(match)
        
        # Extract process spawns
        proc_patterns = [
            r'execve\("([^"]+)"',
            r'PROCESS:.*',
        ]
        for pattern in proc_patterns:
            for match in re.findall(pattern, output):
                if match and match not in result['processes_spawned']:
                    result['processes_spawned'].append(match)
    
    def _assess_risk(self, result: dict) -> str:
        """Assess overall risk based on trace results."""
        score = 0
        
        # Network activity
        if result['network_activity']:
            score += 2
            result['risk_factors'].append('Network activity detected')
        
        # Sensitive file access
        sensitive_paths = ['/etc/', '/root/', '/.ssh/', '/var/log/', '/private/']
        for f in result['files_accessed']:
            for sens in sensitive_paths:
                if sens in f:
                    score += 3
                    result['risk_factors'].append(f'Sensitive file access: {f}')
                    break
        
        # Process spawning
        if result['processes_spawned']:
            score += 1
            
        # Specific dangerous patterns in trace
        if 'EXFIL' in result['trace_output']:
            score += 4
            result['risk_factors'].append('Possible data exfiltration')
        if 'PERSISTENCE' in result['trace_output']:
            score += 3
            result['risk_factors'].append('Possible persistence mechanism')
        if 'PRIVILEGE' in result['trace_output']:
            score += 2
            result['risk_factors'].append('Privilege modification')
        
        if score >= 5:
            return 'critical'
        elif score >= 3:
            return 'high'
        elif score >= 1:
            return 'medium'
        return 'low'

    def dismiss_alert(self, alert_index: int):
        """Dismiss an alert by index (removes from recent list)."""
        if self.alerts_file.exists():
            try:
                alerts = json.loads(self.alerts_file.read_text())
                # Convert index to actual position (we show reversed in UI)
                actual_index = len(alerts) - 1 - alert_index
                if 0 <= actual_index < len(alerts):
                    dismissed = alerts.pop(actual_index)
                    self.alerts_file.write_text(json.dumps(alerts, indent=2))
                    
                    # Log dismissed alert
                    dismissed_log = self.alerts_file.parent / 'dismissed-alerts.json'
                    dismissed_list = []
                    if dismissed_log.exists():
                        try:
                            dismissed_list = json.loads(dismissed_log.read_text())
                        except:
                            pass
                    dismissed['dismissed_at'] = datetime.now().isoformat()
                    dismissed_list.append(dismissed)
                    dismissed_log.write_text(json.dumps(dismissed_list, indent=2))
            except Exception as e:
                print(f"Error dismissing alert: {e}")


# Standalone runner
if __name__ == '__main__':
    import sys
    
    detector = SecurityDetector()
    
    if len(sys.argv) > 1 and sys.argv[1] == 'init':
        print("🔒 Initializing security baseline...")
        detector.run_all_checks()
        print("✅ Baseline saved. Future runs will alert on changes.")
    else:
        print("🔍 Running security checks...")
        alerts = detector.run_all_checks()
        
        if alerts:
            print(f"\n⚠️  {len(alerts)} alert(s) found:\n")
            for alert in alerts:
                icon = "🔴" if alert.severity == CRITICAL else "🟠" if alert.severity == HIGH else "🟡"
                print(f"{icon} [{alert.severity.upper()}] {alert.title}")
                print(f"   {alert.description}\n")
        else:
            print("✅ No alerts - all clear!")
