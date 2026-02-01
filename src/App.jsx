import { useState, useEffect, useCallback } from 'react'
import { Activity, Zap, Database, DollarSign, AlertTriangle, Clock, Cpu, RefreshCw, Shield, BarChart3, Brain, Radio } from 'lucide-react'
import TokenChart from './components/TokenChart'
import CacheChart from './components/CacheChart'
import CostChart from './components/CostChart'
import MetricCard from './components/MetricCard'
import ToolCallsList from './components/ToolCallsList'
import SessionInfo from './components/SessionInfo'
import SecurityDashboard from './features/security/SecurityDashboard'
import InsightsDashboard from './features/insights/InsightsDashboard'
import { PerformanceDashboard } from './features/performance'
import { TracesPanel } from './features/traces'

function App() {
  const [activeTab, setActiveTab] = useState('usage')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [online, setOnline] = useState(false)
  const [riskLevel, setRiskLevel] = useState(0)

  const fetchData = useCallback(async () => {
    try {
      const [usageRes, sessionsRes, healthRes, risksRes] = await Promise.all([
        fetch('/api/usage').catch(() => null),
        fetch('/api/sessions').catch(() => null),
        fetch('/api/health').catch(() => null),
        fetch('/api/security/risks').catch(() => null)
      ])

      const usage = usageRes?.ok ? await usageRes.json() : null
      const sessions = sessionsRes?.ok ? await sessionsRes.json() : null
      const health = healthRes?.ok ? await healthRes.json() : null
      const risks = risksRes?.ok ? await risksRes.json() : null

      setOnline(!!health)
      if (risks) setRiskLevel(risks.level || 0)

      if (usage) {
        setData({
          metrics: {
            totalInput: usage.totalInput || 0,
            totalOutput: usage.totalOutput || 0,
            totalCacheRead: usage.totalCacheRead || 0,
            totalCacheWrite: usage.totalCacheWrite || 0,
            totalCost: (usage.totalCost || 0).toFixed(4),
            messageCount: usage.messageCount || 0,
            cacheHitRatio: usage.cacheHitRatio || '0',
            byModel: usage.byModel || {},
            byDay: usage.byDay || {}
          },
          toolCalls: usage.toolCalls || [],
          sessions: sessions?.sessions || []
        })
        setLastUpdate(new Date())
        setError(null)
      } else {
        setError('Failed to fetch data')
      }
    } catch (err) {
      setError(err.message)
      setOnline(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  const { metrics, toolCalls, sessions } = data || {}

  // Tab configuration
  const tabs = [
    { id: 'usage', label: 'Usage', icon: BarChart3 },
    { id: 'performance', label: 'Performance', icon: Activity },
    { id: 'traces', label: 'Traces', icon: Radio },
    { id: 'security', label: 'Security', icon: Shield, badge: riskLevel > 0 ? riskLevel : null },
    { id: 'insights', label: 'Insights', icon: Brain }
  ]

  return (
    <div className="min-h-screen p-4 md:p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl md:text-4xl">🦀</span>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[var(--accent-orange)]">Don Cangrejo Monitor</h1>
            <p className="text-[var(--text-muted)] text-xs">Self-monitoring dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          {lastUpdate && (
            <span className="text-xs text-[var(--text-muted)] hidden md:flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button 
            onClick={fetchData}
            className="p-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
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

      {/* Loading state */}
      {loading && !data && (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-6xl mb-4">🦀</div>
            <div className="text-[var(--text-muted)]">Loading...</div>
          </div>
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
              value={`${metrics?.cacheHitRatio || 0}%`}
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
              <TokenChart data={metrics?.byDay} />
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
              <CostChart data={metrics?.byDay} />
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

      {activeTab === 'performance' && (
        <PerformanceDashboard />
      )}

      {activeTab === 'traces' && (
        <TracesPanel />
      )}

      {activeTab === 'security' && (
        <SecurityDashboard />
      )}

      {activeTab === 'insights' && (
        <InsightsDashboard />
      )}

      {/* Footer */}
      <footer className="mt-6 md:mt-8 text-center text-[var(--text-muted)] text-xs">
        Don Cangrejo Self-Monitor • Built with 🦀 and Recharts
      </footer>
    </div>
  )
}

export default App
