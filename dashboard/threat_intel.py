"""
Threat Intelligence - Known bad patterns, CVEs, and threat indicators.
"""
import re
from typing import Dict, List, Optional
from dataclasses import dataclass
from enum import Enum


class ThreatSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class ThreatPattern:
    id: str
    name: str
    description: str
    severity: ThreatSeverity
    pattern: str  # Regex pattern
    category: str
    mitre_id: Optional[str] = None  # MITRE ATT&CK ID
    cve: Optional[str] = None
    remediation: Optional[str] = None


# Known threat patterns database
THREAT_PATTERNS: List[ThreatPattern] = [
    # === EXECUTION ===
    ThreatPattern(
        id="EXEC-001",
        name="Pipe to Shell",
        description="Downloads and executes remote code in one command",
        severity=ThreatSeverity.CRITICAL,
        pattern=r"(curl|wget|fetch)\s+.*\|\s*(ba)?sh",
        category="execution",
        mitre_id="T1059.004",
        remediation="Review the URL being fetched. Never pipe untrusted URLs to shell."
    ),
    ThreatPattern(
        id="EXEC-002",
        name="Base64 Decode Execute",
        description="Decodes and executes base64-encoded payload",
        severity=ThreatSeverity.HIGH,
        pattern=r"(echo|printf).*\|\s*base64\s+-d\s*\|\s*(ba)?sh",
        category="execution",
        mitre_id="T1027",
        remediation="Decode the base64 payload to inspect contents before execution."
    ),
    ThreatPattern(
        id="EXEC-003",
        name="Python Reverse Shell",
        description="Python code creating reverse shell connection",
        severity=ThreatSeverity.CRITICAL,
        pattern=r"python.*-c.*socket.*connect",
        category="execution",
        mitre_id="T1059.006",
        remediation="Terminate the process immediately. Check for persistence."
    ),
    ThreatPattern(
        id="EXEC-004",
        name="Bash Reverse Shell",
        description="Bash reverse shell using /dev/tcp",
        severity=ThreatSeverity.CRITICAL,
        pattern=r"bash.*-i.*>&\s*/dev/tcp/",
        category="execution",
        mitre_id="T1059.004",
        remediation="Terminate immediately. Check network connections."
    ),
    ThreatPattern(
        id="EXEC-005",
        name="Netcat Listener",
        description="Netcat listening for incoming connections",
        severity=ThreatSeverity.HIGH,
        pattern=r"(nc|ncat|netcat)\s+(-[a-z]+\s+)*-l",
        category="execution",
        mitre_id="T1059",
        remediation="Check what's connecting to this listener."
    ),

    # === PERSISTENCE ===
    ThreatPattern(
        id="PERS-001",
        name="Crontab Modification",
        description="Adding scheduled task for persistence",
        severity=ThreatSeverity.HIGH,
        pattern=r"crontab\s+(-[a-z]+\s+)*-[el]|echo.*>>\s*.*cron",
        category="persistence",
        mitre_id="T1053.003",
        remediation="Review crontab entries: crontab -l"
    ),
    ThreatPattern(
        id="PERS-002",
        name="LaunchAgent Creation",
        description="Creating macOS LaunchAgent for persistence",
        severity=ThreatSeverity.HIGH,
        pattern=r"(LaunchAgents|LaunchDaemons).*\.plist",
        category="persistence",
        mitre_id="T1543.001",
        remediation="Check ~/Library/LaunchAgents and /Library/LaunchDaemons"
    ),
    ThreatPattern(
        id="PERS-003",
        name="Shell Profile Modification",
        description="Modifying shell startup files",
        severity=ThreatSeverity.MEDIUM,
        pattern=r">>\s*~?/.*\.(bashrc|zshrc|profile|bash_profile)",
        category="persistence",
        mitre_id="T1546.004",
        remediation="Review shell config files for unauthorized additions."
    ),

    # === CREDENTIAL ACCESS ===
    ThreatPattern(
        id="CRED-001",
        name="SSH Key Access",
        description="Accessing SSH private keys",
        severity=ThreatSeverity.HIGH,
        pattern=r"(cat|less|more|head|tail|cp|scp).*\.ssh/(id_|known_hosts|authorized)",
        category="credential_access",
        mitre_id="T1552.004",
        remediation="Check if SSH keys were exfiltrated."
    ),
    ThreatPattern(
        id="CRED-002",
        name="AWS Credentials Access",
        description="Accessing AWS credentials file",
        severity=ThreatSeverity.CRITICAL,
        pattern=r"(cat|less|more|cp).*\.aws/(credentials|config)",
        category="credential_access",
        mitre_id="T1552.001",
        remediation="Rotate AWS credentials immediately."
    ),
    ThreatPattern(
        id="CRED-003",
        name="Browser Data Access",
        description="Accessing browser cookies or login data",
        severity=ThreatSeverity.CRITICAL,
        pattern=r"(Cookies|Login Data|Web Data).*sqlite",
        category="credential_access",
        mitre_id="T1539",
        remediation="Check for data exfiltration. Consider rotating passwords."
    ),
    ThreatPattern(
        id="CRED-004",
        name="Keychain Access",
        description="Accessing macOS Keychain",
        severity=ThreatSeverity.CRITICAL,
        pattern=r"security\s+(find|dump|export).*keychain",
        category="credential_access",
        mitre_id="T1555.001",
        remediation="Review keychain access logs."
    ),

    # === EXFILTRATION ===
    ThreatPattern(
        id="EXFIL-001",
        name="Data Upload",
        description="Uploading files to external server",
        severity=ThreatSeverity.HIGH,
        pattern=r"curl.*(-F|--form|--data|--upload-file).*@",
        category="exfiltration",
        mitre_id="T1041",
        remediation="Check what data was uploaded and to where."
    ),
    ThreatPattern(
        id="EXFIL-002",
        name="Archive and Exfil",
        description="Creating archive for exfiltration",
        severity=ThreatSeverity.MEDIUM,
        pattern=r"(tar|zip|7z).*\.(tar|gz|zip|7z).*&&.*(curl|wget|scp|rsync)",
        category="exfiltration",
        mitre_id="T1560.001",
        remediation="Check archive contents and destination."
    ),
    ThreatPattern(
        id="EXFIL-003",
        name="DNS Exfiltration",
        description="Possible DNS tunneling for data exfiltration",
        severity=ThreatSeverity.HIGH,
        pattern=r"(dig|nslookup|host)\s+.*\$\(",
        category="exfiltration",
        mitre_id="T1048.003",
        remediation="Monitor DNS queries for encoded data."
    ),

    # === DEFENSE EVASION ===
    ThreatPattern(
        id="EVADE-001",
        name="History Clearing",
        description="Clearing command history",
        severity=ThreatSeverity.MEDIUM,
        pattern=r"(history\s+-c|>\s*.*history|rm.*history|unset\s+HISTFILE)",
        category="defense_evasion",
        mitre_id="T1070.003",
        remediation="Investigate what commands were run before clearing."
    ),
    ThreatPattern(
        id="EVADE-002",
        name="Log Tampering",
        description="Modifying or deleting logs",
        severity=ThreatSeverity.HIGH,
        pattern=r"(rm|truncate|>).*(/var/log/|\.log|syslog)",
        category="defense_evasion",
        mitre_id="T1070.002",
        remediation="Check backup logs or remote logging."
    ),

    # === PRIVILEGE ESCALATION ===
    ThreatPattern(
        id="PRIVESC-001",
        name="Sudo without TTY",
        description="Attempting sudo in script context",
        severity=ThreatSeverity.MEDIUM,
        pattern=r"echo.*\|\s*sudo\s+-S",
        category="privilege_escalation",
        mitre_id="T1548.003",
        remediation="Check what command was run with sudo."
    ),
    ThreatPattern(
        id="PRIVESC-002",
        name="SUID Binary Creation",
        description="Creating SUID binary for privilege escalation",
        severity=ThreatSeverity.CRITICAL,
        pattern=r"chmod\s+[u+]*s|chmod\s+[0-7]*4[0-7]{3}",
        category="privilege_escalation",
        mitre_id="T1548.001",
        remediation="Find and remove unauthorized SUID binaries."
    ),
]

