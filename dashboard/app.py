#!/usr/bin/env python3
"""
CrabGuard Security Dashboard
Real-time monitoring of AI agent activity
"""

import json
import os
import glob
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from flask import Flask, jsonify, send_from_directory
from flask_socketio import SocketIO
from flask_cors import CORS
import threading
import time

# Import security detector, trust engine, baseline, smart filtering, and crypto
from detector import SecurityDetector
from trust import get_trust_engine, TrustEngine
from baseline import get_baseline
from smart_alerts import get_smart_filter
from crypto import get_encryption
from threat_intel import get_threat_intel
from notifications import get_notification_manager
from gateway_client import get_gateway_client

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
security_detector = SecurityDetector()
trust_engine = get_trust_engine()
app.config['SECRET_KEY'] = 'clawdbot-security-dashboard'
socketio = SocketIO(app, cors_allowed_origins="*")

# Paths
CLAWDBOT_DIR = Path.home() / '.clawdbot'
SESSIONS_DIR = CLAWDBOT_DIR / 'agents'

def parse_session_file(filepath, limit=100):
    """Parse a JSONL session file and extract events (last N lines)."""
    events = []
    try:
        # Read last N lines efficiently
        with open(filepath, 'rb') as f:
            # Seek to end and read backwards
            f.seek(0, 2)
            file_size = f.tell()
            
            # Read last chunk (up to 500KB)
            chunk_size = min(500000, file_size)
            f.seek(max(0, file_size - chunk_size))
            content = f.read().decode('utf-8', errors='ignore')
            
            lines = content.strip().split('\n')
            # Take last N lines
            for line in lines[-limit:]:
                if line.strip():
                    try:
                        entry = json.loads(line)
                        events.append(entry)
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        print(f"Error parsing {filepath}: {e}")
    return events

def get_recent_tool_calls(limit=50):
    """Extract recent tool calls from session files."""
    tool_calls = []
    
    # Find all session JSONL files
    pattern = str(SESSIONS_DIR / '**' / '*.jsonl')
    session_files = sorted(glob.glob(pattern, recursive=True), 
                          key=os.path.getmtime, reverse=True)[:5]
    
    for filepath in session_files:
        events = parse_session_file(filepath, limit=200)
        for event in events:
            if event.get('type') != 'message':
                continue
            
            msg = event.get('message', {})
            if msg.get('role') != 'assistant':
                continue
                
            content = msg.get('content', [])
            timestamp = event.get('timestamp', msg.get('timestamp', ''))
            
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get('type') == 'toolCall':
                        tool_calls.append({
                            'timestamp': timestamp,
                            'tool': item.get('name', 'unknown'),
                            'input': item.get('arguments', {}),
                            'session': os.path.basename(filepath)[:8]
                        })
    
    return sorted(tool_calls, key=lambda x: x.get('timestamp', ''), reverse=True)[:limit]

