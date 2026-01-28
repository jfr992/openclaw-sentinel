import { useState } from 'react'
import { Shield, CheckCircle, Eye, Activity, X, AlertTriangle, Skull, Zap } from 'lucide-react'
import { runSecurityCheck, getAlertDetails, traceCommand, alertAction } from '../hooks/useApi'

const severityConfig = {
  critical: {
    border: 'alert-item-critical',
    badge: 'badge-critical',
    dot: 'bg-threat-600',
    icon: Skull,
  },
  high: {
    border: 'alert-item-high',
    badge: 'badge-high',
    dot: 'bg-threat-500',
    icon: AlertTriangle,
  },
  medium: {
    border: 'alert-item-medium',
    badge: 'badge-medium',
    dot: 'bg-status-warn',
    icon: Zap,
  },
  low: {
    border: 'alert-item',
    badge: 'badge-low',
    dot: 'bg-status-safe',
    icon: Shield,
  },
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export default function AlertsPanel({ alerts, onRefresh, dimmed, expanded }) {
  const [scanning, setScanning] = useState(false)
  const [modal, setModal] = useState(null)

  async function handleScan() {
    setScanning(true)
    try {
      await runSecurityCheck()
      onRefresh()
    } finally {
      setScanning(false)
    }
  }

  async function handleViewDetails(alertId) {
    const data = await getAlertDetails(alertId)
    setModal({ type: 'details', data })
  }

  async function handleTrace(command) {
    setModal({ type: 'trace', data: { loading: true } })
    const result = await traceCommand(command)
    setModal({ type: 'trace', data: result })
  }

  async function handleAction(action, alertId, data) {
    if (action === 'whitelist' && data) {
      try {
        await fetch('/api/baseline/whitelist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: data.details?.tool || 'EXEC',
            details: {
              command: data.details?.command,
              path: data.details?.path,
              remote: data.details?.remote,
            }
          }),
        })
        await alertAction('dismiss', alertId, '')
        onRefresh()
      } catch (e) {
        console.error('Failed to whitelist:', e)
      }
    } else {
      await alertAction(action, alertId, data)
      if (action === 'dismiss') onRefresh()
    }
  }

  return (
    <>
      <div className={`${expanded ? '' : 'card card-threat'} overflow-hidden transition-all ${dimmed ? 'opacity-30 scale-[0.98]' : ''}`}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-shell-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-threat-400" />
            <h2 className={`font-display font-semibold text-white uppercase tracking-wide ${expanded ? 'text-lg' : 'text-sm'}`}>
              Security Alerts
            </h2>
            {alerts.length > 0 && (
              <span className="badge badge-critical">{alerts.length}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {alerts.length > 0 && (
              <button
                onClick={async () => {
                  try {
                    await fetch('/api/alerts/clear', { method: 'POST' })
                    onRefresh()
                  } catch (e) {
                    console.error('Failed to clear alerts:', e)
                  }
                }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-shell-800 border border-threat-500/30 text-threat-400 hover:bg-threat-500/10 font-mono transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={handleScan}
              disabled={scanning}
              className="text-[10px] px-1.5 py-0.5 rounded bg-shell-800 border border-shell-600 text-shell-400 hover:bg-shell-700 hover:text-white font-mono transition-colors disabled:opacity-50"
            >
              {scanning ? (
                <>
                  <span className="animate-spin inline-block w-2 h-2 border border-threat-400 border-t-transparent rounded-full mr-1" />
                  ...
                </>
              ) : 'Scan'}
            </button>
          </div>
        </div>

        {/* Alerts List */}
        <div className={`p-4 overflow-y-auto ${expanded ? 'h-[600px]' : 'h-72'}`}>
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-status-safe/10 flex items-center justify-center mb-4 glow-green">
                <CheckCircle className="w-8 h-8 text-status-safe" />
              </div>
              <p className="font-display text-status-safe text-sm uppercase tracking-wide">All Clear</p>
              <p className="text-shell-500 text-xs font-mono mt-2">No security threats detected</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...alerts].reverse().map((alert, i) => {
                const config = severityConfig[alert.severity] || severityConfig.medium
                const Icon = config.icon

                return (
                  <div key={i} className={`${config.border} animate-slide-in`} style={{ animationDelay: `${i * 50}ms` }}>
                    {/* Alert Header */}
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4 text-threat-400" />
                      <span className={`${config.dot} w-2 h-2 rounded-full`} />
                      <span className="text-sm font-display font-medium text-white flex-1 uppercase tracking-wide">
                        {alert.title?.replace(/^[^\w]*/, '').trim()}
                      </span>
                      <span className="terminal-timestamp">{formatTime(alert.timestamp)}</span>
                    </div>

                    {/* Command/Path Display */}
                    {(alert.details?.full_command || alert.details?.path || alert.details?.file || alert.details?.port) && (
                      <div className="bg-shell-950 border border-shell-800 rounded p-2 mt-2 font-mono text-xs">
                        <span className="text-threat-500">&gt;</span>
                        <span className="text-neon-cyan ml-2">
                          {alert.details?.full_command?.slice(0, 100) ||
                           alert.details?.path ||
                           alert.details?.file ||
                           (alert.details?.port && `Port: ${alert.details.port}`) ||
                           ''}
                        </span>
                      </div>
                    )}

                    {/* Description */}
                    <p className="text-xs text-shell-500 mt-2 line-clamp-1">{alert.description}</p>

                    {/* Matched Pattern */}
                    {alert.details?.matched_text && !alert.details?.full_command && (
                      <code className="block text-xs bg-shell-950 text-threat-400 p-2 rounded mt-2 font-mono border border-threat-500/20">
                        {alert.details.matched_text}
                      </code>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        onClick={() => handleViewDetails(i)}
                        className="text-xs px-2.5 py-1.5 rounded-md bg-neon-blue/10 text-neon-blue border border-neon-blue/30 hover:bg-neon-blue/20 transition-colors flex items-center gap-1.5 font-mono"
                      >
                        <Eye className="w-3 h-3" /> DETAILS
                      </button>

                      {alert.details?.full_command && (
                        <button
                          onClick={() => handleTrace(alert.details.full_command)}
                          className="text-xs px-2.5 py-1.5 rounded-md bg-neon-purple/10 text-neon-purple border border-neon-purple/30 hover:bg-neon-purple/20 transition-colors flex items-center gap-1.5 font-mono"
                        >
                          <Activity className="w-3 h-3" /> TRACE
                        </button>
                      )}

                      {alert.details?.session_file && (
                        <button
                          onClick={() => handleAction('kill', i, alert.details.session_file)}
                          className="text-xs px-2.5 py-1.5 rounded-md bg-threat-500/10 text-threat-400 border border-threat-500/30 hover:bg-threat-500/20 transition-colors font-mono"
                        >
                          KILL SESSION
                        </button>
                      )}

                      <button
                        onClick={() => handleAction('whitelist', i, alert)}
                        className="text-xs px-2.5 py-1.5 rounded-md bg-status-safe/10 text-status-safe border border-status-safe/30 hover:bg-status-safe/20 transition-colors font-mono"
                      >
                        SAFE
                      </button>

                      <button
                        onClick={() => handleAction('dismiss', i, '')}
                        className="text-xs px-2.5 py-1.5 rounded-md bg-shell-700 text-shell-500 border border-shell-600 hover:bg-shell-600 transition-colors font-mono"
                      >
                        DISMISS
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-shell-950/90 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative card p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto animate-fade-in border-threat-500/30">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-lg font-semibold text-white uppercase tracking-wide">
                {modal.type === 'details' ? 'Alert Details' : 'Command Trace Analysis'}
              </h3>
              <button onClick={() => setModal(null)} className="text-shell-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {modal.type === 'details' && modal.data?.alert && (
              <DetailsContent data={modal.data} onTrace={handleTrace} />
            )}

            {modal.type === 'trace' && (
              <TraceContent data={modal.data} />
            )}
          </div>
        </div>
      )}
    </>
  )
}

function DetailsContent({ data, onTrace }) {
  const { alert, context } = data
  const config = severityConfig[alert.severity] || severityConfig.medium

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <span className={`badge ${config.badge}`}>
          {alert.severity?.toUpperCase()}
        </span>
        <span className="badge badge-info">
          {alert.category}
        </span>
      </div>

      <div>
        <h4 className="text-xs font-mono text-shell-500 uppercase tracking-wide mb-2">Description</h4>
        <p className="text-sm text-gray-300">{alert.description}</p>
      </div>

      {alert.details?.full_command && (
        <div>
          <h4 className="text-xs font-mono text-shell-500 uppercase tracking-wide mb-2">Command Executed</h4>
          <pre className="bg-shell-950 border border-shell-800 p-3 rounded-lg text-xs text-threat-400 font-mono overflow-x-auto whitespace-pre-wrap">
            <span className="text-threat-600">&gt;</span> {alert.details.full_command}
          </pre>
          <button
            onClick={() => onTrace(alert.details.full_command)}
            className="mt-3 btn-secondary text-xs"
          >
            <Activity className="w-3 h-3 mr-1.5 inline" /> Analyze with Trace
          </button>
        </div>
      )}

      {alert.details?.recommendation && (
        <div className="bg-neon-purple/5 border border-neon-purple/30 rounded-lg p-4">
          <h4 className="text-xs font-mono text-neon-purple uppercase tracking-wide mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Recommendation
          </h4>
          <p className="text-sm text-gray-300">{alert.details.recommendation}</p>
        </div>
      )}

      {context?.length > 0 && (
        <div>
          <h4 className="text-xs font-mono text-shell-500 uppercase tracking-wide mb-2">Session Context</h4>
          <div className="bg-shell-950 rounded-lg p-3 max-h-64 overflow-y-auto space-y-2 border border-shell-800">
            {context.map((msg, i) => (
              <div key={i} className={`text-xs font-mono ${msg.role === 'user' ? 'text-neon-blue' : msg.role === 'assistant' ? 'text-neon-green' : 'text-shell-500'}`}>
                <span className="font-semibold">{msg.role.toUpperCase()}:</span>
                <span className="text-gray-400 ml-2">{msg.content?.substring(0, 200)}{msg.content?.length > 200 ? '...' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TraceContent({ data }) {
  if (data.loading) {
    return (
      <div className="flex items-center gap-3 text-shell-500">
        <span className="animate-spin w-5 h-5 border-2 border-neon-cyan border-t-transparent rounded-full" />
        <span className="font-mono text-sm">Analyzing command...</span>
      </div>
    )
  }

  const config = severityConfig[data.risk_assessment] || severityConfig.medium

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-xs font-mono text-shell-500 uppercase tracking-wide mb-2">Command Analyzed</h4>
        <pre className="bg-shell-950 border border-shell-800 p-3 rounded-lg text-xs text-neon-cyan font-mono overflow-x-auto whitespace-pre-wrap">
          <span className="text-neon-cyan/50">&gt;</span> {data.command}
        </pre>
      </div>

      <div className="flex items-center gap-3">
        <h4 className="text-xs font-mono text-shell-500 uppercase tracking-wide">Risk Assessment:</h4>
        <span className={`badge ${config.badge} text-sm`}>
          {data.risk_assessment?.toUpperCase()}
        </span>
      </div>

      {data.risk_factors?.length > 0 && (
        <div>
          <h4 className="text-xs font-mono text-shell-500 uppercase tracking-wide mb-2">Risk Factors</h4>
          <ul className="space-y-2">
            {data.risk_factors.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-threat-400 font-mono">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.files_accessed?.length > 0 && (
        <div>
          <h4 className="text-xs font-mono text-shell-500 uppercase tracking-wide mb-2">Files Accessed</h4>
          <div className="bg-shell-950 rounded-lg p-3 space-y-1 border border-shell-800">
            {data.files_accessed.map((f, i) => (
              <div key={i} className="text-xs font-mono text-neon-purple">{f}</div>
            ))}
          </div>
        </div>
      )}

      {data.network_activity?.length > 0 && (
        <div>
          <h4 className="text-xs font-mono text-shell-500 uppercase tracking-wide mb-2">Network Activity</h4>
          <div className="bg-shell-950 rounded-lg p-3 space-y-1 border border-shell-800">
            {data.network_activity.map((n, i) => (
              <div key={i} className="text-xs font-mono text-neon-orange">{n}</div>
            ))}
          </div>
        </div>
      )}

      {data.trace_output && (
        <details className="text-sm">
          <summary className="text-shell-500 cursor-pointer hover:text-gray-300 font-mono text-xs uppercase">Raw Analysis Output</summary>
          <pre className="mt-2 bg-shell-950 border border-shell-800 p-3 rounded-lg text-xs text-shell-500 font-mono overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
            {data.trace_output}
          </pre>
        </details>
      )}

      {data.error && (
        <div className="bg-threat-500/10 border border-threat-500/30 rounded-lg p-4">
          <p className="text-sm text-threat-400 font-mono">{data.error}</p>
        </div>
      )}
    </div>
  )
}
