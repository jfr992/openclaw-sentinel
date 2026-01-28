<div align="center">

# 🦀 MoltBot Guardian

**Security dashboard extension for MoltBot operations**

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
| `CLAWDBOT_URL` | `ws://127.0.0.1:18789` | Gateway WebSocket URL (auto-detects Docker) |
| `CLAWDBOT_API_TOKEN` | *(from config)* | Gateway auth token |

> **Note:** Network monitoring requires `lsof` and is disabled in Docker (container can only see its own traffic). Run natively for full network visibility.

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

## OpenTelemetry Integration

MoltBot Guardian can receive telemetry directly from Clawdbot! Add this to `~/.clawdbot/clawdbot.json`:

```json
{
  "plugins": {
    "allow": ["diagnostics-otel"],
    "entries": {
      "diagnostics-otel": { "enabled": true }
    }
  },
  "diagnostics": {
    "enabled": true,
    "otel": {
      "enabled": true,
      "endpoint": "http://localhost:4318",
      "traces": true,
      "metrics": true,
      "logs": false
    }
  }
}
```

Then run with the observability stack:

```bash
docker-compose up -d
```

**Dashboards:**
- http://localhost:3000 — Grafana (admin/moltbot)
- http://localhost:16686 — Jaeger traces
- http://localhost:9090 — Prometheus

**Metrics from Clawdbot:**
- `clawdbot.tokens` — Token usage by model/channel
- `clawdbot.cost.usd` — API costs
- `clawdbot.run.duration_ms` — Run times
- `clawdbot.webhook.received` — Webhook traffic
- `clawdbot.message.processed` — Message throughput

---

## Real-time Gateway Events

MoltBot connects to Clawdbot's gateway WebSocket for live monitoring:

```
✅ Tool calls as they happen
✅ Chat/message events
✅ Session state changes
✅ Presence updates
```

Auto-configures from `~/.clawdbot/clawdbot.json` (reads `gateway.auth.token` and `gateway.port`).

**Docker:** Automatically uses `host.docker.internal` to reach the host gateway.

**Status Indicator:** Header shows **LIVE** (cyan) when connected, **OFFLINE** (gray) when disconnected.

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
