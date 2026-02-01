/**
 * MetricCard - Reusable card for displaying a single performance metric
 */
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const STATUS_COLORS = {
  excellent: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  healthy: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  good: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  fast: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  normal: 'text-gray-400 bg-gray-400/10 border-gray-400/30',
  moderate: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  'needs-attention': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  'needs-work': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  underutilized: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  slow: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  poor: 'text-red-400 bg-red-400/10 border-red-400/30',
  fragile: 'text-red-400 bg-red-400/10 border-red-400/30',
  inactive: 'text-gray-500 bg-gray-500/10 border-gray-500/30',
  unknown: 'text-gray-500 bg-gray-500/10 border-gray-500/30',
  resilient: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  valuable: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
}

export default function MetricCard({
  title,
  icon: Icon,
  value,
  unit = '',
  subValue,
  subLabel,
  status,
  trend,
  onClick
}) {
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.unknown

  const TrendIcon = trend === 'increasing' ? TrendingUp
    : trend === 'decreasing' ? TrendingDown
    : Minus

  const trendColor = trend === 'increasing' ? 'text-emerald-400'
    : trend === 'decreasing' ? 'text-red-400'
    : 'text-gray-500'

  return (
    <div
      className={`p-4 rounded-lg border ${statusColor} cursor-pointer hover:scale-[1.02] transition-transform`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4" />}
          <span className="text-sm font-medium text-gray-300">{title}</span>
        </div>
        {trend && (
          <TrendIcon className={`w-4 h-4 ${trendColor}`} />
        )}
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold">{value}</span>
        {unit && <span className="text-sm text-gray-400">{unit}</span>}
      </div>

      {subValue !== undefined && (
        <div className="mt-1 text-xs text-gray-500">
          {subLabel}: <span className="text-gray-400">{subValue}</span>
        </div>
      )}

      <div className="mt-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor}`}>
          {status}
        </span>
      </div>
    </div>
  )
}
