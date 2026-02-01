import { Terminal } from 'lucide-react'

export default function ToolCallsList({ calls }) {
  if (!calls || calls.length === 0) {
    return (
      <div className="text-[var(--text-muted)] text-sm py-8 text-center">
        No tool calls recorded
      </div>
    )
  }

  // Group by tool name for summary
  const toolCounts = {}
  for (const call of calls) {
    toolCounts[call.name] = (toolCounts[call.name] || 0) + 1
  }

  return (
    <div className="space-y-4">
      {/* Tool summary */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(toolCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, count]) => (
            <span
              key={name}
              className="px-2 py-1 rounded-md bg-[var(--bg-secondary)] text-xs font-mono flex items-center gap-1"
            >
              <Terminal className="w-3 h-3 text-[var(--accent-purple)]" />
              {name}
              <span className="text-[var(--accent-orange)]">×{count}</span>
            </span>
          ))}
      </div>

      {/* Recent calls list */}
      <div className="max-h-48 overflow-y-auto space-y-1">
        {calls.slice(0, 15).map((call, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <span className="font-mono text-sm text-[var(--text-secondary)]">
              {call.name}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {call.timestamp ? new Date(call.timestamp).toLocaleTimeString() : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
