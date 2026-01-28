import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import MetricCards from './components/MetricCards'
import ActivityLog from './components/ActivityLog'
import AlertsPanel from './components/AlertsPanel'
import NetworkPanel from './components/NetworkPanel'
import SettingsModal from './components/SettingsModal'
import PrivacyModal from './components/PrivacyModal'
import { useActivity, useAlerts } from './hooks/useApi'

export default function App() {
  const [activeView, setActiveView] = useState('all')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const { data, loading, error } = useActivity(5000)
  const { alerts, refresh: refreshAlerts } = useAlerts(30000)

  // Zoom mode - when a section is selected, it expands
  const isZoomed = activeView !== 'all'

  return (
    <div className="min-h-screen grid-bg">
      <Sidebar 
        activeView={activeView} 
        onViewChange={setActiveView} 
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="ml-16 p-6">
        <Header onOpenPrivacy={() => setPrivacyOpen(true)} />

        {/* Metrics - always visible but compact when zoomed */}
        <div className={`transition-all duration-300 ${isZoomed ? 'mb-4' : 'mb-6'}`}>
          <MetricCards data={data} alertCount={alerts.length} compact={isZoomed} />
        </div>

        {/* ZOOMED VIEW - Single expanded panel */}
        {isZoomed && (
          <div className="animate-in fade-in duration-300">
            {activeView === 'alerts' && (
              <div className="bg-[var(--dark-800)] rounded-xl border border-purple-500/30 overflow-hidden shadow-lg shadow-purple-500/10">
                <AlertsPanel
                  alerts={alerts}
                  onRefresh={refreshAlerts}
                  expanded={true}
                />
              </div>
            )}

            {activeView === 'network' && (
              <div className="bg-[var(--dark-800)] rounded-xl border border-cyan-500/30 overflow-hidden shadow-lg shadow-cyan-500/10">
                <NetworkPanel
                  connections={data?.connections}
                  expanded={true}
                />
              </div>
            )}

            {activeView === 'files' && (
              <div className="bg-[var(--dark-800)] rounded-xl border border-blue-500/30 overflow-hidden shadow-lg shadow-blue-500/10">
                <ExpandedFileOps operations={data?.file_ops} />
              </div>
            )}
          </div>
        )}

        {/* NORMAL VIEW - Grid layout */}
        {!isZoomed && (
          <>
            {/* Main panels */}
            <div className="grid grid-cols-3 gap-4">
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
        <div className="fixed bottom-4 right-4 flex items-center gap-2">
          {loading && (
            <div className="text-xs text-gray-500 bg-[var(--dark-800)] px-3 py-1.5 rounded-full border border-white/5">
              Refreshing...
            </div>
          )}
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 px-3 py-1.5 rounded-full border border-red-500/30">
              Connection error
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
  const fileOps = operations?.filter(op => 
    op.operation?.includes('READ') || 
    op.operation?.includes('WRITE') || 
    op.operation?.includes('EDIT')
  ) || []

  return (
    <div className="bg-[var(--dark-800)] rounded-xl border border-white/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="font-medium text-white">File Operations</h2>
        <span className="text-xs text-gray-500">{fileOps.length} ops</span>
      </div>
      <div className="p-4 h-64 overflow-y-auto">
        {fileOps.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-8">
            No file operations
            <p className="text-xs text-gray-600 mt-1">
              {operations?.length ? `(${operations.length} total ops, no READ/WRITE/EDIT)` : 'Waiting for data...'}
            </p>
          </div>
        ) : (
          fileOps.slice(0, 15).map((op, i) => (
            <div key={i} className="py-1.5 border-b border-white/5 last:border-0">
              <div className="flex items-center gap-2 text-xs">
                <span className={`font-mono font-medium ${
                  op.operation?.includes('WRITE') ? 'text-yellow-400' :
                  op.operation?.includes('EDIT') ? 'text-purple-400' : 'text-blue-400'
                }`}>
                  {op.operation?.replace(/^[^\w]*/, '').split(/\s/)[0] || 'OP'}
                </span>
                <span className="text-gray-600">
                  {op.timestamp ? new Date(op.timestamp).toLocaleTimeString() : ''}
                </span>
              </div>
              <p className="text-xs text-gray-400 font-mono truncate">{op.path || 'unknown'}</p>
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

  return (
    <>
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="font-medium text-white text-lg">File Operations</h2>
        <span className="text-sm text-gray-400">{allOps.length} total operations</span>
      </div>
      <div className="p-6">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {['READ', 'WRITE', 'EDIT', 'EXEC'].map(type => {
            const count = allOps.filter(op => op.operation?.includes(type)).length
            const colors = {
              READ: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
              WRITE: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
              EDIT: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
              EXEC: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
            }
            return (
              <div key={type} className={`rounded-lg p-4 border ${colors[type]}`}>
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-sm opacity-80">{type}</div>
              </div>
            )
          })}
        </div>

        {/* Full list */}
        <div className="h-[500px] overflow-y-auto space-y-2">
          {allOps.length === 0 ? (
            <div className="text-gray-500 text-center py-12">No operations recorded</div>
          ) : (
            allOps.map((op, i) => {
              const opType = op.operation?.replace(/^[^\w]*/, '').split(/\s/)[0] || 'OP'
              const colors = {
                READ: 'border-blue-500/30 bg-blue-500/5',
                WRITE: 'border-yellow-500/30 bg-yellow-500/5',
                EDIT: 'border-purple-500/30 bg-purple-500/5',
                EXEC: 'border-cyan-500/30 bg-cyan-500/5',
                SEARCH: 'border-green-500/30 bg-green-500/5',
                FETCH: 'border-gray-500/30 bg-gray-500/5',
              }
              const colorClass = Object.entries(colors).find(([k]) => op.operation?.includes(k))?.[1] || colors.EXEC

              return (
                <div key={i} className={`p-3 rounded-lg border ${colorClass}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm font-medium text-white">{opType}</span>
                    <span className="text-xs text-gray-500">
                      {op.timestamp ? new Date(op.timestamp).toLocaleString() : ''}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 font-mono break-all">{op.path || 'unknown'}</p>
                  {op.details && <p className="text-xs text-gray-500 mt-1">{op.details}</p>}
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
