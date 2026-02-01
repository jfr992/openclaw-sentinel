import { useState, useEffect, useCallback, useMemo } from 'react'
import { Brain, Zap, Search, Database, Clock, RefreshCw, AlertCircle, CheckCircle2, Layers, FileText, TrendingUp } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

function StatCard({ title, value, subtitle, icon: Icon, color = 'orange' }) {
  const colors = {
    orange: 'text-[var(--accent-orange)]',
    green: 'text-[var(--accent-green)]',
    blue: 'text-[var(--accent-blue)]',
    purple: 'text-[var(--accent-purple)]',
    cyan: 'text-[var(--accent-cyan)]',
    red: 'text-[var(--accent-red)]'
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">{title}</span>
        <Icon className={`w-4 h-4 ${colors[color]}`} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${colors[color]}`}>{value}</span>
      </div>
      {subtitle && <p className="text-xs text-[var(--text-muted)] mt-1">{subtitle}</p>}
    </div>
  )
}

function AgentCard({ agent }) {
  const hasIssues = agent.issues?.length > 0

  return (
    <div className={`card p-4 ${hasIssues ? 'border-yellow-500/30' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-[var(--accent-cyan)]">{agent.id}</h4>
        <div className="flex items-center gap-2">
          {agent.vector.available && (
            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
              Vector
            </span>
          )}
          {agent.fts.available && (
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
              FTS
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Files</span>
          <span className="text-[var(--accent-orange)]">{agent.files}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Chunks</span>
          <span className="text-[var(--accent-orange)]">{agent.chunks}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Provider</span>
          <span className="text-[var(--accent-green)]">{agent.provider}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Cache</span>
          <span className="text-[var(--accent-cyan)]">{agent.cache?.entries || 0} entries</span>
        </div>
        {agent.vector.dims > 0 && (
          <div className="flex justify-between col-span-2">
            <span className="text-[var(--text-muted)]">Dimensions</span>
            <span className="text-[var(--accent-purple)]">{agent.vector.dims}</span>
          </div>
        )}
      </div>

      {agent.dirty && (
        <div className="mt-2 text-xs text-yellow-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Needs reindexing
        </div>
      )}

      {hasIssues && (
        <div className="mt-2 text-xs text-yellow-400">
          {agent.issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-1">
              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{issue}</span>
            </div>
          ))}
        </div>
      )}

      {agent.sources?.length > 0 && (
        <div className="mt-3 pt-2 border-t border-[var(--border)]">
          <span className="text-xs text-[var(--text-muted)]">Sources:</span>
          <div className="mt-1 space-y-1">
            {agent.sources.map((src, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-[var(--text-secondary)]">{src.source}</span>
                <span className="text-[var(--accent-cyan)]">{src.files} files, {src.chunks} chunks</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function MemoryDashboard({ dateRange = 7, customStart, customEnd }) {
  const [data, setData] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)

  const hasData = data !== null || history.length > 0

  // Calculate date range for API
  const { start, end, granularity } = useMemo(() => {
    const now = new Date()
    let startDate, endDate = now.toISOString()

    if (customStart && customEnd) {
      startDate = new Date(customStart).toISOString()
      endDate = new Date(customEnd).toISOString()
    } else {
      const days = typeof dateRange === 'number' ? dateRange : 7
      startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
    }

    const days = dateRange < 1 ? dateRange : dateRange
    const gran = days <= 1 ? '5min' : days <= 7 ? 'hour' : 'day'

    return { start: startDate, end: endDate, granularity: gran }
  }, [dateRange, customStart, customEnd])

  const fetchData = useCallback(async () => {
    try {
      // Fetch both current state and historical data
      const [currentRes, historyRes] = await Promise.all([
        fetch('/api/memory'),
        fetch(`/api/metrics/memory?start=${start}&end=${end}&granularity=${granularity}`)
      ])

      if (currentRes.ok) {
        const result = await currentRes.json()
        setData(result)
      }

      if (historyRes.ok) {
        const result = await historyRes.json()
        setHistory(result.timeseries || [])
      }

      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [start, end, granularity])

  useEffect(() => {
    if (!hasData) {
      setLoading(true)
    } else {
      setSyncing(true)
    }
    fetchData()
    const interval = setInterval(() => {
      setSyncing(true)
      fetchData()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchData, hasData])

  if (loading && !hasData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Brain className="w-12 h-12 text-[var(--accent-purple)] animate-pulse mx-auto mb-4" />
          <p className="text-[var(--text-muted)]">Loading OpenClaw memory status...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-6 border-[var(--accent-red)] bg-red-500/10">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-[var(--accent-red)]" />
          <div>
            <h3 className="font-semibold text-[var(--accent-red)]">Failed to get memory status</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">{error}</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="mt-4 flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-secondary)] rounded text-sm hover:bg-[var(--border)] transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    )
  }

  const { agents, totals, timestamp } = data || {}
  const mainAgent = agents?.find(a => a.id === 'main')

  // Show unavailable state when memory DBs not found
  if (data?.unavailable) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-[var(--accent-purple)]" />
          <div>
            <h2 className="text-lg font-semibold">OpenClaw Memory</h2>
            <p className="text-xs text-[var(--text-muted)]">Vector search & semantic memory</p>
          </div>
        </div>

        <div className="card p-6 border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="flex items-start gap-4">
            <Database className="w-8 h-8 text-[var(--text-muted)]" />
            <div className="flex-1">
              <h3 className="font-semibold text-[var(--text-primary)]">Memory Databases Not Found</h3>
              <p className="text-sm text-[var(--text-muted)] mt-2">
                {data.message || 'Could not access OpenClaw memory databases.'}
              </p>
              <div className="mt-4 bg-[var(--bg-tertiary)] rounded p-4 font-mono text-xs">
                <p className="text-[var(--text-muted)]"># In Docker, ensure ~/.openclaw is mounted:</p>
                <p className="text-[var(--accent-cyan)] mt-1">-v ~/.openclaw:/data/.openclaw:ro</p>
                <p className="text-[var(--text-muted)] mt-3"># Or run natively:</p>
                <p className="text-[var(--accent-cyan)]">cd openclaw-sentinel && npm start</p>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-4 italic">
                Other features (Usage, Security, Insights, Performance) work normally.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className={`w-6 h-6 text-[var(--accent-purple)] ${syncing ? 'animate-pulse' : ''}`} />
          <div>
            <h2 className="text-lg font-semibold">OpenClaw Memory</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Built-in vector search • {mainAgent?.provider || 'auto'} ({mainAgent?.model || 'detecting...'})
            </p>
          </div>
          {syncing && <span className="text-xs text-[var(--text-muted)]">syncing...</span>}
        </div>
        <div className="flex items-center gap-3">
          {totals?.vectorReady && totals?.ftsReady ? (
            <span className="flex items-center gap-1.5 text-xs text-[var(--accent-green)]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Ready
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-yellow-400">
              <AlertCircle className="w-3.5 h-3.5" />
              Degraded
            </span>
          )}
          <button
            onClick={() => { setSyncing(true); fetchData(); }}
            disabled={syncing}
            className="p-1.5 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Agents"
          value={totals?.agents || 0}
          subtitle="Configured memory stores"
          icon={Layers}
          color="purple"
        />
        <StatCard
          title="Files Indexed"
          value={totals?.files || 0}
          subtitle="Across all agents"
          icon={FileText}
          color="orange"
        />
        <StatCard
          title="Chunks"
          value={totals?.chunks || 0}
          subtitle="Vector embeddings stored"
          icon={Database}
          color="cyan"
        />
        <StatCard
          title="Cache Entries"
          value={totals?.cacheEntries || 0}
          subtitle="Embedding cache hits"
          icon={Zap}
          color="green"
        />
      </div>

      {/* History Chart */}
      {history.length > 0 && (
        <div className="card p-6">
          <h4 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--accent-cyan)]" />
            Memory Growth
            <span className="text-xs text-[var(--text-muted)] ml-auto font-normal">
              {history.length} data points
            </span>
          </h4>

          {history.length < 3 && (
            <div className="mb-4 p-3 rounded-lg bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/30">
              <p className="text-sm text-[var(--accent-cyan)]">
                📊 Tracking started — data accumulates every 5 minutes. Chart will show trends as memory changes over time.
              </p>
            </div>
          )}
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <XAxis
                  dataKey="period"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  tickFormatter={(v) => {
                    const d = new Date(v)
                    return granularity === 'day' ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) :
                           d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                  }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1a1a24',
                    border: '1px solid #2a2a3a',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                  labelFormatter={(v) => new Date(v).toLocaleString()}
                />
                <Line
                  type="monotone"
                  dataKey="chunks_total"
                  name="Chunks"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="files_indexed"
                  name="Files"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="cache_entries"
                  name="Cache"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Capabilities */}
      <div className="card p-4">
        <h4 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Search Capabilities</h4>
        {data?.unavailable ? (
          <div className="text-sm text-[var(--text-muted)] space-y-2">
            <p>Memory search requires the OpenClaw CLI on the host.</p>
            <div className="bg-[var(--bg-tertiary)] rounded p-3 font-mono text-xs">
              <p className="text-[var(--text-secondary)]"># Install on host (not Docker):</p>
              <p>npm install -g openclaw</p>
              <p className="mt-2 text-[var(--text-secondary)]"># Then run Sentinel natively:</p>
              <p>npm start</p>
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            {totals?.vectorReady ? (
              <CheckCircle2 className="w-4 h-4 text-[var(--accent-green)]" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[var(--text-muted)]" />
            )}
            <span className="text-sm">Vector Search (sqlite-vec)</span>
          </div>
          <div className="flex items-center gap-2">
            {totals?.ftsReady ? (
              <CheckCircle2 className="w-4 h-4 text-[var(--accent-green)]" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[var(--text-muted)]" />
            )}
            <span className="text-sm">Full-Text Search (FTS5)</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[var(--accent-green)]" />
            <span className="text-sm">Hybrid Ranking</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[var(--accent-green)]" />
            <span className="text-sm">Embedding Cache</span>
          </div>
        </div>
        )}
      </div>

      {/* Agent Cards */}
      <div>
        <h4 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Memory Stores by Agent</h4>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents?.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-xs text-[var(--text-muted)] text-center">
        Last updated: {timestamp ? new Date(timestamp).toLocaleTimeString() : 'N/A'}
        {' • '}
        {data?.source === 'sqlite' ? (
          <span className="text-[var(--accent-cyan)]">reading from SQLite</span>
        ) : (
          <code className="bg-[var(--bg-secondary)] px-1 rounded">openclaw memory status</code>
        )}
      </div>
    </div>
  )
}

export default MemoryDashboard
