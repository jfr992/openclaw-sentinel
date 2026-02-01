/**
 * PerformanceDashboard - Display all performance metrics
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  CheckCircle,
  Clock,
  Wrench,
  Brain,
  Zap,
  HeartPulse,
  RefreshCw,
  Activity,
  Calendar,
  TrendingUp,
  TrendingDown
} from 'lucide-react'
import OverallScore from './OverallScore'
import MetricCard from './MetricCard'

export default function PerformanceDashboard({ dateRange = 7, customStart, customEnd }) {
  const [summary, setSummary] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)

  // Calculate date range for API
  const { start, end, granularity } = useMemo(() => {
    const now = new Date()
    let startDate, endDate = now.toISOString()

    if (customStart && customEnd) {
      startDate = new Date(customStart).toISOString()
      endDate = new Date(customEnd).toISOString()
    } else {
      const days = typeof dateRange === 'number' ? dateRange : 7
      startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
    }

    const days = dateRange < 1 ? dateRange : dateRange
    const gran = days <= 1 ? '5min' : days <= 7 ? 'hour' : 'day'

    return { start: startDate, end: endDate, granularity: gran }
  }, [dateRange, customStart, customEnd])

  // Track if we have any data (for loading vs syncing decision)
  const hasData = summary !== null || history.length > 0

  const fetchData = useCallback(async () => {
    try {
      // Always fetch live summary (for memory/proactive which aren't in historical)
      // Plus historical data for trends
      const [summaryRes, historyRes] = await Promise.all([
        fetch('/api/performance/summary'),
        fetch(`/api/metrics/performance?start=${start}&end=${end}&granularity=${granularity}`)
      ])

      if (summaryRes.ok) {
        const data = await summaryRes.json()
        setSummary(data)
      }

      if (historyRes.ok) {
        const data = await historyRes.json()
        setHistory(data.timeseries || [])
      }

      setLastUpdate(new Date())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [start, end, granularity])

  useEffect(() => {
    // Set loading state before fetch
    if (!hasData) {
      setLoading(true)
    } else {
      setSyncing(true)
    }
    fetchData()
    const interval = setInterval(() => {
      setSyncing(true)
      fetchData()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchData, hasData])

  // Calculate trend from history
  const trend = useMemo(() => {
    if (history.length < 2) return null
    const recent = history.slice(-3)
    const older = history.slice(0, 3)
    const recentAvg = recent.reduce((a, b) => a + (b.overall_score || 0), 0) / recent.length
    const olderAvg = older.reduce((a, b) => a + (b.overall_score || 0), 0) / older.length
    return recentAvg - olderAvg
  }, [history])

  // Calculate summary from historical data
  const historicalSummary = useMemo(() => {
    if (!history || history.length === 0) return null

    const avgTaskRate = history.reduce((a, b) => a + (b.task_completion_rate || 0), 0) / history.length
    const avgLatency = history.reduce((a, b) => a + (b.avg_latency_ms || 0), 0) / history.length
    const avgToolRate = history.reduce((a, b) => a + (b.tool_success_rate || 0), 0) / history.length
    const avgOverall = history.reduce((a, b) => a + (b.overall_score || 0), 0) / history.length
    const totalTasks = history.reduce((a, b) => a + (b.tasks_completed || 0), 0)
    const totalTools = history.reduce((a, b) => a + (b.tool_calls_total || 0), 0)
    const totalFailed = history.reduce((a, b) => a + (b.tool_calls_failed || 0), 0)

    const avgMemoryRate = history.reduce((a, b) => a + (b.memory_usage_rate || 0), 0) / history.length
    const avgProactive = history.reduce((a, b) => a + (b.proactive_score || 0), 0) / history.length

    const overallScore = Math.round(avgOverall)
    const status = overallScore >= 80 ? 'excellent' : overallScore >= 60 ? 'good' : overallScore >= 40 ? 'fair' : 'poor'

    return {
      overallScore,
      status,
      tasks: { completionRate: Math.round(avgTaskRate), total: totalTasks },
      latency: { avgMs: Math.round(avgLatency), trend: 'stable' },
      tools: { successRate: Math.round(avgToolRate), total: totalTools, failed: totalFailed },
      memory: { usageRate: Math.round(avgMemoryRate), effectiveness: avgMemoryRate >= 80 ? 'excellent' : avgMemoryRate >= 50 ? 'good' : 'low' },
      proactive: { valueScore: Math.round(avgProactive), total: 0 },
      recovery: { recoveryRate: 100, totalErrors: totalFailed },
      dataPoints: history.length
    }
  }, [history])

  // Merge historical + live data
  // Historical has trends (task/latency/tools), live has real-time metrics (memory/proactive/recovery)
  const displayData = useMemo(() => {
    if (!historicalSummary && !summary) return null
    if (!historicalSummary) return summary

    // Merge: historical for trended metrics, live for real-time ones
    return {
      ...historicalSummary,
      // Always use live data for memory/proactive/recovery (not in historical buckets)
      memory: summary?.memory || { usageRate: 0, effectiveness: 'unknown' },
      proactive: summary?.proactive || { valueScore: 0, total: 0 },
      recovery: summary?.recovery || { recoveryRate: 100, totalErrors: 0 }
    }
  }, [historicalSummary, summary])

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    )
  }

  if (error && !summary) {
    return (
      <div className="p-6 rounded-lg bg-red-900/20 border border-red-800 text-red-400">
        <p className="font-medium">Failed to load performance data</p>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 px-4 py-2 bg-red-800/50 rounded hover:bg-red-800/70 transition"
        >
          Retry
        </button>
      </div>
    )
  }

  const {
    overallScore = 0,
    status = 'unknown',
    tasks = {},
    latency = {},
    tools = {},
    memory = {},
    proactive = {},
    recovery = {},
    dataPoints = 0
  } = displayData || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-400" />
          <h2 className="text-xl font-semibold text-gray-100">Performance</h2>
          {dataPoints > 0 && (
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
              {dataPoints} samples
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {syncing && <span className="text-xs text-gray-500">syncing...</span>}
          {lastUpdate && !syncing && (
            <span className="text-xs text-gray-500">
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchData}
            disabled={syncing}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Score */}
      <div className="flex justify-center">
        <OverallScore score={overallScore} status={status} />
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard
          title="Task Completion"
          icon={CheckCircle}
          value={tasks.completionRate || 0}
          unit="%"
          subValue={tasks.total || 0}
          subLabel="Total tasks"
          status={tasks.completionRate >= 80 ? 'healthy' : tasks.completionRate >= 60 ? 'needs-attention' : 'poor'}
        />

        <MetricCard
          title="Response Latency"
          icon={Clock}
          value={latency.avgMs || 0}
          unit="ms"
          trend={latency.trend}
          status={latency.avgMs < 5000 ? 'fast' : latency.avgMs < 15000 ? 'normal' : 'slow'}
        />

        <MetricCard
          title="Tool Success"
          icon={Wrench}
          value={tools.successRate || 0}
          unit="%"
          subValue={tools.total || 0}
          subLabel="Total calls"
          status={tools.successRate >= 95 ? 'excellent' : tools.successRate >= 80 ? 'good' : 'needs-attention'}
        />

        <MetricCard
          title="Memory Retrieval"
          icon={Brain}
          value={memory.usageRate || 0}
          unit="%"
          subValue={memory.totalQueries || 0}
          subLabel="Queries"
          status={memory.effectiveness || 'unknown'}
        />

        <MetricCard
          title="Proactive Actions"
          icon={Zap}
          value={proactive.valueScore || 0}
          unit="pts"
          subValue={proactive.total || 0}
          subLabel="Total actions"
          status={proactive.valueScore >= 50 ? 'valuable' : proactive.total > 0 ? 'moderate' : 'inactive'}
        />

        <MetricCard
          title="Error Recovery"
          icon={HeartPulse}
          value={recovery.recoveryRate || 0}
          unit="%"
          subValue={recovery.totalErrors || 0}
          subLabel="Total errors"
          status={recovery.recoveryRate >= 80 ? 'resilient' : recovery.recoveryRate >= 50 ? 'moderate' : 'fragile'}
        />
      </div>

      {/* Timestamp */}
      {summary?.timestamp && (
        <div className="text-center text-xs text-gray-600">
          Data from: {new Date(summary.timestamp).toLocaleString()}
        </div>
      )}
    </div>
  )
}
