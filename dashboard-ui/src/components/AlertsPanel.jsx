import { useState } from 'react'
import { Shield, CheckCircle, Eye, Activity, X, AlertTriangle } from 'lucide-react'
import { runSecurityCheck, getAlertDetails, traceCommand, alertAction } from '../hooks/useApi'

const severityColors = {
  critical: 'border-red-500 bg-red-500/5',
  high: 'border-orange-500 bg-orange-500/5',
  medium: 'border-violet-500 bg-violet-500/5',
  low: 'border-blue-500 bg-blue-500/5',
}

const severityDots = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-violet-500',
  low: 'bg-blue-500',
}

const riskBadgeColors = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function AlertsPanel({ alerts, onRefresh, dimmed, expanded }) {
  const [scanning, setScanning] = useState(false)
  const [modal, setModal] = useState(null) // { type: 'details' | 'trace', data: any }

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

  async function handleAction(action, alertId, sessionFile) {
    await alertAction(action, alertId, sessionFile)
    if (action === 'dismiss') onRefresh()
  }

  return (
    <>
      <div className={`${expanded ? '' : 'bg-[var(--dark-800)] rounded-xl border border-white/5'} overflow-hidden transition-all ${dimmed ? 'opacity-30 scale-[0.98]' : ''}`}>
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h2 className={`font-medium text-white ${expanded ? 'text-lg' : ''}`}>Security Alerts</h2>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
          >
            {scanning ? 'Scanning...' : 'Run Check'}
          </button>
        </div>

        <div className={`p-4 overflow-y-auto ${expanded ? 'h-[600px]' : 'h-96'}`}>
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              <p className="text-gray-400 text-sm">No alerts</p>
              <p className="text-gray-600 text-xs mt-1">System is secure</p>
            </div>
          ) : (
            [...alerts].reverse().map((alert, i) => (
              <div
                key={i}
                className={`border-l-2 ${severityColors[alert.severity] || severityColors.medium} rounded-r-lg p-3 mb-2`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${severityDots[alert.severity] || 'bg-gray-500'}`} />
                  <span className="text-sm font-medium text-white flex-1">
                    {alert.title?.replace(/^[^\w]*/, '').trim()}
                  </span>
                  <span className="text-xs text-gray-600">{formatTime(alert.timestamp)}</span>
                </div>
                
                {/* Show the actual path/command/target that triggered the alert */}
                {(alert.details?.full_command || alert.details?.path || alert.details?.file || alert.details?.port) && (
                  <code className="block text-xs bg-[var(--dark-900)] text-cyan-400 p-2 rounded mt-2 font-mono overflow-x-auto truncate">
                    {alert.details?.full_command?.slice(0, 100) || 
                     alert.details?.path || 
                     alert.details?.file ||
                     (alert.details?.port && `Port: ${alert.details.port}`) ||
                     ''}
                  </code>
                )}
                
                {/* Brief description */}
                <p className="text-xs text-gray-400 mt-2 line-clamp-1">{alert.description}</p>
                
                {alert.details?.matched_text && !alert.details?.full_command && (
                  <code className="block text-xs bg-[var(--dark-900)] text-red-400 p-2 rounded mt-2 font-mono overflow-x-auto">
                    {alert.details.matched_text}
                  </code>
                )}
                
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    onClick={() => handleViewDetails(i)}
                    className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" /> Details
                  </button>
                  
                  {alert.details?.full_command && (
                    <button
                      onClick={() => handleTrace(alert.details.full_command)}
                      className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors flex items-center gap-1"
                    >
                      <Activity className="w-3 h-3" /> Trace
                    </button>
                  )}
                  
                  {alert.details?.session_file && (
                    <button
                      onClick={() => handleAction('kill', i, alert.details.session_file)}
                      className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                    >
                      Kill Session
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleAction('dismiss', i, '')}
                    className="text-xs px-2 py-1 rounded bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setModal(null)} />
          <div className="relative bg-[var(--dark-800)] rounded-xl border border-white/10 p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                {modal.type === 'details' ? 'Alert Details' : 'Command Trace Analysis'}
              </h3>
              <button onClick={() => setModal(null)} className="text-gray-500 hover:text-white">
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

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <span className={`px-2 py-1 rounded text-xs font-medium border ${riskBadgeColors[alert.severity] || riskBadgeColors.medium}`}>
          {alert.severity?.toUpperCase()}
        </span>
        <span className="px-2 py-1 rounded text-xs bg-[var(--dark-600)] text-gray-300">
          {alert.category}
        </span>
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-400 mb-1">Description</h4>
        <p className="text-sm text-white">{alert.description}</p>
      </div>

      {alert.details?.full_command && (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-1">Command Executed</h4>
          <pre className="bg-[var(--dark-900)] p-3 rounded text-xs text-red-400 font-mono overflow-x-auto whitespace-pre-wrap">
            {alert.details.full_command}
          </pre>
          <button
            onClick={() => onTrace(alert.details.full_command)}
            className="mt-2 text-xs px-3 py-1.5 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
          >
            Analyze with Trace
          </button>
        </div>
      )}

      {alert.details?.recommendation && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
          <h4 className="text-sm font-medium text-purple-400 mb-1 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" /> Recommendation
          </h4>
          <p className="text-sm text-purple-200">{alert.details.recommendation}</p>
        </div>
      )}

      {context?.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">Session Context</h4>
          <div className="bg-[var(--dark-900)] rounded-lg p-3 max-h-64 overflow-y-auto space-y-2">
            {context.map((msg, i) => (
              <div key={i} className={`text-xs ${msg.role === 'user' ? 'text-blue-400' : msg.role === 'assistant' ? 'text-green-400' : 'text-gray-400'}`}>
                <span className="font-medium">{msg.role}:</span>
                <span className="text-gray-300 ml-1">{msg.content?.substring(0, 200)}{msg.content?.length > 200 ? '...' : ''}</span>
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
    return <div className="text-gray-400">Analyzing command... This may take a few seconds.</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium text-gray-400 mb-1">Command Analyzed</h4>
        <pre className="bg-[var(--dark-900)] p-3 rounded text-xs text-cyan-400 font-mono overflow-x-auto whitespace-pre-wrap">
          {data.command}
        </pre>
      </div>

      <div className="flex items-center gap-3">
        <h4 className="text-sm font-medium text-gray-400">Risk Assessment:</h4>
        <span className={`px-3 py-1 rounded text-sm font-bold border ${riskBadgeColors[data.risk_assessment] || riskBadgeColors.medium}`}>
          {data.risk_assessment?.toUpperCase()}
        </span>
      </div>

      {data.risk_factors?.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">Risk Factors</h4>
          <ul className="space-y-1">
            {data.risk_factors.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-red-400">
                <AlertTriangle className="w-4 h-4" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.files_accessed?.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">Files That Would Be Accessed</h4>
          <div className="bg-[var(--dark-900)] rounded p-2 space-y-1">
            {data.files_accessed.map((f, i) => (
              <div key={i} className="text-xs font-mono text-violet-400">{f}</div>
            ))}
          </div>
        </div>
      )}

      {data.network_activity?.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">Network Activity</h4>
          <div className="bg-[var(--dark-900)] rounded p-2 space-y-1">
            {data.network_activity.map((n, i) => (
              <div key={i} className="text-xs font-mono text-orange-400">{n}</div>
            ))}
          </div>
        </div>
      )}

      {data.trace_output && (
        <details className="text-sm">
          <summary className="text-gray-400 cursor-pointer hover:text-gray-300">Raw Analysis Output</summary>
          <pre className="mt-2 bg-[var(--dark-900)] p-3 rounded text-xs text-gray-400 font-mono overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
            {data.trace_output}
          </pre>
        </details>
      )}

      {data.error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-sm text-red-400">{data.error}</p>
        </div>
      )}
    </div>
  )
}
