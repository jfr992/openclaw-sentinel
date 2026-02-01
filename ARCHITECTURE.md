# 🦀 Don Cangrejo Monitor — Architecture

## Design Principles

1. **Clean Architecture** — Dependencies point inward; domain has zero deps
2. **DRY** — Single source of truth for parsing, scoring, formatting
3. **TDD** — Tests drive design; write failing test first
4. **SOLID** — Single responsibility, open/closed, dependency inversion
5. **12-Factor** — Config from env, stateless processes, disposability

---

## Directory Structure

```
cangrejo-monitor/
├── server/                    # Backend (Node.js)
│   ├── src/
│   │   ├── domain/            # Core business logic (ZERO deps)
│   │   │   ├── entities/
│   │   │   │   ├── Session.js
│   │   │   │   ├── Message.js
│   │   │   │   ├── ToolCall.js
│   │   │   │   ├── Usage.js
│   │   │   │   ├── Alert.js
│   │   │   │   └── Risk.js
│   │   │   ├── services/
│   │   │   │   ├── UsageCalculator.js
│   │   │   │   ├── RiskScorer.js
│   │   │   │   ├── AnomalyDetector.js
│   │   │   │   └── AlertClassifier.js
│   │   │   └── index.js
│   │   │
│   │   ├── application/       # Use cases (orchestration)
│   │   │   ├── GetUsageStats.js
│   │   │   ├── GetSessions.js
│   │   │   ├── GetToolCalls.js
│   │   │   ├── AnalyzeRisk.js
│   │   │   ├── DetectAnomalies.js
│   │   │   └── index.js
│   │   │
│   │   ├── infrastructure/    # External interfaces
│   │   │   ├── repositories/
│   │   │   │   ├── SessionFileRepository.js   # Reads JSONL files
│   │   │   │   ├── AlertRepository.js         # Persists alerts
│   │   │   │   └── ConfigRepository.js
│   │   │   ├── services/
│   │   │   │   ├── GatewayClient.js           # WebSocket to OpenClaw
│   │   │   │   └── NotificationService.js
│   │   │   └── index.js
│   │   │
│   │   ├── interfaces/        # Delivery mechanisms
│   │   │   ├── http/
│   │   │   │   ├── routes/
│   │   │   │   │   ├── usage.js
│   │   │   │   │   ├── sessions.js
│   │   │   │   │   ├── tools.js
│   │   │   │   │   ├── security.js
│   │   │   │   │   └── health.js
│   │   │   │   ├── middleware/
│   │   │   │   │   ├── errorHandler.js
│   │   │   │   │   └── requestLogger.js
│   │   │   │   └── server.js
│   │   │   └── websocket/
│   │   │       └── realtimeUpdates.js
│   │   │
│   │   ├── config/
│   │   │   ├── index.js       # Env-based config
│   │   │   └── patterns.js    # Risk patterns, thresholds
│   │   │
│   │   └── index.js           # Entry point
│   │
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── domain/
│   │   │   │   ├── UsageCalculator.test.js
│   │   │   │   ├── RiskScorer.test.js
│   │   │   │   └── AnomalyDetector.test.js
│   │   │   └── application/
│   │   ├── integration/
│   │   │   ├── repositories/
│   │   │   └── http/
│   │   └── fixtures/
│   │       └── sessions/      # Sample JSONL for tests
│   │
│   └── package.json
│
├── client/                    # Frontend (React)
│   ├── src/
│   │   ├── components/        # Presentational (dumb)
│   │   │   ├── charts/
│   │   │   │   ├── AreaChart.jsx
│   │   │   │   ├── PieChart.jsx
│   │   │   │   └── BarChart.jsx
│   │   │   ├── cards/
│   │   │   │   └── MetricCard.jsx
│   │   │   └── layout/
│   │   │       ├── Header.jsx
│   │   │       └── Footer.jsx
│   │   │
│   │   ├── features/          # Feature modules (smart)
│   │   │   ├── usage/
│   │   │   │   ├── UsageDashboard.jsx
│   │   │   │   ├── useUsage.js
│   │   │   │   └── usageApi.js
│   │   │   ├── sessions/
│   │   │   ├── tools/
│   │   │   └── security/      # Security monitoring
│   │   │       ├── SecurityDashboard.jsx
│   │   │       ├── RiskIndicator.jsx
│   │   │       ├── AlertFeed.jsx
│   │   │       ├── useSecurity.js
│   │   │       └── securityApi.js
│   │   │
│   │   ├── hooks/
│   │   │   ├── usePolling.js
│   │   │   └── useWebSocket.js
│   │   │
│   │   ├── stores/            # Zustand state
│   │   │   ├── useUsageStore.js
│   │   │   └── useSecurityStore.js
│   │   │
│   │   ├── services/
│   │   │   └── api.js         # Base fetch wrapper
│   │   │
│   │   ├── utils/
│   │   │   ├── formatters.js
│   │   │   └── constants.js
│   │   │
│   │   ├── App.jsx
│   │   └── main.jsx
│   │
│   ├── tests/
│   │   ├── components/
│   │   └── features/
│   │
│   └── package.json
│
├── .github/
│   └── workflows/
│       ├── test.yml           # Run on push
│       └── lint.yml
│
├── docker-compose.yml         # Local dev stack
├── Makefile                   # Common commands
└── README.md
```

