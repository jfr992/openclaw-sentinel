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

# Suspicious network destinations - domains associated with malware/C2
SUSPICIOUS_DOMAINS = [
    # Tunneling / Proxy services (potential C2)
    ("ngrok.io", "Tunneling service - potential C2", "high"),
    ("ngrok.com", "Tunneling service - potential C2", "high"),
    ("serveo.net", "SSH tunneling service", "high"),
    ("localtunnel.me", "Tunneling service", "medium"),
    ("localhost.run", "SSH tunneling service", "medium"),
    ("telebit.cloud", "Tunneling service", "medium"),
    ("pagekite.me", "Tunneling service", "medium"),
    ("bore.pub", "Tunneling service", "medium"),

    # Anonymous file sharing (exfiltration risk)
    ("pastebin.com", "Public paste service - exfil risk", "medium"),
    ("hastebin.com", "Public paste service - exfil risk", "medium"),
    ("ghostbin.com", "Public paste service - exfil risk", "medium"),
    ("0x0.st", "Anonymous file hosting", "high"),
    ("file.io", "Ephemeral file sharing", "medium"),
    ("transfer.sh", "Anonymous file transfer", "medium"),
    ("temp.sh", "Temporary file hosting", "medium"),
    ("catbox.moe", "Anonymous file hosting", "medium"),
    ("litterbox.catbox.moe", "Anonymous file hosting", "medium"),
    ("uguu.se", "Anonymous file hosting", "medium"),
    ("fileditch.com", "Anonymous file hosting", "medium"),

    # Known malware / C2 infrastructure patterns
    ("tor2web", "Tor gateway - dark web access", "critical"),
    (".onion.", "Tor hidden service", "critical"),
    ("duckdns.org", "Dynamic DNS - often used by malware", "high"),
    ("no-ip.com", "Dynamic DNS - often used by malware", "high"),
    ("no-ip.org", "Dynamic DNS - often used by malware", "high"),
    ("dynu.com", "Dynamic DNS - potential C2", "medium"),
    ("freedns.afraid.org", "Dynamic DNS - potential C2", "medium"),
    ("changeip.com", "Dynamic DNS - potential C2", "medium"),

    # Crypto mining pools
    (".pool.", "Possible crypto mining pool", "high"),
    ("nanopool.org", "Crypto mining pool", "high"),
    ("f2pool.com", "Crypto mining pool", "high"),
    ("antpool.com", "Crypto mining pool", "high"),
    ("ethermine.org", "Crypto mining pool", "high"),
    ("2miners.com", "Crypto mining pool", "high"),
    ("nicehash.com", "Crypto mining pool", "high"),
    ("minergate.com", "Crypto mining pool", "high"),
    ("slushpool.com", "Crypto mining pool", "high"),

    # VPN/Proxy services that may hide traffic
    ("mullvad.net", "VPN service - may hide traffic", "low"),
    ("nordvpn.com", "VPN service - may hide traffic", "low"),
    ("expressvpn.com", "VPN service - may hide traffic", "low"),

    # Request/webhook catchers (exfil testing)
    ("requestbin.com", "HTTP request capture", "medium"),
    ("webhook.site", "Webhook capture service", "medium"),
    ("pipedream.com", "Webhook capture service", "medium"),
    ("beeceptor.com", "HTTP mock/capture service", "medium"),
    ("httpbin.org", "HTTP testing service", "low"),
    ("postb.in", "HTTP request capture", "medium"),
    ("requestcatcher.com", "HTTP request capture", "medium"),
    ("hookbin.com", "Webhook capture", "medium"),

    # IP lookup (recon)
    ("ipinfo.io", "IP information lookup - recon", "low"),
    ("ip-api.com", "IP information lookup - recon", "low"),
    ("ifconfig.me", "External IP lookup - recon", "low"),
    ("icanhazip.com", "External IP lookup - recon", "low"),
    ("checkip.amazonaws.com", "External IP lookup - recon", "low"),

    # Suspicious TLDs often used by attackers
    (".top", "Suspicious TLD - often abused", "low"),
    (".xyz", "Suspicious TLD - often abused", "low"),
    (".tk", "Free TLD - often abused", "medium"),
    (".ml", "Free TLD - often abused", "medium"),
    (".ga", "Free TLD - often abused", "medium"),
    (".cf", "Free TLD - often abused", "medium"),
    (".gq", "Free TLD - often abused", "medium"),
]

# Suspicious IP ranges (CIDR notation would be ideal but using prefixes for simplicity)
SUSPICIOUS_IP_RANGES = [
    # Tor exit nodes (sample - would need live feed in production)
    ("185.220.101.", "Known Tor exit node range", "high"),
    ("185.220.102.", "Known Tor exit node range", "high"),
    ("45.153.160.", "Bulletproof hosting", "high"),
    ("194.26.192.", "Bulletproof hosting", "high"),
]

