# API Reference

Base URL: `http://localhost:5056`

## Health & Status

### GET /api/health
Check server health.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-01T19:32:11.622Z",
  "data": {
    "lastParse": "2026-02-01T19:32:11.614Z",
    "stats": { "files": 11, "messages": 23946, "toolCalls": 10776 }
  }
}
```

### GET /api/gateway/status
Check OpenClaw Gateway connection.

**Response:**
```json
{
  "connected": true,
  "url": "ws://host.docker.internal:18789",
  "reconnects": 0
}
```

---

## Usage Metrics

### GET /api/metrics/query
Query historical usage metrics.

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| start | ISO date | 7 days ago | Start of range |
| end | ISO date | now | End of range |
| granularity | string | hour | `5min`, `hour`, or `day` |

**Response:**
```json
{
  "summary": {
    "total_input": 1281124,
    "total_output": 48332054,
    "total_cache_read": 15219958661,
    "total_cost": 13920.37,
    "total_messages": 160761,
    "cacheHitRatio": 100
  },
  "byModel": [
    { "model": "claude-opus-4", "total_tokens": 49613178, "cost": 13920.37, "calls": 23946 }
  ],
  "timeseries": [
    { "period": "2026-02-01T00:00:00Z", "input_tokens": 50000, "output_tokens": 1500000, "cost": 500.00 }
  ]
}
```

### GET /api/metrics/summary
Quick summary stats for predefined periods.

**Response:**
```json
{
  "fiveMin": { "tokens": 1234, "cost": 0.50, "messages": 5 },
  "oneHour": { "tokens": 50000, "cost": 20.00, "messages": 100 },
  "oneDay": { "tokens": 1000000, "cost": 400.00, "messages": 2000 },
  "sevenDays": { "tokens": 5000000, "cost": 2000.00, "messages": 10000 },
  "thirtyDays": { "tokens": 20000000, "cost": 8000.00, "messages": 40000 }
}
```

---

## Performance Metrics

### GET /api/performance/summary
Current performance metrics.

**Response:**
```json
{
  "overallScore": 87,
  "status": "excellent",
  "tasks": { "completionRate": 79, "total": 350 },
  "latency": { "avgMs": 8500, "trend": "stable" },
  "tools": { "successRate": 100, "total": 10776, "failed": 0 },
  "memory": { "usageRate": 99, "effectiveness": "good" },
  "proactive": { "valueScore": 55, "total": 120 },
  "recovery": { "recoveryRate": 100, "totalErrors": 0 }
}
```

### GET /api/metrics/performance
Query historical performance data.

**Parameters:** Same as `/api/metrics/query`

**Response:**
```json
{
  "range": { "start": "...", "end": "...", "granularity": "hour" },
  "timeseries": [
    {
      "period": "2026-02-01T00:00:00Z",
      "task_completion_rate": 80.5,
      "avg_latency_ms": 8500,
      "tool_success_rate": 99.9,
      "memory_usage_rate": 99,
      "proactive_score": 55,
      "overall_score": 87
    }
  ]
}
```

### GET /api/performance/tasks
Task completion details.

### GET /api/performance/latency
Response latency breakdown.

### GET /api/performance/tools
Tool reliability stats.

### GET /api/performance/memory
Memory retrieval stats.

### GET /api/performance/proactive
Proactive action tracking.

---

## Insights Metrics

### GET /api/insights/summary
Combined insights overview.

**Response:**
```json
{
  "healthScore": 68,
  "corrections": { "score": 0, "total": 0 },
  "sentiment": { "feedbackScore": 54, "trend": "stable" },
  "context": { "healthScore": 85, "continuityRate": 95 },
  "status": { "label": "Good", "emoji": "👍" }
}
```

### GET /api/insights/corrections
Self-correction analysis.

### GET /api/insights/sentiment
User sentiment analysis.

### GET /api/insights/context
Context health analysis.

### GET /api/metrics/insights
Query historical insights data.

**Parameters:** Same as `/api/metrics/query`

---

## Memory Stats

### GET /api/memory
Current memory system status.

**Response:**
```json
{
  "agents": [
    {
      "id": "main",
      "files": 10,
      "chunks": 42,
      "provider": "openai",
      "model": "text-embedding-3-small",
      "vector": { "available": true, "dims": 1536 },
      "fts": { "available": true },
      "cache": { "entries": 42 }
    }
  ],
  "totals": {
    "agents": 3,
    "files": 10,
    "chunks": 42,
    "cacheEntries": 42,
    "vectorReady": true,
    "ftsReady": true
  },
  "source": "sqlite"
}
```

### GET /api/metrics/memory
Query historical memory stats.

**Parameters:** Same as `/api/metrics/query`

---

## Security

### GET /api/security/risks
Current risk assessment.

**Response:**
```json
{
  "level": 3,
  "levelName": "HIGH",
  "totalRisks": 7,
  "criticalCount": 0,
  "highCount": 7,
  "summary": { "byType": { "credential_access": 7 } },
  "recentRisks": [...]
}
```

### GET /api/security/alerts
List security alerts.

### POST /api/security/alerts/:id/ack
Acknowledge an alert.

### POST /api/security/alerts/ack-all
Acknowledge all alerts.

### POST /api/security/alerts/clear
Clear all alerts.

### GET /api/metrics/security
Query historical security events.

---

## Data Management

### POST /api/metrics/sync
Trigger a manual sync of current metrics.

### POST /api/metrics/migrate
Full historical data import from session files.

**Response:**
```json
{
  "success": true,
  "stats": {
    "usage": 11630,
    "performance": 708,
    "insights": 708,
    "memory": 1
  },
  "totalMessages": 23946,
  "totalToolCalls": 10776,
  "elapsedMs": 1500
}
```

### POST /api/metrics/backfill
Backfill performance and insights only (legacy).

---

## WebSocket Endpoints

### /ws/live
Real-time agent activity stream.

**Events:**
- `activity` — Tool calls, messages
- `run:start` — New agent run started
- `run:complete` — Agent run finished
- `risk:alert` — Security risk detected

### /ws/security
Real-time security alerts.

**Events:**
- `alert` — New security alert
- `ack` — Alert acknowledged
