/**
 * Performance API Routes
 * Task completion, latency, tool reliability, memory retrieval, proactive actions, error recovery
 */
import { Router } from 'express'
import { calculateTaskMetrics } from '../../../domain/services/TaskCompletionTracker.js'
import { extractLatencies, calculateLatencyMetrics } from '../../../domain/services/ResponseLatencyTracker.js'
import { parseToolCalls, calculateReliabilityMetrics, getHealthStatus } from '../../../domain/services/ToolReliabilityTracker.js'
import { parseRetrievalEvents, calculateMemoryMetrics } from '../../../domain/services/MemoryRetrievalTracker.js'
import { parseProactiveActions, calculateProactiveMetrics } from '../../../domain/services/ProactiveActionTracker.js'
import { parseRecoveryEvents, calculateRecoveryMetrics } from '../../../domain/services/ErrorRecoveryTracker.js'

const router = Router()

/**
 * GET /api/performance/tasks
 * Task completion metrics
 */
router.get('/tasks', async (req, res) => {
  try {
    const { getSessionData } = req.app.locals
    const data = await getSessionData()

    const messages = data.messages || []
    const metrics = calculateTaskMetrics(messages)

    res.json({
      totalTasks: metrics.totalTasks,
      completedTasks: metrics.completedTasks,
      failedTasks: metrics.failedTasks,
      completionRate: Math.round(metrics.completionRate),
      satisfactionRate: Math.round(metrics.satisfactionRate),
      avgConfidence: Math.round(metrics.avgConfidence),
      taskTypes: metrics.taskTypes,
      status: metrics.completionRate >= 80 ? 'healthy' : metrics.completionRate >= 60 ? 'needs-attention' : 'poor'
    })
  } catch (err) {
    console.error('Tasks API error:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/performance/latency
 * Response latency metrics
 */
router.get('/latency', async (req, res) => {
  try {
    const { getSessionData } = req.app.locals
    const data = await getSessionData()

    const messages = data.messages || []
    const latencies = extractLatencies(messages)
    const metrics = calculateLatencyMetrics(latencies)

    res.json({
      count: metrics.count,
      avgMs: metrics.avgMs,
      p50Ms: metrics.p50Ms,
      p95Ms: metrics.p95Ms,
      minMs: metrics.minMs,
      maxMs: metrics.maxMs,
      trend: metrics.trend,
      recentAvgMs: metrics.recentAvgMs,
      byComplexity: metrics.byComplexity,
      status: metrics.avgMs < 5000 ? 'fast' : metrics.avgMs < 15000 ? 'normal' : 'slow'
    })
  } catch (err) {
    console.error('Latency API error:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/performance/tools
 * Tool reliability metrics
 */
router.get('/tools', async (req, res) => {
  try {
    const { getSessionData } = req.app.locals
    const data = await getSessionData()

    // Use pre-enriched tool calls from session parser (has success/failure linked)
    const toolCalls = data.toolCalls || []

    // Transform to format expected by calculateReliabilityMetrics
    const allCalls = toolCalls.map(tc => ({
      tool: tc.name,
      success: tc.success !== false, // undefined = success (no result yet)
      error: tc.result?.isError ? tc.result.content?.slice(0, 100) : null,
      id: tc.id,
      timestamp: tc.timestamp
    }))

    const metrics = calculateReliabilityMetrics(allCalls)

    res.json({
      totalCalls: metrics.totalCalls,
      successRate: metrics.successRate,
      failureRate: metrics.failureRate,
      retryRate: metrics.retryRate,
      mostUsed: metrics.mostUsed,
      leastReliable: metrics.leastReliable,
      topFailures: metrics.topFailures,
      byTool: metrics.byTool,
      status: getHealthStatus(metrics)
    })
  } catch (err) {
    console.error('Tools API error:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/performance/memory
 * Memory retrieval metrics
 */
router.get('/memory', async (req, res) => {
  try {
    const { getSessionData } = req.app.locals
    const data = await getSessionData()

    const messages = data.messages || []
    const toolCalls = data.toolCalls || []

    // Parse events from message text patterns
    const textEvents = parseRetrievalEvents(messages)

    // Also count tool-based memory access
    const memoryToolCalls = toolCalls.filter(tc =>
      tc.name === 'memory_search' ||
      (tc.name === 'read' && tc.arguments?.path?.includes('memory/')) ||
      (tc.name === 'read' && tc.arguments?.path?.includes('MEMORY.md'))
    )

    // Convert tool calls to events format
    const toolEvents = memoryToolCalls.map(tc => ({
      type: tc.name === 'memory_search' ? 'vector' : 'file',
      timestamp: tc.timestamp,
      wasUsed: tc.success !== false,
      latencyMs: 0
    }))

    // Merge both event sources
    const events = [...textEvents, ...toolEvents]
    const metrics = calculateMemoryMetrics(events, messages)

    res.json({
      totalQueries: metrics.totalQueries,
      vectorQueries: metrics.vectorQueries,
      fileQueries: metrics.fileQueries,
      usageRate: metrics.usageRate,
      avgLatencyMs: metrics.avgLatencyMs,
      contextLostCount: metrics.contextLostCount,
      missedOpportunities: metrics.missedOpportunities,
      effectiveness: metrics.effectiveness,
      byType: metrics.byType,
      status: metrics.effectiveness === 'good' ? 'healthy' :
              metrics.effectiveness === 'underutilized' ? 'needs-attention' : 'unknown'
    })
  } catch (err) {
    console.error('Memory API error:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/performance/proactive
 * Proactive action metrics
 */
router.get('/proactive', async (req, res) => {
  try {
    const { getSessionData } = req.app.locals
    const data = await getSessionData()

    const messages = data.messages || []
    const toolCalls = data.toolCalls || []

    // Parse from message text
    const textActions = parseProactiveActions(messages)

    // Also count proactive tool usage
    const proactiveTools = toolCalls.filter(tc =>
      tc.name === 'cron' ||
      tc.name === 'message' ||
      (tc.name === 'write' && tc.arguments?.path?.includes('memory/'))
    )

    // Convert to actions format
    const toolActions = proactiveTools.map(tc => ({
      type: tc.name === 'cron' ? 'maintenance' :
            tc.name === 'message' ? 'alert' : 'maintenance',
      timestamp: tc.timestamp,
      value: tc.name === 'message' ? 'medium' : 'low',
      confidence: 0.9
    }))

    const actions = [...textActions, ...toolActions]
    const assistantCount = messages.filter(m => m.role === 'assistant').length
    const metrics = calculateProactiveMetrics(actions, assistantCount)

    res.json({
      totalActions: metrics.totalActions,
      proactiveRate: metrics.proactiveRate,
      valueScore: metrics.valueScore,
      highValueActions: metrics.highValueActions,
      byType: metrics.byType,
      byValue: metrics.byValue,
      mostCommonType: metrics.mostCommonType,
      recommendations: metrics.recommendations,
      status: metrics.valueScore >= 50 ? 'valuable' :
              metrics.totalActions > 0 ? 'moderate' : 'inactive'
    })
  } catch (err) {
    console.error('Proactive API error:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/performance/recovery
 * Error recovery metrics
 */
router.get('/recovery', async (req, res) => {
  try {
    const { getSessionData } = req.app.locals
    const data = await getSessionData()

    const messages = data.messages || []
    const events = parseRecoveryEvents(messages)
    const metrics = calculateRecoveryMetrics(events)

    res.json({
      totalErrors: metrics.totalErrors,
      recoveredErrors: metrics.recoveredErrors,
      unrecoveredErrors: metrics.unrecoveredErrors,
      recoveryRate: metrics.recoveryRate,
      avgRecoveryTimeMs: metrics.avgRecoveryTimeMs,
      fastestRecoveryMs: metrics.fastestRecoveryMs,
      slowestRecoveryMs: metrics.slowestRecoveryMs,
      byType: metrics.byType,
      byStrategy: metrics.byStrategy,
      mostCommonError: metrics.mostCommonError,
      mostEffectiveStrategy: metrics.mostEffectiveStrategy,
      status: metrics.recoveryRate >= 80 ? 'resilient' :
              metrics.recoveryRate >= 50 ? 'moderate' : 'fragile'
    })
  } catch (err) {
    console.error('Recovery API error:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/performance/summary
 * All performance metrics summary
 */
router.get('/summary', async (req, res) => {
  try {
    const { getSessionData } = req.app.locals
    const data = await getSessionData()
    const messages = data.messages || []
    const toolCalls = data.toolCalls || []

    // Calculate all metrics
    const taskMetrics = calculateTaskMetrics(messages)
    const latencies = extractLatencies(messages)
    const latencyMetrics = calculateLatencyMetrics(latencies)

    // Use pre-enriched tool calls
    const allCalls = toolCalls.map(tc => ({
      tool: tc.name,
      success: tc.success !== false,
      error: tc.result?.isError ? tc.result.content?.slice(0, 100) : null,
      id: tc.id,
      timestamp: tc.timestamp
    }))
    const toolMetrics = calculateReliabilityMetrics(allCalls)

    // Enhanced memory events (text + tool-based)
    const textEvents = parseRetrievalEvents(messages)
    const memoryToolCalls = toolCalls.filter(tc =>
      tc.name === 'memory_search' ||
      (tc.name === 'read' && tc.arguments?.path?.includes('memory/')) ||
      (tc.name === 'read' && tc.arguments?.path?.includes('MEMORY.md'))
    )
    const toolEvents = memoryToolCalls.map(tc => ({
      type: tc.name === 'memory_search' ? 'vector' : 'file',
      timestamp: tc.timestamp,
      wasUsed: tc.success !== false,
      latencyMs: 0
    }))
    const memoryMetrics = calculateMemoryMetrics([...textEvents, ...toolEvents], messages)

    // Enhanced proactive actions (text + tool-based)
    const textActions = parseProactiveActions(messages)
    const proactiveTools = toolCalls.filter(tc =>
      tc.name === 'cron' ||
      tc.name === 'message' ||
      (tc.name === 'write' && tc.arguments?.path?.includes('memory/'))
    )
    const toolActions = proactiveTools.map(tc => ({
      type: tc.name === 'cron' ? 'maintenance' :
            tc.name === 'message' ? 'alert' : 'maintenance',
      timestamp: tc.timestamp,
      value: tc.name === 'message' ? 'medium' : 'low',
      confidence: 0.9
    }))
    const assistantCount = messages.filter(m => m.role === 'assistant').length
    const proactiveMetrics = calculateProactiveMetrics([...textActions, ...toolActions], assistantCount)

    const recoveryEvents = parseRecoveryEvents(messages)
    const recoveryMetrics = calculateRecoveryMetrics(recoveryEvents)

    // Calculate overall health score (0-100)
    const scores = [
      taskMetrics.completionRate,
      toolMetrics.successRate,
      recoveryMetrics.recoveryRate,
      memoryMetrics.usageRate,
      proactiveMetrics.valueScore
    ].filter(s => s > 0)

    const overallScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0

    res.json({
      overallScore,
      status: overallScore >= 80 ? 'excellent' : overallScore >= 60 ? 'good' : overallScore >= 40 ? 'needs-work' : 'poor',
      tasks: {
        completionRate: Math.round(taskMetrics.completionRate),
        total: taskMetrics.totalTasks
      },
      latency: {
        avgMs: latencyMetrics.avgMs,
        trend: latencyMetrics.trend
      },
      tools: {
        successRate: toolMetrics.successRate,
        total: toolMetrics.totalCalls
      },
      memory: {
        usageRate: memoryMetrics.usageRate,
        effectiveness: memoryMetrics.effectiveness
      },
      proactive: {
        valueScore: proactiveMetrics.valueScore,
        total: proactiveMetrics.totalActions
      },
      recovery: {
        recoveryRate: recoveryMetrics.recoveryRate,
        totalErrors: recoveryMetrics.totalErrors
      },
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.error('Summary API error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
