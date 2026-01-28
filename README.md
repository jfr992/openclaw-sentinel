<div align="center">

# 🦀 MoltBot Guardian

**Real-time security monitoring for AI agent operations**

[![CI](https://github.com/jfr992/moltbot-guardian/actions/workflows/ci.yml/badge.svg)](https://github.com/jfr992/moltbot-guardian/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue.svg)](https://github.com/jfr992/moltbot-guardian/pkgs/container/moltbot-guardian)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![MoltBot Guardian Dashboard](docs/screenshot.png)

</div>

---

## What is this?

A **security monitoring layer** for [MoltBot](https://github.com/moltbot/moltbot) AI agents. It watches what your agents do and alerts you to suspicious activity.

**This is NOT MoltBot itself** — it's a companion tool that monitors MoltBot operations.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **🚨 Security Alerts** | Detects reverse shells, data exfiltration, privilege escalation |
| **⚡ Kill Session** | One-click termination of suspicious agent sessions |
| **🌐 Network Monitor** | Real-time connections with threat detection (50+ domains, 30+ ports) |
| **📊 Operation Stats** | Counters by type: Read, Write, Edit, Exec, Message, Browser |
| **📝 Activity Log** | Real-time feed of all tool calls with timestamps |
| **🧠 Baseline Learning** | Learns normal patterns, flags anomalies |
| **🔐 Local Only** | No external data transmission |

---

## 🚀 Quick Start

### Docker (Recommended)

```bash
# Get your MoltBot gateway token
TOKEN=$(jq -r '.gateway.auth.token' ~/.moltbot/moltbot.json)

# Run Guardian
docker run -d --name guardian \
  -p 5050:5050 \
  -v ~/.moltbot:/data \
  -e MOLTBOT_API_TOKEN="$TOKEN" \
  ghcr.io/jfr992/moltbot-guardian:latest
```

**Dashboard:** http://localhost:5050

### From Source

```bash
git clone https://github.com/jfr992/moltbot-guardian.git
cd moltbot-guardian
./dev.sh setup
./dev.sh start
```

---

## ⚙️ Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MOLTBOT_PORT` | `5050` | Dashboard port |
| `MOLTBOT_DIR` | `~/.moltbot` | Agent session logs location |
| `MOLTBOT_API_TOKEN` | - | Gateway token (for kill functionality) |

---

## 📈 Observability (OpenTelemetry)

Guardian can visualize **Clawdbot's native OTEL metrics** via a bundled collector stack.

### Quick Start

**1. Enable OTEL in Clawdbot** (`~/.clawdbot/clawdbot.json`):

```json
{
  "diagnostics": {
    "otel": {
      "enabled": true,
      "endpoint": "http://localhost:4317",
      "protocol": "grpc",
      "serviceName": "clawdbot",
      "traces": true,
      "metrics": true,
      "logs": true
    }
  }
}
```

**2. Start the collector stack:**

```bash
docker-compose -f docker-compose.yml -f docker-compose.otel.yaml up -d
```

**3. Restart Clawdbot** to apply config:

```bash
clawdbot gateway restart
```

### Dashboards

| Service | URL | Credentials |
|---------|-----|-------------|
| Guardian | http://localhost:5050 | — |
| Grafana | http://localhost:3000 | admin / guardian |
| Prometheus | http://localhost:9090 | — |

### Clawdbot Metrics

Clawdbot exports these via OTEL when enabled:

| Metric | Description |
|--------|-------------|
| `clawdbot.tokens.input` | Input tokens by model |
| `clawdbot.tokens.output` | Output tokens by model |
| `clawdbot.cost.total` | API cost in USD |
| `clawdbot.requests.total` | Total API requests |
| `clawdbot.requests.duration` | Request latency histogram |
| `clawdbot.tool_calls` | Tool invocations by name |
| `clawdbot.sessions.active` | Active session count |

### Custom OTEL Backend

Point Clawdbot to any OTLP-compatible backend:

```json
{
  "diagnostics": {
    "otel": {
      "enabled": true,
      "endpoint": "https://otlp.your-provider.com:4317",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

Supports: Grafana Cloud, Datadog, Honeycomb, Jaeger, SigNoz, etc.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│              MoltBot Guardian                    │
├─────────────────────────────────────────────────┤
│  React Dashboard    │  Flask API + SocketIO     │
│  ├─ Metrics         │  ├─ Session parser        │
│  ├─ Activity Log    │  ├─ Security detector     │
│  ├─ Alerts          │  ├─ Threat intelligence   │
│  ├─ Network         │  └─ Gateway WebSocket     │
│  └─ Operation Stats │                           │
├─────────────────────────────────────────────────┤
│  ~/.moltbot/agents/*.jsonl (session logs)       │
└─────────────────────────────────────────────────┘
```

---

## 📜 License

MIT — See [LICENSE](LICENSE)

---

<div align="center">

**A security layer for MoltBot** 🦀 by [@jfr992](https://github.com/jfr992)

</div>