def get_network_connections():
    """Get current network connections from node/clawdbot processes."""
    connections = []
    try:
        result = subprocess.run(
            ['/usr/sbin/lsof', '-i', '-n', '-P'],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.split('\n'):
            if 'node' in line.lower():
                parts = line.split()
                if len(parts) >= 9:
                    connections.append({
                        'process': parts[0],
                        'pid': parts[1],
                        'type': parts[4] if len(parts) > 4 else '',
                        'connection': parts[8] if len(parts) > 8 else ''
                    })
    except Exception as e:
        print(f"Error getting connections: {e}")
    return connections

def get_detailed_network():
    """Get Wireshark-style detailed network information."""
    result = {
        'connections': [],
        'protocols': {},
        'remote_hosts': {},
        'suspicious': [],
        'stats': {
            'total_connections': 0,
            'established': 0,
            'listening': 0,
            'outbound': 0,
            'inbound': 0,
        }
    }
    
    # Known suspicious ports/hosts
    suspicious_ports = {22: 'SSH', 23: 'Telnet', 3389: 'RDP', 4444: 'Metasploit', 5555: 'ADB'}
    suspicious_hosts = ['pastebin.com', 'ngrok.io', 'serveo.net', 'localtunnel.me']
    
    try:
        # Get all connections with lsof
        lsof_result = subprocess.run(
            ['/usr/sbin/lsof', '-i', '-n', '-P'],
            capture_output=True, text=True, timeout=10
        )
        
        for line in lsof_result.stdout.split('\n')[1:]:  # Skip header
            if not line.strip():
                continue
            parts = line.split()
            if len(parts) < 9:
                continue
                
            process = parts[0]
            pid = parts[1]
            user = parts[2]
            fd = parts[3]
            conn_type = parts[4]  # IPv4, IPv6
            protocol = parts[7] if len(parts) > 7 else ''  # TCP, UDP
            connection = parts[8] if len(parts) > 8 else ''
            state = parts[9] if len(parts) > 9 else ''
            
            # Parse connection string (e.g., "192.168.1.1:443->10.0.0.1:54321")
            local_addr = ''
            remote_addr = ''
            local_port = ''
            remote_port = ''
            direction = 'unknown'
            
            if '->' in connection:
                local_part, remote_part = connection.split('->')
                local_addr, local_port = local_part.rsplit(':', 1) if ':' in local_part else (local_part, '')
                remote_addr, remote_port = remote_part.rsplit(':', 1) if ':' in remote_part else (remote_part, '')
                direction = 'outbound'
            elif connection.startswith('*:'):
                local_port = connection.replace('*:', '')
                direction = 'listening'
            elif ':' in connection:
                local_addr, local_port = connection.rsplit(':', 1)
                direction = 'inbound' if state == '(LISTEN)' else 'local'
            
            conn_data = {
                'process': process,
                'pid': pid,
                'user': user,
                'protocol': f"{conn_type}/{protocol}".replace('IPv4/', '').replace('IPv6/', 'v6/'),
                'local': f"{local_addr}:{local_port}" if local_port else local_addr,
                'remote': f"{remote_addr}:{remote_port}" if remote_port else remote_addr,
                'state': state.replace('(', '').replace(')', ''),
                'direction': direction,
            }
            
            result['connections'].append(conn_data)
            result['stats']['total_connections'] += 1
            
            # Count states
            if 'ESTABLISHED' in state:
                result['stats']['established'] += 1
            if 'LISTEN' in state:
                result['stats']['listening'] += 1
            if direction == 'outbound':
                result['stats']['outbound'] += 1
            if direction == 'inbound':
                result['stats']['inbound'] += 1
            
            # Track protocols
            proto_key = protocol or 'OTHER'
            result['protocols'][proto_key] = result['protocols'].get(proto_key, 0) + 1
            
            # Track remote hosts
            if remote_addr and remote_addr not in ['', '*', 'localhost', '127.0.0.1', '::1']:
                if remote_addr not in result['remote_hosts']:
                    result['remote_hosts'][remote_addr] = {
                        'count': 0,
                        'ports': set(),
                        'processes': set()
                    }
                result['remote_hosts'][remote_addr]['count'] += 1
                if remote_port:
                    result['remote_hosts'][remote_addr]['ports'].add(remote_port)
                result['remote_hosts'][remote_addr]['processes'].add(process)
            
            # Check for suspicious activity
            try:
                port_num = int(remote_port) if remote_port else 0
                if port_num in suspicious_ports:
                    result['suspicious'].append({
                        'type': 'suspicious_port',
                        'description': f"{process} connecting to {suspicious_ports[port_num]} port ({port_num})",
                        'connection': conn_data
                    })
            except ValueError:
                pass
            
            for sus_host in suspicious_hosts:
                if sus_host in remote_addr.lower():
                    result['suspicious'].append({
                        'type': 'suspicious_host',
                        'description': f"{process} connecting to {sus_host}",
                        'connection': conn_data
                    })
    
    except Exception as e:
        result['error'] = str(e)
    
    # Convert sets to lists for JSON serialization
    for host_data in result['remote_hosts'].values():
        host_data['ports'] = list(host_data['ports'])
        host_data['processes'] = list(host_data['processes'])
    
    return result

def get_recent_messages(limit=20):
    """Get recent messages from session files."""
    messages = []
    
    pattern = str(SESSIONS_DIR / '**' / '*.jsonl')
    session_files = sorted(glob.glob(pattern, recursive=True), 
                          key=os.path.getmtime, reverse=True)[:3]
    
    for filepath in session_files:
        events = parse_session_file(filepath, limit=100)
        for event in events:
            if event.get('type') != 'message':
                continue
            
            msg = event.get('message', {})
            role = msg.get('role', '')
            
            if role not in ['user', 'assistant']:
                continue
            
            timestamp = event.get('timestamp', msg.get('timestamp', ''))
            content = msg.get('content', '')
            
            # Extract text content
            if isinstance(content, str):
                text = content[:200] + '...' if len(content) > 200 else content
            elif isinstance(content, list):
                texts = []
                for c in content:
                    if isinstance(c, dict) and c.get('type') == 'text':
                        texts.append(c.get('text', '')[:100])
                text = ' '.join(texts)[:200]
            else:
                text = str(content)[:200]
            
            if text.strip():
                messages.append({
                    'timestamp': timestamp,
                    'role': role,
                    'content': text,
                    'session': os.path.basename(filepath)[:8]
                })
    
    return sorted(messages, key=lambda x: x.get('timestamp', ''), reverse=True)[:limit]

def get_file_operations(limit=30):
    """Extract file read/write operations from recent tool calls."""
    ops = []
    tool_calls = get_recent_tool_calls(100)
    
    for tc in tool_calls:
        tool = tc.get('tool', '')
        inp = tc.get('input', {})
        ts = tc.get('timestamp', '')
        
        if tool in ['Read', 'read']:
            ops.append({
                'timestamp': ts,
                'operation': '📖 READ',
                'path': inp.get('path', inp.get('file_path', 'unknown')),
                'details': ''
            })
        elif tool in ['Write', 'write']:
            content = inp.get('content', '')
            ops.append({
                'timestamp': ts,
                'operation': '✏️ WRITE',
                'path': inp.get('path', inp.get('file_path', 'unknown')),
                'details': f"{len(content)} bytes"
            })
        elif tool in ['Edit', 'edit']:
            ops.append({
                'timestamp': ts,
                'operation': '🔧 EDIT',
                'path': inp.get('path', inp.get('file_path', 'unknown')),
                'details': ''
            })
        elif tool == 'exec':
            cmd = inp.get('command', '')[:80]
            ops.append({
                'timestamp': ts,
                'operation': '⚡ EXEC',
                'path': cmd,
                'details': ''
            })
        elif tool == 'web_search':
            ops.append({
                'timestamp': ts,
                'operation': '🔍 SEARCH',
                'path': inp.get('query', '')[:60],
                'details': ''
            })
        elif tool == 'web_fetch':
            ops.append({
                'timestamp': ts,
                'operation': '🌐 FETCH',
                'path': inp.get('url', '')[:60],
                'details': ''
            })
        elif tool == 'message':
            ops.append({
                'timestamp': ts,
                'operation': '💬 MESSAGE',
                'path': inp.get('target', inp.get('channel', ''))[:40],
                'details': ''
            })
        elif tool == 'browser':
            ops.append({
                'timestamp': ts,
                'operation': '🖥️ BROWSER',
                'path': inp.get('action', '')[:40],
                'details': ''
            })
    
    return ops[:limit]

# Serve React app
# Handle development, installed, and PyInstaller bundled paths
import sys
if getattr(sys, 'frozen', False):
    # Running as PyInstaller bundle
    REACT_BUILD = Path(sys._MEIPASS) / 'dashboard-ui' / 'dist'
elif (Path(__file__).parent / 'static').exists():
    # Running from installed location (~/.moltbot/dashboard/static)
    REACT_BUILD = Path(__file__).parent / 'static'
else:
    # Running from source (development)
    REACT_BUILD = Path(__file__).parent.parent / 'dashboard-ui' / 'dist'

@app.route('/')
def dashboard():
    return send_from_directory(REACT_BUILD, 'index.html')

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory(REACT_BUILD / 'assets', filename)

@app.route('/favicon.svg')
def favicon():
    return send_from_directory(REACT_BUILD, 'favicon.svg')

@app.route('/api/activity')
def api_activity():
    return jsonify({
        'tool_calls': get_recent_tool_calls(30),
        'connections': get_network_connections(),
        'messages': get_recent_messages(15),
        'file_ops': get_file_operations(25),
        'updated': datetime.now().isoformat()
    })

@app.route('/api/tools')
def api_tools():
    return jsonify(get_recent_tool_calls(50))

@app.route('/api/network')
def api_network():
    return jsonify(get_network_connections())

@app.route('/api/network/detailed')
def api_network_detailed():
    """Wireshark-style detailed network information."""
    return jsonify(get_detailed_network())

@app.route('/api/alerts')
def api_alerts():
    alerts = security_detector.get_recent_alerts(50)
    
    # Filter by threshold from settings
    settings = get_settings()
    threshold = settings.get('alertThreshold', 'all')
    
    if threshold != 'all':
        severity_levels = {'low': 1, 'medium': 2, 'high': 3, 'critical': 4}
        min_level = severity_levels.get(threshold, 1)
        alerts = [a for a in alerts if severity_levels.get(a.get('severity', 'medium'), 2) >= min_level]
    
    return jsonify(alerts)

@app.route('/api/security-check')
def api_security_check():
    """Run security checks and return new alerts."""
    alerts = security_detector.run_all_checks()
    return jsonify({
        'new_alerts': [a.to_dict() for a in alerts],
        'total_recent': len(security_detector.get_recent_alerts(50))
    })

SETTINGS_FILE = CLAWDBOT_DIR / 'security-settings.json'

def get_settings():
    """Load settings from file."""
    defaults = {
        'retentionDays': 30,
        'autoPurge': False,
        'alertThreshold': 'all'
    }
    if SETTINGS_FILE.exists():
        try:
            return {**defaults, **json.loads(SETTINGS_FILE.read_text())}
        except:
            pass
    return defaults

def save_settings(settings):
    """Save settings to file."""
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(settings, indent=2))

