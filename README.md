<div align="center">

# 🦀 MoltBot Security Dashboard

**Real-time security monitoring for [molt.bot](https://molt.bot) AI agents**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)

</div>

---

## What is this?

An **optional security layer** for [molt.bot](https://molt.bot) that monitors your AI agent's activity in real-time:

- 👁️ **Activity Log** — See every tool call (exec, read, write, browser)
- 🚨 **Security Alerts** — Detect reverse shells, data exfil, privilege escalation
- 📊 **Baseline Learning** — Learns normal patterns, flags anomalies
- 🔐 **Encrypted Baselines** — Optional AES-256-GCM for sensitive environments
- 🌐 **Network Monitor** — Track active connections with process attribution

Reads from `~/.clawdbot` (where molt.bot stores session logs).

---

## vs Crabwalk

| | **This (Security)** | **[Crabwalk](https://github.com/luccast/crabwalk)** |
|---|---|---|
| **Purpose** | Detect threats | Watch agents work |
| **View** | Activity log + alerts | Node graph visualization |
| **Focus** | Security monitoring | Real-time streaming |
| **Use case** | "Is my agent doing something bad?" | "What is my agent doing?" |

**They're complementary** — use both for full visibility.

---

## Installation

### Docker (Recommended)

```bash
docker run -d \
  --name moltbot-security \
  -p 5050:5050 \
  -v ~/.clawdbot:/data:ro \
  ghcr.io/jfr992/moltbot-security-dashboard:latest
```

Or with docker-compose:

```bash
curl -O https://raw.githubusercontent.com/jfr992/moltbot-security-dashboard/main/docker-compose.yml
docker-compose up -d
```

### From Source

```bash
git clone https://github.com/jfr992/moltbot-security-dashboard.git ~/.moltbot-security
cd ~/.moltbot-security && ./setup.sh
./start.sh
```

**Dashboard:** http://localhost:5050

---

## Features

### Detection Patterns

| Threat | Method |
|--------|--------|
| Pipe to shell (`curl \| sh`) | Pattern matching |
| Reverse shells | Signature detection |
| Data exfiltration | Network + file analysis |
| Privilege escalation | Command monitoring |
| Sensitive file access | Path monitoring |
| Behavioral anomalies | Baseline deviation |

### Dashboard Sections

- **Tool Calls** — Count of agent actions in last 24h
- **Connections** — Active network connections
- **File Ops** — Recent read/write/edit operations
- **Alerts** — Security issues detected
- **Activity Log** — Real-time feed of all tool calls
- **Network Activity** — Connections grouped by process

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MOLTBOT_PORT` | `5050` | Dashboard port |
| `MOLTBOT_HOST` | `127.0.0.1` | Bind address |
| `CLAWDBOT_DIR` | `~/.clawdbot` | Agent logs directory |

### Baseline Settings

Configure via Settings → Baseline, or API:

| Setting | Options | Description |
|---------|---------|-------------|
| **Learning Period** | 1h, 6h, 24h, 7d | Time to learn "normal" patterns |
| **Sensitivity** | low, medium, high, paranoid | Alert threshold |
| **Whitelist** | commands, paths, IPs | Ignore specific items |

```bash
# API example: set to paranoid mode with 6h learning
curl -X POST http://localhost:5050/api/baseline/config \
  -H "Content-Type: application/json" \
  -d '{"sensitivity": "paranoid", "learning_period": 6}'
```

---

## Security

Runs **locally only** — no data leaves your machine.

Local vulnerability scanning:
```bash
./scripts/security-check.sh
```

---

## License

MIT

---

<div align="center">

**[molt.bot](https://molt.bot)** — AI agents that work for you

</div>
