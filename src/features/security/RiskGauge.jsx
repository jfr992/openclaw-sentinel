import { Shield, ShieldAlert, ShieldX } from 'lucide-react'

export default function RiskGauge({ level, levelName, criticalCount, highCount }) {
  // Color based on risk level
  const getColors = () => {
    switch (level) {
      case 4: return { bg: 'bg-purple-500', text: 'text-purple-400', glow: 'shadow-purple-500/50' }
      case 3: return { bg: 'bg-red-500', text: 'text-red-400', glow: 'shadow-red-500/50' }
      case 2: return { bg: 'bg-orange-500', text: 'text-orange-400', glow: 'shadow-orange-500/50' }
      case 1: return { bg: 'bg-yellow-500', text: 'text-yellow-400', glow: 'shadow-yellow-500/50' }
      default: return { bg: 'bg-green-500', text: 'text-green-400', glow: 'shadow-green-500/50' }
    }
  }

  const colors = getColors()
  const Icon = level >= 3 ? ShieldX : level >= 1 ? ShieldAlert : Shield

  // Calculate gauge percentage (0-4 scale → 0-100%)
  const percentage = (level / 4) * 100

  return (
    <div className="flex flex-col items-center">
      {/* Circular gauge */}
      <div className="relative w-32 h-32">
        {/* Background circle */}
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="64"
            cy="64"
            r="56"
            fill="none"
            stroke="var(--border)"
            strokeWidth="8"
          />
          {/* Progress arc */}
          <circle
            cx="64"
            cy="64"
            r="56"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${percentage * 3.52} 352`}
            className={`${colors.text} transition-all duration-500`}
          />
        </svg>

        {/* Center icon and level */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className={`w-8 h-8 ${colors.text} ${level >= 3 ? 'animate-pulse' : ''}`} />
          <span className={`text-lg font-bold ${colors.text} mt-1`}>
            {levelName}
          </span>
        </div>
      </div>

      {/* Risk counts */}
      <div className="flex gap-4 mt-4">
        {criticalCount > 0 && (
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-xs text-purple-400">{criticalCount} critical</span>
          </div>
        )}
        {highCount > 0 && (
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs text-red-400">{highCount} high</span>
          </div>
        )}
        {level === 0 && (
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-green-400">All clear</span>
          </div>
        )}
      </div>
    </div>
  )
}
