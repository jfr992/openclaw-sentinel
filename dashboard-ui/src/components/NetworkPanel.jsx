import { useState, useEffect } from 'react'
import { Globe, Shield, AlertTriangle, CheckCircle, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'

// Known safe services for categorization
const KNOWN_SERVICES = {
  'anthropic': { name: 'AI Provider', icon: '🤖', safe: true },
  '2001:67c:4e8': { name: 'AI Provider', icon: '🤖', safe: true }, // Anthropic IPv6
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
  '2607:f8b0': { name: 'Google', icon: '🔍', safe: true }, // Google IPv6
  '142.250': { name: 'Google', icon: '🔍', safe: true }, // Google IPv4
  '140.82.11': { name: 'GitHub', icon: '🐙', safe: true }, // GitHub
}

function categorizeConnection(conn) {
  const text = `${conn.process} ${conn.remote || ''} ${conn.local || ''}`.toLowerCase()
  
  // Check known services
  for (const [key, service] of Object.entries(KNOWN_SERVICES)) {
    if (text.includes(key)) {
      return { ...service, type: 'known' }
    }
  }
  
  // macOS system services
  const systemProcesses = ['identitys', 'rapportd', 'sharingd', 'bluetoothd', 'airportd', 'configd', 'mDNSResponder']
  if (systemProcesses.some(p => conn.process?.toLowerCase().includes(p))) {
    return { name: 'macOS System', icon: '🍎', safe: true, type: 'local' }
  }
  
  // Local/internal connections
  if (conn.remote === '-' || !conn.remote || 
      conn.remote.includes('127.0.0.1') || 
      conn.remote.includes('::1') ||
      conn.remote.includes('localhost') ||
      conn.remote.includes('fe80:') || // Link-local IPv6
      conn.state === 'LISTEN') {
    return { name: 'Local Service', icon: '🏠', safe: true, type: 'local' }
  }
  
  // Unknown external
  return { name: 'Unknown', icon: '❓', safe: false, type: 'unknown' }
}

export default function NetworkPanel({ connections, expanded }) {
  const [detailed, setDetailed] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showTechnical, setShowTechnical] = useState(false)

  useEffect(() => {
    if (expanded) {
      loadDetailedNetwork()
    }
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

  // Summarize connections for simple view
  function summarizeConnections(conns) {
    const summary = {
      known: {},
      local: {},  // Now track by process name
      unknown: []
    }
    
    for (const conn of (conns || [])) {
      const category = categorizeConnection(conn)
      
      if (category.type === 'local') {
        // Group local by process name
        const processName = conn.process || 'Unknown'
        if (!summary.local[processName]) {
          summary.local[processName] = { 
            name: processName, 
            count: 0, 
            ports: new Set(),
            states: new Set()
          }
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
    
    // Convert port sets to arrays
    for (const proc of Object.values(summary.local)) {
      proc.ports = [...proc.ports].slice(0, 5)
      proc.states = [...proc.states]
    }
    
    return summary
  }

  if (expanded) {
    return <DetailedNetworkView data={detailed} loading={loading} onRefresh={loadDetailedNetwork} />
  }

  // Compact view - simplified for non-technical users
  const summary = summarizeConnections(connections)
  const hasUnknown = summary.unknown.length > 0
  const localCount = Object.values(summary.local).reduce((sum, p) => sum + p.count, 0)
  
  return (
    <div className="bg-[var(--dark-800)] rounded-xl border border-white/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="font-medium text-white">Network Activity</h2>
        <div className="flex items-center gap-2">
          {hasUnknown ? (
            <span className="text-xs px-2 py-1 rounded-full bg-orange-500/20 text-orange-400">
              {summary.unknown.length} unknown
            </span>
          ) : (
            <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
              All known
            </span>
          )}
        </div>
      </div>
      
      <div className="p-4 h-64 overflow-y-auto">
        {/* Known services */}
        {Object.values(summary.known).length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">Connected Services</p>
            <div className="flex flex-wrap gap-2">
              {Object.values(summary.known).map(service => (
                <div 
                  key={service.name}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[var(--dark-900)] rounded-lg"
                >
                  <span>{service.icon}</span>
                  <span className="text-sm text-white">{service.name}</span>
                  <span className="text-xs text-gray-500">({service.count})</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Local services - detailed by process */}
        {Object.keys(summary.local).length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">Local Services</p>
            <div className="space-y-1">
              {Object.values(summary.local)
                .sort((a, b) => b.count - a.count)
                .slice(0, 6)
                .map(proc => (
                <div 
                  key={proc.name}
                  className="flex items-center justify-between px-3 py-2 bg-[var(--dark-900)] rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span>🏠</span>
                    <span className="text-sm text-white">{proc.name}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {proc.count} conn{proc.count !== 1 ? 's' : ''}
                    {proc.ports.length > 0 && (
                      <span className="ml-2 text-gray-600">
                        ports: {proc.ports.slice(0, 3).join(', ')}{proc.ports.length > 3 ? '...' : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {Object.keys(summary.local).length > 6 && (
                <p className="text-xs text-gray-600 px-3">+{Object.keys(summary.local).length - 6} more</p>
              )}
            </div>
          </div>
        )}
        
        {/* Unknown connections - highlighted */}
        {summary.unknown.length > 0 && (
          <div>
            <p className="text-xs text-orange-400 mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Unknown Connections
            </p>
            <div className="space-y-2">
              {summary.unknown.slice(0, 5).map((conn, i) => (
                <div 
                  key={i}
                  className="p-2 bg-orange-500/10 border border-orange-500/30 rounded-lg"
                >
                  <p className="text-sm text-white">{conn.process}</p>
                  <p className="text-xs text-orange-300 font-mono">{conn.remote}</p>
                </div>
              ))}
              {summary.unknown.length > 5 && (
                <p className="text-xs text-gray-500">+{summary.unknown.length - 5} more</p>
              )}
            </div>
          </div>
        )}
        
        {/* All clear message */}
        {Object.keys(summary.known).length === 0 && Object.keys(summary.local).length === 0 && summary.unknown.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-8">
            <Globe className="w-8 h-8 mx-auto mb-2 text-gray-600" />
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
        <div className="text-gray-400 text-center py-12">
          {loading ? 'Loading network data...' : 'No data available'}
        </div>
      </div>
    )
  }

  // Summarize for simple view
  const summary = {
    known: {},
    local: {},
    unknown: []
  }
  
  for (const conn of (data.connections || [])) {
    const category = categorizeConnection(conn)
    if (category.type === 'local') {
      // Group local by process name
      const processName = conn.process || 'Unknown'
      if (!summary.local[processName]) {
        summary.local[processName] = { 
          name: processName, 
          count: 0, 
          ports: new Set(),
          states: new Set()
        }
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
  
  // Convert port sets to arrays
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
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="font-medium text-white text-lg">Network Activity</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTechnical(!showTechnical)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
              showTechnical 
                ? 'bg-purple-500/20 text-purple-400' 
                : 'bg-[var(--dark-700)] text-gray-400 hover:text-white'
            }`}
          >
            {showTechnical ? 'Simple View' : 'Technical View'}
          </button>
          <button
            onClick={onRefresh}
            className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="p-6">
        {!showTechnical ? (
          /* Simple View */
          <div className="space-y-6">
            {/* Status summary */}
            <div className={`p-4 rounded-lg border ${
              summary.unknown.length > 0 
                ? 'bg-orange-500/10 border-orange-500/30' 
                : 'bg-green-500/10 border-green-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {summary.unknown.length > 0 ? (
                  <>
                    <AlertTriangle className="w-5 h-5 text-orange-400" />
                    <span className="font-medium text-orange-300">
                      {summary.unknown.length} unknown connection{summary.unknown.length !== 1 ? 's' : ''} detected
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="font-medium text-green-300">All connections are to known services</span>
                  </>
                )}
              </div>
              <p className="text-sm text-gray-400">
                {data.stats?.total_connections || 0} total • 
                {Object.keys(summary.known).length} services • 
                {Object.keys(summary.local).length} local processes
              </p>
            </div>

            {/* Known services grid */}
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-3">Connected Services</h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.values(summary.known).map(service => (
                  <div 
                    key={service.name}
                    className="flex items-center gap-3 p-3 bg-[var(--dark-900)] rounded-lg"
                  >
                    <span className="text-2xl">{service.icon}</span>
                    <div>
                      <p className="text-white font-medium">{service.name}</p>
                      <p className="text-xs text-gray-500">{service.count} connection{service.count !== 1 ? 's' : ''}</p>
                    </div>
                    <Shield className="w-4 h-4 text-green-500 ml-auto" />
                  </div>
                ))}
                {Object.keys(summary.local).length > 0 && Object.values(summary.local)
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 4)
                  .map(proc => (
                  <div key={proc.name} className="flex items-center gap-3 p-3 bg-[var(--dark-900)] rounded-lg">
                    <span className="text-2xl">🏠</span>
                    <div>
                      <p className="text-white font-medium">{proc.name}</p>
                      <p className="text-xs text-gray-500">
                        {proc.count} conn{proc.count !== 1 ? 's' : ''}
                        {proc.ports.length > 0 && ` • ports: ${proc.ports.slice(0,2).join(', ')}`}
                      </p>
                    </div>
                    <Shield className="w-4 h-4 text-green-500 ml-auto" />
                  </div>
                ))}
              </div>
            </div>

            {/* Unknown connections */}
            {summary.unknown.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-orange-400 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Unknown Connections
                </h3>
                <div className="space-y-2">
                  {summary.unknown.map((conn, i) => (
                    <div 
                      key={i}
                      className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">{conn.process}</p>
                          <p className="text-sm text-orange-300 font-mono">{conn.remote}</p>
                        </div>
                        <span className="text-xs text-gray-500">{conn.state}</span>
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
            {/* Filters */}
            <div className="flex gap-4 mb-4">
              <div className="flex gap-1 bg-[var(--dark-900)] rounded-lg p-1">
                {['all', 'outbound', 'inbound', 'listening', 'unknown'].map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded text-xs transition-colors ${
                      filter === f 
                        ? 'bg-cyan-500/20 text-cyan-400' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-[var(--dark-900)] border border-white/10 rounded-lg px-3 py-1 text-sm text-white placeholder-gray-600"
              />
            </div>

            {/* Table */}
            <div className="bg-[var(--dark-900)] rounded-lg overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-white/5 text-xs text-gray-500 font-medium">
                <div className="col-span-2">Process</div>
                <div className="col-span-1">PID</div>
                <div className="col-span-3">Local</div>
                <div className="col-span-4">Remote</div>
                <div className="col-span-2">State</div>
              </div>
              
              <div className="max-h-[400px] overflow-y-auto">
                {filteredConnections.length === 0 ? (
                  <div className="text-gray-500 text-sm text-center py-8">No connections match filter</div>
                ) : (
                  filteredConnections.map((conn, i) => {
                    const category = categorizeConnection(conn)
                    return (
                      <div 
                        key={i} 
                        className={`grid grid-cols-12 gap-2 px-4 py-2 border-b border-white/5 text-xs hover:bg-white/5 ${
                          category.type === 'unknown' ? 'bg-orange-500/5' : ''
                        }`}
                      >
                        <div className="col-span-2 text-white truncate">{conn.process}</div>
                        <div className="col-span-1 text-gray-500">{conn.pid}</div>
                        <div className="col-span-3 text-gray-400 font-mono truncate">{conn.local}</div>
                        <div className="col-span-4 text-gray-400 font-mono truncate">{conn.remote || '-'}</div>
                        <div className="col-span-2">
                          <span className={`${
                            conn.state === 'ESTABLISHED' ? 'text-green-400' :
                            conn.state === 'LISTEN' ? 'text-blue-400' :
                            'text-gray-500'
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
