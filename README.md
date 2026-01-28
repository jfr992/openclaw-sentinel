<div align="center">

# 🦀 MoltBot Guardian

**Security dashboard for AI agent operations**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue.svg)](https://github.com/jfr992/moltbot-security-dashboard/pkgs/container/moltbot-guardian)

</div>

---

## Quick Start

```bash
docker run -d --name moltbot-guardian \
  -p 5050:5050 \
  -v ~/.clawdbot:/data:ro \
  ghcr.io/jfr992/moltbot-guardian:latest
```

**Dashboard:** http://localhost:5050

---

## Features

| Feature | Description |
|---------|-------------|
| 🚨 Security Alerts | Detect shells, exfil, privesc |
| 📊 Baseline Learning | Learns normal → flags anomalies |
| 🔐 Encrypted Baselines | AES-256-GCM for sensitive envs |
| 🌐 Network Monitor | Track connections (native only) |
| ⚡ Live Events | Real-time via gateway WebSocket |
| 📈 OpenTelemetry | Traces, metrics, logs (optional) |

---

## How It Works

**Data sources:**
1. **Session files** — Parses `~/.clawdbot/agents/*.jsonl`
2. **Gateway WebSocket** — Live events from Clawdbot
3. **Network (native only)** — Uses `lsof` for connection tracking

**Docker note:** Network monitoring disabled in containers.

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MOLTBOT_PORT` | `5050` | Dashboard port |
| `CLAWDBOT_DIR` | `~/.clawdbot` | Agent logs |
| `CLAWDBOT_URL` | auto | Gateway URL |

---

## OpenTelemetry (Optional)

> ⚠️ **Known Issue:** OTEL integration requires additional setup.
> See [#1](https://github.com/jfr992/moltbot-security-dashboard/issues/1)

Enable in `~/.clawdbot/clawdbot.json`:
```json
{
  "diagnostics": {
    "otel": {
      "enabled": true,
      "endpoint": "http://localhost:4318"
    }
  }
}
```

Run with observability stack:
```bash
docker compose -f docker-compose.otel.yml up -d
```

**Dashboards:**
- Grafana: http://localhost:3000
- Jaeger: http://localhost:16686

---

## Development

```bash
./dev.sh setup   # Install deps + pre-commit
./dev.sh start   # Run locally
./dev.sh lint    # Run checks
./dev.sh docker  # Build & run container
```

---

## License

MIT — Juan Reyes
