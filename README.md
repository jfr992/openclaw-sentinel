# 🦀 MoltBot Security Dashboard

Real-time security monitoring for AI agents. Detect prompt injection, suspicious commands, and anomalous behavior.

![MoltBot Dashboard](https://img.shields.io/badge/MoltBot-Security-purple?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3.9+-blue?style=flat-square)
![React](https://img.shields.io/badge/React-18+-cyan?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

## Features

- 🔍 **Real-time Activity Monitoring** — Track tool calls, file operations, network activity
- 🚨 **Security Alerts** — Detect prompt injection, suspicious commands, data exfiltration
- 🌐 **Network Monitor** — Wireshark-style connection tracking with protocol breakdown
- 📊 **Command Tracing** — Analyze what commands do before/after execution
- ⚙️ **Data Retention** — Configurable log purging and privacy controls

## Screenshots

| Dashboard | Network Monitor | Alert Details |
|-----------|-----------------|---------------|
| Real-time metrics | Wireshark-style view | Command tracing |

## Quick Start

### Prerequisites

- **Python 3.9+**
- **Node.js 18+** (for development only)
- **macOS** (Linux support partial)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/moltbot.git
cd moltbot/security

# Set up Python environment
cd dashboard
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start the dashboard
python app.py
```

Open **http://localhost:5050** in your browser.

### Development Mode (with hot reload)

```bash
# Terminal 1: Start Flask backend
cd dashboard
source venv/bin/activate
python app.py

# Terminal 2: Start React dev server
cd dashboard-ui
npm install
npm run dev
```

Open **http://localhost:5173** for development.

## Project Structure

```
security/
├── dashboard/                 # Python backend
│   ├── app.py                # Flask server & API
│   ├── detector.py           # Security detection engine
│   ├── requirements.txt      # Python dependencies
│   └── templates/            # Legacy HTML dashboard
│
├── dashboard-ui/             # React frontend
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── hooks/            # Data fetching hooks
│   │   └── App.jsx           # Main app
│   ├── dist/                 # Production build
│   └── package.json
│
├── logs/                     # Security alerts storage
└── README.md
```

## Configuration

### Settings (via UI)

- **Data Retention**: 7 days → Forever
- **Auto-Purge**: Automatically delete old logs
- **Alert Threshold**: Filter by severity

### Environment Variables

```bash
# Optional: Change port (default: 5050)
export MOLTBOT_PORT=5050

# Optional: Clawdbot directory
export CLAWDBOT_DIR=~/.clawdbot
```

## Detection Capabilities

### Prompt Injection Patterns

| Pattern | Severity | Description |
|---------|----------|-------------|
| `curl \| sh` | Critical | Pipe to shell |
| `base64 -d` | High | Encoded payload |
| `nc -e` | Critical | Reverse shell |
| `/etc/passwd` | High | Sensitive file access |
| `chmod 777` | Medium | Permission change |

### Network Monitoring

- Active connection tracking
- Protocol breakdown (TCP/UDP)
- Suspicious port detection (4444, 5555, etc.)
- Tunneling service detection (ngrok, serveo)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/activity` | GET | Recent activity summary |
| `/api/alerts` | GET | Security alerts |
| `/api/security-check` | GET | Run security scan |
| `/api/network/detailed` | GET | Wireshark-style network data |
| `/api/trace` | POST | Trace command execution |
| `/api/settings` | GET/POST | Dashboard settings |
| `/api/purge` | POST | Purge old logs |

## Building for Production

```bash
cd dashboard-ui
npm run build

# Built files are in dist/
# Flask automatically serves them from /
```

## Integration with Clawdbot

MoltBot monitors Clawdbot session logs at:
```
~/.clawdbot/agents/*/sessions/*.jsonl
```

No configuration needed — it auto-discovers sessions.

## Troubleshooting

### Dashboard shows no data
- Check if Clawdbot is running
- Verify `~/.clawdbot/agents/` exists
- Check Flask logs for errors

### Network monitoring not working
- Requires `lsof` (pre-installed on macOS)
- May need elevated permissions on Linux

### Alerts not detecting anything
- Run "Security Check" manually
- Check `security/logs/security-alerts.json`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests (if any)
5. Submit a pull request

## License

MIT License — see [LICENSE](LICENSE)

## Credits

Built with:
- [Flask](https://flask.palletsprojects.com/) — Python web framework
- [React](https://react.dev/) — UI library
- [Vite](https://vitejs.dev/) — Build tool
- [Tailwind CSS](https://tailwindcss.com/) — Styling
- [Lucide](https://lucide.dev/) — Icons

---

**MoltBot** 🦀 — Security monitoring for the AI age.