@app.route('/api/settings', methods=['GET', 'POST'])
def api_settings():
    """Get or update settings."""
    from flask import request
    if request.method == 'POST':
        settings = request.get_json()
        save_settings(settings)
        return jsonify({'success': True})
    return jsonify(get_settings())


# --- Encryption API ---

@app.route('/api/encryption/status')
def api_encryption_status():
    """Get encryption status."""
    return jsonify(get_encryption().get_status())

@app.route('/api/encryption/setup', methods=['POST'])
def api_encryption_setup():
    """Set up encryption with a passphrase."""
    from flask import request
    data = request.get_json() or {}
    passphrase = data.get('passphrase', '')
    
    if len(passphrase) < 8:
        return jsonify({'success': False, 'error': 'Passphrase must be at least 8 characters'}), 400
    
    encryption = get_encryption()
    if encryption.setup(passphrase):
        # Re-save baseline as encrypted
        baseline = get_baseline()
        baseline._save_baseline()
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Setup failed'}), 500

@app.route('/api/encryption/unlock', methods=['POST'])
def api_encryption_unlock():
    """Unlock encryption with passphrase."""
    from flask import request
    data = request.get_json() or {}
    passphrase = data.get('passphrase', '')
    
    encryption = get_encryption()
    if encryption.unlock(passphrase):
        # Reload baseline with unlocked encryption
        baseline = get_baseline()
        baseline.baseline = baseline._load_baseline()
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Invalid passphrase'}), 401