# Suspicious network destinations
SUSPICIOUS_DESTINATIONS = [
    # Known bad IPs would go here (placeholder)
    # In production, this would be loaded from threat feeds
]

# Suspicious ports
SUSPICIOUS_PORTS = {
    4444: "Metasploit default",
    5555: "Common RAT port",
    6666: "IRC/Botnet",
    6667: "IRC",
    31337: "Elite/Back Orifice",
    12345: "NetBus",
    27374: "SubSeven",
}


class ThreatIntel:
    """Threat intelligence engine."""

    def __init__(self):
        self.patterns = THREAT_PATTERNS
        self._compiled = {p.id: re.compile(p.pattern, re.IGNORECASE) for p in self.patterns}

    def analyze_command(self, command: str) -> List[Dict]:
        """Analyze a command for known threat patterns."""
        matches = []

        for pattern in self.patterns:
            compiled = self._compiled[pattern.id]
            if compiled.search(command):
                matches.append({
                    'threat_id': pattern.id,
                    'name': pattern.name,
                    'description': pattern.description,
                    'severity': pattern.severity.value,
                    'category': pattern.category,
                    'mitre_id': pattern.mitre_id,
                    'remediation': pattern.remediation,
                    'matched_pattern': pattern.pattern,
                })

        return matches

    def analyze_network(self, remote: str, port: int) -> Optional[Dict]:
        """Analyze network connection for suspicious activity."""
        if port in SUSPICIOUS_PORTS:
            return {
                'threat_id': f'NET-{port}',
                'name': f'Suspicious Port {port}',
                'description': SUSPICIOUS_PORTS[port],
                'severity': 'high',
                'category': 'network',
                'remediation': f'Investigate why port {port} is being used.',
            }
        return None

    def get_all_patterns(self) -> List[Dict]:
        """Get all threat patterns for display."""
        return [
            {
                'id': p.id,
                'name': p.name,
                'description': p.description,
                'severity': p.severity.value,
                'category': p.category,
                'mitre_id': p.mitre_id,
            }
            for p in self.patterns
        ]


# Singleton
_intel: Optional[ThreatIntel] = None

def get_threat_intel() -> ThreatIntel:
    global _intel
    if _intel is None:
        _intel = ThreatIntel()
    return _intel
