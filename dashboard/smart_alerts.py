"""
Smart Alert Filtering - Learn what's normal, only alert on truly suspicious activity.
"""
import json
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict

LEARNED_PATTERNS_FILE = Path.home() / '.clawdbot' / 'security' / 'learned_patterns.json'

class SmartAlertFilter:
    def __init__(self):
        self.learned = self._load_learned()

        # Built-in patterns that are almost never real threats
        self.benign_patterns = [
            # Development activity
            'package-lock.json',
            'package.json',
            'yarn.lock',
            'Cargo.lock',
            'Gemfile.lock',
            'poetry.lock',
            'pnpm-lock.yaml',
            '.git/',
            'node_modules/',
            '__pycache__/',
            '.pyc',
            '.npm/',
            '.cache/',

            # Normal system activity
            '.DS_Store',
            '.Trash',
            'Library/Caches',
            'Library/Preferences',
            '/var/folders/',
            '/tmp/',  # nosec B108 - filter pattern

            # IDE/Editor
            '.vscode/',
            '.idea/',
            '*.swp',
            '.eslintcache',
        ]

        # Categories of alerts to auto-suppress if seen in baseline
        self.baseline_suppressible = [
            'behavioral_anomaly',
            'rate_spike',
            'lockfile',
        ]

    def _load_learned(self):
        if LEARNED_PATTERNS_FILE.exists():
            try:
                return json.loads(LEARNED_PATTERNS_FILE.read_text())
            except:
                pass
        return {
            'dismissed_patterns': [],  # Patterns user has dismissed
            'known_safe_processes': [],  # Processes marked as safe
            'known_safe_paths': [],  # Paths marked as safe
            'suppressed_categories': [],  # Alert categories to suppress
            'last_updated': None,
        }

    def _save_learned(self):
        LEARNED_PATTERNS_FILE.parent.mkdir(parents=True, exist_ok=True)
        self.learned['last_updated'] = datetime.now().isoformat()
        LEARNED_PATTERNS_FILE.write_text(json.dumps(self.learned, indent=2))

    def should_suppress(self, alert: dict) -> tuple[bool, str]:
        """
        Decide if an alert should be suppressed.
        Returns (should_suppress, reason)
        """
        title = alert.get('title', '')
        category = alert.get('category', '')
        details = alert.get('details', {})
        description = alert.get('description', '')

        # Check built-in benign patterns
        for pattern in self.benign_patterns:
            if pattern in title or pattern in description or pattern in str(details):
                return True, f"Matches benign pattern: {pattern}"

        # Check if user has dismissed similar patterns before
        for dismissed in self.learned.get('dismissed_patterns', []):
            if dismissed in title or dismissed in description:
                return True, f"Previously dismissed: {dismissed}"

        # Check known safe processes
        process = details.get('process', details.get('tool_name', ''))
        if process in self.learned.get('known_safe_processes', []):
            return True, f"Known safe process: {process}"

        # Check known safe paths
        path = details.get('path', details.get('file', ''))
        for safe_path in self.learned.get('known_safe_paths', []):
            if safe_path in path:
                return True, f"Known safe path: {safe_path}"

        # Suppress rate-based behavioral alerts - these are too noisy
        # The baseline is learning, so rate spikes are expected
        if category == 'behavioral_anomaly':
            activity_type = details.get('activity_type', '')
            # Suppress all rate-based alerts during normal operation
            # Real threats would be caught by pattern detection, not rate
            return True, f"Suppressed rate-based alert: {activity_type}"

        return False, ""

    def learn_from_dismissal(self, alert: dict):
        """Learn from user dismissing an alert."""
        title = alert.get('title', '')
        details = alert.get('details', {})

        # Extract pattern to learn
        if 'Lockfile' in title:
            pattern = 'Lockfile'
        elif 'Activity Pattern' in title:
            # Don't learn from these - they're rate-based and temporary
            return
        else:
            # Learn the title pattern
            pattern = title.split(':')[0].strip() if ':' in title else title

        if pattern and pattern not in self.learned['dismissed_patterns']:
            self.learned['dismissed_patterns'].append(pattern)
            self._save_learned()

    def mark_process_safe(self, process: str):
        """Mark a process as known safe."""
        if process not in self.learned['known_safe_processes']:
            self.learned['known_safe_processes'].append(process)
            self._save_learned()

    def mark_path_safe(self, path: str):
        """Mark a path as known safe."""
        if path not in self.learned['known_safe_paths']:
            self.learned['known_safe_paths'].append(path)
            self._save_learned()

    def get_stats(self):
        return {
            'dismissed_patterns': len(self.learned.get('dismissed_patterns', [])),
            'known_safe_processes': len(self.learned.get('known_safe_processes', [])),
            'known_safe_paths': len(self.learned.get('known_safe_paths', [])),
            'benign_patterns': len(self.benign_patterns),
            'last_updated': self.learned.get('last_updated'),
        }

    def clear_learned(self):
        """Reset learned patterns."""
        self.learned = {
            'dismissed_patterns': [],
            'known_safe_processes': [],
            'known_safe_paths': [],
            'suppressed_categories': [],
            'last_updated': None,
        }
        self._save_learned()


# Singleton
_filter = None

def get_smart_filter() -> SmartAlertFilter:
    global _filter
    if _filter is None:
        _filter = SmartAlertFilter()
    return _filter
