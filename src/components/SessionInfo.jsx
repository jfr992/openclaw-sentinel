import { MessageSquare, Clock } from 'lucide-react'

export default function SessionInfo({ sessions }) {
  if (!sessions || sessions.length === 0) {
    return (
      <div className="text-[var(--text-muted)] text-sm py-8 text-center">
        No active sessions
      </div>
    )
  }

  return (
    <div className="space-y-3 max-h-64 overflow-y-auto">
      {sessions.map((session) => {
        const lastActivity = session.lastModified 
          ? new Date(session.lastModified).toLocaleString()
          : 'Unknown'
        
        return (
          <div 
            key={session.key}
            className="p-3 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-sm text-[var(--accent-blue)]">
                {session.key?.slice(0, 8) || 'Session'}...
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                session.agent === 'main' 
                  ? 'bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]'
                  : 'bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]'
              }`}>
                {session.agent || 'session'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {session.messageCount || 0} msgs
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {lastActivity}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
