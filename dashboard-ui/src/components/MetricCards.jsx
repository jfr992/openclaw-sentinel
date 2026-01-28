import { useState, useEffect } from 'react'
import { Zap, Globe, Folder, Shield, ShieldAlert, TrendingUp, AlertTriangle } from 'lucide-react'

function MetricCard({ title, value, subtitle, icon: Icon, variant, compact, pulse }) {
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
      <div className={`card ${style.bg} ${style.border} px-4 py-3 flex items-center gap-3 ${pulse ? 'animate-glow-pulse' : ''}`}>
        <div className={`w-10 h-10 rounded-lg ${style.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${style.iconColor}`} />
        </div>
        <div>
          <div className={`metric-value text-xl ${style.valueColor}`}>{value ?? '-'}</div>
          <div className="metric-label">{title}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`card ${style.bg} ${style.border} p-5 hover:scale-[1.02] transition-all duration-200 ${pulse ? 'animate-glow-pulse' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="metric-label">{title}</span>
        <div className={`w-10 h-10 rounded-lg ${style.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${style.iconColor}`} />
        </div>
      </div>
      <div className={`metric-value ${style.valueColor}`}>{value ?? '-'}</div>
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

  useEffect(() => {
    async function fetchExtras() {
      try {
        const [netRes, usageRes] = await Promise.all([
          fetch('/api/network/detailed'),
          fetch('/api/usage')
        ])
        if (netRes.ok) setNetwork(await netRes.json())
        if (usageRes.ok) setUsage(await usageRes.json())
      } catch {}
    }
    fetchExtras()
    const interval = setInterval(fetchExtras, 30000) // Every 30s instead of 10s
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
      />
      <MetricCard
        title="Connections"
        value={connCount}
        subtitle={established > 0 ? `${established} established` : 'Active network'}
        icon={Globe}
        variant="cyan"
        compact={compact}
      />
      <MetricCard
        title="File Ops"
        value={data?.file_ops?.length ?? '-'}
        subtitle="Recent operations"
        icon={Folder}
        variant="purple"
        compact={compact}
      />
      <MetricCard
        title="Security"
        value={hasAlerts ? alertCount : '✓'}
        subtitle={hasAlerts ? `${alertCount} issue${alertCount > 1 ? 's' : ''} detected` : 'All systems nominal'}
        icon={hasAlerts ? (hasCritical ? AlertTriangle : ShieldAlert) : Shield}
        variant={hasAlerts ? 'red' : 'green'}
        compact={compact}
        pulse={hasCritical}
      />
    </div>
  )
}
