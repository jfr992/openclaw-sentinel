import { Lock, Brain } from 'lucide-react'
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

export default function Header({ onOpenPrivacy }) {
  const [time, setTime] = useState(new Date())
  const [baseline, setBaseline] = useState(null)
  const [securityStatus, setSecurityStatus] = useState({ status: 'ok', alert_count: 0 })

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Fetch baseline status
    async function fetchBaseline() {
      try {
        const res = await fetch('/api/baseline')
        if (res.ok) setBaseline(await res.json())
      } catch (e) {}
    }
    fetchBaseline()
    const interval = setInterval(fetchBaseline, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Connect to WebSocket for security status
    const socket = io(window.location.origin)
    
    socket.on('security_status', (data) => {
      setSecurityStatus(data)
    })
    
    // Also fetch initial alert count
    fetch('/api/alerts')
      .then(res => res.json())
      .then(alerts => {
        if (alerts.length > 0) {
          setSecurityStatus(prev => ({ ...prev, status: 'alert', alert_count: alerts.length }))
        }
      })
      .catch(() => {})
    
    return () => socket.disconnect()
  }, [])

  return (
    <header className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">CrabGuard</h1>
        <p className="text-sm text-gray-500 mt-1">Security Monitoring Dashboard</p>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Baseline indicator */}
        {baseline && (
          <div 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
              baseline.learned 
                ? 'bg-purple-500/10 border-purple-500/30' 
                : 'bg-[var(--dark-700)] border-white/5'
            }`}
            title={baseline.learned 
              ? `Baseline learned (${baseline.hours_of_data}h of data)` 
              : `Learning baseline: ${baseline.windows_collected}/${baseline.windows_needed} hours`
            }
          >
            <Brain className={`w-4 h-4 ${baseline.learned ? 'text-purple-400' : 'text-gray-500'}`} />
            <span className={`text-sm ${baseline.learned ? 'text-purple-300' : 'text-gray-500'}`}>
              {baseline.learned ? 'Baseline Active' : `Learning ${Math.round(baseline.windows_collected / baseline.windows_needed * 100)}%`}
            </span>
          </div>
        )}

        {/* Privacy indicator */}
        <button 
          onClick={onOpenPrivacy}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--dark-700)] border border-white/5 hover:border-cyan-500/30 transition-colors"
          title="Click for data flow info"
        >
          <Lock className="w-4 h-4 text-cyan-400" />
          <span className="text-sm text-gray-400">Local</span>
        </button>

        {/* Status - shows last security check time */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--dark-700)] border border-white/5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-sm text-gray-300">
            {securityStatus.timestamp 
              ? `Checked ${formatTimeAgo(securityStatus.timestamp)}`
              : 'Ready'
            }
          </span>
        </div>

        {/* Time */}
        <div className="text-sm text-gray-500">
          {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>
    </header>
  )
}
