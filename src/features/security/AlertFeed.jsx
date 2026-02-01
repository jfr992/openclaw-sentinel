import { AlertTriangle, CheckCircle, Clock } from 'lucide-react'

export default function AlertFeed({ alerts, onAcknowledge }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-[var(--text-muted)]">
        <CheckCircle className="w-8 h-8 mb-2 text-green-500" />
        <p>No alerts</p>
      </div>
    )
  }

  const getLevelColor = (level) => {
    switch (level) {
      case 4: return 'border-l-purple-500 bg-purple-500/5'
      case 3: return 'border-l-red-500 bg-red-500/5'
      case 2: return 'border-l-orange-500 bg-orange-500/5'
      case 1: return 'border-l-yellow-500 bg-yellow-500/5'
      default: return 'border-l-gray-500 bg-gray-500/5'
    }
  }

  const getLevelBadge = (level) => {
    const badges = {
      4: { text: 'CRITICAL', class: 'bg-purple-500/20 text-purple-400' },
      3: { text: 'HIGH', class: 'bg-red-500/20 text-red-400' },
      2: { text: 'MEDIUM', class: 'bg-orange-500/20 text-orange-400' },
      1: { text: 'LOW', class: 'bg-yellow-500/20 text-yellow-400' }
    }
    return badges[level] || { text: 'INFO', class: 'bg-gray-500/20 text-gray-400' }
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date

    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {alerts.map((alert) => {
        const badge = getLevelBadge(alert.level)

        return (
          <div
            key={alert.id}
            className={`p-3 rounded-lg border-l-4 ${getLevelColor(alert.level)} ${
              alert.acknowledged ? 'opacity-50' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${badge.class}`}>
                    {badge.text}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] capitalize">
                    {alert.type?.replace(/_/g, ' ')}
                  </span>
                </div>

                <p className="text-sm text-[var(--text-secondary)] truncate">
                  {alert.description}
                </p>

                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="text-xs text-[var(--text-muted)]">
                    {formatTime(alert.timestamp)}
                  </span>
                  {alert.toolCall && (
                    <code className="text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] px-1 rounded">
                      {alert.toolCall}
                    </code>
                  )}
                </div>
              </div>

              {!alert.acknowledged && (
                <button
                  onClick={() => onAcknowledge(alert.id)}
                  className="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  title="Acknowledge"
                >
                  <CheckCircle className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