---

## Domain Entities

### Session
```javascript
class Session {
  constructor({ key, agent, messages, createdAt, lastActivity }) {
    this.key = key
    this.agent = agent
    this.messages = messages.map(m => new Message(m))
    this.createdAt = createdAt
    this.lastActivity = lastActivity
  }
  
  get messageCount() { return this.messages.length }
  get toolCalls() { return this.messages.flatMap(m => m.toolCalls) }
  get totalTokens() { return this.messages.reduce((sum, m) => sum + m.tokens, 0) }
}
```

### Risk
```javascript
class Risk {
  static LEVELS = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }
  
  constructor({ type, level, description, evidence, timestamp }) {
    this.type = type
    this.level = level
    this.description = description
    this.evidence = evidence
    this.timestamp = timestamp
  }
  
  get isCritical() { return this.level >= Risk.LEVELS.CRITICAL }
}
```

---

## Security Monitoring Extension

### Risk Categories

| Category | Patterns | Severity |
|----------|----------|----------|
| **Destructive Commands** | `rm -rf`, `DROP TABLE`, `format` | CRITICAL |
| **Privilege Escalation** | `sudo`, `chmod 777`, `chown root` | HIGH |
| **Credential Access** | `.env`, `*_KEY`, `*_SECRET`, `*_TOKEN` | HIGH |
| **Data Exfiltration** | Large outputs, base64 blobs, curl POST | MEDIUM |
| **Unusual Patterns** | Burst activity, off-hours usage | LOW-MEDIUM |

### Alert Pipeline

```
ToolCall → RiskScorer → AlertClassifier → AlertRepository
                ↓                              ↓
         AnomalyDetector              WebSocket Push
                ↓
        Baseline Comparison
```

### API Endpoints (Security)

```
GET  /api/security/risks          # Current risk assessment
GET  /api/security/alerts         # Alert history
GET  /api/security/exposure       # External calls, data flow
POST /api/security/acknowledge    # Mark alert as reviewed
WS   /ws/security                 # Real-time alerts
```

---

## Testing Strategy

### Unit Tests (Domain)
- Pure functions, no I/O
- Fast (<100ms per test)
- Test edge cases, boundaries

```javascript
// UsageCalculator.test.js
describe('UsageCalculator', () => {
  describe('calculateCacheHitRatio', () => {
    it('returns 0 when no input', () => {
      expect(calculateCacheHitRatio(0, 0)).toBe(0)
    })
    
    it('calculates ratio correctly', () => {
      expect(calculateCacheHitRatio(80, 20)).toBe(80)  // 80%
    })
    
    it('handles 100% cache hit', () => {
      expect(calculateCacheHitRatio(1000, 0)).toBe(100)
    })
  })
})
```

### Integration Tests (Repositories)
- Test against fixture files
- Verify parsing logic

### E2E Tests (API)
- Supertest for HTTP
- Full request/response cycles

---

## Local GitHub Actions

Use `act` to run workflows locally:

```bash
# Install act
brew install act

# Run test workflow
act push

# Run specific job
act -j test
```

---

## DRY Patterns

### Shared Parsing
```javascript
// server/src/domain/services/MessageParser.js
export function parseMessage(entry) {
  // Single source of truth for JSONL parsing
}
```

### Shared Formatters
```javascript
// client/src/utils/formatters.js
export const formatTokens = (n) => n.toLocaleString()
export const formatCost = (n) => `$${n.toFixed(2)}`
export const formatPercent = (n) => `${n.toFixed(1)}%`
```

### Shared Types (TypeScript migration path)
```typescript
// shared/types.ts
export interface Usage {
  totalInput: number
  totalOutput: number
  cacheRead: number
  cacheWrite: number
  cost: number
}
```

---

## Migration Plan

1. **Phase 1:** Extract domain logic from server.js → domain/
2. **Phase 2:** Add unit tests for domain services
3. **Phase 3:** Create repository abstraction
4. **Phase 4:** Add security monitoring features
5. **Phase 5:** Split client into feature modules
6. **Phase 6:** Add E2E tests
7. **Phase 7:** GitHub Actions CI

---

## Next Steps

1. Create directory structure
2. Write first failing test (TDD)
3. Implement domain entities
4. Wire up repositories
5. Build security features

---

*"Architecture is the decisions that are hard to change."* — Martin Fowler
