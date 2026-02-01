import { useState, useEffect, useCallback, useMemo } from 'react'
import { Activity, Zap, Database, DollarSign, AlertTriangle, Clock, Cpu, RefreshCw, Shield, BarChart3, Brain, Sparkles, Calendar, Upload } from 'lucide-react'
import TokenChart from './components/TokenChart'
import CacheChart from './components/CacheChart'
import CostChart from './components/CostChart'
import MetricCard from './components/MetricCard'
import ToolCallsList from './components/ToolCallsList'
import SessionInfo from './components/SessionInfo'
import SecurityDashboard from './features/security/SecurityDashboard'
import InsightsDashboard from './features/insights/InsightsDashboard'
import { PerformanceDashboard } from './features/performance'
import { MemoryDashboard } from './features/memory'

function App() {
  // Persist active tab in localStorage + URL hash
  const [activeTab, setActiveTab] = useState(() => {
    // Priority: URL hash > localStorage > default
    const hash = window.location.hash.slice(1)
    if (['usage', 'memory', 'performance', 'security', 'insights'].includes(hash)) {
      return hash
    }
    return localStorage.getItem('sentinel-tab') || 'usage'
  })

  // Sync tab to localStorage and URL hash
  useEffect(() => {
    localStorage.setItem('sentinel-tab', activeTab)
    window.location.hash = activeTab
  }, [activeTab])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [online, setOnline] = useState(false)
  const [riskLevel, setRiskLevel] = useState(0)
  const [dateRange, setDateRange] = useState(7) // Days: 7, 14, 30, 90, or 'custom'
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      // Calculate date range
      const now = new Date()
      let start, end = now.toISOString()

      if (dateRange === 'custom' && customStart && customEnd) {
        start = new Date(customStart).toISOString()
        end = new Date(customEnd).toISOString()
      } else {
        const days = typeof dateRange === 'number' ? dateRange : 7
        start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
      }

      // Choose granularity based on range
      const days = dateRange === 'custom'
        ? Math.ceil((new Date(end) - new Date(start)) / (24 * 60 * 60 * 1000))
        : dateRange
      // 5min for ≤1 day, hourly for ≤7 days, daily for longer
      const granularity = days <= 1 ? '5min' : days <= 7 ? 'hour' : 'day'

      const [metricsRes, sessionsRes, healthRes, risksRes] = await Promise.all([
        fetch(`/api/metrics/query?start=${start}&end=${end}&granularity=${granularity}`).catch(() => null),
        fetch('/api/sessions').catch(() => null),
        fetch('/api/health').catch(() => null),
        fetch('/api/security/risks').catch(() => null)
      ])

      const metricsData = metricsRes?.ok ? await metricsRes.json() : null
      const sessions = sessionsRes?.ok ? await sessionsRes.json() : null
      const health = healthRes?.ok ? await healthRes.json() : null
      const risks = risksRes?.ok ? await risksRes.json() : null

      setOnline(!!health)
      if (risks) setRiskLevel(risks.level || 0)

      if (metricsData) {
        const { summary, byModel, timeseries } = metricsData

        // Convert timeseries to byDay format for charts
        const byDay = {}
        for (const point of timeseries || []) {
          const day = point.period.slice(0, 10)
          if (!byDay[day]) {
            byDay[day] = { tokens: 0, cost: 0 }
          }
          byDay[day].tokens += (point.input_tokens || 0) + (point.output_tokens || 0)
          byDay[day].cost += point.cost || 0
        }

        // Convert byModel array to object
        const byModelObj = {}
        for (const m of byModel || []) {
          byModelObj[m.model] = { tokens: m.total_tokens, cost: m.cost, calls: m.calls }
        }

        setData({
          metrics: {
            totalInput: summary?.total_input || 0,
            totalOutput: summary?.total_output || 0,
            totalCacheRead: summary?.total_cache_read || 0,
            totalCacheWrite: summary?.total_cache_write || 0,
            totalCost: (summary?.total_cost || 0).toFixed(2),
            messageCount: summary?.total_messages || 0,
            cacheHitRatio: summary?.cacheHitRatio?.toFixed(1) || '0',
            byModel: byModelObj,
            byDay,
            timeseries // Keep raw timeseries for detailed charts
          },
          toolCalls: [], // Tool calls now in metrics
          sessions: sessions?.sessions || []
        })
        setLastUpdate(new Date())
        setError(null)
      } else {
        setError('Failed to fetch metrics')
      }
    } catch (err) {
      setError(err.message)
      setOnline(false)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [dateRange, customStart, customEnd])

  // Track if we have data
  const hasData = data !== null

  useEffect(() => {
    // Set loading state before fetch
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

  // Full data migration from session files
  const runMigration = useCallback(async () => {
    if (migrating) return

    if (!window.confirm('This will re-import all historical data from session files. Continue?')) {
      return
    }

    setMigrating(true)
    setMigrateResult(null)

    try {
      const res = await fetch('/api/metrics/migrate', { method: 'POST' })
      const result = await res.json()
      setMigrateResult(result)

      if (result.success) {
        // Refresh data after migration
        fetchData()
      }
    } catch (err) {
      setMigrateResult({ error: err.message })
    } finally {
      setMigrating(false)
    }
  }, [migrating, fetchData])

  const { metrics, toolCalls, sessions } = data || {}

  // Filter byDay data based on date range
  const filteredByDay = useMemo(() => {
    if (!metrics?.byDay) return {}

    const allDays = Object.keys(metrics.byDay).sort()
    if (allDays.length === 0) return {}

    let startDate, endDate
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (customStart && customEnd) {
      startDate = customStart
      endDate = customEnd
    } else {
      endDate = today.toISOString().slice(0, 10)
      const start = new Date(today)
      start.setDate(start.getDate() - dateRange + 1)
      startDate = start.toISOString().slice(0, 10)
    }

    const filtered = {}
    for (const [day, data] of Object.entries(metrics.byDay)) {
      if (day >= startDate && day <= endDate) {
        filtered[day] = data
      }
    }
    return filtered
  }, [metrics?.byDay, dateRange, customStart, customEnd])

  // Calculate totals for selected range
  const rangeTotals = useMemo(() => {
    let tokens = 0, cost = 0
    for (const data of Object.values(filteredByDay)) {
      tokens += data.tokens || 0
      cost += data.cost || 0
    }
    return { tokens, cost, days: Object.keys(filteredByDay).length }
  }, [filteredByDay])

  // Tab configuration
  const tabs = [
    { id: 'usage', label: 'Usage', icon: BarChart3 },
    { id: 'memory', label: 'Memory', icon: Sparkles },
    { id: 'performance', label: 'Performance', icon: Activity },
    { id: 'security', label: 'Security', icon: Shield, badge: riskLevel > 0 ? riskLevel : null },
    { id: 'insights', label: 'Insights', icon: Brain }
  ]

  return (
    <div className="min-h-screen p-4 md:p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl md:text-4xl logo-bounce cursor-pointer">🦞</span>
          <div>
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-[var(--accent-orange)] to-[var(--accent-amber)] bg-clip-text text-transparent">OpenClaw Sentinel</h1>
            <p className="text-[var(--text-muted)] text-xs">Agent Monitoring Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          {syncing && <span className="text-xs text-[var(--text-muted)]">syncing...</span>}
          {lastUpdate && !syncing && (
            <span className="text-xs text-[var(--text-muted)] hidden md:flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchData}
            disabled={syncing}
            className="p-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={runMigration}
            disabled={migrating}
            className="p-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] transition-colors disabled:opacity-50"
            title="Import historical data"
          >
            <Upload className={`w-4 h-4 ${migrating ? 'animate-pulse' : ''}`} />
          </button>
          {online ? (
            <span className="flex items-center gap-2 text-[var(--accent-green)] text-sm">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-green)] animate-pulse-glow" />
              <span className="hidden md:inline">Online</span>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-[var(--accent-red)] text-sm">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-red)]" />
              <span className="hidden md:inline">Offline</span>
            </span>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[var(--border)] pb-2">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const riskColors = {
            0: '',
            1: 'text-yellow-400',
            2: 'text-orange-400',
            3: 'text-red-400',
            4: 'text-purple-400'
          }

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                isActive
                  ? 'bg-[var(--accent-orange)]/20 text-[var(--accent-orange)] border border-[var(--accent-orange)]/30'
                  : 'hover:bg-[var(--bg-secondary)] text-[var(--text-muted)]'
              }`}
            >
              <Icon className={`w-4 h-4 ${tab.id === 'security' && riskLevel > 0 ? riskColors[riskLevel] : ''}`} />
              <span className="text-sm font-medium">{tab.label}</span>
              {tab.badge !== null && tab.badge > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                  tab.badge >= 3 ? 'bg-red-500 text-white animate-pulse' :
                  tab.badge >= 2 ? 'bg-orange-500 text-white' :
                  'bg-yellow-500 text-black'
                }`}>
                  {tab.badge >= 4 ? '!' : tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {error && (
        <div className="card p-4 mb-6 border-[var(--accent-red)] bg-red-500/10">
          <div className="flex items-center gap-2 text-[var(--accent-red)]">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Migration result notification */}
      {migrateResult && (
        <div className={`card p-4 mb-6 ${migrateResult.success ? 'border-[var(--accent-green)] bg-green-500/10' : 'border-[var(--accent-red)] bg-red-500/10'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {migrateResult.success ? (
                <>
                  <Upload className="w-4 h-4 text-[var(--accent-green)]" />
                  <span className="text-sm text-[var(--accent-green)]">
                    Migration complete! Imported {migrateResult.stats?.usage || 0} usage records,
                    {migrateResult.stats?.performance || 0} performance,
                    {migrateResult.stats?.insights || 0} insights buckets
                    ({migrateResult.elapsedMs}ms)
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-[var(--accent-red)]" />
                  <span className="text-sm text-[var(--accent-red)]">Migration failed: {migrateResult.error}</span>
                </>
              )}
            </div>
            <button
              onClick={() => setMigrateResult(null)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-6xl mb-4">🦀</div>
            <div className="text-[var(--text-muted)]">Loading...</div>
          </div>
        </div>
      )}

      {/* Date Range Picker - Shared across Usage, Performance, Insights */}
      {['usage', 'memory', 'performance', 'insights'].includes(activeTab) && (
        <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-[var(--text-secondary)]" />
          <span className="text-sm text-[var(--text-secondary)]">Range:</span>
          {[
            { value: 1/24, label: '1H' },
            { value: 6/24, label: '6H' },
            { value: 1, label: '24H' },
            { value: 7, label: '7D' },
            { value: 14, label: '14D' },
            { value: 30, label: '30D' },
          ].map(({ value, label }) => (
            <button
              key={label}
              onClick={() => { setDateRange(value); setCustomStart(''); setCustomEnd(''); }}
              className={`px-2 py-1 text-xs font-mono rounded border transition-colors ${
                dateRange === value && !customStart
                  ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white'
                  : 'bg-[var(--bg-tertiary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--accent-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => { setCustomStart(e.target.value); setDateRange('custom'); }}
              className="px-2 py-1 text-xs font-mono bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded text-[var(--text-primary)]"
            />
            <span className="text-[var(--text-muted)]">→</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => { setCustomEnd(e.target.value); setDateRange('custom'); }}
              className="px-2 py-1 text-xs font-mono bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded text-[var(--text-primary)]"
            />
          </div>
          <span className="text-xs text-[var(--text-muted)] ml-auto">
            {dateRange < 1 ? `${Math.round(dateRange * 24)}h` : `${Math.round(dateRange)}d`}
          </span>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'usage' && data && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
            <MetricCard
              title="Total Tokens"
              value={((metrics?.totalInput || 0) + (metrics?.totalOutput || 0)).toLocaleString()}
              subtitle={`${(metrics?.totalInput || 0).toLocaleString()} in / ${(metrics?.totalOutput || 0).toLocaleString()} out`}
              icon={Zap}
              color="orange"
            />
            <MetricCard
              title="Cache Hit"
              value={`${(parseFloat(metrics?.cacheHitRatio) || 0).toFixed(1)}%`}
              subtitle={`${(metrics?.totalCacheRead || 0).toLocaleString()} cached`}
              icon={Database}
              color={parseFloat(metrics?.cacheHitRatio) > 50 ? 'green' : 'amber'}
            />
            <MetricCard
              title="Total Cost"
              value={`$${metrics?.totalCost || '0.00'}`}
              subtitle="Estimated spend"
              icon={DollarSign}
              color="blue"
            />
            <MetricCard
              title="Messages"
              value={metrics?.messageCount || 0}
              subtitle={`${sessions?.length || 0} sessions`}
              icon={Activity}
              color="purple"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6">
            <div className="card p-4 md:p-6">
              <h3 className="text-xs md:text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-[var(--accent-orange)]" />
                Token Usage by Day
              </h3>
              <TokenChart data={filteredByDay} />
            </div>
            <div className="card p-4 md:p-6">
              <h3 className="text-xs md:text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
                <Database className="w-4 h-4 text-[var(--accent-cyan)]" />
                Cache Efficiency
              </h3>
              <CacheChart
                cacheRead={metrics?.totalCacheRead || 0}
                totalInput={metrics?.totalInput || 0}
              />
            </div>
            <div className="card p-4 md:p-6">
              <h3 className="text-xs md:text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-[var(--accent-green)]" />
                Cost by Day
              </h3>
              <CostChart data={filteredByDay} />
            </div>
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <div className="card p-4 md:p-6">
              <h3 className="text-xs md:text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[var(--accent-purple)]" />
                Recent Tool Calls
              </h3>
              <ToolCallsList calls={toolCalls} />
            </div>
            <div className="card p-4 md:p-6">
              <h3 className="text-xs md:text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--accent-blue)]" />
                Active Sessions
              </h3>
              <SessionInfo sessions={sessions} />
            </div>
          </div>
        </>
      )}

      {activeTab === 'memory' && (
        <MemoryDashboard
          dateRange={dateRange}
          customStart={customStart}
          customEnd={customEnd}
        />
      )}

      {activeTab === 'performance' && (
        <PerformanceDashboard
          dateRange={dateRange}
          customStart={customStart}
          customEnd={customEnd}
        />
      )}

      {activeTab === 'security' && (
        <SecurityDashboard />
      )}

      {activeTab === 'insights' && (
        <InsightsDashboard
          dateRange={dateRange}
          customStart={customStart}
          customEnd={customEnd}
        />
      )}

      {/* Footer */}
      <footer className="mt-6 md:mt-8 text-center text-[var(--text-muted)] text-xs">
        OpenClaw Sentinel • Agent Monitoring Dashboard • Built with 🦞
      </footer>
    </div>
  )
}

export default App