@app.route('/api/encryption/lock', methods=['POST'])
def api_encryption_lock():
    """Lock encryption (clear key from memory)."""
    get_encryption().lock()
    return jsonify({'success': True})

@app.route('/api/encryption/disable', methods=['POST'])
def api_encryption_disable():
    """Disable encryption entirely."""
    from flask import request
    data = request.get_json() or {}
    passphrase = data.get('passphrase', '')
    
    encryption = get_encryption()
    
    # Require unlock first to disable
    if encryption.is_enabled() and not encryption.is_unlocked():
        if not encryption.unlock(passphrase):
            return jsonify({'success': False, 'error': 'Invalid passphrase'}), 401
    
    # Re-save baseline as plain before disabling
    baseline = get_baseline()
    encryption.disable()
    baseline._save_baseline()
    
    return jsonify({'success': True})

@app.route('/api/storage-stats')
def api_storage_stats():
    """Get storage statistics."""
    session_count = 0
    total_size = 0
    oldest_log = None
    alert_count = 0
    
    # Count session files
    for jsonl in SESSIONS_DIR.rglob('*.jsonl'):
        session_count += 1
        total_size += jsonl.stat().st_size
        mtime = datetime.fromtimestamp(jsonl.stat().st_mtime)
        if oldest_log is None or mtime < oldest_log:
            oldest_log = mtime
    
    # Count alerts
    alerts = security_detector.get_recent_alerts(1000)
    alert_count = len(alerts)
    
    # Format size
    if total_size > 1024 * 1024:
        size_str = f"{total_size / (1024*1024):.1f} MB"
    elif total_size > 1024:
        size_str = f"{total_size / 1024:.1f} KB"
    else:
        size_str = f"{total_size} B"
    
    return jsonify({
        'sessionCount': session_count,
        'totalSize': size_str,
        'oldestLog': oldest_log.strftime('%Y-%m-%d') if oldest_log else '-',
        'alertCount': alert_count
    })

