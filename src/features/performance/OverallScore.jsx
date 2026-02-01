/**
 * OverallScore - Circular gauge showing overall performance score
 */
import { Gauge, Sparkles, AlertTriangle, XCircle } from 'lucide-react'

const SCORE_CONFIG = {
  excellent: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-400',
    icon: Sparkles,
    label: 'Excellent'
  },
  good: {
    color: 'text-blue-400',
    bg: 'bg-blue-400',
    icon: Gauge,
    label: 'Good'
  },
  'needs-work': {
    color: 'text-yellow-400',
    bg: 'bg-yellow-400',
    icon: AlertTriangle,
    label: 'Needs Work'
  },
  poor: {
    color: 'text-red-400',
    bg: 'bg-red-400',
    icon: XCircle,
    label: 'Poor'
  },
}

export default function OverallScore({ score, status }) {
  const config = SCORE_CONFIG[status] || SCORE_CONFIG.good
  const Icon = config.icon

  // Calculate stroke dash for circular progress
  const circumference = 2 * Math.PI * 45 // radius = 45
  const strokeDash = (score / 100) * circumference

  return (
    <div className="flex flex-col items-center p-6 rounded-xl bg-gray-800/50 border border-gray-700">
      <div className="relative w-32 h-32">
        {/* Background circle */}
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="64"
            cy="64"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-gray-700"
          />
          {/* Progress circle */}
          <circle
            cx="64"
            cy="64"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - strokeDash}
            className={config.color}
            style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${config.color}`}>{score}</span>
          <span className="text-xs text-gray-500">/ 100</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Icon className={`w-5 h-5 ${config.color}`} />
        <span className={`text-lg font-medium ${config.color}`}>{config.label}</span>
      </div>

      <p className="mt-2 text-xs text-gray-500 text-center">
        Overall Performance Score
      </p>
    </div>
  )
}
