"""
Tests for smart_alerts.py - Smart alert filtering.
"""
import pytest
import json
from pathlib import Path
from unittest.mock import patch

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from smart_alerts import SmartAlertFilter


class TestSmartAlertFilter:
    """Tests for SmartAlertFilter class."""

    @pytest.fixture
    def filter_instance(self, temp_dir):
        """Create a SmartAlertFilter with temp storage."""
        learned_file = temp_dir / 'learned_patterns.json'
        with patch('smart_alerts.LEARNED_PATTERNS_FILE', learned_file):
            return SmartAlertFilter()

    def test_init_empty_learned(self, filter_instance):
        """Test initialization with no learned patterns."""
        assert filter_instance.learned['dismissed_patterns'] == []
        assert filter_instance.learned['known_safe_processes'] == []
        assert filter_instance.learned['known_safe_paths'] == []

    def test_benign_patterns_loaded(self, filter_instance):
        """Test benign patterns are loaded."""
        assert len(filter_instance.benign_patterns) > 0
        assert 'package-lock.json' in filter_instance.benign_patterns
        assert 'node_modules/' in filter_instance.benign_patterns
        assert '.git/' in filter_instance.benign_patterns

    def test_suppress_benign_lockfile(self, filter_instance, sample_alert):
        """Test lockfile alerts are suppressed."""
        should_suppress, reason = filter_instance.should_suppress(sample_alert)
        assert should_suppress is True
        assert 'benign pattern' in reason.lower()

    def test_suppress_node_modules(self, filter_instance):
        """Test node_modules alerts are suppressed."""
        alert = {
            'title': 'File Modified',
            'description': 'node_modules/lodash/index.js was modified',
            'category': 'file_modification',
            'details': {}
        }
        should_suppress, reason = filter_instance.should_suppress(alert)
        assert should_suppress is True

    def test_suppress_git_directory(self, filter_instance):
        """Test .git directory alerts are suppressed."""
        alert = {
            'title': 'File Created',
            'description': 'New file in .git/objects',
            'category': 'file_modification',
            'details': {'path': '/project/.git/objects/abc123'}
        }
        should_suppress, reason = filter_instance.should_suppress(alert)
        assert should_suppress is True

    def test_no_suppress_suspicious(self, filter_instance, suspicious_alert):
        """Test suspicious alerts are not suppressed by default."""
        # Modify to not match behavioral_anomaly category
        suspicious_alert['category'] = 'network'
        should_suppress, reason = filter_instance.should_suppress(suspicious_alert)
        assert should_suppress is False

    def test_suppress_behavioral_anomaly(self, filter_instance):
        """Test behavioral anomaly alerts are suppressed (too noisy)."""
        alert = {
            'title': 'Activity Pattern Changed',
            'category': 'behavioral_anomaly',
            'description': 'Unusual activity rate',
            'details': {'activity_type': 'READ'}
        }
        should_suppress, reason = filter_instance.should_suppress(alert)
        assert should_suppress is True
        assert 'rate-based' in reason.lower()

    def test_learn_from_dismissal(self, filter_instance, temp_dir):
        """Test learning from dismissed alerts."""
        alert = {
            'title': 'Custom Alert: Test Pattern',
            'category': 'custom',
            'details': {}
        }
        
        with patch('smart_alerts.LEARNED_PATTERNS_FILE', temp_dir / 'learned.json'):
            filter_instance.learn_from_dismissal(alert)
            assert 'Custom Alert' in filter_instance.learned['dismissed_patterns']

    def test_mark_process_safe(self, filter_instance, temp_dir):
        """Test marking a process as safe."""
        with patch('smart_alerts.LEARNED_PATTERNS_FILE', temp_dir / 'learned.json'):
            filter_instance.mark_process_safe('my_safe_process')
            assert 'my_safe_process' in filter_instance.learned['known_safe_processes']
            
            # Verify alert with this process is suppressed
            alert = {
                'title': 'Process Activity',
                'category': 'process',
                'description': '',
                'details': {'process': 'my_safe_process'}
            }
            should_suppress, reason = filter_instance.should_suppress(alert)
            assert should_suppress is True
            assert 'safe process' in reason.lower()

    def test_mark_path_safe(self, filter_instance, temp_dir):
        """Test marking a path as safe."""
        with patch('smart_alerts.LEARNED_PATTERNS_FILE', temp_dir / 'learned.json'):
            filter_instance.mark_path_safe('/home/user/safe_project')
            assert '/home/user/safe_project' in filter_instance.learned['known_safe_paths']
            
            # Verify alert with this path is suppressed
            alert = {
                'title': 'File Modified',
                'category': 'file',
                'description': '',
                'details': {'path': '/home/user/safe_project/src/file.py'}
            }
            should_suppress, reason = filter_instance.should_suppress(alert)
            assert should_suppress is True
            assert 'safe path' in reason.lower()

    def test_get_stats(self, filter_instance):
        """Test getting filter statistics."""
        stats = filter_instance.get_stats()
        
        assert 'dismissed_patterns' in stats
        assert 'known_safe_processes' in stats
        assert 'known_safe_paths' in stats
        assert 'benign_patterns' in stats
        assert stats['benign_patterns'] > 0

    def test_clear_learned(self, filter_instance, temp_dir):
        """Test clearing learned patterns."""
        with patch('smart_alerts.LEARNED_PATTERNS_FILE', temp_dir / 'learned.json'):
            filter_instance.mark_process_safe('test_process')
            assert len(filter_instance.learned['known_safe_processes']) > 0
            
            filter_instance.clear_learned()
            assert filter_instance.learned['known_safe_processes'] == []
            assert filter_instance.learned['dismissed_patterns'] == []

    def test_suppress_dismissed_pattern(self, filter_instance, temp_dir):
        """Test previously dismissed patterns are suppressed."""
        with patch('smart_alerts.LEARNED_PATTERNS_FILE', temp_dir / 'learned.json'):
            # First, learn from a dismissal
            filter_instance.learned['dismissed_patterns'].append('MyCustomPattern')
            
            # Then check if similar alert is suppressed
            alert = {
                'title': 'MyCustomPattern detected',
                'category': 'custom',
                'description': '',
                'details': {}
            }
            should_suppress, reason = filter_instance.should_suppress(alert)
            assert should_suppress is True
            assert 'dismissed' in reason.lower()
