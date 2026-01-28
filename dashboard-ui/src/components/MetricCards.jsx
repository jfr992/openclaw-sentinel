import { Zap, Globe, Folder, Shield, ShieldAlert } from 'lucide-react'

function MetricCard({ title, value, subtitle, icon: Icon, color, glow, compact }) {
  if (compact) {
    return (
      <div className={`bg-[var(--dark-800)] rounded-lg px-4 py-2 border border-white/5 flex items-center gap-3 ${glow || ''}`}>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </span>
        <div>
          <div className="text-lg font-semibold text-white">{value ?? '-'}</div>
          <div className="text-xs text-gray-500">{title}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-[var(--dark-800)] rounded-xl p-5 border border-white/5 hover:border-purple-500/30 transition-all hover:-translate-y-0.5 ${glow || ''}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-500 text-sm font-medium">{title}</span>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <div className="text-3xl font-semibold text-white">{value ?? '-'}</div>
      <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
    </div>
  )
}

export default function MetricCards({ data, alertCount, compact }) {
  const hasAlerts = alertCount > 0

  return (
    <div className={`grid gap-4 ${compact ? 'grid-cols-4' : 'grid-cols-4'}`}>
      <MetricCard
        title="Tool Calls"
        value={data?.tool_calls?.length ?? '-'}
        subtitle="Last 24 hours"
        icon={Zap}
        color="bg-blue-500/10 text-blue-400"
        compact={compact}
      />
      <MetricCard
        title="Connections"
        value={data?.connections?.length ?? '-'}
        subtitle="Node processes"
        icon={Globe}
        color="bg-cyan-500/10 text-cyan-400"
        compact={compact}
      />
      <MetricCard
        title="File Ops"
        value={data?.file_ops?.length ?? '-'}
        subtitle="Read/Write/Exec"
        icon={Folder}
        color="bg-purple-500/10 text-purple-400"
        compact={compact}
      />
      <MetricCard
        title="Alerts"
        value={alertCount}
        subtitle={hasAlerts ? `${alertCount} issue${alertCount > 1 ? 's' : ''} found` : 'All clear'}
        icon={hasAlerts ? ShieldAlert : Shield}
        color={hasAlerts ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}
        glow={hasAlerts ? 'glow-red' : 'glow-green'}
        compact={compact}
      />
    </div>
  )
}
