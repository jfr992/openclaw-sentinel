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

Guardian exports metrics and traces via OpenTelemetry for integration with your observability stack.

### Quick Start with Grafana

```bash
# Start Guardian + OTEL Collector + Prometheus + Grafana
docker-compose -f docker-compose.yml -f docker-compose.otel.yaml up -d
```

**Dashboards:**
- Guardian UI: http://localhost:5050
- Grafana: http://localhost:3000 (admin/guardian)
- Prometheus: http://localhost:9090

### Metrics Exported

| Metric | Type | Description |
|--------|------|-------------|
| `moltbot_alerts_total` | Counter | Security alerts by severity/category |
| `moltbot_tool_calls_total` | Counter | Tool calls by type and success |
| `moltbot_tokens_total` | Counter | Token usage by model (input/output) |
| `moltbot_cost_total` | Counter | API cost in USD |
| `moltbot_connections_active` | Gauge | Active network connections |
| `moltbot_gateway_connected` | Gauge | Gateway connection status |

### Custom OTEL Backend

Set these environment variables to export to your own collector:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://your-collector:4317
OTEL_SERVICE_NAME=moltbot-guardian
```

Supports any OTLP-compatible backend: Grafana Cloud, Datadog, Honeycomb, Jaeger, etc.

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
