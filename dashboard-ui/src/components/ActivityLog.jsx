import { BookOpen, Edit3, Settings, Zap, Search, Globe, MessageSquare, Monitor, Terminal } from 'lucide-react'

const opStyles = {
  READ: { icon: BookOpen, color: 'text-neon-blue', bg: 'bg-neon-blue/10' },
  WRITE: { icon: Edit3, color: 'text-neon-purple', bg: 'bg-neon-purple/10' },
  EDIT: { icon: Settings, color: 'text-neon-pink', bg: 'bg-neon-pink/10' },
  EXEC: { icon: Terminal, color: 'text-neon-cyan', bg: 'bg-neon-cyan/10' },
  SEARCH: { icon: Search, color: 'text-neon-green', bg: 'bg-neon-green/10' },
  FETCH: { icon: Globe, color: 'text-shell-400', bg: 'bg-shell-700' },
  MESSAGE: { icon: MessageSquare, color: 'text-neon-pink', bg: 'bg-neon-pink/10' },
  BROWSER: { icon: Monitor, color: 'text-neon-orange', bg: 'bg-neon-orange/10' },
}

function getOpStyle(operation) {
  for (const [key, style] of Object.entries(opStyles)) {
    if (operation?.includes(key)) return style
  }
  return { icon: Zap, color: 'text-shell-500', bg: 'bg-shell-700' }
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function truncate(str, len) {
  if (!str) return ''
  return str.length > len ? str.substring(0, len) + '...' : str
}

export default function ActivityLog({ operations, lastUpdate, dimmed }) {
  return (
    <div className={`card card-activity overflow-hidden transition-all ${dimmed ? 'opacity-30 scale-[0.98]' : ''}`}>
      <div className="px-5 py-4 border-b border-shell-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-neon-purple" />
          <h2 className="font-display font-semibold text-white text-sm uppercase tracking-wide">Activity Log</h2>
        </div>
        <span className="text-xs font-mono text-shell-500">
          {lastUpdate ? `SYNC ${formatTime(lastUpdate)}` : 'SYNCING...'}
        </span>
      </div>
      
      <div className="p-4 h-96 overflow-y-auto">
        {!operations || operations.length === 0 ? (
          <div className="text-shell-500 text-sm text-center py-8 font-mono">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No recent activity
          </div>
        ) : (
          <div className="space-y-2">
            {operations.map((op, i) => {
              const style = getOpStyle(op.operation)
              const OpIcon = style.icon
              const opLabel = op.operation?.replace(/^[^\w]*/, '').split(/\s/)[0] || 'OP'
              
              return (
                <div key={i} className="animate-slide-in flex items-start gap-3 p-2 rounded-lg hover:bg-shell-800 transition-colors" style={{ animationDelay: `${i * 30}ms` }}>
                  <div className={`w-8 h-8 rounded-lg ${style.bg} flex items-center justify-center flex-shrink-0`}>
                    <OpIcon className={`w-4 h-4 ${style.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-xs font-semibold ${style.color}`}>{opLabel}</span>
                      <span className="terminal-timestamp">{formatTime(op.timestamp)}</span>
                    </div>
                    <p className="text-xs text-gray-400 truncate font-mono mt-0.5">{truncate(op.path, 60)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
