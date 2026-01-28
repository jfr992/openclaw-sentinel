"""
Pytest fixtures for MoltBot Guardian tests.
"""
import pytest
import tempfile
import json
from pathlib import Path


@pytest.fixture
def temp_dir():
    """Create a temporary directory for test files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def mock_config_dir(temp_dir):
    """Create a mock .clawdbot config directory."""
    config_dir = temp_dir / '.clawdbot' / 'security'
    config_dir.mkdir(parents=True)
    return config_dir


@pytest.fixture
def mock_session_file(temp_dir):
    """Create a mock session file with sample messages."""
    session_file = temp_dir / 'session.jsonl'
    
    messages = [
        {"type": "message", "message": {"role": "user", "content": "Please run npm install"}},
        {"type": "message", "message": {"role": "assistant", "content": "I'll run npm install for you."}},
        {"type": "message", "message": {"role": "user", "content": "Now build the project"}},
        {"type": "message", "message": {"role": "assistant", "content": "Running npm run build..."}},
    ]
    
    with open(session_file, 'w') as f:
        for msg in messages:
            f.write(json.dumps(msg) + '\n')
    
    return session_file


@pytest.fixture
def sample_alert():
    """Sample alert for testing."""
    return {
        'title': 'Lockfile Modified: package-lock.json',
        'category': 'file_modification',
        'severity': 'low',
        'description': 'Package lockfile was modified',
        'details': {
            'path': '/project/package-lock.json',
            'process': 'npm'
        }
    }


@pytest.fixture
def suspicious_alert():
    """Suspicious alert for testing."""
    return {
        'title': 'Suspicious Network Connection',
        'category': 'network',
        'severity': 'high',
        'description': 'Connection to unknown IP',
        'details': {
            'host': '192.168.1.100',
            'port': 4444,
            'process': 'nc'
        }
    }
