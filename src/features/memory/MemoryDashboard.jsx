import { useState, useEffect, useCallback } from 'react'
import { Brain, Zap, Search, Database, Clock, RefreshCw, AlertCircle, CheckCircle2, Layers, FileText } from 'lucide-react'

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

export function MemoryDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/memory')
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setData(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-[var(--accent-purple)]" />
          <div>
            <h2 className="text-lg font-semibold">OpenClaw Memory</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Built-in vector search • {mainAgent?.provider || 'auto'} ({mainAgent?.model || 'detecting...'})
            </p>
          </div>
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
            onClick={fetchData}
            className="p-1.5 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
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

      {/* Capabilities */}
      <div className="card p-4">
        <h4 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Search Capabilities</h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            {totals?.vectorReady ? (
              <CheckCircle2 className="w-4 h-4 text-[var(--accent-green)]" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[var(--accent-red)]" />
            )}
            <span className="text-sm">Vector Search (sqlite-vec)</span>
          </div>
          <div className="flex items-center gap-2">
            {totals?.ftsReady ? (
              <CheckCircle2 className="w-4 h-4 text-[var(--accent-green)]" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[var(--accent-red)]" />
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
        <code className="bg-[var(--bg-secondary)] px-1 rounded">openclaw memory status</code>
      </div>
    </div>
  )
}

export default MemoryDashboard
