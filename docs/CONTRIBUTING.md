# Contributing Guide

## Development Setup

### Prerequisites
- Node.js 20+
- Docker (optional)
- An OpenClaw installation with session data

### Install Dependencies
```bash
git clone https://github.com/jfr992/openclaw-sentinel.git
cd openclaw-sentinel
npm install
```

### Run in Development
```bash
# Start both frontend and backend with hot reload
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:5056

### Run Tests
```bash
npm test
```

### Build for Production
```bash
npm run build
```

### Build Docker Image
```bash
docker build -t openclaw-sentinel:dev .
```

## Project Structure

```
src/                    # React frontend (Vite)
├── App.jsx            # Main component
├── components/        # Shared components
└── features/          # Feature modules
    ├── insights/
    ├── memory/
    ├── performance/
    └── security/

server/                 # Express backend
└── src/
    ├── index.js       # Entry point, routes
    ├── domain/        # Business logic
    │   └── services/  # Metric calculators
    ├── infrastructure/ # Data access
    └── interfaces/    # HTTP route handlers

docs/                   # Documentation
tests/                  # Test suites
```

## Code Style

- **ESLint** with recommended rules
- **Prettier** for formatting (implicit)
- Prefer functional components with hooks
- Use `useMemo`/`useCallback` for performance

## Adding a New Metric

1. **Create the tracker** in `server/src/domain/services/`
   ```javascript
   export function calculateMyMetrics(data) {
     return { score: 100, details: {} }
   }
   ```

2. **Add API endpoint** in `server/src/index.js`
   ```javascript
   app.get('/api/my-metric', async (req, res) => {
     const result = await calculateMyMetrics(data)
     res.json(result)
   })
   ```

3. **Add to sync** in `syncMetrics()` if storing historically

4. **Create UI component** in `src/features/`

5. **Add tests** in `server/tests/`

## Adding to SQLite Schema

1. Add table in `MetricsStore._initSchema()`
2. Add `record*()` method for writes
3. Add `query*()` method for reads
4. Update `rollupOldData()` for cleanup

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Write tests for new functionality
4. Ensure all tests pass: `npm test`
5. Commit with clear messages
6. Push and open a PR

## Reporting Issues

Include:
- Sentinel version
- OpenClaw version
- Docker or native?
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs

## License

Contributions are licensed under MIT License.
