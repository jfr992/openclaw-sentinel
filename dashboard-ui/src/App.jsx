import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import MetricCards from './components/MetricCards'
import ActivityLog from './components/ActivityLog'
import AlertsPanel from './components/AlertsPanel'
import NetworkPanel from './components/NetworkPanel'
import SettingsModal from './components/SettingsModal'
import PrivacyModal from './components/PrivacyModal'
import { useActivity, useAlerts } from './hooks/useApi'

// Valid view names for hash routing
const VALID_VIEWS = ['all', 'alerts', 'network', 'files']

// Get initial view from URL hash
function getViewFromHash() {
  const hash = window.location.hash.slice(1) // remove #
  return VALID_VIEWS.includes(hash) ? hash : 'all'
}

export default function App() {
  const [activeView, setActiveView] = useState(getViewFromHash)
  const [isLoaded, setIsLoaded] = useState(false)

  // Fade in on mount
  useEffect(() => {
    setTimeout(() => setIsLoaded(true), 100)
  }, [])

  // Sync hash with view state
  useEffect(() => {
    // Update hash when view changes
    const newHash = activeView === 'all' ? '' : activeView
    const currentHash = window.location.hash.slice(1)
    if (currentHash !== newHash) {
      window.location.hash = newHash
    }
  }, [activeView])

  // Listen for browser back/forward
  useEffect(() => {
    const handleHashChange = () => setActiveView(getViewFromHash())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const { data, loading, error, connectionMode, gatewayConnected } = useActivity(5000)
  const { alerts, refresh: refreshAlerts } = useAlerts(30000)

  // Zoom mode - when a section is selected, it expands
  const isZoomed = activeView !== 'all'

  return (
    <div className={`min-h-screen grid-bg scanlines transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenPrivacy={() => setPrivacyOpen(true)}
      />

      <main className="ml-16 p-4">
        <Header alertCount={alerts.length} />

        {/* Metrics - always visible but compact when zoomed */}
        <div className={`transition-all duration-300 ${isZoomed ? 'mb-3' : 'mb-4'}`}>
          <MetricCards data={data} alertCount={alerts.length} compact={isZoomed} />
        </div>

        {/* ZOOMED VIEW - Single expanded panel */}
        {isZoomed && (
          <div className="animate-fade-in">
            {activeView === 'alerts' && (
              <div className="card card-threat glow-red">
                <AlertsPanel
                  alerts={alerts}
                  onRefresh={refreshAlerts}
                  expanded={true}
                />
              </div>
            )}

            {activeView === 'network' && (
              <div className="card card-network glow-cyan">
                <NetworkPanel
                  connections={data?.connections}
                  expanded={true}
                />
              </div>
            )}

            {activeView === 'files' && (
              <div className="card card-activity glow-purple">
                <ExpandedFileOps operations={data?.file_ops} />
              </div>
            )}
          </div>
        )}

        {/* NORMAL VIEW - Grid layout */}
        {!isZoomed && (
          <>
            {/* Main panels */}
            <div className="grid grid-cols-2 gap-4">
              <ActivityLog
                operations={data?.file_ops}
                lastUpdate={data?.updated}
              />
              <AlertsPanel
                alerts={alerts}
                onRefresh={refreshAlerts}
              />
            </div>

            {/* Bottom panels */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <NetworkPanel connections={data?.connections} />
              <FileOpsPanel operations={data?.file_ops} />
            </div>
          </>
        )}

        {/* Status indicators */}
        <div className="fixed bottom-4 right-4 flex items-center gap-2 z-20">
          {/* Connection Mode Indicator */}
          {connectionMode === 'live' && (
            <div className="text-xs font-mono text-neon-cyan bg-neon-cyan/10 px-3 py-1.5 rounded-lg border border-neon-cyan/30 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-cyan opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-cyan" />
              </span>
              LIVE STREAM
            </div>
          )}
          {connectionMode === 'polling' && !error && (
            <div className="text-xs font-mono text-status-warn bg-status-warn/10 px-3 py-1.5 rounded-lg border border-status-warn/30 flex items-center gap-2"
                 title="Gateway not connected - using polling fallback. Data refreshes every 5 seconds.">
              <span className="inline-block w-2 h-2 rounded-full bg-status-warn animate-pulse" />
              POLLING MODE
            </div>
          )}
          {loading && (
            <div className="text-xs font-mono text-shell-500 bg-shell-900 px-3 py-1.5 rounded-lg border border-shell-700">
              <span className="animate-spin inline-block w-3 h-3 border border-neon-cyan border-t-transparent rounded-full mr-2" />
              SYNCING...
            </div>
          )}
          {error && (
            <div className="text-xs font-mono text-threat-400 bg-threat-500/10 px-3 py-1.5 rounded-lg border border-threat-500/30">
              CONNECTION ERROR
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <PrivacyModal isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  )
}

// Compact file operations panel for normal view
function FileOpsPanel({ operations }) {
  const allOps = operations || []

  // Count by operation type
  const counts = {
    READ: allOps.filter(op => op.operation?.includes('READ')).length,
    WRITE: allOps.filter(op => op.operation?.includes('WRITE')).length,
    EDIT: allOps.filter(op => op.operation?.includes('EDIT')).length,
    EXEC: allOps.filter(op => op.operation?.includes('EXEC')).length,
    OTHER: allOps.filter(op =>
      !op.operation?.includes('READ') &&
      !op.operation?.includes('WRITE') &&
      !op.operation?.includes('EDIT') &&
      !op.operation?.includes('EXEC')
    ).length,
  }

  const opColors = {
    READ: { text: 'text-neon-blue', label: '📖' },
    WRITE: { text: 'text-neon-purple', label: '✏️' },
    EDIT: { text: 'text-neon-pink', label: '🔧' },
    EXEC: { text: 'text-neon-cyan', label: '⚡' },
    OTHER: { text: 'text-shell-400', label: '📦' },
  }

  return (
    <div className="card card-activity overflow-hidden">
      <div className="px-5 py-4 border-b border-shell-700 flex items-center justify-between">
        <h2 className="font-display font-semibold text-white text-sm uppercase tracking-wide">File Operations</h2>
        <span className="badge badge-info">{allOps.length} total</span>
      </div>

      {/* Counters row */}
      <div className="px-4 py-3 border-b border-shell-800 flex flex-wrap gap-3">
        {Object.entries(counts).map(([type, count]) => {
          if (count === 0) return null
          const { text, label } = opColors[type]
          return (
            <div key={type} className="flex items-center gap-1.5 text-xs">
              <span>{label}</span>
              <span className={`font-mono font-bold ${text}`}>{count}</span>
              <span className="text-shell-500">{type}</span>
            </div>
          )
        })}
      </div>

      <div className="p-4 h-48 overflow-y-auto">
        {allOps.length === 0 ? (
          <div className="text-shell-500 text-sm text-center py-8 font-mono">
            No operations yet
          </div>
        ) : (
          allOps.slice(0, 12).map((op, i) => (
            <div key={i} className="py-2 border-b border-shell-800 last:border-0">
              <div className="flex items-center gap-2 text-xs">
                <span className={`font-mono font-semibold ${
                  op.operation?.includes('WRITE') ? 'text-neon-purple' :
                  op.operation?.includes('EDIT') ? 'text-neon-pink' :
                  op.operation?.includes('EXEC') ? 'text-neon-cyan' :
                  op.operation?.includes('READ') ? 'text-neon-blue' : 'text-shell-400'
                }`}>
                  {op.operation?.replace(/^[^\w]*/, '').split(/\s/)[0] || 'OP'}
                </span>
                <span className="text-shell-500 font-mono">
                  {op.timestamp ? new Date(op.timestamp).toLocaleTimeString('en-US', { hour12: false }) : ''}
                </span>
              </div>
              <p className="text-xs text-shell-400 font-mono truncate mt-1">{op.path || 'unknown'}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Expanded file operations for zoomed view
function ExpandedFileOps({ operations }) {
  const allOps = operations || []

  // Operation type definitions with colors and labels
  const opTypes = [
    { key: 'READ', label: '📖 Read', bg: 'bg-neon-blue/10', border: 'border-neon-blue/30', text: 'text-neon-blue', desc: 'File reads' },
    { key: 'WRITE', label: '✏️ Write', bg: 'bg-neon-purple/10', border: 'border-neon-purple/30', text: 'text-neon-purple', desc: 'File creates' },
    { key: 'EDIT', label: '🔧 Edit', bg: 'bg-neon-pink/10', border: 'border-neon-pink/30', text: 'text-neon-pink', desc: 'File edits' },
    { key: 'EXEC', label: '⚡ Exec', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/30', text: 'text-neon-cyan', desc: 'Commands' },
    { key: 'SEARCH', label: '🔍 Search', bg: 'bg-neon-green/10', border: 'border-neon-green/30', text: 'text-neon-green', desc: 'Web searches' },
    { key: 'FETCH', label: '🌐 Fetch', bg: 'bg-neon-orange/10', border: 'border-neon-orange/30', text: 'text-neon-orange', desc: 'URL fetches' },
    { key: 'MESSAGE', label: '💬 Message', bg: 'bg-status-warn/10', border: 'border-status-warn/30', text: 'text-status-warn', desc: 'Messages sent' },
    { key: 'BROWSER', label: '🖥️ Browser', bg: 'bg-shell-700', border: 'border-shell-600', text: 'text-shell-300', desc: 'Browser actions' },
  ]

  // Calculate counts
  const counts = {}
  opTypes.forEach(t => {
    counts[t.key] = allOps.filter(op => op.operation?.includes(t.key)).length
  })

  // Filter to only show types with counts > 0
  const activeTypes = opTypes.filter(t => counts[t.key] > 0)

  return (
    <>
      <div className="px-5 py-4 border-b border-shell-700 flex items-center justify-between">
        <h2 className="font-display font-semibold text-white text-lg uppercase tracking-wide">File Operations</h2>
        <span className="badge badge-info">{allOps.length} total</span>
      </div>
      <div className="p-6">
        {/* Stats row - dynamic grid based on active types */}
        <div className={`grid gap-4 mb-6 ${activeTypes.length <= 4 ? 'grid-cols-4' : 'grid-cols-4 lg:grid-cols-8'}`}>
          {activeTypes.map(t => (
            <div key={t.key} className={`rounded-lg p-4 border ${t.bg} ${t.border} hover:scale-105 transition-transform`}>
              <div className={`metric-value ${t.text}`}>{counts[t.key]}</div>
              <div className="metric-label mt-1 flex items-center gap-1">
                <span>{t.label.split(' ')[0]}</span>
                <span className="hidden sm:inline">{t.label.split(' ')[1]}</span>
              </div>
              <div className="text-[10px] text-shell-500 mt-1 hidden lg:block">{t.desc}</div>
            </div>
          ))}
        </div>

        {/* Full list */}
        <div className="h-[500px] overflow-y-auto space-y-2">
          {allOps.length === 0 ? (
            <div className="text-shell-500 text-center py-12 font-mono">No operations recorded</div>
          ) : (
            allOps.map((op, i) => {
              const opType = op.operation?.replace(/^[^\w]*/, '').split(/\s/)[0] || 'OP'
              const colors = {
                READ: 'border-neon-blue/30 bg-neon-blue/5',
                WRITE: 'border-neon-purple/30 bg-neon-purple/5',
                EDIT: 'border-neon-pink/30 bg-neon-pink/5',
                EXEC: 'border-neon-cyan/30 bg-neon-cyan/5',
                SEARCH: 'border-neon-green/30 bg-neon-green/5',
                FETCH: 'border-shell-600 bg-shell-800',
              }
              const colorClass = Object.entries(colors).find(([k]) => op.operation?.includes(k))?.[1] || colors.EXEC

              return (
                <div key={i} className={`p-3 rounded-lg border ${colorClass}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm font-semibold text-white">{opType}</span>
                    <span className="terminal-timestamp">
                      {op.timestamp ? new Date(op.timestamp).toLocaleString('en-US', { hour12: false }) : ''}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 font-mono break-all">{op.path || 'unknown'}</p>
                  {op.details && <p className="text-xs text-shell-500 mt-1">{op.details}</p>}
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
