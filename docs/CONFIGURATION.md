# Configuration Guide

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5056` | Server port |
| `BIND_ADDRESS` | `127.0.0.1` | Bind address (native), `0.0.0.0` in Docker |
| `OPENCLAW_DIR` | `~/.openclaw` | Path to OpenClaw data directory |
| `DATA_DIR` | `./data` | Path for SQLite database |
| `OPENCLAW_GATEWAY_URL` | `ws://127.0.0.1:18789` | Gateway WebSocket URL |
| `OPENCLAW_GATEWAY_TOKEN` | (from config) | Gateway authentication token |

## Docker Configuration

### Basic Run
```bash
docker run -d \
  --name sentinel \
  -p 5056:5056 \
  -v ~/.openclaw:/data/.openclaw:ro \
  ghcr.io/jfr992/openclaw-sentinel:latest
```

### With Persistent Data
```bash
docker run -d \
  --name sentinel \
  -p 5056:5056 \
  -v ~/.openclaw:/data/.openclaw:ro \
  -v sentinel-data:/app/data \
  ghcr.io/jfr992/openclaw-sentinel:latest
```

### With Gateway Connection
```bash
docker run -d \
  --name sentinel \
  -p 5056:5056 \
  -v ~/.openclaw:/data/.openclaw:ro \
  -v sentinel-data:/app/data \
  -e OPENCLAW_GATEWAY_URL=ws://host.docker.internal:18789 \
  -e OPENCLAW_GATEWAY_TOKEN=your-token-here \
  ghcr.io/jfr992/openclaw-sentinel:latest
```

### Docker Compose
```yaml
version: '3.8'
services:
  sentinel:
    image: ghcr.io/jfr992/openclaw-sentinel:latest
    ports:
      - "127.0.0.1:5056:5056"
    volumes:
      - ~/.openclaw:/data/.openclaw:ro
      - sentinel-data:/app/data
    environment:
      - OPENCLAW_DIR=/data/.openclaw
      - DATA_DIR=/app/data
      - OPENCLAW_GATEWAY_URL=ws://host.docker.internal:18789
    restart: unless-stopped

volumes:
  sentinel-data:
```

## Security Considerations

### Network Binding
- **Native**: Binds to `127.0.0.1` (localhost only) by default
- **Docker**: Binds to `0.0.0.0` internally, but exposed port can be restricted

To restrict Docker to localhost only:
```bash
-p 127.0.0.1:5056:5056
```

### Gateway Token
The gateway token is read from `~/.openclaw/openclaw.json` → `auth.token`.

To override:
```bash
-e OPENCLAW_GATEWAY_TOKEN=your-secure-token
```

### Read-Only Mounts
Mount OpenClaw data as read-only for security:
```bash
-v ~/.openclaw:/data/.openclaw:ro
```

## Data Retention

Metrics are automatically cleaned up after 30 days.

To change retention (in code):
```javascript
// server/src/infrastructure/MetricsStore.js
metricsStore.rollupOldData(30) // days to keep
```

## Sync Intervals

| Operation | Interval | Description |
|-----------|----------|-------------|
| Session parse | 30 sec | Re-parse session files |
| Metrics sync | 5 min | Store metrics to SQLite |
| UI refresh | 30 sec | Frontend data refresh |
| Gateway reconnect | Exponential | Auto-reconnect on disconnect |

## Granularity Settings

Historical queries support three granularities:

| Granularity | Time Range | Description |
|-------------|------------|-------------|
| `5min` | ≤ 1 day | 5-minute buckets |
| `hour` | ≤ 7 days | Hourly aggregates |
| `day` | > 7 days | Daily aggregates |

The UI auto-selects based on the date range.

## Baseline Learning

Security baseline learning requires live gateway connection:
- Learns normal tool usage patterns
- Flags anomalies after 24h of data
- Stored in `DATA_DIR/baseline.json`

## Troubleshooting

### Check Logs
```bash
docker logs sentinel
```

### Verify Mounts
```bash
docker exec sentinel ls -la /data/.openclaw/
docker exec sentinel ls -la /app/data/
```

### Check Database
```bash
docker exec sentinel sqlite3 /app/data/metrics.db \
  "SELECT COUNT(*) FROM usage_metrics"
```

### Force Re-sync
```bash
curl -X POST http://localhost:5056/api/metrics/migrate
```
