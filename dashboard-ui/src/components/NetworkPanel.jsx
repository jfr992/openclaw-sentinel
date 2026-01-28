import { useState, useEffect } from 'react'
import { Globe, Shield, AlertTriangle, CheckCircle, Radio, Wifi } from 'lucide-react'

// Known safe services for categorization
const KNOWN_SERVICES = {
  'anthropic': { name: 'AI Provider', icon: '🤖', safe: true },
  '2001:67c:4e8': { name: 'AI Provider', icon: '🤖', safe: true },
  'openai': { name: 'AI Provider', icon: '🤖', safe: true },
  'api.openai': { name: 'AI Provider', icon: '🤖', safe: true },
  'telegram': { name: 'Telegram', icon: '📱', safe: true },
  'google': { name: 'Google', icon: '🔍', safe: true },
  'apple': { name: 'Apple', icon: '🍎', safe: true },
  'icloud': { name: 'Apple', icon: '🍎', safe: true },
  'github': { name: 'GitHub', icon: '🐙', safe: true },
  'cloudflare': { name: 'Cloudflare', icon: '☁️', safe: true },
  'discord': { name: 'Discord', icon: '💬', safe: true },
  'slack': { name: 'Slack', icon: '💼', safe: true },
  'microsoft': { name: 'Microsoft', icon: '🪟', safe: true },
  'azure': { name: 'Microsoft', icon: '🪟', safe: true },
  'amazon': { name: 'AWS', icon: '☁️', safe: true },
  '2607:f8b0': { name: 'Google', icon: '🔍', safe: true },
  '142.250': { name: 'Google', icon: '🔍', safe: true },
  '140.82.11': { name: 'GitHub', icon: '🐙', safe: true },
}

function categorizeConnection(conn) {
  const text = `${conn.process} ${conn.remote || ''} ${conn.local || ''}`.toLowerCase()

  for (const [key, service] of Object.entries(KNOWN_SERVICES)) {
    if (text.includes(key)) {
      return { ...service, type: 'known' }
    }
  }

  const systemProcesses = ['identitys', 'rapportd', 'sharingd', 'bluetoothd', 'airportd', 'configd', 'mDNSResponder']
  if (systemProcesses.some(p => conn.process?.toLowerCase().includes(p))) {
    return { name: 'macOS System', icon: '🍎', safe: true, type: 'local' }
  }

  if (conn.remote === '-' || !conn.remote ||
      conn.remote.includes('127.0.0.1') ||
      conn.remote.includes('::1') ||
      conn.remote.includes('localhost') ||
      conn.remote.includes('fe80:') ||
      conn.state === 'LISTEN') {
    return { name: 'Local Service', icon: '🏠', safe: true, type: 'local' }
  }

  return { name: 'Unknown', icon: '❓', safe: false, type: 'unknown' }
}

