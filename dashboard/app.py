#!/usr/bin/env python3
"""
MoltBot Security Dashboard
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
import threading
import time

# Import security detector
from detector import SecurityDetector

app = Flask(__name__)
security_detector = SecurityDetector()
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
    return jsonify(security_detector.get_recent_alerts(50))

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

def background_monitor():
    """Background thread to push updates via WebSocket."""
    last_data = None
    while True:
        try:
            data = {
                'tool_calls': get_recent_tool_calls(10),
                'connections': get_network_connections(),
                'updated': datetime.now().isoformat()
            }
            if str(data) != str(last_data):
                socketio.emit('activity_update', data)
                last_data = data
        except Exception as e:
            pass
        time.sleep(3)

if __name__ == '__main__':
    # Start background monitor
    monitor_thread = threading.Thread(target=background_monitor, daemon=True)
    monitor_thread.start()
    
    print("\n🦀 MoltBot Security Dashboard")
    print("=" * 40)
    print("Open: http://localhost:5050")
    print("=" * 40 + "\n")
    
    socketio.run(app, host='127.0.0.1', port=5050, debug=False)
