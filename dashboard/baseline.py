"""
Behavioral Baseline - Learn normal patterns, detect anomalies.
"""
import json
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, List, Optional
import statistics

from crypto import get_encryption

BASELINE_FILE = Path.home() / '.clawdbot' / 'security' / 'baseline.json'
BASELINE_ENCRYPTED_FILE = Path.home() / '.clawdbot' / 'security' / 'baseline.enc'

class BehaviorBaseline:
    def __init__(self):
        self.baseline = self._load_baseline()
        self.current_window = defaultdict(lambda: defaultdict(int))
        self.window_start = datetime.now()
        
    def _load_baseline(self) -> Dict:
        """Load baseline from disk (encrypted or plain)."""
        encryption = get_encryption()
        
        # Try encrypted file first
        if encryption.is_enabled() and BASELINE_ENCRYPTED_FILE.exists():
            if encryption.is_unlocked():
                try:
                    encrypted = BASELINE_ENCRYPTED_FILE.read_text()
                    data = encryption.decrypt(encrypted)
                    if data:
                        return data
                except Exception as e:
                    print(f"Failed to decrypt baseline: {e}")
            else:
                # Encryption enabled but locked - return empty baseline
                return self._default_baseline()
        
        # Fall back to plain JSON
        if BASELINE_FILE.exists():
            try:
                return json.loads(BASELINE_FILE.read_text())
            except:
                pass
        
        return self._default_baseline()
    
    def _default_baseline(self) -> Dict:
        """Return empty default baseline."""
        return {
            'windows': [],  # List of hourly windows
            'learned': False,
            'min_windows': 24,  # Need 24 hours before baseline is "learned"
        }
    
    def _save_baseline(self):
        """Save baseline to disk (encrypted if enabled)."""
        encryption = get_encryption()
        
        BASELINE_FILE.parent.mkdir(parents=True, exist_ok=True)
        
        if encryption.is_enabled() and encryption.is_unlocked():
            try:
                encrypted = encryption.encrypt(self.baseline)
                BASELINE_ENCRYPTED_FILE.write_text(encrypted)
                # Remove plain file if exists
                if BASELINE_FILE.exists():
                    BASELINE_FILE.unlink()
                return
            except Exception as e:
                print(f"Failed to encrypt baseline, saving plain: {e}")
        
        # Save plain JSON
        BASELINE_FILE.write_text(json.dumps(self.baseline, indent=2, default=str))
    
    def record_activity(self, activity_type: str, details: Dict):
        """Record an activity for baseline learning."""
        # Rotate window every hour
        if datetime.now() - self.window_start > timedelta(hours=1):
            self._rotate_window()
        
        # Track counts
        self.current_window['counts'][activity_type] += 1
        
        # Track specific patterns
        if activity_type == 'EXEC':
            cmd = details.get('command', '').split()[0] if details.get('command') else 'unknown'
            self.current_window['commands'][cmd] += 1
            
        elif activity_type in ('READ', 'WRITE', 'EDIT'):
            path = details.get('path', '')
            # Track directory, not full path
            dir_path = str(Path(path).parent) if path else 'unknown'
            self.current_window['directories'][dir_path] += 1
            
        elif activity_type == 'NETWORK':
            remote = details.get('remote', 'unknown')
            self.current_window['network'][remote] += 1
    
    def _rotate_window(self):
        """Save current window to baseline and start new one."""
        if self.current_window:
            window_data = {
                'timestamp': self.window_start.isoformat(),
                'hour': self.window_start.hour,
                'counts': dict(self.current_window['counts']),
                'commands': dict(self.current_window['commands']),
                'directories': dict(self.current_window['directories']),
                'network': dict(self.current_window['network']),
            }
            self.baseline['windows'].append(window_data)
            
            # Keep only last 7 days (168 hours)
            if len(self.baseline['windows']) > 168:
                self.baseline['windows'] = self.baseline['windows'][-168:]
            
            # Mark as learned once we have enough data
            if len(self.baseline['windows']) >= self.baseline['min_windows']:
                self.baseline['learned'] = True
            
            self._save_baseline()
        
        # Reset current window
        self.current_window = defaultdict(lambda: defaultdict(int))
        self.window_start = datetime.now()
    
    def check_anomaly(self, activity_type: str, details: Dict) -> Optional[Dict]:
        """Check if activity is anomalous compared to baseline."""
        if not self.baseline['learned']:
            return None  # Not enough data yet
        
        anomalies = []
        
        # Get current hour's typical patterns
        current_hour = datetime.now().hour
        similar_windows = [w for w in self.baseline['windows'] if w.get('hour') == current_hour]
        
        if len(similar_windows) < 3:
            # Not enough data for this hour
            similar_windows = self.baseline['windows'][-24:]  # Use last 24 hours
        
        # Check activity rate
        rate_anomaly = self._check_rate_anomaly(activity_type, similar_windows)
        if rate_anomaly:
            anomalies.append(rate_anomaly)
        
        # Check for unusual commands
        if activity_type == 'EXEC':
            cmd_anomaly = self._check_command_anomaly(details, similar_windows)
            if cmd_anomaly:
                anomalies.append(cmd_anomaly)
        
        # Check for unusual directories
        if activity_type in ('READ', 'WRITE', 'EDIT'):
            dir_anomaly = self._check_directory_anomaly(details, similar_windows)
            if dir_anomaly:
                anomalies.append(dir_anomaly)
        
        # Check for unusual network
        if activity_type == 'NETWORK':
            net_anomaly = self._check_network_anomaly(details, similar_windows)
            if net_anomaly:
                anomalies.append(net_anomaly)
        
        if anomalies:
            return {
                'is_anomaly': True,
                'reasons': anomalies,
                'severity': 'high' if len(anomalies) > 1 else 'medium'
            }
        return None
    
    def _check_rate_anomaly(self, activity_type: str, windows: List[Dict]) -> Optional[str]:
        """Check if activity rate is anomalous."""
        # Get historical counts for this activity type
        historical = [w['counts'].get(activity_type, 0) for w in windows]
        if not historical or all(h == 0 for h in historical):
            return None
        
        current_count = self.current_window['counts'].get(activity_type, 0)
        mean = statistics.mean(historical) if historical else 0
        
        if mean == 0:
            if current_count > 10:
                return f"Unusual {activity_type} activity: {current_count} ops (normally none)"
            return None
        
        # Flag if more than 3x normal
        if current_count > mean * 3 and current_count > 5:
            return f"High {activity_type} rate: {current_count} ops (normal: ~{mean:.0f})"
        
        return None
    
    def _check_command_anomaly(self, details: Dict, windows: List[Dict]) -> Optional[str]:
        """Check if command is unusual."""
        cmd = details.get('command', '').split()[0] if details.get('command') else None
        if not cmd:
            return None
        
        # Build set of known commands
        known_commands = set()
        for w in windows:
            known_commands.update(w.get('commands', {}).keys())
        
        # Check for sensitive commands that are rarely used
        sensitive_commands = {
            'curl', 'wget', 'nc', 'ncat', 'netcat', 'ssh', 'scp', 
            'base64', 'xxd', 'dd', 'tar', 'zip', 'gpg',
            'chmod', 'chown', 'sudo', 'su', 'passwd',
            'crontab', 'systemctl', 'launchctl'
        }
        
        if cmd in sensitive_commands and cmd not in known_commands:
            return f"First-time sensitive command: {cmd}"
        
        return None
    
    def _check_directory_anomaly(self, details: Dict, windows: List[Dict]) -> Optional[str]:
        """Check if directory access is unusual."""
        path = details.get('path', '')
        if not path:
            return None
        
        dir_path = str(Path(path).parent)
        
        # Check for sensitive directories
        sensitive_patterns = [
            '.ssh', '.aws', '.gnupg', '.config/gcloud',
            'Cookies', 'Login Data', 'Keychain',
            '/etc/passwd', '/etc/shadow', '/etc/sudoers'
        ]
        
        for pattern in sensitive_patterns:
            if pattern in path:
                # Check if we've accessed this before
                known_dirs = set()
                for w in windows:
                    known_dirs.update(w.get('directories', {}).keys())
                
                if dir_path not in known_dirs:
                    return f"First-time access to sensitive path: {path}"
        
        return None
    
    def _check_network_anomaly(self, details: Dict, windows: List[Dict]) -> Optional[str]:
        """Check if network destination is unusual."""
        remote = details.get('remote', '')
        if not remote or remote == '-':
            return None
        
        # Build set of known destinations
        known_remotes = set()
        for w in windows:
            known_remotes.update(w.get('network', {}).keys())
        
        # Check for new external IPs (not localhost/LAN)
        if remote not in known_remotes:
            # Skip localhost and common LAN ranges
            if not any(x in remote for x in ['127.0.0.1', '::1', '192.168.', '10.0.', '172.16.']):
                return f"New network destination: {remote}"
        
        return None
    
    def get_stats(self) -> Dict:
        """Get baseline statistics for display."""
        if not self.baseline['windows']:
            return {
                'learned': False,
                'windows_collected': 0,
                'windows_needed': self.baseline['min_windows'],
                'message': 'Collecting baseline data...'
            }
        
        windows = self.baseline['windows']
        
        # Aggregate stats
        total_counts = defaultdict(int)
        all_commands = defaultdict(int)
        all_directories = defaultdict(int)
        
        for w in windows:
            for k, v in w.get('counts', {}).items():
                total_counts[k] += v
            for k, v in w.get('commands', {}).items():
                all_commands[k] += v
            for k, v in w.get('directories', {}).items():
                all_directories[k] += v
        
        return {
            'learned': self.baseline['learned'],
            'windows_collected': len(windows),
            'windows_needed': self.baseline['min_windows'],
            'hours_of_data': len(windows),
            'activity_totals': dict(total_counts),
            'top_commands': dict(sorted(all_commands.items(), key=lambda x: -x[1])[:10]),
            'top_directories': dict(sorted(all_directories.items(), key=lambda x: -x[1])[:10]),
        }


# Singleton
_baseline = None

def get_baseline() -> BehaviorBaseline:
    global _baseline
    if _baseline is None:
        _baseline = BehaviorBaseline()
    return _baseline