export default function NetworkPanel({ connections, expanded }) {
  const [detailed, setDetailed] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (expanded) loadDetailedNetwork()
  }, [expanded])

  async function loadDetailedNetwork() {
    setLoading(true)
    try {
      const res = await fetch('/api/network/detailed')
      const data = await res.json()
      setDetailed(data)
    } catch (e) {
      console.error('Failed to load detailed network:', e)
    }
    setLoading(false)
  }

  function summarizeConnections(conns) {
    const summary = { known: {}, local: {}, unknown: [] }

    for (const conn of (conns || [])) {
      const category = categorizeConnection(conn)

      if (category.type === 'local') {
        const processName = conn.process || 'Unknown'
        if (!summary.local[processName]) {
          summary.local[processName] = { name: processName, count: 0, ports: new Set(), states: new Set() }
        }
        summary.local[processName].count++
        if (conn.local) summary.local[processName].ports.add(conn.local.split(':').pop())
        if (conn.state) summary.local[processName].states.add(conn.state)
      } else if (category.type === 'known') {
        if (!summary.known[category.name]) {
          summary.known[category.name] = { ...category, count: 0 }
        }
        summary.known[category.name].count++
      } else {
        summary.unknown.push(conn)
      }
    }

    for (const proc of Object.values(summary.local)) {
      proc.ports = [...proc.ports].slice(0, 5)
      proc.states = [...proc.states]
    }

    return summary
  }

  if (expanded) {
    return <DetailedNetworkView data={detailed} loading={loading} onRefresh={loadDetailedNetwork} />
  }

  const summary = summarizeConnections(connections)
  const hasUnknown = summary.unknown.length > 0

  return (
    <div className="card card-network overflow-hidden">
      <div className="px-5 py-4 border-b border-shell-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wifi className="w-5 h-5 text-neon-cyan" />
          <h2 className="font-display font-semibold text-white text-sm uppercase tracking-wide">Network Activity</h2>
        </div>
        <div className="flex items-center gap-2">
          {hasUnknown ? (
            <span className="badge badge-medium">{summary.unknown.length} unknown</span>
          ) : (
            <span className="badge badge-low">All known</span>
          )}
        </div>
      </div>

      <div className="p-4 h-64 overflow-y-auto">
        {/* Known services */}
        {Object.values(summary.known).length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-mono text-shell-500 uppercase tracking-wide mb-2">Connected Services</p>
            <div className="flex flex-wrap gap-2">
              {Object.values(summary.known).map(service => (
                <div key={service.name} className="flex items-center gap-2 px-3 py-2 bg-shell-800 rounded-lg border border-shell-700">
                  <span>{service.icon}</span>
                  <span className="text-sm text-white font-mono">{service.name}</span>
                  <span className="text-xs text-neon-cyan">({service.count})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Local services */}
        {Object.keys(summary.local).length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-mono text-shell-500 uppercase tracking-wide mb-2">Local Services</p>
            <div className="space-y-1">
              {Object.values(summary.local)
                .sort((a, b) => b.count - a.count)
                .slice(0, 6)
                .map(proc => (
                <div key={proc.name} className="flex items-center justify-between px-3 py-2 bg-shell-800 rounded-lg border border-shell-700">
                  <div className="flex items-center gap-2">
                    <Radio className="w-3 h-3 text-neon-green" />
                    <span className="text-sm text-white font-mono">{proc.name}</span>
                  </div>
                  <div className="text-xs text-shell-500 font-mono">
                    {proc.count} conn{proc.count !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unknown connections */}
        {summary.unknown.length > 0 && (
          <div>
            <p className="text-xs font-mono text-status-warn uppercase tracking-wide mb-2 flex items-center gap-2">
              <AlertTriangle className="w-3 h-3" /> Unknown Connections
            </p>
            <div className="space-y-2">
              {summary.unknown.slice(0, 5).map((conn, i) => (
                <div key={i} className="p-2 bg-status-warn/10 border border-status-warn/30 rounded-lg">
                  <p className="text-sm text-white font-mono">{conn.process}</p>
                  <p className="text-xs text-status-warn font-mono">{conn.remote}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {Object.keys(summary.known).length === 0 && Object.keys(summary.local).length === 0 && summary.unknown.length === 0 && (
          <div className="text-center text-shell-500 py-8 font-mono">
            <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No active connections</p>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailedNetworkView({ data, loading, onRefresh }) {
  const [showTechnical, setShowTechnical] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  if (loading || !data) {
    return (
      <div className="p-6">
        <div className="text-shell-500 text-center py-12 font-mono">
          {loading ? (
            <div className="flex items-center justify-center gap-3">
              <span className="animate-spin w-5 h-5 border-2 border-neon-cyan border-t-transparent rounded-full" />
              Loading network data...
            </div>
          ) : 'No data available'}
        </div>
      </div>
    )
  }

  const summary = { known: {}, local: {}, unknown: [] }

  for (const conn of (data.connections || [])) {
    const category = categorizeConnection(conn)
    if (category.type === 'local') {
      const processName = conn.process || 'Unknown'
      if (!summary.local[processName]) {
        summary.local[processName] = { name: processName, count: 0, ports: new Set(), states: new Set() }
      }
      summary.local[processName].count++
      if (conn.local) summary.local[processName].ports.add(conn.local.split(':').pop())
      if (conn.state) summary.local[processName].states.add(conn.state)
    } else if (category.type === 'known') {
      if (!summary.known[category.name]) {
        summary.known[category.name] = { ...category, count: 0, connections: [] }
      }
      summary.known[category.name].count++
      summary.known[category.name].connections.push(conn)
    } else {
      summary.unknown.push(conn)
    }
  }

  for (const proc of Object.values(summary.local)) {
    proc.ports = [...proc.ports].slice(0, 5)
    proc.states = [...proc.states]
  }

  const filteredConnections = data.connections?.filter(conn => {
    if (filter === 'listening' && conn.state !== 'LISTEN') return false
    if (filter === 'outbound' && conn.direction !== 'outbound') return false
    if (filter === 'inbound' && conn.direction !== 'inbound') return false
    if (filter === 'unknown') {
      const cat = categorizeConnection(conn)
      if (cat.type !== 'unknown') return false
    }
    if (search) {
      const searchLower = search.toLowerCase()
      return (
        conn.process?.toLowerCase().includes(searchLower) ||
        conn.remote?.toLowerCase().includes(searchLower) ||
        conn.local?.toLowerCase().includes(searchLower)
      )
    }
    return true
  }) || []

  return (
    <>
      <div className="px-5 py-4 border-b border-shell-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wifi className="w-5 h-5 text-neon-cyan" />
          <h2 className="font-display font-semibold text-white text-lg uppercase tracking-wide">Network Activity</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTechnical(!showTechnical)}
            className={`btn-secondary text-xs ${showTechnical ? 'bg-neon-purple/20 text-neon-purple border-neon-purple/30' : ''}`}
          >
            {showTechnical ? 'Simple' : 'Technical'}
          </button>
          <button onClick={onRefresh} className="btn-secondary text-xs">Refresh</button>
        </div>
      </div>

      <div className="p-6">
        {!showTechnical ? (
          <div className="space-y-6">
            {/* Status summary */}
            <div className={`p-4 rounded-lg border ${
              summary.unknown.length > 0
                ? 'bg-status-warn/10 border-status-warn/30'
                : 'bg-status-safe/10 border-status-safe/30 glow-green'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {summary.unknown.length > 0 ? (
                  <>
                    <AlertTriangle className="w-5 h-5 text-status-warn" />
                    <span className="font-display font-semibold text-status-warn uppercase">
                      {summary.unknown.length} unknown connection{summary.unknown.length !== 1 ? 's' : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 text-status-safe" />
                    <span className="font-display font-semibold text-status-safe uppercase">All Clear</span>
                  </>
                )}
              </div>
              <p className="text-sm text-shell-500 font-mono">
                {data.stats?.total_connections || 0} total •
                {Object.keys(summary.known).length} services •
                {Object.keys(summary.local).length} local
              </p>
            </div>

            {/* Services grid */}
            <div>
              <h3 className="text-xs font-mono text-shell-500 uppercase tracking-wide mb-3">Connected Services</h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.values(summary.known).map(service => (
                  <div key={service.name} className="flex items-center gap-3 p-3 bg-shell-800 rounded-lg border border-shell-700">
                    <span className="text-2xl">{service.icon}</span>
                    <div>
                      <p className="text-white font-mono font-semibold">{service.name}</p>
                      <p className="text-xs text-shell-500">{service.count} conn{service.count !== 1 ? 's' : ''}</p>
                    </div>
                    <Shield className="w-4 h-4 text-status-safe ml-auto" />
                  </div>
                ))}
              </div>
            </div>

            {/* Unknown */}
            {summary.unknown.length > 0 && (
              <div>
                <h3 className="text-xs font-mono text-status-warn uppercase tracking-wide mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Unknown Connections
                </h3>
                <div className="space-y-2">
                  {summary.unknown.map((conn, i) => (
                    <div key={i} className="p-3 bg-status-warn/10 border border-status-warn/30 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-mono font-semibold">{conn.process}</p>
                          <p className="text-sm text-status-warn font-mono">{conn.remote}</p>
                        </div>
                        <span className="badge badge-medium">{conn.state}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Technical View */
          <div>
            <div className="flex gap-4 mb-4">
              <div className="flex gap-1 bg-shell-900 rounded-lg p-1 border border-shell-700">
                {['all', 'outbound', 'inbound', 'listening', 'unknown'].map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                      filter === f ? 'bg-neon-cyan/20 text-neon-cyan' : 'text-shell-500 hover:text-gray-300'
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-shell-900 border border-shell-700 rounded-lg px-3 py-1 text-sm text-white font-mono placeholder-shell-500 focus:border-neon-cyan/50 focus:outline-none"
              />
            </div>

            <div className="bg-shell-900 rounded-lg overflow-hidden border border-shell-700">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-shell-700 text-xs text-shell-500 font-mono uppercase">
                <div className="col-span-2">Process</div>
                <div className="col-span-1">PID</div>
                <div className="col-span-3">Local</div>
                <div className="col-span-4">Remote</div>
                <div className="col-span-2">State</div>
              </div>

              <div className="max-h-[400px] overflow-y-auto">
                {filteredConnections.length === 0 ? (
                  <div className="text-shell-500 text-sm text-center py-8 font-mono">No connections match filter</div>
                ) : (
                  filteredConnections.map((conn, i) => {
                    const category = categorizeConnection(conn)
                    return (
                      <div
                        key={i}
                        className={`table-row grid grid-cols-12 gap-2 px-4 py-2 text-xs ${
                          category.type === 'unknown' ? 'bg-status-warn/5' : ''
                        }`}
                      >
                        <div className="col-span-2 text-white font-mono truncate">{conn.process}</div>
                        <div className="col-span-1 text-shell-500 font-mono">{conn.pid}</div>
                        <div className="col-span-3 text-shell-400 font-mono truncate">{conn.local}</div>
                        <div className="col-span-4 text-shell-400 font-mono truncate">{conn.remote || '-'}</div>
                        <div className="col-span-2">
                          <span className={`font-mono ${
                            conn.state === 'ESTABLISHED' ? 'text-status-safe' :
                            conn.state === 'LISTEN' ? 'text-neon-blue' : 'text-shell-500'
                          }`}>
                            {conn.state || '-'}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
