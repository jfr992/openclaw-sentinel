import { Globe, FileWarning, ExternalLink } from 'lucide-react'

export default function ExposurePanel({ exposure }) {
  if (!exposure) {
    return (
      <div className="flex items-center justify-center py-8 text-[var(--text-muted)]">
        Loading exposure data...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Top Destinations */}
      {exposure.topDestinations?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2 flex items-center gap-1">
            <Globe className="w-3 h-3" />
            Top Destinations
          </h4>
          <div className="space-y-1">
            {exposure.topDestinations.slice(0, 5).map(({ domain, count }) => (
              <div key={domain} className="flex items-center justify-between py-1">
                <span className="text-sm font-mono text-[var(--accent-cyan)] truncate flex-1">
                  {domain}
                </span>
                <span className="text-xs text-[var(--text-muted)] ml-2">
                  {count}×
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sensitive File Access */}
      {exposure.sensitiveAccess?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2 flex items-center gap-1">
            <FileWarning className="w-3 h-3 text-[var(--accent-red)]" />
            Sensitive Access
            <span className="ml-1 px-1.5 py-0.5 text-xs rounded bg-red-500/20 text-red-400">
              {exposure.sensitiveAccess.length}
            </span>
          </h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {exposure.sensitiveAccess.map((access, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1 px-2 rounded bg-red-500/5 border border-red-500/20"
              >
                <code className="text-xs text-red-400 truncate flex-1">
                  {access.path}
                </code>
                <span className="text-xs text-[var(--text-muted)] ml-2">
                  {access.tool}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent External Calls */}
      {exposure.externalCalls?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2 flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />
            Recent External Calls
          </h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {exposure.externalCalls.slice(0, 10).map((call, i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                  {call.tool}
                </span>
                <span className="text-xs text-[var(--text-secondary)] truncate flex-1">
                  {call.target}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!exposure.topDestinations?.length &&
       !exposure.sensitiveAccess?.length &&
       !exposure.externalCalls?.length && (
        <div className="flex flex-col items-center justify-center py-8 text-[var(--text-muted)]">
          <Globe className="w-8 h-8 mb-2 text-green-500" />
          <p>No external exposure detected</p>
        </div>
      )}
    </div>
  )
}
