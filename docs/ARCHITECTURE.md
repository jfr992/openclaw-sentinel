# Architecture Overview

OpenClaw Sentinel is a monitoring dashboard for AI agents running on OpenClaw.

## System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenClaw Sentinel                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   React     │  │   Express   │  │   SQLite            │ │
│  │   Frontend  │◄─┤   Server    │◄─┤   MetricsStore      │ │
│  │   (Vite)    │  │   (API)     │  │   (better-sqlite3)  │ │
│  └─────────────┘  └──────┬──────┘  └─────────────────────┘ │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              Session File Parser                       │ │
│  │  ~/.openclaw/sessions/*.jsonl                         │ │
│  └───────────────────────────────────────────────────────┘ │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐ │
│  │           OpenClaw Gateway (WebSocket)                 │ │
│  │  ws://localhost:18789 (live events)                   │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Session Files** → Parsed on startup and every 30s
2. **Metrics Sync** → Extracted and stored in SQLite every 5 min
3. **Gateway Events** → Real-time updates via WebSocket
4. **API Requests** → Frontend fetches from Express server
5. **UI Updates** → React renders with stale-while-revalidate pattern

## Directory Structure

```
openclaw-sentinel/
├── src/                    # React frontend
│   ├── App.jsx            # Main app component
│   ├── components/        # Shared UI components
│   └── features/          # Feature-specific components
│       ├── insights/      # Self-correction, sentiment
│       ├── memory/        # Memory status dashboard
│       ├── performance/   # Performance metrics
│       └── security/      # Security alerts
├── server/                 # Express backend
│   └── src/
│       ├── index.js       # Server entry, API routes
│       ├── domain/        # Business logic
│       │   └── services/  # Metric calculators
│       ├── infrastructure/ # Data layer
│       │   ├── MetricsStore.js    # SQLite storage
│       │   └── OpenClawGatewayClient.js
│       └── interfaces/    # HTTP routes
├── dist/                   # Built frontend (production)
├── data/                   # SQLite database
└── docs/                   # Documentation
```

## Key Technologies

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | React 19 + Vite 7 | Dashboard UI |
| Charts | Recharts | Data visualization |
| Backend | Express 5 | API server |
| Database | better-sqlite3 | Metrics persistence |
| WebSocket | ws | Gateway connection |
| Styling | Tailwind-like CSS vars | Dark theme UI |

## Database Schema

### usage_metrics
Stores token usage in 5-minute buckets:
- `bucket_start` (TEXT) — ISO timestamp
- `model` (TEXT) — Model name
- `input_tokens`, `output_tokens` (INTEGER)
- `cache_read`, `cache_write` (INTEGER)
- `cost_usd` (REAL)
- `message_count`, `tool_calls` (INTEGER)

### performance_metrics
Stores performance snapshots:
- `bucket_start` (TEXT)
- `task_completion_rate` (REAL) — 0-100
- `avg_latency_ms` (INTEGER)
- `tool_success_rate` (REAL) — 0-100
- `memory_usage_rate` (REAL)
- `proactive_score` (INTEGER)
- `overall_score` (INTEGER)

### insights_metrics
Stores behavioral insights:
- `bucket_start` (TEXT)
- `health_score` (INTEGER) — 0-100
- `corrections_count` (INTEGER)
- `sentiment_score` (INTEGER) — 0-100
- `context_health` (INTEGER) — 0-100
- `confusion_signals`, `reask_count` (INTEGER)

### memory_stats
Stores memory system snapshots:
- `bucket_start` (TEXT)
- `agents_count`, `files_indexed` (INTEGER)
- `chunks_total`, `cache_entries` (INTEGER)
- `vector_ready`, `fts_ready` (INTEGER)

### security_events
Individual security alerts:
- `timestamp` (TEXT)
- `event_type`, `severity` (TEXT)
- `tool_name`, `command` (TEXT)
- `risk_score` (REAL)
- `acknowledged` (INTEGER)

## Metric Calculation

### Task Completion
Analyzes assistant messages for completion indicators:
- "Done", "Completed", "Here's the result"
- Compares to user request patterns

### Self-Correction Score
Detects corrections in agent behavior:
- Verbal corrections ("Actually...", "I apologize")
- Tool retries (same tool with same args)
- File re-edits (editing same file multiple times)

### User Sentiment
Analyzes user message tone:
- Positive: "Thanks!", "Great", "Perfect"
- Negative: "No", "Wrong", "???"
- Calculates satisfaction ratio

### Context Health
Tracks conversation continuity:
- Truncation events
- Re-ask patterns ("What were we doing?")
- Confusion signals
