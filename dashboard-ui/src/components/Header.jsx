import { Shield, Brain, Activity, DollarSign, Wifi, WifiOff } from 'lucide-react'
import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return 'over 1h ago'
}

export default function Header({ alertCount = 0 }) {
  const [time, setTime] = useState(new Date())
  const [baseline, setBaseline] = useState(null)
  const [securityStatus, setSecurityStatus] = useState({ status: 'ok', alert_count: 0, timestamp: null })
  const [usage, setUsage] = useState(null)
  const [gateway, setGateway] = useState({ connected: false })

  // Sync alert count from parent
  useEffect(() => {
    setSecurityStatus(prev => ({
      ...prev,
      status: alertCount > 0 ? 'alert' : 'ok',
      alert_count: alertCount
    }))
  }, [alertCount])

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    async function fetchBaseline() {
      try {
        const res = await fetch('/api/baseline')
        if (res.ok) setBaseline(await res.json())
      } catch { /* ignore */ }
    }
    fetchBaseline()
    const interval = setInterval(fetchBaseline, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    async function fetchUsage() {
      try {
        const res = await fetch('/api/usage')
        if (res.ok) setUsage(await res.json())
      } catch { /* ignore */ }
    }
    fetchUsage()
    const interval = setInterval(fetchUsage, 60000)
    return () => clearInterval(interval)
  }, [])

  // Fetch gateway status
  useEffect(() => {
    async function fetchGateway() {
      try {
        const res = await fetch('/api/gateway/status')
        if (res.ok) setGateway(await res.json())
      } catch {
        setGateway({ connected: false })
      }
    }
    fetchGateway()
    const interval = setInterval(fetchGateway, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const socket = io(window.location.origin)

    socket.on('security_status', (data) => {
      setSecurityStatus(data)
    })

    return () => socket.disconnect()
  }, [])

  const isAlert = securityStatus.status === 'alert' || securityStatus.alert_count > 0

  return (
    <header className="flex items-center justify-between mb-4 relative z-10">
      {/* Logo & Title */}
      <div className="flex items-center gap-4">
        {/* Shield Icon with Glow */}
        <div className={`relative ${isAlert ? 'animate-glow-pulse' : ''}`}>
          <Shield
            className={`w-10 h-10 ${isAlert ? 'text-threat-400' : 'text-threat-500'}`}
            style={{ filter: `drop-shadow(0 0 ${isAlert ? '15px' : '10px'} rgba(239, 68, 68, ${isAlert ? '0.6' : '0.4'}))` }}
          />
          {isAlert && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-threat-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-threat-500" />
            </span>
          )}
        </div>

        <div>
          <h1 className="header-title">OPENCLAW SENTINEL</h1>
          <p className="header-subtitle mt-1">Security Dashboard for AI Operations</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Gateway Connection Status */}
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
            gateway.connected
              ? 'bg-neon-cyan/10 border-neon-cyan/30'
              : 'bg-shell-800 border-shell-600'
          }`}
          title={gateway.connected ? 'Connected to OpenClaw gateway' : 'Gateway disconnected - no live events'}
        >
          {gateway.connected ? (
            <Wifi className="w-4 h-4 text-neon-cyan" />
          ) : (
            <WifiOff className="w-4 h-4 text-shell-500" />
          )}
          <span className={`text-xs font-mono ${gateway.connected ? 'text-neon-cyan' : 'text-shell-500'}`}>
            {gateway.connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        {/* Baseline Status */}
        {baseline && (
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
              baseline.learned
                ? 'bg-neon-purple/10 border-neon-purple/30 glow-purple'
                : 'bg-shell-800 border-shell-600'
            }`}
            title={baseline.learned
              ? `Baseline learned (${baseline.hours_of_data}h of data)`
              : `Learning baseline: ${baseline.windows_collected}/${baseline.windows_needed} hours`
            }
          >
            <Brain className={`w-4 h-4 ${baseline.learned ? 'text-neon-purple' : 'text-shell-500'}`} />
            <span className={`text-xs font-mono ${baseline.learned ? 'text-neon-purple' : 'text-shell-500'}`}>
              {baseline.learned ? 'BASELINE ACTIVE' : `LEARNING ${Math.round(baseline.windows_collected / baseline.windows_needed * 100)}%`}
            </span>
          </div>
        )}

        {/* Usage/Cost Display */}
        {usage && usage.total_cost > 0 && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neon-green/10 border border-neon-green/30"
            title={`${usage.total_input_tokens?.toLocaleString() || 0} input + ${usage.total_output_tokens?.toLocaleString() || 0} output tokens`}
          >
            <DollarSign className="w-4 h-4 text-neon-green" />
            <span className="text-xs font-mono text-neon-green">
              ${usage.total_cost.toFixed(2)}
            </span>
          </div>
        )}

        {/* Security Status */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
          isAlert
            ? 'bg-threat-500/10 border-threat-500/30'
            : 'bg-status-safe/10 border-status-safe/30'
        }`}>
          <div className={`status-dot ${isAlert ? 'status-alert' : 'status-online'}`} />
          <span className={`text-xs font-mono ${isAlert ? 'text-threat-400' : 'text-status-safe'}`}>
            {isAlert
              ? `${securityStatus.alert_count} ALERT${securityStatus.alert_count !== 1 ? 'S' : ''}`
              : securityStatus.timestamp
                ? `CHECKED ${formatTimeAgo(securityStatus.timestamp).toUpperCase()}`
                : 'READY'
            }
          </span>
        </div>

        {/* System Time */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-shell-900 border border-shell-700">
          <Activity className="w-4 h-4 text-shell-500" />
          <span className="text-xs font-mono text-neon-cyan text-glow-cyan">
            {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </span>
        </div>
      </div>
    </header>
  )
}
