import { useState, useEffect, useRef } from 'react'
import { Zap, Globe, Folder, Shield, ShieldAlert, TrendingUp, AlertTriangle, Activity } from 'lucide-react'

// eslint-disable-next-line no-unused-vars
function MetricCard({ title, value, subtitle, icon: Icon, variant, compact, pulse, isUpdating }) {
  const [showPop, setShowPop] = useState(false)
  const prevValue = useRef(value)

  // Trigger pop animation when value changes
  useEffect(() => {
    if (prevValue.current !== value && value !== '-') {
      setShowPop(true)
      const timer = setTimeout(() => setShowPop(false), 300)
      prevValue.current = value
      return () => clearTimeout(timer)
    }
  }, [value])
  const variants = {
    blue: {
      border: 'border-neon-blue/30',
      bg: 'bg-neon-blue/5',
      iconBg: 'bg-neon-blue/20',
      iconColor: 'text-neon-blue',
      valueColor: 'text-neon-blue',
    },
    cyan: {
      border: 'border-neon-cyan/30',
      bg: 'bg-neon-cyan/5',
      iconBg: 'bg-neon-cyan/20',
      iconColor: 'text-neon-cyan',
      valueColor: 'text-neon-cyan',
    },
    purple: {
      border: 'border-neon-purple/30',
      bg: 'bg-neon-purple/5',
      iconBg: 'bg-neon-purple/20',
      iconColor: 'text-neon-purple',
      valueColor: 'text-neon-purple',
    },
    green: {
      border: 'border-status-safe/30',
      bg: 'bg-status-safe/5',
      iconBg: 'bg-status-safe/20',
      iconColor: 'text-status-safe',
      valueColor: 'text-status-safe',
    },
    red: {
      border: 'border-threat-500/30',
      bg: 'bg-threat-500/5',
      iconBg: 'bg-threat-500/20',
      iconColor: 'text-threat-400',
      valueColor: 'text-threat-400',
    },
  }

  const style = variants[variant] || variants.blue

  if (compact) {
    return (
      <div className={`card ${style.bg} ${style.border} px-4 py-3 flex items-center gap-3 ${pulse ? 'animate-glow-pulse' : ''} ${isUpdating ? 'data-updating' : ''} transition-all duration-200`}>
        <div className={`w-10 h-10 rounded-lg ${style.iconBg} flex items-center justify-center ${isUpdating ? 'shimmer' : ''}`}>
          <Icon className={`w-5 h-5 ${style.iconColor} ${isUpdating ? 'animate-pulse' : ''}`} />
        </div>
        <div>
          <div className={`metric-value text-xl ${style.valueColor} ${showPop ? 'metric-pop' : ''}`}>{value ?? '-'}</div>
          <div className="metric-label">{title}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`card ${style.bg} ${style.border} p-5 hover:scale-[1.02] transition-all duration-200 ${pulse ? 'animate-glow-pulse' : ''} ${isUpdating ? 'data-updating' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="metric-label">{title}</span>
          {isUpdating && <Activity className="w-3 h-3 text-neon-cyan animate-pulse" />}
        </div>
        <div className={`w-10 h-10 rounded-lg ${style.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${style.iconColor}`} />
        </div>
      </div>
      <div className={`metric-value ${style.valueColor} ${showPop ? 'metric-pop' : ''}`}>{value ?? '-'}</div>
      <div className="flex items-center gap-2 mt-2">
        <TrendingUp className="w-3 h-3 text-shell-500" />
        <span className="text-xs font-mono text-shell-500">{subtitle}</span>
      </div>
    </div>
  )
}

export default function MetricCards({ data, alertCount, compact }) {
  const [network, setNetwork] = useState(null)
  const [usage, setUsage] = useState(null)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    async function fetchExtras() {
      setIsUpdating(true)
      try {
        const [netRes, usageRes] = await Promise.all([
          fetch('/api/network/detailed'),
          fetch('/api/usage')
        ])
        if (netRes.ok) setNetwork(await netRes.json())
        if (usageRes.ok) setUsage(await usageRes.json())
      } catch { /* ignore */ }
      // Brief delay to show updating animation
      setTimeout(() => setIsUpdating(false), 200)
    }
    fetchExtras()
    const interval = setInterval(fetchExtras, 30000) // Every 30s
    return () => clearInterval(interval)
  }, [])

  const hasAlerts = alertCount > 0
  const hasCritical = alertCount >= 5

  // Get latest tool call timestamp for "active" indicator
  const latestTool = data?.tool_calls?.[0]?.timestamp
  const isActive = latestTool && (Date.now() - new Date(latestTool).getTime()) < 60000

  // Use detailed network stats
  const connCount = network?.stats?.total_connections ?? data?.connections?.length ?? '-'
  const established = network?.stats?.established ?? 0

  // Use messages analyzed as better metric
  const msgCount = usage?.messages_analyzed ?? data?.tool_calls?.length ?? '-'

  // Network threat summary
  const threatCount = network?.threat_summary?.total_threats ?? 0
  const hasThreat = threatCount > 0

  return (
    <div className={`grid gap-4 ${compact ? 'grid-cols-4' : 'grid-cols-4'}`}>
      <MetricCard
        title="Messages"
        value={msgCount}
        subtitle={isActive ? '● Active now' : 'Total analyzed'}
        icon={Zap}
        variant="blue"
        compact={compact}
        pulse={isActive}
        isUpdating={isUpdating}
      />
      <MetricCard
        title="Connections"
        value={connCount}
        subtitle={hasThreat ? `⚠️ ${threatCount} threat${threatCount > 1 ? 's' : ''}` : (established > 0 ? `${established} established` : 'Active network')}
        icon={Globe}
        variant={hasThreat ? 'red' : 'cyan'}
        compact={compact}
        isUpdating={isUpdating}
        pulse={hasThreat}
      />
      <MetricCard
        title="File Ops"
        value={data?.file_ops?.length ?? '-'}
        subtitle="Recent operations"
        icon={Folder}
        variant="purple"
        compact={compact}
        isUpdating={isUpdating}
      />
      <MetricCard
        title="Security"
        value={hasAlerts ? alertCount : '✓'}
        subtitle={hasAlerts ? `${alertCount} issue${alertCount > 1 ? 's' : ''} detected` : 'All systems nominal'}
        icon={hasAlerts ? (hasCritical ? AlertTriangle : ShieldAlert) : Shield}
        variant={hasAlerts ? 'red' : 'green'}
        compact={compact}
        pulse={hasCritical}
        isUpdating={isUpdating}
      />
    </div>
  )
}
