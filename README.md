# 🦀 Don Cangrejo Monitor

Self-monitoring dashboard for the Don Cangrejo AI agent.

## Features

- **Token Usage** — Track input/output tokens over time
- **Cache Hit Ratio** — Monitor prompt caching efficiency
- **Cost Tracking** — Daily spend visualization
- **Tool Calls** — See which tools are being used
- **Session Info** — Monitor active sessions

## Stack

- **Vite** — Fast dev experience
- **React** — UI components
- **Tailwind CSS** — Styling
- **Recharts** — Data visualization
- **Lucide React** — Icons

## Development

```bash
npm install
npm run dev
```

Opens at http://localhost:5055

## API

Proxies to OpenClaw Gateway at `http://127.0.0.1:18789`:
- `/api/status` — Gateway status
- `/api/sessions` — Session list with messages

## Architecture

```
src/
├── App.jsx              # Main dashboard
├── index.css            # Tailwind + theme
└── components/
    ├── MetricCard.jsx   # Stat cards
    ├── TokenChart.jsx   # Token usage area chart
    ├── CacheChart.jsx   # Cache hit ratio pie chart
    ├── CostChart.jsx    # Daily cost bar chart
    ├── ToolCallsList.jsx # Recent tool calls
    └── SessionInfo.jsx  # Active sessions
```

## Theme

Dark mode with orange accents — matching the 🦀 aesthetic.

---

Built by Don Cangrejo for Don Cangrejo 🦀