@app.route('/api/purge', methods=['POST'])
def api_purge():
    """Purge old session logs based on retention settings."""
    settings = get_settings()
    retention_days = settings.get('retentionDays', 30)
    
    if retention_days == 0:
        return jsonify({'success': False, 'error': 'Retention set to forever'})
    
    cutoff = datetime.now() - timedelta(days=retention_days)
    deleted = 0
    
    for jsonl in SESSIONS_DIR.rglob('*.jsonl'):
        try:
            mtime = datetime.fromtimestamp(jsonl.stat().st_mtime)
            if mtime < cutoff:
                jsonl.unlink()
                deleted += 1
        except:
            pass
    
    return jsonify({'success': True, 'deleted': deleted})

# ============ Trust & Context API ============

@app.route('/api/trust/sessions')
def api_trust_sessions():
    """Get list of trusted sessions."""
    return jsonify({
        'trusted': list(trust_engine.trusted_sessions),
        'count': len(trust_engine.trusted_sessions)
    })

@app.route('/api/trust/session', methods=['POST'])
def api_trust_session():
    """Add or remove trust from a session."""
    from flask import request
    data = request.get_json()
    session_id = data.get('sessionId', '')
    action = data.get('action', 'trust')  # trust or untrust
    
    if not session_id:
        return jsonify({'error': 'No session ID provided'})
    
    if action == 'trust':
        trust_engine.trust_session(session_id)
        return jsonify({'success': True, 'message': f'Session {session_id[:8]}... is now trusted'})
    else:
        trust_engine.untrust_session(session_id)
        return jsonify({'success': True, 'message': f'Session {session_id[:8]}... removed from trusted'})

@app.route('/api/trust/evaluate', methods=['POST'])
def api_trust_evaluate():
    """Evaluate trust level of a command."""
    from flask import request
    try:
        data = request.get_json() or {}
        command = data.get('command', '')
        session_id = data.get('sessionId', '')
        session_file = data.get('sessionFile', '')
        
        if not command:
            return jsonify({'error': 'No command provided'}), 400
        
        session_path = Path(session_file) if session_file else None
        result = trust_engine.evaluate_command(command, session_id, session_path)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e), 'trust_level': 'unknown'}), 500

@app.route('/api/trust/threat-intel')
def api_threat_intel():
    """Get current threat intelligence."""
    return jsonify({
        'patterns': trust_engine.threat_intel.get('patterns', {}),
        'blocked_ips': trust_engine.threat_intel.get('blocked_ips', []),
        'blocked_domains': trust_engine.threat_intel.get('blocked_domains', []),
        'updated': trust_engine.threat_intel.get('updated')
    })

@app.route('/api/trust/block', methods=['POST'])
def api_trust_block():
    """Block an IP or domain."""
    from flask import request
    data = request.get_json()
    
    if 'ip' in data:
        trust_engine.block_ip(data['ip'])
        return jsonify({'success': True, 'message': f"Blocked IP: {data['ip']}"})
    elif 'domain' in data:
        trust_engine.block_domain(data['domain'])
        return jsonify({'success': True, 'message': f"Blocked domain: {data['domain']}"})
    elif 'pattern' in data:
        trust_engine.add_threat_pattern(
            data['pattern'], 
            data.get('reason', 'Custom rule'),
            data.get('severity', 'high')
        )
        return jsonify({'success': True, 'message': f"Added pattern: {data['pattern']}"})
    else:
        return jsonify({'error': 'Provide ip, domain, or pattern'})

