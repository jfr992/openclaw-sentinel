import { useState, useEffect } from 'react'
import { Globe, AlertTriangle, ArrowUpRight, ArrowDownLeft, Radio, Server } from 'lucide-react'

export default function NetworkPanel({ connections, dimmed, expanded }) {
  const [detailed, setDetailed] = useState(null)
  const [loading, setLoading] = useState(false)

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

  if (expanded) {
    return <DetailedNetworkView data={detailed} loading={loading} onRefresh={loadDetailedNetwork} />
  }

  // Compact view
  return (
    <div className={`bg-[var(--dark-800)] rounded-xl border border-white/5 overflow-hidden transition-all ${dimmed ? 'opacity-30 scale-[0.98]' : ''}`}>
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="font-medium text-white">Network Connections</h2>
        <span className="text-sm text-gray-400">{connections?.length || 0} active</span>
      </div>
      
      <div className="p-4 h-64 overflow-y-auto">
        {!connections || connections.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-8">No active connections</div>
        ) : (
          connections.map((conn, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">{conn.process}</p>
                <p className="text-xs text-gray-500 font-mono truncate">{conn.connection}</p>
              </div>
              <span className="text-xs text-gray-600">PID {conn.pid}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function DetailedNetworkView({ data, loading, onRefresh }) {
  const [filter, setFilter] = useState('all') // all, outbound, inbound, listening
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

  const filteredConnections = data.connections?.filter(conn => {
    if (filter !== 'all' && conn.direction !== filter) return false
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
        <h2 className="font-medium text-white text-lg">Network Monitor</h2>
        <button
          onClick={onRefresh}
          className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="p-6">
        {/* Stats Row */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <StatCard 
            label="Total" 
            value={data.stats?.total_connections || 0} 
            icon={Globe}
            color="text-white"
          />
          <StatCard 
            label="Established" 
            value={data.stats?.established || 0} 
            icon={Radio}
            color="text-green-400"
          />
          <StatCard 
            label="Listening" 
            value={data.stats?.listening || 0} 
            icon={Server}
            color="text-blue-400"
          />
          <StatCard 
            label="Outbound" 
            value={data.stats?.outbound || 0} 
            icon={ArrowUpRight}
            color="text-cyan-400"
          />
          <StatCard 
            label="Inbound" 
            value={data.stats?.inbound || 0} 
            icon={ArrowDownLeft}
            color="text-purple-400"
          />
        </div>

        {/* Suspicious Activity */}
        {data.suspicious?.length > 0 && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium text-red-400">
                Suspicious Activity Detected ({data.suspicious.length})
              </span>
            </div>
            <div className="space-y-2">
              {data.suspicious.map((sus, i) => (
                <div key={i} className="text-sm text-red-200">
                  {sus.description}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Protocol Breakdown */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Protocols</h3>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(data.protocols || {}).map(([proto, count]) => (
              <span key={proto} className="px-3 py-1 rounded-full bg-[var(--dark-900)] text-sm">
                <span className="text-cyan-400 font-mono">{proto}</span>
                <span className="text-gray-500 ml-2">{count}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <div className="flex gap-1 bg-[var(--dark-900)] rounded-lg p-1">
            {['all', 'outbound', 'inbound', 'listening'].map(f => (
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
            placeholder="Search process, IP, port..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-[var(--dark-900)] border border-white/10 rounded-lg px-3 py-1 text-sm text-white placeholder-gray-600"
          />
        </div>

        {/* Connections Table */}
        <div className="bg-[var(--dark-900)] rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-white/5 text-xs text-gray-500 font-medium">
            <div className="col-span-2">Process</div>
            <div className="col-span-1">PID</div>
            <div className="col-span-1">Proto</div>
            <div className="col-span-3">Local</div>
            <div className="col-span-3">Remote</div>
            <div className="col-span-1">State</div>
            <div className="col-span-1">Dir</div>
          </div>
          
          <div className="max-h-[400px] overflow-y-auto">
            {filteredConnections.length === 0 ? (
              <div className="text-gray-500 text-sm text-center py-8">No connections match filter</div>
            ) : (
              filteredConnections.map((conn, i) => (
                <div 
                  key={i} 
                  className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-white/5 text-xs hover:bg-white/5 transition-colors"
                >
                  <div className="col-span-2 text-white font-medium truncate">{conn.process}</div>
                  <div className="col-span-1 text-gray-500">{conn.pid}</div>
                  <div className="col-span-1 text-cyan-400 font-mono">{conn.protocol}</div>
                  <div className="col-span-3 text-gray-400 font-mono truncate">{conn.local}</div>
                  <div className="col-span-3 text-gray-400 font-mono truncate">{conn.remote || '-'}</div>
                  <div className="col-span-1">
                    <span className={`${
                      conn.state === 'ESTABLISHED' ? 'text-green-400' :
                      conn.state === 'LISTEN' ? 'text-blue-400' :
                      conn.state === 'CLOSE_WAIT' ? 'text-yellow-400' :
                      'text-gray-500'
                    }`}>
                      {conn.state || '-'}
                    </span>
                  </div>
                  <div className="col-span-1">
                    {conn.direction === 'outbound' && <ArrowUpRight className="w-3 h-3 text-cyan-400" />}
                    {conn.direction === 'inbound' && <ArrowDownLeft className="w-3 h-3 text-purple-400" />}
                    {conn.direction === 'listening' && <Radio className="w-3 h-3 text-blue-400" />}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Remote Hosts Summary */}
        {Object.keys(data.remote_hosts || {}).length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Remote Hosts</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(data.remote_hosts).slice(0, 10).map(([host, info]) => (
                <div key={host} className="bg-[var(--dark-900)] rounded-lg p-3">
                  <div className="text-sm text-white font-mono truncate">{host}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {info.count} connection{info.count > 1 ? 's' : ''} • 
                    Ports: {info.ports?.slice(0, 3).join(', ')}{info.ports?.length > 3 ? '...' : ''} • 
                    {info.processes?.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-[var(--dark-900)] rounded-lg p-4 text-center">
      <Icon className={`w-5 h-5 mx-auto mb-2 ${color}`} />
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}
