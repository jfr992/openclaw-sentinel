import { useState, useEffect, useCallback, useMemo } from 'react'
import { Brain, MessageCircle, TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle, CheckCircle, Target, Layers, Calendar, Clock } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

export default function InsightsDashboard() {
  const [summary, setSummary] = useState(null)
  const [corrections, setCorrections] = useState(null)
  const [sentiment, setSentiment] = useState(null)
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [timeRange, setTimeRange] = useState(60) // minutes: 15, 30, 60, 240, 'all'

  const fetchData = useCallback(async () => {
    try {
      const [summaryRes, correctionsRes, sentimentRes, contextRes] = await Promise.all([
        fetch('/api/insights/summary'),
        fetch('/api/insights/corrections'),
        fetch('/api/insights/sentiment'),
        fetch('/api/insights/context')
      ])

      if (summaryRes.ok) setSummary(await summaryRes.json())
      if (correctionsRes.ok) setCorrections(await correctionsRes.json())
      if (sentimentRes.ok) setSentiment(await sentimentRes.json())
      if (contextRes.ok) setContext(await contextRes.json())
      
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000) // Every 30s
    return () => clearInterval(interval)
  }, [fetchData])

  // Filter and process sentiment data based on time range
  const { recentSentimentData, trendChartData, recentStats } = useMemo(() => {
    if (!sentiment?.recentDetails) return { recentSentimentData: [], trendChartData: [], recentStats: null }
    
    const now = Date.now()
    const cutoff = timeRange === 'all' ? 0 : now - (timeRange * 60 * 1000)
    
    const filtered = sentiment.recentDetails.filter(d => 
      new Date(d.timestamp).getTime() > cutoff
    )
    
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
  }, [sentiment, timeRange])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Brain className="w-12 h-12 text-[var(--accent-purple)] mx-auto mb-2 animate-pulse" />
          <p className="text-[var(--text-muted)]">Analyzing behavior...</p>
        </div>
      </div>
    )
  }

  const TrendIcon = sentiment?.trend === 'improving' ? TrendingUp :
                    sentiment?.trend === 'declining' ? TrendingDown : Minus

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-[var(--accent-purple)]" />
          <h2 className="text-xl font-bold">Self-Insights</h2>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Time Range Picker */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <Clock className="w-4 h-4 text-[var(--text-secondary)]" />
        <span className="text-sm text-[var(--text-secondary)]">Time Range:</span>
        {[15, 30, 60, 240].map(mins => (
          <button
            key={mins}
            onClick={() => setTimeRange(mins)}
            className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
              timeRange === mins
                ? 'bg-[var(--accent-purple)] border-[var(--accent-purple)] text-white'
                : 'bg-[var(--bg-tertiary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--accent-purple)]'
            }`}
          >
            {mins < 60 ? `${mins}m` : `${mins/60}h`}
          </button>
        ))}
        <button
          onClick={() => setTimeRange('all')}
          className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
            timeRange === 'all'
              ? 'bg-[var(--accent-purple)] border-[var(--accent-purple)] text-white'
              : 'bg-[var(--bg-tertiary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--accent-purple)]'
          }`}
        >
          All
        </button>
        {recentStats && (
          <span className="text-xs text-[var(--text-muted)] ml-auto">
            {recentStats.total} messages • {recentStats.positiveRate}% positive • {recentStats.negativeRate}% negative
          </span>
        )}
      </div>

      {/* Sentiment Trend Chart */}
      {trendChartData.length > 0 && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--accent-cyan)]" />
            Sentiment Trend ({timeRange === 'all' ? 'All Time' : `Last ${timeRange < 60 ? `${timeRange}m` : `${timeRange/60}h`}`})
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
      {summary && (
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-2">Overall Health</h3>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold" style={{ 
                  color: summary.status.color === 'green' ? 'var(--accent-green)' :
                         summary.status.color === 'blue' ? 'var(--accent-blue)' :
                         summary.status.color === 'yellow' ? 'var(--accent-amber)' :
                         summary.status.color === 'orange' ? 'var(--accent-orange)' :
                         'var(--accent-red)'
                }}>
                  {summary.healthScore}
                </span>
                <div>
                  <span className="text-2xl">{summary.status.emoji}</span>
                  <p className="text-sm text-[var(--text-muted)]">{summary.status.label}</p>
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
          
          {corrections && (
            <div className="space-y-4">
              {/* Score Display */}
              <div className="flex items-end gap-4">
                <span className={`text-5xl font-bold ${
                  corrections.score === 0 ? 'text-[var(--accent-green)]' :
                  corrections.score < 30 ? 'text-[var(--accent-blue)]' :
                  corrections.score < 60 ? 'text-[var(--accent-amber)]' :
                  'text-[var(--accent-red)]'
                }`}>
                  {corrections.score}
                </span>
                <span className="text-[var(--text-muted)] mb-2">/ 100</span>
              </div>
              
              <p className="text-sm text-[var(--text-secondary)]">
                {corrections.interpretation}
              </p>
              
              {/* Breakdown */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 rounded bg-[var(--bg-secondary)]">
                  <span className="text-[var(--text-muted)]">Verbal</span>
                  <span className="float-right font-mono">{corrections.byType.verbal}</span>
                </div>
                <div className="p-2 rounded bg-[var(--bg-secondary)]">
                  <span className="text-[var(--text-muted)]">Tool Retry</span>
                  <span className="float-right font-mono">{corrections.byType.toolRetry}</span>
                </div>
                <div className="p-2 rounded bg-[var(--bg-secondary)]">
                  <span className="text-[var(--text-muted)]">File Re-edit</span>
                  <span className="float-right font-mono">{corrections.byType.fileReedit}</span>
                </div>
                <div className="p-2 rounded bg-[var(--bg-secondary)]">
                  <span className="text-[var(--text-muted)]">Error Recovery</span>
                  <span className="float-right font-mono">{corrections.byType.errorRecovery}</span>
                </div>
              </div>
              
              {/* Recommendation */}
              <div className="p-3 rounded-lg bg-[var(--accent-orange)]/10 border border-[var(--accent-orange)]/30">
                <p className="text-sm text-[var(--accent-orange)]">
                  💡 {corrections.recommendation}
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
          
          {sentiment && (
            <div className="space-y-4">
              {/* Feedback Score */}
              <div className="flex items-end gap-4">
                <span className={`text-5xl font-bold ${
                  sentiment.feedbackScore >= 70 ? 'text-[var(--accent-green)]' :
                  sentiment.feedbackScore >= 50 ? 'text-[var(--accent-blue)]' :
                  sentiment.feedbackScore >= 30 ? 'text-[var(--accent-amber)]' :
                  'text-[var(--accent-red)]'
                }`}>
                  {sentiment.feedbackScore}
                </span>
                <span className="text-[var(--text-muted)] mb-2">/ 100</span>
              </div>
              
              {/* Trend */}
              <div className="flex items-center gap-2">
                <TrendIcon className={`w-5 h-5 ${
                  sentiment.trend === 'improving' ? 'text-[var(--accent-green)]' :
                  sentiment.trend === 'declining' ? 'text-[var(--accent-red)]' :
                  'text-[var(--text-muted)]'
                }`} />
                <span className="text-sm capitalize">{sentiment.trend}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  ({sentiment.totalMessages} messages)
                </span>
              </div>
              
              {/* Distribution */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-3 bg-[var(--bg-secondary)] rounded-full overflow-hidden flex">
                    <div 
                      className="h-full bg-[var(--accent-green)]" 
                      style={{ width: `${sentiment.satisfactionRate}%` }}
                    />
                    <div 
                      className="h-full bg-[var(--accent-red)]" 
                      style={{ width: `${sentiment.frustrationRate}%` }}
                    />
                  </div>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--accent-green)]">
                    {sentiment.satisfactionRate}% satisfied
                  </span>
                  <span className="text-[var(--accent-red)]">
                    {sentiment.frustrationRate}% frustrated
                  </span>
                </div>
              </div>
              
              {/* Recent Sentiment */}
              <div className="flex items-center gap-2 p-2 rounded bg-[var(--bg-secondary)]">
                <span className="text-xs text-[var(--text-muted)]">Recent:</span>
                {sentiment.recentSentiment === 'positive' ? (
                  <><CheckCircle className="w-4 h-4 text-[var(--accent-green)]" /> <span className="text-sm text-[var(--accent-green)]">Positive</span></>
                ) : sentiment.recentSentiment === 'negative' ? (
                  <><AlertCircle className="w-4 h-4 text-[var(--accent-red)]" /> <span className="text-sm text-[var(--accent-red)]">Negative</span></>
                ) : (
                  <><Minus className="w-4 h-4 text-[var(--text-muted)]" /> <span className="text-sm text-[var(--text-muted)]">Neutral</span></>
                )}
              </div>
              
              {/* Recommendation */}
              <div className="p-3 rounded-lg bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/30">
                <p className="text-sm text-[var(--accent-cyan)]">
                  💬 {sentiment.recommendation}
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
          
          {context && (
            <div className="space-y-4">
              {/* Health Score */}
              <div className="flex items-end gap-4">
                <span className={`text-5xl font-bold ${
                  context.healthScore >= 80 ? 'text-[var(--accent-green)]' :
                  context.healthScore >= 60 ? 'text-[var(--accent-blue)]' :
                  context.healthScore >= 40 ? 'text-[var(--accent-amber)]' :
                  'text-[var(--accent-red)]'
                }`}>
                  {context.healthScore}
                </span>
                <div className="mb-2">
                  <span className="text-lg">{context.status.emoji}</span>
                  <span className="text-sm text-[var(--text-muted)] ml-1">{context.status.label}</span>
                </div>
              </div>
              
              {/* Continuity Rate */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">Continuity:</span>
                <div className="flex-1 h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[var(--accent-purple)]" 
                    style={{ width: `${context.continuityRate}%` }}
                  />
                </div>
                <span className="text-sm font-mono">{context.continuityRate}%</span>
              </div>
              
              {/* Events Breakdown */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 rounded bg-[var(--bg-secondary)]">
                  <span className="text-[var(--text-muted)]">Truncations</span>
                  <span className={`float-right font-mono ${context.events.truncations > 0 ? 'text-[var(--accent-red)]' : ''}`}>
                    {context.events.truncations}
                  </span>
                </div>
                <div className="p-2 rounded bg-[var(--bg-secondary)]">
                  <span className="text-[var(--text-muted)]">Re-asks</span>
                  <span className={`float-right font-mono ${context.events.reasksCount > 0 ? 'text-[var(--accent-orange)]' : ''}`}>
                    {context.events.reasksCount}
                  </span>
                </div>
                <div className="p-2 rounded bg-[var(--bg-secondary)]">
                  <span className="text-[var(--text-muted)]">Confusion</span>
                  <span className="float-right font-mono">{context.events.confusionSignals}</span>
                </div>
                <div className="p-2 rounded bg-[var(--bg-secondary)]">
                  <span className="text-[var(--text-muted)]">Memory Reads</span>
                  <span className="float-right font-mono text-[var(--accent-green)]">{context.events.memoryReads}</span>
                </div>
              </div>
              
              {/* Recommendation */}
              <div className="p-3 rounded-lg bg-[var(--accent-purple)]/10 border border-[var(--accent-purple)]/30">
                <p className="text-sm text-[var(--accent-purple)]">
                  🧠 {context.recommendation}
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