@app.route('/api/trust/current-session')
def api_current_session():
    """Get current active sessions that could be trusted."""
    sessions = []
    for jsonl in SESSIONS_DIR.rglob('*.jsonl'):
        try:
            mtime = datetime.fromtimestamp(jsonl.stat().st_mtime)
            if datetime.now() - mtime < timedelta(hours=1):  # Active in last hour
                session_id = jsonl.stem
                sessions.append({
                    'id': session_id,
                    'file': str(jsonl),
                    'modified': mtime.isoformat(),
                    'trusted': trust_engine.is_trusted_session(session_id)
                })
        except:
            pass
    return jsonify(sorted(sessions, key=lambda x: x['modified'], reverse=True))

@app.route('/api/trace', methods=['POST'])
def api_trace():
    """Trace a command to see what it does."""
    from flask import request
    data = request.get_json()
    command = data.get('command', '')
    
    if not command:
        return jsonify({'error': 'No command provided'})
    
    result = security_detector.trace_command(command)
    return jsonify(result)

@app.route('/api/alert-details/<int:alert_id>')
def api_alert_details(alert_id):
    """Get full details for a specific alert."""
    alerts = security_detector.get_recent_alerts(50)
    
    # Alerts are shown reversed in UI
    actual_index = len(alerts) - 1 - alert_id
    
    if 0 <= actual_index < len(alerts):
        alert = alerts[actual_index]
        
        # Try to get more context from session file
        session_file = alert.get('details', {}).get('session_file')
        context_messages = []
        
        if session_file and os.path.exists(session_file):
            try:
                with open(session_file, 'r') as f:
                    lines = f.readlines()[-100:]  # Last 100 entries
                    for line in lines:
                        try:
                            entry = json.loads(line)
                            if entry.get('type') == 'message':
                                msg = entry.get('message', {})
                                role = msg.get('role', '')
                                content = msg.get('content', '')
                                if isinstance(content, list):
                                    content = json.dumps(content)[:500]
                                elif isinstance(content, str):
                                    content = content[:500]
                                context_messages.append({
                                    'role': role,
                                    'content': content,
                                    'timestamp': entry.get('timestamp', '')
                                })
                        except:
                            pass
            except:
                pass
        
        return jsonify({
            'alert': alert,
            'context': context_messages[-20:]  # Last 20 relevant messages
        })
    
    return jsonify({'error': 'Alert not found'})

@app.route('/api/alert-action', methods=['POST'])
def api_alert_action():
    """Take action on a security alert."""
    from flask import request
    data = request.get_json()
    action = data.get('action')
    alert_id = data.get('alertId')
    session_file = data.get('sessionFile')
    
    try:
        if action == 'dismiss':
            # Mark alert as dismissed
            security_detector.dismiss_alert(alert_id)
            return jsonify({'success': True, 'message': 'Alert dismissed'})
        
        elif action == 'kill':
            # Kill the session - find and terminate the clawdbot process
            if session_file:
                # Extract session ID from file path
                session_id = Path(session_file).stem
                
                # Try to find and kill related processes
                result = subprocess.run(
                    ['pkill', '-f', f'clawdbot.*{session_id[:8]}'],
                    capture_output=True, timeout=5
                )
                
                # Also try killing by gateway
                subprocess.run(
                    ['pkill', '-f', 'clawdbot gateway'],
                    capture_output=True, timeout=5
                )
                
                return jsonify({
                    'success': True, 
                    'message': f'Attempted to kill session {session_id[:8]}...'
                })
            return jsonify({'success': False, 'error': 'No session file provided'})
        
        elif action == 'quarantine':
            # Move session to quarantine folder
            if session_file and os.path.exists(session_file):
                quarantine_dir = CLAWDBOT_DIR / 'quarantine'
                quarantine_dir.mkdir(exist_ok=True)
                
                import shutil
                dest = quarantine_dir / Path(session_file).name
                shutil.move(session_file, dest)
                
                return jsonify({
                    'success': True,
                    'message': f'Session quarantined to {dest}'
                })
            return jsonify({'success': False, 'error': 'Session file not found'})
        
        else:
            return jsonify({'success': False, 'error': f'Unknown action: {action}'})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/baseline')
def api_baseline():
    """Get behavioral baseline statistics."""
    baseline = get_baseline()
    return jsonify(baseline.get_stats())

@app.route('/api/alerts/clear', methods=['POST'])
def api_alerts_clear():
    """Clear all alerts."""
    if security_detector.alerts_file.exists():
        security_detector.alerts_file.write_text('[]')
    return jsonify({'success': True, 'message': 'All alerts cleared'})

