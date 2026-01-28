import { BookOpen, Edit3, Settings, Zap, Search, Globe, MessageSquare, Monitor } from 'lucide-react'

const opStyles = {
  READ: { icon: BookOpen, color: 'text-blue-400' },
  WRITE: { icon: Edit3, color: 'text-violet-400' },
  EDIT: { icon: Settings, color: 'text-purple-400' },
  EXEC: { icon: Zap, color: 'text-cyan-400' },
  SEARCH: { icon: Search, color: 'text-green-400' },
  FETCH: { icon: Globe, color: 'text-gray-400' },
  MESSAGE: { icon: MessageSquare, color: 'text-pink-400' },
  BROWSER: { icon: Monitor, color: 'text-orange-400' },
}

function getOpStyle(operation) {
  for (const [key, style] of Object.entries(opStyles)) {
    if (operation?.includes(key)) return style
  }
  return { icon: Zap, color: 'text-gray-400' }
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function truncate(str, len) {
  if (!str) return ''
  return str.length > len ? str.substring(0, len) + '...' : str
}

export default function ActivityLog({ operations, lastUpdate, dimmed }) {
  const { icon: Icon, color } = { icon: Zap, color: 'text-gray-400' }

  return (
    <div className={`col-span-2 bg-[var(--dark-800)] rounded-xl border border-white/5 overflow-hidden transition-all ${dimmed ? 'opacity-30 scale-[0.98]' : ''}`}>
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="font-medium text-white">Activity Log</h2>
        <span className="text-xs text-gray-500">
          {lastUpdate ? `Updated ${formatTime(lastUpdate)}` : 'Updating...'}
        </span>
      </div>
      
      <div className="p-4 h-96 overflow-y-auto">
        {!operations || operations.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-8">No recent activity</div>
        ) : (
          operations.map((op, i) => {
            const style = getOpStyle(op.operation)
            const OpIcon = style.icon
            const opLabel = op.operation?.replace(/^[^\w]*/, '').split(/\s/)[0] || 'OP'
            
            return (
              <div key={i} className="animate-slide-in flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                <OpIcon className={`w-4 h-4 mt-0.5 ${style.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-xs ${style.color}`}>{opLabel}</span>
                    <span className="text-xs text-gray-600">{formatTime(op.timestamp)}</span>
                  </div>
                  <p className="text-sm text-gray-300 truncate font-mono">{truncate(op.path, 70)}</p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