# Suspicious ports
SUSPICIOUS_PORTS = {
    # RATs and backdoors
    4444: ("Metasploit default", "critical"),
    4445: ("Metasploit/Meterpreter", "critical"),
    5555: ("Common RAT port / ADB", "high"),
    6666: ("IRC/Botnet", "high"),
    6667: ("IRC (unencrypted)", "medium"),
    6697: ("IRC over TLS", "low"),
    31337: ("Elite/Back Orifice", "critical"),
    12345: ("NetBus", "critical"),
    27374: ("SubSeven", "critical"),
    1337: ("Elite hacker port", "high"),
    1234: ("Common backdoor port", "medium"),

    # Remote access
    3389: ("RDP - Remote Desktop", "medium"),
    5900: ("VNC", "medium"),
    5901: ("VNC", "medium"),
    22: ("SSH - expected but monitor", "low"),
    23: ("Telnet - insecure", "high"),

    # Crypto mining
    3333: ("Common crypto mining pool port", "high"),
    8008: ("Common crypto mining pool port", "high"),
    8080: ("HTTP alt - may be mining or proxy", "low"),
    9999: ("Common malware/mining port", "medium"),
    14444: ("Mining pool port", "high"),
    45700: ("Monero mining", "high"),

    # Proxy/Tunneling
    1080: ("SOCKS proxy", "medium"),
    8888: ("HTTP proxy / Jupyter", "low"),
    9050: ("Tor SOCKS proxy", "high"),
    9051: ("Tor control port", "high"),
    9150: ("Tor Browser SOCKS", "high"),

    # Other suspicious
    6379: ("Redis - should not be exposed", "high"),
    27017: ("MongoDB - should not be exposed", "high"),
    11211: ("Memcached - should not be exposed", "high"),
    2375: ("Docker API unencrypted - critical exposure", "critical"),
    2376: ("Docker API - should verify TLS", "medium"),
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

    def analyze_network(self, remote: str, port: int, hostname: str = None) -> List[Dict]:
        """Analyze network connection for suspicious activity."""
        threats = []

        # Check suspicious ports
        if port and port in SUSPICIOUS_PORTS:
            port_info = SUSPICIOUS_PORTS[port]
            threats.append({
                'threat_id': f'NET-PORT-{port}',
                'name': f'Suspicious Port: {port}',
                'description': port_info[0],
                'severity': port_info[1],
                'category': 'network',
                'indicator': f'port:{port}',
                'remediation': f'Investigate why port {port} is being used. {port_info[0]}',
            })

        # Check hostname/domain for suspicious patterns
        check_hostname = (hostname or '').lower()
        check_remote = (remote or '').lower()

        for domain_pattern, description, severity in SUSPICIOUS_DOMAINS:
            if domain_pattern in check_hostname or domain_pattern in check_remote:
                threats.append({
                    'threat_id': f'NET-DOMAIN-{hash(domain_pattern) % 10000}',
                    'name': f'Suspicious Domain: {domain_pattern}',
                    'description': description,
                    'severity': severity,
                    'category': 'network',
                    'indicator': f'domain:{domain_pattern}',
                    'matched': hostname or remote,
                    'remediation': f'Investigate connection to {domain_pattern}. {description}',
                })

        # Check IP ranges
        for ip_prefix, description, severity in SUSPICIOUS_IP_RANGES:
            if remote and remote.startswith(ip_prefix):
                threats.append({
                    'threat_id': f'NET-IP-{hash(ip_prefix) % 10000}',
                    'name': f'Suspicious IP Range',
                    'description': description,
                    'severity': severity,
                    'category': 'network',
                    'indicator': f'ip:{ip_prefix}*',
                    'matched': remote,
                    'remediation': f'Investigate connection to {remote}. {description}',
                })

        return threats

    def analyze_connection(self, conn: Dict) -> Dict:
        """Analyze a full connection dict and return enriched info."""
        remote = conn.get('remote', '')
        hostname = conn.get('hostname', '')
        port = 0

        # Extract port from remote
        if ':' in remote:
            try:
                port = int(remote.split(':')[-1])
            except ValueError:
                pass

        threats = self.analyze_network(remote.split(':')[0] if ':' in remote else remote, port, hostname)

        return {
            **conn,
            'threats': threats,
            'is_suspicious': len(threats) > 0,
            'max_severity': max([t['severity'] for t in threats], key=lambda s: {'low': 1, 'medium': 2, 'high': 3, 'critical': 4}.get(s, 0)) if threats else None,
        }

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