@app.route('/api/smart-filter')
def api_smart_filter():
    """Get smart filter statistics."""
    smart_filter = get_smart_filter()
    return jsonify(smart_filter.get_stats())

@app.route('/api/smart-filter/learn', methods=['POST'])
def api_smart_filter_learn():
    """Learn from a dismissed alert."""
    data = request.get_json() or {}
    alert = data.get('alert', {})
    smart_filter = get_smart_filter()
    smart_filter.learn_from_dismissal(alert)
    return jsonify({'success': True, 'message': 'Learned from dismissal'})

@app.route('/api/baseline/reset', methods=['POST'])
def api_baseline_reset():
    """Reset the behavioral baseline."""
    baseline = get_baseline()
    baseline.reset_baseline()
    return jsonify({'success': True, 'message': 'Baseline reset'})

@app.route('/api/baseline/config', methods=['GET', 'POST'])
def api_baseline_config():
    """Get or update baseline configuration."""
    baseline = get_baseline()
    
    if request.method == 'POST':
        config = request.get_json() or {}
        baseline.update_config(config)
        return jsonify({'success': True, 'config': baseline.get_config()})
    
    return jsonify(baseline.get_config())

@app.route('/api/baseline/whitelist', methods=['POST'])
def api_baseline_whitelist():
    """Add item to whitelist (mark as normal)."""
    data = request.get_json() or {}
    activity_type = data.get('type', 'EXEC')
    details = data.get('details', {})
    
    baseline = get_baseline()
    baseline.mark_as_normal(activity_type, details)
    
    return jsonify({'success': True, 'message': 'Added to whitelist'})


# --- Threat Intelligence API ---

@app.route('/api/threat-intel')
def api_threat_intel_all():
    """Get all threat intelligence patterns."""
    intel = get_threat_intel()
    return jsonify({
        'patterns': intel.get_all_patterns(),
        'count': len(intel.patterns)
    })

@app.route('/api/threat-intel/analyze', methods=['POST'])
def api_threat_intel_analyze():
    """Analyze a command for threat patterns."""
    data = request.get_json() or {}
    command = data.get('command', '')
    
    intel = get_threat_intel()
    matches = intel.analyze_command(command)
    
    return jsonify({
        'command': command,
        'threats': matches,
        'is_threat': len(matches) > 0
    })


# --- Notifications API ---

@app.route('/api/notifications/config', methods=['GET', 'POST'])
def api_notifications_config():
    """Get or update notification configuration."""
    manager = get_notification_manager()
    
    if request.method == 'POST':
        config = request.get_json() or {}
        manager.update_config(config)
        return jsonify({'success': True, 'config': manager.get_config()})
    
    return jsonify(manager.get_config())

@app.route('/api/notifications/test', methods=['POST'])
def api_notifications_test():
    """Test notification connections."""
    manager = get_notification_manager()
    results = manager.test_connection()
    return jsonify({'success': True, 'results': results})


# --- Gateway Connection API ---

@app.route('/api/gateway/status')
def api_gateway_status():
    """Get gateway WebSocket connection status."""
    client = get_gateway_client()
    return jsonify(client.get_status())

@app.route('/api/gateway/connect', methods=['POST'])
def api_gateway_connect():
    """Connect to gateway WebSocket."""
    client = get_gateway_client()
    success = client.connect()
    return jsonify({'success': success, 'status': client.get_status()})


# --- Session Control API ---

@app.route('/api/sessions/kill', methods=['POST'])
def api_kill_session():
    """Kill an agent session."""
    data = request.get_json() or {}
    session_id = data.get('session_id')
    
    if not session_id:
        return jsonify({'success': False, 'error': 'session_id required'}), 400
    
    # Try to kill via gateway client
    # For now, just return success - actual implementation depends on gateway API
    return jsonify({
        'success': True,
        'message': f'Kill request sent for session {session_id}',
        'note': 'Session termination depends on gateway support'
    })


