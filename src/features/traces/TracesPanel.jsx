/**
 * TracesPanel - Display OTEL traces from Jaeger
 */
import { useState, useEffect, useCallback } from 'react'
import { 
  Activity, 
  RefreshCw, 
  Clock, 
  ChevronDown, 
  ChevronRight,
  AlertCircle,
  CheckCircle
} from 'lucide-react'

const JAEGER_API = '/api/traces'

function formatDuration(microseconds) {
  if (microseconds < 1000) return `${microseconds}µs`
  if (microseconds < 1000000) return `${(microseconds / 1000).toFixed(1)}ms`
  return `${(microseconds / 1000000).toFixed(2)}s`
}

function formatTime(microseconds) {
  const date = new Date(microseconds / 1000)
  return date.toLocaleTimeString()
}

function SpanRow({ span, depth = 0 }) {
  const [expanded, setExpanded] = useState(false)
  const hasError = span.tags?.some(t => t.key === 'error' && t.value === true)
  const statusCode = span.tags?.find(t => t.key === 'http.response.status_code')?.value
  
  return (
    <div className="border-b border-gray-700/50">
      <div 
        className={`flex items-center gap-2 py-2 px-3 hover:bg-gray-800/50 cursor-pointer ${hasError ? 'bg-red-900/20' : ''}`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        {span.tags?.length > 0 ? (
          expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />
        ) : <div className="w-4" />}
        
        {hasError ? (
          <AlertCircle className="w-4 h-4 text-red-400" />
        ) : (
          <CheckCircle className="w-4 h-4 text-emerald-400" />
        )}
        
        <span className="font-mono text-sm text-blue-400">{span.operationName}</span>
        
        {statusCode && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            statusCode >= 400 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
          }`}>
            {statusCode}
          </span>
        )}
        
        <span className="ml-auto text-xs text-gray-500 font-mono">
          {formatDuration(span.duration)}
        </span>
      </div>
      
      {expanded && span.tags?.length > 0 && (
        <div className="bg-gray-900/50 px-6 py-2 text-xs" style={{ paddingLeft: `${depth * 20 + 32}px` }}>
          {span.tags.map((tag, i) => (
            <div key={i} className="flex gap-2 py-0.5">
              <span className="text-gray-500">{tag.key}:</span>
              <span className="text-gray-300 font-mono">{String(tag.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TraceCard({ trace }) {
  const [expanded, setExpanded] = useState(false)
  const rootSpan = trace.spans?.[0]
  const spanCount = trace.spans?.length || 0
  const totalDuration = rootSpan?.duration || 0
  const hasErrors = trace.spans?.some(s => s.tags?.some(t => t.key === 'error' && t.value === true))
  
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/30 overflow-hidden">
      <div 
        className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-800/50 ${hasErrors ? 'border-l-2 border-l-red-500' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
        
        <div className="flex-1">
          <div className="font-mono text-sm text-blue-400">{rootSpan?.operationName || 'unknown'}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {formatTime(rootSpan?.startTime)} • {spanCount} spans
          </div>
        </div>
        
        <div className="text-right">
          <div className={`text-sm font-mono ${totalDuration > 1000000 ? 'text-yellow-400' : 'text-gray-300'}`}>
            {formatDuration(totalDuration)}
          </div>
          <div className="text-xs text-gray-500">{trace.traceID?.slice(0, 8)}</div>
        </div>
      </div>
      
      {expanded && (
        <div className="border-t border-gray-700">
          {trace.spans?.map((span, i) => (
            <SpanRow key={span.spanID} span={span} depth={0} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function TracesPanel() {
  const [traces, setTraces] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [service, setService] = useState('cangrejo-memory')
  const [limit, setLimit] = useState(20)

  const fetchTraces = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`${JAEGER_API}?service=${service}&limit=${limit}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTraces(data.data || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [service, limit])

  useEffect(() => {
    fetchTraces()
    const interval = setInterval(fetchTraces, 10000)
    return () => clearInterval(interval)
  }, [fetchTraces])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-purple-400" />
          <h2 className="text-xl font-semibold text-gray-100">Traces</h2>
        </div>
        
        <div className="flex items-center gap-3">
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
          >
            <option value="cangrejo-memory">cangrejo-memory</option>
            <option value="cangrejo-monitor">cangrejo-monitor</option>
          </select>
          
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
          >
            <option value={10}>10 traces</option>
            <option value={20}>20 traces</option>
            <option value={50}>50 traces</option>
          </select>
          
          <button
            onClick={fetchTraces}
            disabled={loading}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-900/20 border border-red-800 text-red-400">
          <p className="text-sm">{error}</p>
          <p className="text-xs mt-1 text-red-500">Make sure Jaeger is running on port 16686</p>
        </div>
      )}

      {/* Loading */}
      {loading && traces.length === 0 && (
        <div className="flex items-center justify-center h-48">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-500" />
        </div>
      )}

      {/* No traces */}
      {!loading && traces.length === 0 && !error && (
        <div className="text-center py-12 text-gray-500">
          <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No traces found for {service}</p>
          <p className="text-sm mt-1">Make some requests to generate traces</p>
        </div>
      )}

      {/* Traces list */}
      <div className="space-y-3">
        {traces.map((trace) => (
          <TraceCard key={trace.traceID} trace={trace} />
        ))}
      </div>
    </div>
  )
}
