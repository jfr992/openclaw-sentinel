"""
Trust & Context Engine
Differentiates legitimate agent activity from malicious actions
"""

import json
import hashlib
import re
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Set

class TrustEngine:
    """
    Manages trust levels and context for agent sessions.
    
    Trust Levels:
    - TRUSTED: Known agent session, user-initiated actions
    - VERIFIED: Agent session with context showing user requested action
    - UNVERIFIED: Agent session, but action wasn't clearly requested
    - SUSPICIOUS: Matches malicious patterns, no user context
    - MALICIOUS: Confirmed malicious (blocked threat intel, known attack)
    """
    
    TRUSTED = "trusted"
    VERIFIED = "verified" 
    UNVERIFIED = "unverified"
    SUSPICIOUS = "suspicious"
    MALICIOUS = "malicious"
    
    def __init__(self, config_dir: Path = None):
        self.config_dir = config_dir or Path.home() / '.moltbot'
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        self.trusted_sessions_file = self.config_dir / 'trusted-sessions.json'
        self.baseline_file = self.config_dir / 'behavioral-baseline.json'
        self.threat_intel_file = self.config_dir / 'threat-intel.json'
        
        self.trusted_sessions: Set[str] = set()
        self.baseline: Dict = {}
        self.threat_intel: Dict = {}
        
        self._load_data()
    
    def _load_data(self):
        """Load persisted trust data."""
        if self.trusted_sessions_file.exists():
            try:
                data = json.loads(self.trusted_sessions_file.read_text())
                self.trusted_sessions = set(data.get('sessions', []))
            except:
                pass
        
        if self.baseline_file.exists():
            try:
                self.baseline = json.loads(self.baseline_file.read_text())
            except:
                pass
                
        if self.threat_intel_file.exists():
            try:
                self.threat_intel = json.loads(self.threat_intel_file.read_text())
            except:
                pass
    
    def _save_trusted_sessions(self):
        """Persist trusted sessions."""
        self.trusted_sessions_file.write_text(json.dumps({
            'sessions': list(self.trusted_sessions),
            'updated': datetime.now().isoformat()
        }, indent=2))
    
    def trust_session(self, session_id: str):
        """Mark a session as trusted (user's agent)."""
        self.trusted_sessions.add(session_id)
        self._save_trusted_sessions()
    
    def untrust_session(self, session_id: str):
        """Remove trust from a session."""
        self.trusted_sessions.discard(session_id)
        self._save_trusted_sessions()
    
    def is_trusted_session(self, session_id: str) -> bool:
        """Check if session is explicitly trusted."""
        # Also trust partial matches (session IDs can be truncated in logs)
        for trusted in self.trusted_sessions:
            if session_id.startswith(trusted[:8]) or trusted.startswith(session_id[:8]):
                return True
        return False
    
    def analyze_context(self, session_file: Path, command: str) -> Dict:
        """
        Analyze session context to determine if action was user-requested.
        
        Returns:
            {
                'trust_level': str,
                'user_requested': bool,
                'context_messages': list,
                'reasoning': str
            }
        """
        result = {
            'trust_level': self.UNVERIFIED,
            'user_requested': False,
            'context_messages': [],
            'reasoning': ''
        }
        
        if not session_file.exists():
            result['reasoning'] = 'Session file not found'
            return result
        
        try:
            # Read last N messages from session
            messages = []
            with open(session_file, 'r') as f:
                lines = f.readlines()[-50:]  # Last 50 entries
                for line in lines:
                    try:
                        entry = json.loads(line)
                        if entry.get('type') == 'message':
                            msg = entry.get('message', {})
                            role = msg.get('role', '')
                            content = msg.get('content', '')
                            if isinstance(content, str):
                                messages.append({'role': role, 'content': content[:500]})
                            elif isinstance(content, list):
                                text = ' '.join(
                                    c.get('text', '')[:200] 
                                    for c in content 
                                    if c.get('type') == 'text'
                                )
                                messages.append({'role': role, 'content': text[:500]})
                    except:
                        continue
            
            result['context_messages'] = messages[-10:]  # Return last 10
            
            # Check if user recently requested something related to the command
            user_requested = self._check_user_request(messages, command)
            result['user_requested'] = user_requested
            
            if user_requested:
                result['trust_level'] = self.VERIFIED
                result['reasoning'] = 'User message found requesting this action'
            else:
                result['trust_level'] = self.UNVERIFIED
                result['reasoning'] = 'No clear user request found for this action'
                
        except Exception as e:
            result['reasoning'] = f'Error analyzing context: {e}'
        
        return result
    
    def _check_user_request(self, messages: List[Dict], command: str) -> bool:
        """Check if any recent user message requested this action."""
        # Keywords that might appear in user requests
        command_lower = command.lower()
        
        # Extract key terms from command
        command_terms = set(re.findall(r'\b\w{4,}\b', command_lower))
        
        # Look at recent user messages
        for msg in reversed(messages[-20:]):
            if msg.get('role') != 'user':
                continue
            
            content = msg.get('content', '').lower()
            
            # Check for explicit requests
            request_patterns = [
                r'run\s', r'execute\s', r'install\s', r'setup\s',
                r'create\s', r'build\s', r'start\s', r'download\s',
                r'please\s', r'can you\s', r'could you\s', r'would you\s',
            ]
            
            has_request = any(re.search(p, content) for p in request_patterns)
            
            # Check for term overlap
            content_terms = set(re.findall(r'\b\w{4,}\b', content))
            overlap = command_terms & content_terms
            
            if has_request and len(overlap) >= 2:
                return True
            
            # Check for very specific matches
            if any(term in content for term in ['curl', 'wget', 'npm', 'pip', 'git']):
                if any(term in command_lower for term in ['curl', 'wget', 'npm', 'pip', 'git']):
                    return True
        
        return False
    
    def evaluate_command(self, command: str, session_id: str = None, 
                         session_file: Path = None) -> Dict:
        """
        Full trust evaluation of a command.
        
        Returns:
            {
                'trust_level': str,
                'is_trusted_session': bool,
                'user_requested': bool,
                'threat_match': dict or None,
                'recommendation': str
            }
        """
        result = {
            'trust_level': self.UNVERIFIED,
            'is_trusted_session': False,
            'user_requested': False,
            'threat_match': None,
            'recommendation': ''
        }
        
        # Check trusted session
        if session_id:
            result['is_trusted_session'] = self.is_trusted_session(session_id)
        
        # Analyze the command itself for risk indicators
        risk_analysis = self.analyze_command_risk(command)
        result['risk_analysis'] = risk_analysis
        
        # Check threat intel
        threat_match = self.check_threat_intel(command)
        if threat_match:
            result['threat_match'] = threat_match
            result['trust_level'] = self.MALICIOUS
            result['recommendation'] = f"BLOCK: Matches threat intel - {threat_match.get('reason')}"
            return result
        
        # Check context if session file provided
        if session_file:
            context = self.analyze_context(session_file, command)
            result['user_requested'] = context['user_requested']
            
            if result['is_trusted_session'] and result['user_requested']:
                result['trust_level'] = self.TRUSTED
                result['recommendation'] = "ALLOW: Trusted session, user requested"
            elif result['is_trusted_session']:
                result['trust_level'] = self.VERIFIED
                result['recommendation'] = "ALLOW with logging: Trusted session, action not explicitly requested"
            elif result['user_requested']:
                result['trust_level'] = self.VERIFIED
                result['recommendation'] = "ALLOW: User requested this action"
            else:
                result['trust_level'] = self.SUSPICIOUS
                result['recommendation'] = "REVIEW: No trusted session or user request"
        else:
            # No session context - use risk analysis to provide recommendation
            if risk_analysis['risk_level'] == 'high':
                result['trust_level'] = self.SUSPICIOUS
                result['recommendation'] = f"REVIEW: {risk_analysis['summary']}"
            elif risk_analysis['risk_level'] == 'medium':
                result['trust_level'] = self.UNVERIFIED
                result['recommendation'] = f"CAUTION: {risk_analysis['summary']}"
            elif risk_analysis['risk_level'] == 'low':
                result['trust_level'] = self.VERIFIED
                result['recommendation'] = f"LIKELY SAFE: {risk_analysis['summary']}"
            elif risk_analysis['risk_level'] == 'minimal':
                result['trust_level'] = self.TRUSTED
                result['recommendation'] = f"SAFE: {risk_analysis['summary']}"
            else:
                result['trust_level'] = self.UNVERIFIED
                result['recommendation'] = f"UNKNOWN: {risk_analysis['summary']}"
        
        return result
    
    def analyze_command_risk(self, command: str) -> Dict:
        """Analyze a command for risk indicators without session context."""
        command_lower = command.lower().strip()
        risk_factors = []
        capabilities = []
        
        # Network-capable commands
        network_commands = {
            'telnet': ('Network connection tool', 'Can connect to remote hosts, unencrypted'),
            'nc': ('Netcat', 'Powerful network tool, can create reverse shells'),
            'ncat': ('Ncat', 'Enhanced netcat, can create reverse shells'),
            'netcat': ('Netcat', 'Powerful network tool, can create reverse shells'),
            'curl': ('HTTP client', 'Downloads content from URLs'),
            'wget': ('HTTP client', 'Downloads files from URLs'),
            'ssh': ('Secure shell', 'Remote access to systems'),
            'scp': ('Secure copy', 'Transfers files over SSH'),
            'rsync': ('Remote sync', 'Syncs files, can be remote'),
            'ftp': ('FTP client', 'Unencrypted file transfer'),
            'sftp': ('SFTP client', 'Encrypted file transfer'),
            'nmap': ('Network scanner', 'Scans networks and ports'),
            'ping': ('Network ping', 'Tests network connectivity'),
            'traceroute': ('Network trace', 'Shows network path'),
            'dig': ('DNS lookup', 'Queries DNS records'),
            'nslookup': ('DNS lookup', 'Queries DNS records'),
            'host': ('DNS lookup', 'Queries DNS records'),
        }
        
        # System modification commands
        system_commands = {
            'rm': ('Remove files', 'Deletes files/directories'),
            'dd': ('Disk dump', 'Low-level disk operations'),
            'mkfs': ('Make filesystem', 'Formats disks'),
            'fdisk': ('Disk partition', 'Modifies partitions'),
            'chmod': ('Change permissions', 'Modifies file permissions'),
            'chown': ('Change owner', 'Modifies file ownership'),
            'sudo': ('Superuser do', 'Runs with elevated privileges'),
            'su': ('Switch user', 'Changes user context'),
            'passwd': ('Change password', 'Modifies user passwords'),
            'useradd': ('Add user', 'Creates new users'),
            'userdel': ('Delete user', 'Removes users'),
            'crontab': ('Cron table', 'Schedules recurring tasks'),
            'systemctl': ('System control', 'Manages system services'),
            'service': ('Service manager', 'Controls services'),
            'kill': ('Kill process', 'Terminates processes'),
            'pkill': ('Kill by name', 'Terminates processes by name'),
        }
        
        # Shell/execution commands  
        exec_commands = {
            'bash': ('Bash shell', 'Command interpreter'),
            'sh': ('Shell', 'Command interpreter'),
            'zsh': ('Zsh shell', 'Command interpreter'),
            'python': ('Python', 'Script interpreter'),
            'python3': ('Python 3', 'Script interpreter'),
            'perl': ('Perl', 'Script interpreter'),
            'ruby': ('Ruby', 'Script interpreter'),
            'node': ('Node.js', 'JavaScript runtime'),
            'eval': ('Eval', 'Evaluates code'),
            'exec': ('Exec', 'Executes commands'),
            'source': ('Source', 'Executes script in current shell'),
        }
        
        # Safe/benign commands (read-only, informational)
        safe_commands = {
            'whoami': 'Shows current username',
            'id': 'Shows user/group IDs',
            'pwd': 'Shows current directory',
            'ls': 'Lists directory contents',
            'cat': 'Displays file contents',
            'head': 'Shows first lines of file',
            'tail': 'Shows last lines of file',
            'less': 'File pager',
            'more': 'File pager',
            'echo': 'Prints text',
            'date': 'Shows date/time',
            'cal': 'Shows calendar',
            'uptime': 'Shows system uptime',
            'uname': 'Shows system info',
            'hostname': 'Shows hostname',
            'env': 'Shows environment variables',
            'printenv': 'Shows environment variables',
            'which': 'Shows command path',
            'whereis': 'Locates command',
            'type': 'Shows command type',
            'file': 'Shows file type',
            'wc': 'Word/line count',
            'sort': 'Sorts text',
            'uniq': 'Filters duplicates',
            'grep': 'Searches text patterns',
            'find': 'Finds files',
            'locate': 'Locates files',
            'df': 'Shows disk usage',
            'du': 'Shows directory size',
            'free': 'Shows memory usage',
            'top': 'Shows processes',
            'htop': 'Shows processes (interactive)',
            'ps': 'Lists processes',
            'man': 'Shows manual pages',
            'help': 'Shows help',
            'history': 'Shows command history',
            'clear': 'Clears terminal',
            'true': 'Returns success',
            'false': 'Returns failure',
            'test': 'Evaluates conditions',
            'cd': 'Changes directory',
            'mkdir': 'Creates directory',
            'touch': 'Creates empty file',
            'cp': 'Copies files',
            'mv': 'Moves files',
        }
        
        # Extract base command
        parts = command_lower.split()
        base_cmd = parts[0] if parts else ''
        
        # Check safe commands first
        if base_cmd in safe_commands:
            return {
                'risk_level': 'minimal',
                'risk_factors': [],
                'capabilities': [f"Safe: {safe_commands[base_cmd]}"],
                'summary': safe_commands[base_cmd],
                'base_command': base_cmd
            }
        
        # Check against known commands
        if base_cmd in network_commands:
            name, desc = network_commands[base_cmd]
            capabilities.append(f"Network: {name} - {desc}")
            risk_factors.append('Network capability')
            
        if base_cmd in system_commands:
            name, desc = system_commands[base_cmd]
            capabilities.append(f"System: {name} - {desc}")
            risk_factors.append('System modification capability')
            
        if base_cmd in exec_commands:
            name, desc = exec_commands[base_cmd]
            capabilities.append(f"Execution: {name} - {desc}")
            
        # Check for dangerous patterns
        dangerous_patterns = [
            (r'\|.*sh\b', 'Pipe to shell - potential code execution'),
            (r'>\s*/dev/', 'Write to device - potential system damage'),
            (r'>\s*/etc/', 'Write to /etc - system config modification'),
            (r'rm\s+-rf\s+/', 'Recursive force delete from root'),
            (r':\(\)\{.*\}', 'Fork bomb pattern'),
            (r'base64\s+-d', 'Base64 decode - potential obfuscation'),
            (r'eval\s*\(', 'Eval with expression - code execution'),
            (r'/dev/tcp/', 'Bash TCP redirection'),
            (r'/dev/udp/', 'Bash UDP redirection'),
        ]
        
        import re
        for pattern, reason in dangerous_patterns:
            if re.search(pattern, command_lower):
                risk_factors.append(reason)
        
        # Determine risk level
        if any('shell' in f.lower() or 'fork bomb' in f.lower() or 'root' in f.lower() for f in risk_factors):
            risk_level = 'high'
        elif len(risk_factors) >= 2 or 'System modification' in str(risk_factors):
            risk_level = 'medium'
        elif risk_factors:
            risk_level = 'low'
        elif capabilities:
            risk_level = 'low'
        else:
            risk_level = 'minimal'
            
        # Generate summary
        if not capabilities and not risk_factors:
            summary = f"Command '{base_cmd}' - no specific risk indicators found"
        elif capabilities and not risk_factors:
            summary = f"{capabilities[0]}"
        elif risk_factors:
            summary = f"Risk factors: {', '.join(risk_factors[:3])}"
        else:
            summary = "Unable to determine risk profile"
            
        return {
            'risk_level': risk_level,
            'risk_factors': risk_factors,
            'capabilities': capabilities,
            'summary': summary,
            'base_command': base_cmd
        }
    
    def check_threat_intel(self, text: str) -> Optional[Dict]:
        """Check if text matches known threats."""
        text_lower = text.lower()
        
        # Built-in threat patterns
        builtin_threats = [
            {
                'pattern': r'pastebin\.com/raw/',
                'reason': 'Pastebin raw URL (common malware host)',
                'severity': 'high'
            },
            {
                'pattern': r'raw\.githubusercontent\.com.*\.sh\s*\|\s*(?:ba)?sh',
                'reason': 'GitHub raw script piped to shell',
                'severity': 'medium'
            },
            {
                'pattern': r'(?:[\d]{1,3}\.){3}[\d]{1,3}:\d{4,5}',
                'reason': 'Direct IP:port connection (potential C2)',
                'severity': 'high'
            },
            {
                'pattern': r'nc\s+-[a-z]*e|ncat.*-e|netcat.*-e',
                'reason': 'Netcat reverse shell',
                'severity': 'critical'
            },
            {
                'pattern': r'/dev/tcp/|/dev/udp/',
                'reason': 'Bash /dev/tcp socket (reverse shell)',
                'severity': 'critical'
            },
            {
                'pattern': r'mkfifo.*/tmp/.*\|.*nc',
                'reason': 'Named pipe reverse shell',
                'severity': 'critical'
            },
            {
                'pattern': r'python.*-c.*socket.*connect',
                'reason': 'Python reverse shell',
                'severity': 'critical'
            },
            {
                'pattern': r'base64\s+-d.*\|\s*(?:ba)?sh',
                'reason': 'Base64 decoded payload executed',
                'severity': 'critical'
            },
        ]
        
        for threat in builtin_threats:
            if re.search(threat['pattern'], text_lower):
                return threat
        
        # Check custom threat intel
        for pattern, info in self.threat_intel.get('patterns', {}).items():
            if re.search(pattern, text_lower):
                return {'pattern': pattern, **info}
        
        # Check blocked IPs
        for ip in self.threat_intel.get('blocked_ips', []):
            if ip in text:
                return {'pattern': ip, 'reason': 'Blocked IP address', 'severity': 'high'}
        
        # Check blocked domains
        for domain in self.threat_intel.get('blocked_domains', []):
            if domain.lower() in text_lower:
                return {'pattern': domain, 'reason': 'Blocked domain', 'severity': 'high'}
        
        return None
    
    def add_threat_pattern(self, pattern: str, reason: str, severity: str = 'high'):
        """Add custom threat pattern."""
        if 'patterns' not in self.threat_intel:
            self.threat_intel['patterns'] = {}
        self.threat_intel['patterns'][pattern] = {'reason': reason, 'severity': severity}
        self._save_threat_intel()
    
    def block_ip(self, ip: str):
        """Block an IP address."""
        if 'blocked_ips' not in self.threat_intel:
            self.threat_intel['blocked_ips'] = []
        if ip not in self.threat_intel['blocked_ips']:
            self.threat_intel['blocked_ips'].append(ip)
            self._save_threat_intel()
    
    def block_domain(self, domain: str):
        """Block a domain."""
        if 'blocked_domains' not in self.threat_intel:
            self.threat_intel['blocked_domains'] = []
        if domain not in self.threat_intel['blocked_domains']:
            self.threat_intel['blocked_domains'].append(domain)
            self._save_threat_intel()
    
    def _save_threat_intel(self):
        """Persist threat intel."""
        self.threat_intel['updated'] = datetime.now().isoformat()
        self.threat_intel_file.write_text(json.dumps(self.threat_intel, indent=2))
    
    def update_baseline(self, session_id: str, activity: Dict):
        """Update behavioral baseline for a session/agent."""
        if session_id not in self.baseline:
            self.baseline[session_id] = {
                'common_commands': {},
                'common_paths': {},
                'common_hosts': {},
                'activity_hours': [0] * 24,
                'total_actions': 0
            }
        
        b = self.baseline[session_id]
        b['total_actions'] += 1
        
        # Track command patterns
        cmd = activity.get('command', '')
        cmd_base = cmd.split()[0] if cmd else ''
        if cmd_base:
            b['common_commands'][cmd_base] = b['common_commands'].get(cmd_base, 0) + 1
        
        # Track file paths
        path = activity.get('path', '')
        if path:
            path_dir = str(Path(path).parent)
            b['common_paths'][path_dir] = b['common_paths'].get(path_dir, 0) + 1
        
        # Track network hosts
        host = activity.get('host', '')
        if host:
            b['common_hosts'][host] = b['common_hosts'].get(host, 0) + 1
        
        # Track activity hours
        hour = datetime.now().hour
        b['activity_hours'][hour] += 1
        
        # Save periodically
        if b['total_actions'] % 100 == 0:
            self._save_baseline()
    
    def check_anomaly(self, session_id: str, activity: Dict) -> Optional[Dict]:
        """Check if activity is anomalous compared to baseline."""
        if session_id not in self.baseline:
            return None
        
        b = self.baseline[session_id]
        if b['total_actions'] < 50:  # Need enough data
            return None
        
        anomalies = []
        
        # Check if command is unusual
        cmd = activity.get('command', '')
        cmd_base = cmd.split()[0] if cmd else ''
        if cmd_base and cmd_base not in b['common_commands']:
            anomalies.append(f"Unusual command: {cmd_base}")
        
        # Check if path is unusual
        path = activity.get('path', '')
        if path:
            path_dir = str(Path(path).parent)
            if path_dir not in b['common_paths']:
                anomalies.append(f"Unusual path: {path_dir}")
        
        # Check if host is unusual
        host = activity.get('host', '')
        if host and host not in b['common_hosts']:
            anomalies.append(f"Unusual host: {host}")
        
        # Check if time is unusual
        hour = datetime.now().hour
        if b['activity_hours'][hour] == 0:
            anomalies.append(f"Unusual activity hour: {hour}:00")
        
        if anomalies:
            return {'anomalies': anomalies, 'baseline_actions': b['total_actions']}
        return None
    
    def _save_baseline(self):
        """Persist behavioral baseline."""
        self.baseline_file.write_text(json.dumps(self.baseline, indent=2))


# Singleton instance
_trust_engine = None

def get_trust_engine() -> TrustEngine:
    global _trust_engine
    if _trust_engine is None:
        _trust_engine = TrustEngine()
    return _trust_engine
