import { useState, useEffect, useCallback, useMemo } from 'react'
import { Brain, MessageCircle, TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle, CheckCircle, Target, Layers } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

export default function InsightsDashboard({ dateRange = 7, customStart, customEnd }) {
  const [summary, setSummary] = useState(null)
  const [corrections, setCorrections] = useState(null)
  const [sentiment, setSentiment] = useState(null)
  const [context, setContext] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false) // Background sync indicator
  const [error, setError] = useState(null)

  // Calculate date range for historical API
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

  // Track if we have data (for loading vs syncing)
  const hasData = history.length > 0

  const fetchData = useCallback(async () => {
    try {
      // For short ranges (<= 1 day), fetch live data for details
      // For longer ranges, use historical aggregates only
      const isRecentView = dateRange <= 1

      const fetches = [
        fetch(`/api/metrics/insights?start=${start}&end=${end}&granularity=${granularity}`)
      ]

      // Only fetch live details for recent views
      if (isRecentView) {
        fetches.push(
          fetch('/api/insights/summary'),
          fetch('/api/insights/corrections'),
          fetch('/api/insights/sentiment'),
          fetch('/api/insights/context')
        )
      }

      const results = await Promise.all(fetches)

      const historyRes = results[0]
      if (historyRes.ok) {
        const data = await historyRes.json()
        setHistory(data.timeseries || [])
      }

      if (isRecentView) {
        const [, summaryRes, correctionsRes, sentimentRes, contextRes] = results
        if (summaryRes?.ok) setSummary(await summaryRes.json())
        if (correctionsRes?.ok) setCorrections(await correctionsRes.json())
        if (sentimentRes?.ok) setSentiment(await sentimentRes.json())
        if (contextRes?.ok) setContext(await contextRes.json())
      } else {
        // Clear live data when viewing historical ranges
        setSummary(null)
        setCorrections(null)
        setSentiment(null)
        setContext(null)
      }

      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [start, end, granularity, dateRange])

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

  // Calculate summary from historical data when available
  const historicalSummary = useMemo(() => {
    if (!history || history.length === 0) return null

    const avgHealth = Math.round(history.reduce((a, b) => a + (b.health_score || 0), 0) / history.length)
    const avgSentiment = Math.round(history.reduce((a, b) => a + (b.sentiment_score || 0), 0) / history.length)
    const avgContext = Math.round(history.reduce((a, b) => a + (b.context_health || 0), 0) / history.length)
    const totalCorrections = history.reduce((a, b) => a + (b.corrections_count || 0), 0)
    const totalConfusion = history.reduce((a, b) => a + (b.confusion_signals || 0), 0)
    const totalReasks = history.reduce((a, b) => a + (b.reask_count || 0), 0)

    // Calculate status based on health score
    const status = avgHealth >= 80 ? { label: 'Excellent', color: 'green', emoji: '🌟' } :
                   avgHealth >= 60 ? { label: 'Good', color: 'blue', emoji: '👍' } :
                   avgHealth >= 40 ? { label: 'Fair', color: 'yellow', emoji: '📊' } :
                   avgHealth >= 20 ? { label: 'Needs Work', color: 'orange', emoji: '⚠️' } :
                   { label: 'Critical', color: 'red', emoji: '🚨' }

    return {
      healthScore: avgHealth,
      status,
      corrections: {
        total: totalCorrections,
        score: totalCorrections > 10 ? Math.min(100, totalCorrections * 2) : totalCorrections * 5
      },
      sentiment: {
        feedbackScore: avgSentiment,
        trend: history.length > 1 && history[history.length - 1].sentiment_score > history[0].sentiment_score ? 'improving' : 'stable'
      },
      context: {
        healthScore: avgContext,
        confusionSignals: totalConfusion,
        reasksCount: totalReasks,
        continuityRate: Math.max(0, 100 - (totalConfusion + totalReasks) * 2)
      },
      dataPoints: history.length,
      range: `${history.length} samples`
    }
  }, [history])

  // Use historical data if available, otherwise current
  const displaySummary = useMemo(() => historicalSummary || summary, [historicalSummary, summary])

  // Unified display data - prefer live, fall back to historical aggregates
  const displayCorrections = useMemo(() => {
    if (corrections) return corrections
    if (!historicalSummary) return null
    return {
      score: historicalSummary.corrections.score,
      interpretation: historicalSummary.corrections.total === 0 ? 'No corrections detected' : `${historicalSummary.corrections.total} corrections in period`,
      totalCorrections: historicalSummary.corrections.total,
      byType: { verbal: 0, toolRetry: 0, fileReedit: 0, errorRecovery: 0 },
      recommendation: historicalSummary.corrections.total === 0 ? 'Excellent! No corrections needed.' : 'Review historical data for patterns.'
    }
  }, [corrections, historicalSummary])

  const displaySentiment = useMemo(() => {
    if (sentiment) return sentiment
    if (!historicalSummary) return null
    return {
      feedbackScore: historicalSummary.sentiment.feedbackScore,
      trend: historicalSummary.sentiment.trend,
      totalMessages: historicalSummary.dataPoints,
      satisfactionRate: Math.round(historicalSummary.sentiment.feedbackScore),
      frustrationRate: Math.round(100 - historicalSummary.sentiment.feedbackScore),
      recentSentiment: historicalSummary.sentiment.feedbackScore >= 60 ? 'positive' : historicalSummary.sentiment.feedbackScore >= 40 ? 'neutral' : 'negative',
      recommendation: historicalSummary.sentiment.feedbackScore >= 60 ? 'Good user experience in this period.' : 'Monitor for patterns in feedback.'
    }
  }, [sentiment, historicalSummary])

  const displayContext = useMemo(() => {
    if (context) return context
    if (!historicalSummary) return null
    return {
      healthScore: historicalSummary.context.healthScore,
      continuityRate: historicalSummary.context.continuityRate,
      status: {
        label: historicalSummary.context.healthScore >= 80 ? 'Excellent' : historicalSummary.context.healthScore >= 60 ? 'Good' : 'Fair',
        emoji: historicalSummary.context.healthScore >= 80 ? '🧠' : historicalSummary.context.healthScore >= 60 ? '👍' : '📊'
      },
      events: {
        truncations: 0,
        reasksCount: historicalSummary.context.reasksCount,
        confusionSignals: historicalSummary.context.confusionSignals,
        memoryReads: 0
      },
      recommendation: historicalSummary.context.healthScore >= 80 ? 'Context maintained well.' : 'Some context gaps detected.'
    }
  }, [context, historicalSummary])

  // Filter and process sentiment data based on date range
  const { recentSentimentData, trendChartData, recentStats } = useMemo(() => {
    if (!sentiment?.recentDetails) return { recentSentimentData: [], trendChartData: [], recentStats: null }

    // Use same date filtering as the global picker
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()

    const filtered = sentiment.recentDetails.filter(d => {
      const ts = new Date(d.timestamp).getTime()
      return ts >= startTime && ts <= endTime
    })

    // Process for trend chart
    const chartData = filtered.map(d => ({
      time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      score: d.score,
      sentiment: d.sentiment === 'positive' ? 1 : d.sentiment === 'negative' ? -1 : 0
    })).reverse()

    // Calculate recent stats
    const positive = filtered.filter(d => d.sentiment === 'positive').length
    const negative = filtered.filter(d => d.sentiment === 'negative').length
    const neutral = filtered.filter(d => d.sentiment === 'neutral').length
    const total = filtered.length

    return {
      recentSentimentData: filtered,
      trendChartData: chartData,
      recentStats: total > 0 ? {
        total,
        positive,
        negative,
        neutral,
        positiveRate: Math.round((positive / total) * 100),
        negativeRate: Math.round((negative / total) * 100)
      } : null
    }
  }, [sentiment, start, end])

  // Only show full loading on initial load with no data
  if (loading && history.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Brain className="w-12 h-12 text-[var(--accent-purple)] mx-auto mb-2 animate-pulse" />
          <p className="text-[var(--text-muted)]">Analyzing behavior...</p>
        </div>
      </div>
    )
  }

  const TrendIcon = displaySentiment?.trend === 'improving' ? TrendingUp :
                    displaySentiment?.trend === 'declining' ? TrendingDown : Minus

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className={`w-6 h-6 text-[var(--accent-purple)] ${syncing ? 'animate-pulse' : ''}`} />
          <h2 className="text-xl font-bold">Self-Insights</h2>
          {syncing && <span className="text-xs text-[var(--text-muted)]">syncing...</span>}
        </div>
        <button
          onClick={() => fetchData(false)}
          disabled={syncing}
          className="p-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Sentiment Trend Chart */}
      {trendChartData.length > 0 && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--accent-cyan)]" />
            Sentiment Trend
            {recentStats && (
              <span className="text-xs text-[var(--text-muted)] ml-auto font-normal">
                {recentStats.total} messages • {recentStats.positiveRate}% positive
              </span>
            )}
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData}>
                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#71717a', fontSize: 10 }}
                />
                <YAxis
                  domain={[-1, 1]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  tickFormatter={(v) => v === 1 ? '😊' : v === -1 ? '😞' : '😐'}
                  width={30}
                />
                <ReferenceLine y={0} stroke="#71717a" strokeDasharray="3 3" />
                <Tooltip
                  contentStyle={{
                    background: '#1a1a24',
                    border: '1px solid #2a2a3a',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                  formatter={(value) => [value === 1 ? 'Positive' : value === -1 ? 'Negative' : 'Neutral', 'Sentiment']}
                />
                <Line
                  type="stepAfter"
                  dataKey="sentiment"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={{ fill: '#22d3ee', strokeWidth: 0, r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {error && (
        <div className="card p-4 border-[var(--accent-red)] bg-red-500/10">
          <div className="flex items-center gap-2 text-[var(--accent-red)]">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Health Score */}
      {displaySummary && (
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-2">
                Overall Health {displaySummary.dataPoints ? `(${displaySummary.dataPoints} samples)` : ''}
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold" style={{
                  color: displaySummary.status?.color === 'green' ? 'var(--accent-green)' :
                         displaySummary.status?.color === 'blue' ? 'var(--accent-blue)' :
                         displaySummary.status?.color === 'yellow' ? 'var(--accent-amber)' :
                         displaySummary.status?.color === 'orange' ? 'var(--accent-orange)' :
                         'var(--accent-red)'
                }}>
                  {displaySummary.healthScore}
                </span>
                <div>
                  <span className="text-2xl">{displaySummary.status?.emoji || '📊'}</span>
                  <p className="text-sm text-[var(--text-muted)]">{displaySummary.status?.label || 'Loading...'}</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-[var(--text-muted)]">Based on</p>
              <p className="text-sm">Corrections + Sentiment</p>
            </div>
          </div>
        </div>
      )}

      {/* Three Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Self-Correction */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-[var(--accent-orange)]" />
            Self-Correction Score
          </h3>

          {displayCorrections && (
            <div className="space-y-4">
              {/* Score Display */}
              <div className="flex items-end gap-4">
                <span className={`text-5xl font-bold ${
                  displayCorrections.score === 0 ? 'text-[var(--accent-green)]' :
                  displayCorrections.score < 30 ? 'text-[var(--accent-blue)]' :
                  displayCorrections.score < 60 ? 'text-[var(--accent-amber)]' :
                  'text-[var(--accent-red)]'
                }`}>
                  {displayCorrections.score}
                </span>
                <span className="text-[var(--text-muted)] mb-2">/ 100</span>
              </div>

              <p className="text-sm text-[var(--text-secondary)]">
                {displayCorrections.interpretation}
              </p>

              {/* Breakdown - only show when live data available */}
              {corrections && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 rounded bg-[var(--bg-secondary)]">
                    <span className="text-[var(--text-muted)]">Verbal</span>
                    <span className="float-right font-mono">{displayCorrections.byType.verbal}</span>
                  </div>
                  <div className="p-2 rounded bg-[var(--bg-secondary)]">
                    <span className="text-[var(--text-muted)]">Tool Retry</span>
                    <span className="float-right font-mono">{displayCorrections.byType.toolRetry}</span>
                  </div>
                  <div className="p-2 rounded bg-[var(--bg-secondary)]">
                    <span className="text-[var(--text-muted)]">File Re-edit</span>
                    <span className="float-right font-mono">{displayCorrections.byType.fileReedit}</span>
                  </div>
                  <div className="p-2 rounded bg-[var(--bg-secondary)]">
                    <span className="text-[var(--text-muted)]">Error Recovery</span>
                    <span className="float-right font-mono">{displayCorrections.byType.errorRecovery}</span>
                  </div>
                </div>
              )}

              {/* Recommendation */}
              <div className="p-3 rounded-lg bg-[var(--accent-orange)]/10 border border-[var(--accent-orange)]/30">
                <p className="text-sm text-[var(--accent-orange)]">
                  💡 {displayCorrections.recommendation}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* User Sentiment */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-[var(--accent-cyan)]" />
            User Sentiment
          </h3>

          {displaySentiment && (
            <div className="space-y-4">
              {/* Feedback Score */}
              <div className="flex items-end gap-4">
                <span className={`text-5xl font-bold ${
                  displaySentiment.feedbackScore >= 70 ? 'text-[var(--accent-green)]' :
                  displaySentiment.feedbackScore >= 50 ? 'text-[var(--accent-blue)]' :
                  displaySentiment.feedbackScore >= 30 ? 'text-[var(--accent-amber)]' :
                  'text-[var(--accent-red)]'
                }`}>
                  {displaySentiment.feedbackScore}
                </span>
                <span className="text-[var(--text-muted)] mb-2">/ 100</span>
              </div>

              {/* Trend */}
              <div className="flex items-center gap-2">
                <TrendIcon className={`w-5 h-5 ${
                  displaySentiment.trend === 'improving' ? 'text-[var(--accent-green)]' :
                  displaySentiment.trend === 'declining' ? 'text-[var(--accent-red)]' :
                  'text-[var(--text-muted)]'
                }`} />
                <span className="text-sm capitalize">{displaySentiment.trend}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  ({displaySentiment.totalMessages} {sentiment ? 'messages' : 'samples'})
                </span>
              </div>

              {/* Distribution */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-3 bg-[var(--bg-secondary)] rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-[var(--accent-green)]"
                      style={{ width: `${displaySentiment.satisfactionRate}%` }}
                    />
                    <div
                      className="h-full bg-[var(--accent-red)]"
                      style={{ width: `${displaySentiment.frustrationRate}%` }}
                    />
                  </div>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--accent-green)]">
                    {displaySentiment.satisfactionRate}% satisfied
                  </span>
                  <span className="text-[var(--accent-red)]">
                    {displaySentiment.frustrationRate}% frustrated
                  </span>
                </div>
              </div>

              {/* Recent Sentiment */}
              <div className="flex items-center gap-2 p-2 rounded bg-[var(--bg-secondary)]">
                <span className="text-xs text-[var(--text-muted)]">Period:</span>
                {displaySentiment.recentSentiment === 'positive' ? (
                  <><CheckCircle className="w-4 h-4 text-[var(--accent-green)]" /> <span className="text-sm text-[var(--accent-green)]">Positive</span></>
                ) : displaySentiment.recentSentiment === 'negative' ? (
                  <><AlertCircle className="w-4 h-4 text-[var(--accent-red)]" /> <span className="text-sm text-[var(--accent-red)]">Negative</span></>
                ) : (
                  <><Minus className="w-4 h-4 text-[var(--text-muted)]" /> <span className="text-sm text-[var(--text-muted)]">Neutral</span></>
                )}
              </div>

              {/* Recommendation */}
              <div className="p-3 rounded-lg bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/30">
                <p className="text-sm text-[var(--accent-cyan)]">
                  💬 {displaySentiment.recommendation}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Context Health */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--accent-purple)]" />
            Context Health
          </h3>

          {displayContext && (
            <div className="space-y-4">
              {/* Health Score */}
              <div className="flex items-end gap-4">
                <span className={`text-5xl font-bold ${
                  displayContext.healthScore >= 80 ? 'text-[var(--accent-green)]' :
                  displayContext.healthScore >= 60 ? 'text-[var(--accent-blue)]' :
                  displayContext.healthScore >= 40 ? 'text-[var(--accent-amber)]' :
                  'text-[var(--accent-red)]'
                }`}>
                  {displayContext.healthScore}
                </span>
                <div className="mb-2">
                  <span className="text-lg">{displayContext.status.emoji}</span>
                  <span className="text-sm text-[var(--text-muted)] ml-1">{displayContext.status.label}</span>
                </div>
              </div>

              {/* Continuity Rate */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">Continuity:</span>
                <div className="flex-1 h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent-purple)]"
                    style={{ width: `${displayContext.continuityRate}%` }}
                  />
                </div>
                <span className="text-sm font-mono">{displayContext.continuityRate}%</span>
              </div>

              {/* Events Breakdown */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 rounded bg-[var(--bg-secondary)]">
                  <span className="text-[var(--text-muted)]">Truncations</span>
                  <span className={`float-right font-mono ${displayContext.events.truncations > 0 ? 'text-[var(--accent-red)]' : ''}`}>
                    {displayContext.events.truncations}
                  </span>
                </div>
                <div className="p-2 rounded bg-[var(--bg-secondary)]">
                  <span className="text-[var(--text-muted)]">Re-asks</span>
                  <span className={`float-right font-mono ${displayContext.events.reasksCount > 0 ? 'text-[var(--accent-orange)]' : ''}`}>
                    {displayContext.events.reasksCount}
                  </span>
                </div>
                <div className="p-2 rounded bg-[var(--bg-secondary)]">
                  <span className="text-[var(--text-muted)]">Confusion</span>
                  <span className="float-right font-mono">{displayContext.events.confusionSignals}</span>
                </div>
                <div className="p-2 rounded bg-[var(--bg-secondary)]">
                  <span className="text-[var(--text-muted)]">Memory Reads</span>
                  <span className="float-right font-mono text-[var(--accent-green)]">{displayContext.events.memoryReads}</span>
                </div>
              </div>

              {/* Recommendation */}
              <div className="p-3 rounded-lg bg-[var(--accent-purple)]/10 border border-[var(--accent-purple)]/30">
                <p className="text-sm text-[var(--accent-purple)]">
                  🧠 {displayContext.recommendation}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Corrections Detail */}
      {corrections?.recentCorrections?.length > 0 && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
            Recent Corrections
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {corrections.recentCorrections.map((c, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded bg-[var(--bg-secondary)]">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  c.type === 'verbal' ? 'bg-blue-500/20 text-blue-400' :
                  c.type === 'tool_retry' ? 'bg-orange-500/20 text-orange-400' :
                  c.type === 'file_reedit' ? 'bg-purple-500/20 text-purple-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {c.type.replace('_', ' ')}
                </span>
                <span className="text-sm text-[var(--text-secondary)] truncate flex-1">
                  {c.match || c.path || c.tool || 'Unknown'}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {Math.round(c.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