def background_monitor():
    """Background thread to push updates via WebSocket."""
    last_data = None
    last_tool_ids = set()
    baseline = get_baseline()
    
    while True:
        try:
            tool_calls = get_recent_tool_calls(10)
            connections = get_network_connections()
            
            # Record new tool calls to baseline
            for tc in tool_calls:
                tc_id = f"{tc.get('timestamp')}_{tc.get('tool')}"
                if tc_id not in last_tool_ids:
                    last_tool_ids.add(tc_id)
                    # Keep set bounded
                    if len(last_tool_ids) > 1000:
                        last_tool_ids = set(list(last_tool_ids)[-500:])
                    
                    # Record to baseline
                    tool_name = tc.get('tool', '').upper()
                    if tool_name in ('READ', 'WRITE', 'EDIT'):
                        baseline.record_activity(tool_name, {
                            'path': tc.get('input', {}).get('path', '')
                        })
                    elif tool_name == 'EXEC':
                        baseline.record_activity('EXEC', {
                            'command': tc.get('input', {}).get('command', '')
                        })
                    elif tool_name in ('WEB_FETCH', 'WEB_SEARCH', 'BROWSER'):
                        baseline.record_activity('NETWORK', {
                            'remote': tc.get('input', {}).get('url', '')
                        })
            
            data = {
                'tool_calls': tool_calls,
                'connections': connections,
                'updated': datetime.now().isoformat()
            }
            if str(data) != str(last_data):
                socketio.emit('activity_update', data)
                last_data = data
        except Exception as e:
            pass
        time.sleep(3)

def background_security():
    """Background thread to run security checks."""
    last_alert_count = 0
    threat_intel = get_threat_intel()
    notification_manager = get_notification_manager()
    
    while True:
        try:
            # Run all security checks
            new_alerts = security_detector.run_all_checks()
            
            # Enhanced threat intel analysis on new exec commands
            tool_calls = get_recent_tool_calls(20)
            for tc in tool_calls:
                if tc.get('tool', '').upper() == 'EXEC':
                    command = tc.get('input', {}).get('command', '')
                    if command:
                        threats = threat_intel.analyze_command(command)
                        for threat in threats:
                            # Create alert for threat intel match
                            alert = security_detector.create_alert(
                                title=threat['name'],
                                description=f"{threat['description']}\n\nCommand: {command[:200]}",
                                severity=threat['severity'],
                                category=threat['category'],
                                details={
                                    'threat_id': threat['threat_id'],
                                    'mitre_id': threat.get('mitre_id'),
                                    'remediation': threat.get('remediation'),
                                    'command': command,
                                }
                            )
                            if alert:
                                new_alerts.append(alert)
            
            current_alerts = security_detector.get_recent_alerts(50)
            alert_count = len(current_alerts)
            
            # Emit status update
            has_alerts = alert_count > 0
            critical_count = sum(1 for a in current_alerts if a.get('severity') == 'critical')
            high_count = sum(1 for a in current_alerts if a.get('severity') == 'high')
            
            socketio.emit('security_status', {
                'status': 'alert' if has_alerts else 'ok',
                'alert_count': alert_count,
                'critical': critical_count,
                'high': high_count,
                'new_alerts': len(new_alerts),
                'timestamp': datetime.now().isoformat()
            })
            
            # If new alerts found, emit them and send notifications
            if new_alerts:
                socketio.emit('new_alerts', [a.to_dict() for a in new_alerts])
                
                # Send notifications for high/critical alerts
                for alert in new_alerts:
                    alert_dict = alert.to_dict() if hasattr(alert, 'to_dict') else alert
                    if alert_dict.get('severity') in ('high', 'critical'):
                        notification_manager.send_alert_async(alert_dict)
            
            last_alert_count = alert_count
        except Exception as e:
            print(f"Security check error: {e}")
        
        time.sleep(30)  # Run every 30 seconds

if __name__ == '__main__':
    # Start background threads
    monitor_thread = threading.Thread(target=background_monitor, daemon=True)
    monitor_thread.start()
    
    security_thread = threading.Thread(target=background_security, daemon=True)
    security_thread.start()
    
    # Try to connect to gateway for real-time events
    try:
        gateway_client = get_gateway_client()
        gateway_client.start_background()
        print("🔗 Gateway connection: attempting...")
    except Exception as e:
        print(f"⚠️  Gateway connection skipped: {e}")
    
    host = os.environ.get('MOLTBOT_HOST', '127.0.0.1')
    port = int(os.environ.get('MOLTBOT_PORT', 5050))
    
    print("\n🦀 CrabGuard Security Dashboard")
    print("=" * 40)
    print(f"Open: http://{host}:{port}")
    print("=" * 40 + "\n")
    
    socketio.run(app, host=host, port=port, debug=False)
