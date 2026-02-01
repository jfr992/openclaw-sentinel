import { useState, useEffect, useCallback, useRef } from 'react'
import { Shield, ShieldAlert, AlertTriangle, Activity, Globe, FileWarning, RefreshCw, Zap, Terminal, Clock, ChevronDown, ChevronRight, Brain, CheckCircle } from 'lucide-react'
import RiskGauge from './RiskGauge'
import AlertFeed from './AlertFeed'
import ExposurePanel from './ExposurePanel'

export default function SecurityDashboard() {
  const [risks, setRisks] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [exposure, setExposure] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Live feed state
  const [connected, setConnected] = useState(false)
  const [liveStats, setLiveStats] = useState(null)
  const [activeRuns, setActiveRuns] = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [expandedItems, setExpandedItems] = useState(new Set())
  const [baseline, setBaseline] = useState(null)
  const wsRef = useRef(null)

  // Fetch baseline status
  const fetchBaseline = useCallback(async () => {
    try {
      const res = await fetch('/api/baseline/status')
      if (res.ok) setBaseline(await res.json())
    } catch {
      // Silent fail - baseline fetch is non-critical
    }
  }, [])

  // Whitelist a command
  const whitelistCommand = async (command) => {
    try {
      await fetch('/api/baseline/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'command', value: command })
      })
      fetchBaseline()
    } catch {
      // Silent fail
    }
  }

  const toggleExpand = (id) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const fetchData = useCallback(async () => {
    try {
      const [risksRes, alertsRes, exposureRes] = await Promise.all([
        fetch('/api/security/risks'),
        fetch('/api/security/alerts?limit=20'),
        fetch('/api/security/exposure')
      ])

      if (risksRes.ok) setRisks(await risksRes.json())
      if (alertsRes.ok) {
        const data = await alertsRes.json()
        setAlerts(data.alerts || [])
      }
      if (exposureRes.ok) setExposure(await exposureRes.json())

      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // WebSocket for real-time live feed
  useEffect(() => {
    fetchData()
    fetchBaseline()
    const baselineInterval = setInterval(fetchBaseline, 30000)

    const connectWs = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live`)
        wsRef.current = ws

        ws.onopen = () => {
          setConnected(true)
        }

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data)

          switch (msg.type) {
            case 'snapshot':
              // Initial data on connect
              setLiveStats(msg.data.stats)
              setActiveRuns(msg.data.activeRuns || [])
              setRecentActivity(msg.data.recentEvents?.slice(0, 20) || [])
              break

            case 'activity':
              // Real-time activity
              setRecentActivity(prev => [msg.data, ...prev].slice(0, 30))
              // Update stats
              setLiveStats(prev => prev ? {
                ...prev,
                totalEvents: (prev.totalEvents || 0) + 1
              } : prev)
              break

            case 'run:start':
              setActiveRuns(prev => [msg.data, ...prev])
              break

            case 'run:complete':
              setActiveRuns(prev => prev.filter(r => r.runId !== msg.data.runId))
              break

            case 'risk:alert':
              // Add to alerts
              const newAlert = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                ...msg.data.risk,
                toolCall: msg.data.toolCall?.name,
                runId: msg.data.runId,
                timestamp: new Date().toISOString()
              }
              setAlerts(prev => [newAlert, ...prev].slice(0, 50))
              // Update risk stats
              setRisks(prev => prev ? {
                ...prev,
                totalRisks: (prev.totalRisks || 0) + 1,
                level: Math.max(prev.level || 0, msg.data.risk.level)
              } : prev)
              break
          }
        }

        ws.onerror = () => {
          setConnected(false)
        }

        ws.onclose = () => {
          setConnected(false)
          // Reconnect after 3s
          setTimeout(connectWs, 3000)
        }
      } catch (err) {
        setConnected(false)
      }
    }

    connectWs()

    // Fallback polling for historical data (less frequent)
    const interval = setInterval(fetchData, 30000)

    return () => {
      clearInterval(interval)
      clearInterval(baselineInterval)
      if (wsRef.current) wsRef.current.close()
    }
  }, [fetchData, fetchBaseline])

  const acknowledgeAlert = async (id) => {
    try {
      await fetch(`/api/security/alerts/${id}/acknowledge`, { method: 'POST' })
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a))
    } catch {
      // Silent fail
    }
  }

  const acknowledgeAllAlerts = async () => {
    try {
      await fetch('/api/security/alerts/acknowledge-all', { method: 'POST' })
      setAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })))
    } catch {
      // Silent fail
    }
  }

  const clearAllAlerts = async () => {
    try {
      await fetch('/api/security/alerts', { method: 'DELETE' })
      setAlerts([])
    } catch {
      // Silent fail
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="w-12 h-12 text-[var(--accent-purple)] mx-auto mb-2 animate-pulse" />
          <p className="text-[var(--text-muted)]">Analyzing security...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-[var(--accent-purple)]" />
          <h2 className="text-xl font-bold">Security Monitor</h2>
          {/* Live indicator */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
            connected
              ? 'bg-green-500/20 text-green-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            {connected ? 'LIVE' : 'OFFLINE'}
          </div>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="card p-4 border-[var(--accent-red)] bg-red-500/10">
          <div className="flex items-center gap-2 text-[var(--accent-red)]">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Baseline Learning Status */}
      {baseline && (
        <div className={`card p-4 ${baseline.learned ? 'bg-green-500/10 border-green-500/30' : 'bg-[var(--accent-amber)]/10 border-[var(--accent-amber)]/30'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className={`w-5 h-5 ${baseline.learned ? 'text-green-400' : 'text-[var(--accent-amber)]'}`} />
              <div>
                <span className="font-semibold">
                  {baseline.learned ? 'Baseline Learned' : 'Learning Patterns...'}
                </span>
                <span className="text-xs text-[var(--text-muted)] ml-2">
                  {baseline.stats.commandsLearned} commands, {baseline.stats.toolsLearned} tools
                </span>
              </div>
            </div>
            {!baseline.learned && (
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent-amber)] transition-all"
                    style={{ width: `${baseline.learningProgress}%` }}
                  />
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {baseline.hoursRemaining}h left
                </span>
              </div>
            )}
            {baseline.learned && (
              <CheckCircle className="w-5 h-5 text-green-400" />
            )}
          </div>
        </div>
      )}

      {/* Live Stats Bar */}
      {liveStats && (
        <div className="card p-4 bg-gradient-to-r from-[var(--accent-purple)]/10 to-[var(--accent-cyan)]/10 border-[var(--accent-purple)]/30">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[var(--accent-amber)]" />
                <span className="text-sm text-[var(--text-muted)]">Events:</span>
                <span className="font-mono font-bold">{liveStats.totalEvents?.toLocaleString() || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[var(--accent-cyan)]" />
                <span className="text-sm text-[var(--text-muted)]">Tool Calls:</span>
                <span className="font-mono font-bold">{liveStats.totalToolCalls?.toLocaleString() || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[var(--accent-red)]" />
                <span className="text-sm text-[var(--text-muted)]">Risk Alerts:</span>
                <span className="font-mono font-bold text-[var(--accent-red)]">{liveStats.riskAlerts || 0}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Clock className="w-3 h-3" />
              Active runs: {activeRuns.length}
            </div>
          </div>
        </div>
      )}

      {/* Risk Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Risk Gauge */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Risk Level
          </h3>
          <RiskGauge
            level={risks?.level || 0}
            levelName={risks?.levelName || 'NONE'}
            criticalCount={risks?.criticalCount || 0}
            highCount={risks?.highCount || 0}
          />
        </div>

        {/* Risk Summary */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Risk Summary
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Total Risks</span>
              <span className="font-mono font-bold">{risks?.totalRisks || 0}</span>
            </div>
            {risks?.summary?.byType && Object.entries(risks.summary.byType).map(([type, count]) => (
              <div key={type} className="flex justify-between items-center">
                <span className="text-[var(--text-muted)] text-sm capitalize">
                  {type.replace(/_/g, ' ')}
                </span>
                <span className="font-mono text-sm">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Exposure Stats
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">External Calls</span>
              <span className="font-mono font-bold">{exposure?.externalCalls?.length || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Unique Domains</span>
              <span className="font-mono font-bold">{exposure?.topDestinations?.length || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Sensitive Access</span>
              <span className={`font-mono font-bold ${exposure?.sensitiveAccess?.length > 0 ? 'text-[var(--accent-red)]' : ''}`}>
                {exposure?.sensitiveAccess?.length || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Data Flow Out</span>
              <span className="font-mono font-bold">{exposure?.dataFlowOut || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Runs (Live) */}
      {activeRuns.length > 0 && (
        <div className="card p-6 border-[var(--accent-cyan)]/30">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--accent-cyan)] animate-pulse" />
            Active Runs
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]">
              {activeRuns.length}
            </span>
          </h3>
          <div className="space-y-2">
            {activeRuns.map((run) => (
              <div
                key={run.runId}
                className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent-cyan)] animate-pulse" />
                    <code className="text-xs text-[var(--text-muted)]">{run.runId?.slice(0, 8)}...</code>
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">
                    {run.toolCalls?.length || 0} tools
                  </span>
                </div>
                {run.risks?.length > 0 && (
                  <div className="mt-2 text-xs text-[var(--accent-red)]">
                    ⚠️ {run.risks.length} risk(s) detected
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts and Exposure */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alert Feed */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[var(--accent-amber)]" />
              Recent Alerts
              {alerts.filter(a => !a.acknowledged).length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-[var(--accent-red)] text-white">
                  {alerts.filter(a => !a.acknowledged).length}
                </span>
              )}
            </h3>
            {alerts.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={acknowledgeAllAlerts}
                  className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  title="Acknowledge all"
                >
                  ✓ Ack All
                </button>
                <button
                  onClick={clearAllAlerts}
                  className="text-xs px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
                  title="Clear all alerts"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>
          <AlertFeed alerts={alerts} onAcknowledge={acknowledgeAlert} />
        </div>

        {/* Live Activity Feed */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[var(--accent-cyan)]" />
            Live Activity
            {connected && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {recentActivity.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)] text-center py-4">
                {connected ? (
                  <p>Waiting for activity...</p>
                ) : (
                  <div className="space-y-2">
                    <p className="font-medium">Gateway not connected</p>
                    <p className="text-xs opacity-70">Live activity requires OpenClaw Gateway access.</p>
                    <p className="text-xs opacity-50">Historical data is still available in other tabs.</p>
                  </div>
                )}
              </div>
            ) : (
              recentActivity.map((event, i) => {
                // Extract command details for exec tool calls
                const toolName = event.tool || event.payload?.data?.name
                const toolInput = event.toolInput || event.payload?.data?.input
                const command = toolInput?.command
                const isExec = toolName === 'exec' && command
                const eventId = event.id || `event-${i}`
                const isExpanded = expandedItems.has(eventId)
                const hasDetails = isExec || (toolInput && Object.keys(toolInput).length > 0)

                return (
                  <div
                    key={eventId}
                    className={`rounded text-xs ${
                      isExec
                        ? 'bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/30'
                        : 'bg-[var(--bg-secondary)]'
                    }`}
                  >
                    {/* Header - clickable if has details */}
                    <div
                      className={`p-2 flex items-center justify-between ${hasDetails ? 'cursor-pointer hover:bg-white/5' : ''}`}
                      onClick={() => hasDetails && toggleExpand(eventId)}
                    >
                      <div className="flex items-center gap-2">
                        {hasDetails && (
                          isExpanded
                            ? <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
                            : <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
                        )}
                        <span className={`font-mono ${
                          isExec ? 'text-[var(--accent-amber)]' :
                          event.type === 'agent' ? 'text-[var(--accent-cyan)]' :
                          event.tool ? 'text-[var(--accent-amber)]' :
                          'text-[var(--text-muted)]'
                        }`}>
                          {toolName || event.stream || event.type}
                        </span>
                        {isExec && !isExpanded && (
                          <span className="text-[var(--text-muted)] truncate max-w-[150px]">
                            {command.split(' ')[0]}
                          </span>
                        )}
                      </div>
                      <span className="text-[var(--text-muted)]">
                        {new Date(event.ts).toLocaleTimeString()}
                      </span>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-2 pb-2 border-t border-[var(--border)] mt-1 pt-2">
                        {/* Show full command for exec calls */}
                        {isExec && (
                          <div className="space-y-2">
                            <div className="font-mono text-[var(--text-primary)] bg-black/30 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                              $ {command}
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); whitelistCommand(command.split(' ')[0]); }}
                              className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30"
                            >
                              ✓ Whitelist "{command.split(' ')[0]}"
                            </button>
                          </div>
                        )}
                        {/* Show other tool inputs */}
                        {!isExec && toolInput && (
                          <pre className="text-[var(--text-muted)] bg-black/30 p-2 rounded overflow-x-auto whitespace-pre-wrap text-[10px]">
                            {JSON.stringify(toolInput, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Show text delta for assistant messages (not expandable) */}
                    {event.delta && !toolName && (
                      <div className="px-2 pb-2 text-[var(--text-secondary)] truncate">
                        {event.delta.slice(0, 60)}...
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Exposure Panel (moved down) */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
          <FileWarning className="w-4 h-4 text-[var(--accent-cyan)]" />
          Network Exposure
        </h3>
        <ExposurePanel exposure={exposure} />
      </div>

      {/* Recent Risks Detail */}
      {risks?.recentRisks?.length > 0 && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
            Recent Risk Details
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {risks.recentRisks.map((risk, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg border ${
                  risk.level >= 4 ? 'border-purple-500/50 bg-purple-500/10' :
                  risk.level >= 3 ? 'border-red-500/50 bg-red-500/10' :
                  risk.level >= 2 ? 'border-orange-500/50 bg-orange-500/10' :
                  'border-yellow-500/50 bg-yellow-500/10'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className={`text-xs font-bold uppercase ${
                      risk.level >= 4 ? 'text-purple-400' :
                      risk.level >= 3 ? 'text-red-400' :
                      risk.level >= 2 ? 'text-orange-400' :
                      'text-yellow-400'
                    }`}>
                      {risk.level >= 4 ? 'CRITICAL' :
                       risk.level >= 3 ? 'HIGH' :
                       risk.level >= 2 ? 'MEDIUM' : 'LOW'}
                    </span>
                    <p className="text-sm mt-1">{risk.description}</p>
                    <code className="text-xs text-[var(--text-muted)] mt-1 block">
                      {risk.match}
                    </code>
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">
                    {risk.toolCall}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
