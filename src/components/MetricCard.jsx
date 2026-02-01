export default function MetricCard({ title, value, subtitle, icon: Icon, color = 'orange' }) {
  const colors = {
    orange: {
      text: 'text-[var(--accent-orange)]',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/30',
      glow: 'hover:shadow-[0_0_20px_rgba(249,115,22,0.2)]'
    },
    green: {
      text: 'text-[var(--accent-green)]',
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
      glow: 'hover:shadow-[0_0_20px_rgba(34,197,94,0.2)]'
    },
    blue: {
      text: 'text-[var(--accent-blue)]',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      glow: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.2)]'
    },
    purple: {
      text: 'text-[var(--accent-purple)]',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/30',
      glow: 'hover:shadow-[0_0_20px_rgba(168,85,247,0.2)]'
    },
    amber: {
      text: 'text-[var(--accent-amber)]',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      glow: 'hover:shadow-[0_0_20px_rgba(245,158,11,0.2)]'
    },
    red: {
      text: 'text-[var(--accent-red)]',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      glow: 'hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]'
    },
    cyan: {
      text: 'text-[var(--accent-cyan)]',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/30',
      glow: 'hover:shadow-[0_0_20px_rgba(6,182,212,0.2)]'
    }
  }

  const c = colors[color] || colors.orange

  return (
    <div className={`card p-5 ${c.bg} ${c.border} ${c.glow} transition-all duration-300`}>
      <div className="flex items-start justify-between mb-3">
        <span className="metric-label">{title}</span>
        <div className={`p-2 rounded-lg ${c.bg}`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
      </div>
      <div className={`metric-value ${c.text}`}>{value}</div>
      <div className="text-xs text-[var(--text-muted)] mt-1">{subtitle}</div>
    </div>
  )
}
