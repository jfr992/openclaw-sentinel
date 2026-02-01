/**
 * OpenClaw Sentinel Server
 * Clean Architecture entry point
 */

// OTEL must be first import for proper instrumentation
import './instrumentation.js'

import express from 'express'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import path from 'path'
import os from 'os'
import { glob } from 'glob'
import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

import securityRoutes, { alertStore } from './interfaces/http/routes/security.js'
import insightsRoutes from './interfaces/http/routes/insights.js'
import performanceRoutes from './interfaces/http/routes/performance.js'
import { aggregateUsage } from './domain/services/UsageCalculator.js'
import { scoreToolCall, RISK_LEVELS } from './domain/services/RiskScorer.js'
import { OpenClawGatewayClient } from './infrastructure/OpenClawGatewayClient.js'
import { LiveFeed } from './domain/services/LiveFeed.js'
import { BaselineLearner } from './domain/services/BaselineLearner.js'
import { MetricsStore } from './infrastructure/MetricsStore.js'
import { setupOpenAPI } from './openapi.js'

const app = express()
const PORT = process.env.PORT || 5056

// Config
const openclawDir = process.env.OPENCLAW_DIR || path.join(os.homedir(), '.openclaw')
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data')

// Initialize metrics store
const metricsDbPath = path.join(dataDir, 'metrics.db')
let metricsStore = null
try {
  metricsStore = new MetricsStore(metricsDbPath)
  console.log(`[Metrics] SQLite store initialized: ${metricsDbPath}`)
} catch (err) {
  console.warn(`[Metrics] Could not initialize SQLite store: ${err.message}`)
}
const sessionsPattern = path.join(openclawDir, 'agents', '*', 'sessions', '*.jsonl')

// Auto-sync interval (configurable via env var, default 5 minutes)
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS || '300000', 10)

// Sync all metrics to database
async function syncAllMetrics() {
  if (!metricsStore) return

  try {
    const startTime = Date.now()

    // 1. Sync usage metrics (per-agent)
    const { messages, toolCalls, agents } = await parseSessionFiles()
    let usageSynced = 0
    for (const msg of messages) {
      if (msg.usage || msg.message?.usage) {
        metricsStore.recordUsage(msg, msg.agentId || 'main')
        usageSynced++
      }
    }
    for (const tc of toolCalls) {
      metricsStore.recordToolCall(tc, tc.agentId || 'main')
    }

    // 2. Sync performance metrics
    const perfData = await getPerformanceSnapshot()
    if (perfData) {
      metricsStore.recordPerformance(perfData)
    }

    // 3. Sync insights metrics
    const insightsData = await getInsightsSnapshot()
    if (insightsData) {
      metricsStore.recordInsights(insightsData)
    }

    // 4. Sync memory stats
    const memoryData = await getMemorySnapshot()
    if (memoryData) {
      metricsStore.recordMemoryStats(memoryData)
    }

    const syncTime = Date.now() - startTime
    console.log(`[Metrics] Synced: ${usageSynced} usage, perf, insights, memory (${syncTime}ms)`)

  } catch (err) {
    console.error(`[Metrics] Sync error: ${err.message}`)
  }
}

// Get performance snapshot for storage
async function getPerformanceSnapshot() {
  try {
    const { messages, toolCalls } = await parseSessionFiles()
    const { calculateTaskMetrics } = await import('./domain/services/TaskCompletionTracker.js')
    const { extractLatencies, calculateLatencyMetrics } = await import('./domain/services/ResponseLatencyTracker.js')
    const { calculateReliabilityMetrics } = await import('./domain/services/ToolReliabilityTracker.js')
    const { parseRetrievalEvents, calculateMemoryMetrics } = await import('./domain/services/MemoryRetrievalTracker.js')
    const { parseProactiveActions, calculateProactiveMetrics } = await import('./domain/services/ProactiveActionTracker.js')

    const taskMetrics = calculateTaskMetrics(messages)
    const latencies = extractLatencies(messages)
    const latencyMetrics = calculateLatencyMetrics(latencies)
    const toolReliability = calculateReliabilityMetrics(toolCalls)

    // Memory retrieval metrics
    const memoryToolCalls = toolCalls.filter(tc =>
      tc.name === 'memory_search' ||
      (tc.name === 'read' && tc.arguments?.path?.includes('memory/')) ||
      (tc.name === 'read' && tc.arguments?.path?.includes('MEMORY.md'))
    )
    const memoryEvents = memoryToolCalls.map(tc => ({
      type: tc.name === 'memory_search' ? 'vector' : 'file',
      timestamp: tc.timestamp,
      wasUsed: tc.success !== false,
      latencyMs: 0
    }))
    const memoryMetrics = calculateMemoryMetrics(memoryEvents, messages)

    // Proactive action metrics - need to parse tool calls into action format
    const proactiveToolCalls = toolCalls.filter(tc =>
      tc.name === 'cron' ||
      tc.name === 'message' ||
      (tc.name === 'write' && tc.arguments?.path?.includes('memory/'))
    )
    // Convert tool calls to action format expected by calculateProactiveMetrics
    const proactiveActions = proactiveToolCalls.map(tc => ({
      type: tc.name === 'cron' ? 'alert' : tc.name === 'message' ? 'alert' : 'maintenance',
      value: tc.name === 'cron' ? 'medium' : tc.name === 'message' ? 'medium' : 'low',
      timestamp: tc.timestamp
    }))
    const proactiveMetrics = calculateProactiveMetrics(proactiveActions, messages.length)

    return {
      taskCompletionRate: taskMetrics.completionRate || 0,
      avgLatencyMs: latencyMetrics.avgMs || 0,
      toolSuccessRate: toolReliability.successRate || 0,
      memoryUsageRate: memoryMetrics.usageRate || 0,
      proactiveScore: proactiveMetrics.valueScore || 0,
      overallScore: Math.round((taskMetrics.completionRate + toolReliability.successRate) / 2),
      tasksCompleted: taskMetrics.completed || 0,
      toolCallsTotal: toolReliability.total || 0,
      toolCallsFailed: toolReliability.failed || 0
    }
  } catch (err) {
    console.error(`[Metrics] Performance snapshot error: ${err.message}`)
    return null
  }
}

// Get insights snapshot for storage
async function getInsightsSnapshot() {
  try {
    const sessionData = await getSessionData()
    const { calculateCorrectionScore } = await import('./domain/services/SelfCorrectionTracker.js')
    const { analyzeConversation, calculateFeedbackScore } = await import('./domain/services/SentimentAnalyzer.js')
    const { calculateContextHealth } = await import('./domain/services/ContextHealthTracker.js')

    const corrections = calculateCorrectionScore({
      messages: sessionData.messages || [],
      toolCalls: sessionData.toolCalls || [],
      assistantTexts: sessionData.assistantTexts || []
    })

    const userMessages = sessionData.messages?.filter(m => m.role === 'user') || []
    const sentiment = analyzeConversation(userMessages)
    const feedbackScore = calculateFeedbackScore(sentiment)

    const contextHealth = calculateContextHealth({
      assistantTexts: sessionData.assistantTexts || [],
      systemTexts: [],
      toolCalls: sessionData.toolCalls || []
    })

    return {
      healthScore: Math.round(60 - corrections.score * 0.3 + (feedbackScore - 50) * 0.3),
      correctionsCount: corrections.totalCorrections || 0,
      sentimentScore: feedbackScore,
      contextHealth: contextHealth.healthScore || 0,
      confusionSignals: contextHealth.events?.confusionSignals || 0,
      reaskCount: contextHealth.events?.reasksCount || 0
    }
  } catch (err) {
    console.error(`[Metrics] Insights snapshot error: ${err.message}`)
    return null
  }
}

// Get memory stats snapshot for storage
async function getMemorySnapshot() {
  try {
    // Try to get memory stats from the /api/memory endpoint logic
    const openclawDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || '/root', '.openclaw')
    const memoryDir = path.join(openclawDir, 'memory')

    let totals = { agents: 0, files: 0, chunks: 0, cacheEntries: 0, vectorReady: false, ftsReady: false }

    try {
      const { readdirSync, existsSync } = await import('fs')
      const { execSync } = await import('child_process')

      if (existsSync(memoryDir)) {
        const files = readdirSync(memoryDir).filter(f => f.endsWith('.sqlite'))
        totals.agents = files.length

        for (const file of files) {
          const dbPath = path.join(memoryDir, file)
          try {
            // Count files
            const filesResult = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(DISTINCT path) FROM files" 2>/dev/null || echo 0`, { encoding: 'utf-8' })
            totals.files += parseInt(filesResult.trim()) || 0

            // Count chunks
            const chunksResult = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM chunks" 2>/dev/null || echo 0`, { encoding: 'utf-8' })
            totals.chunks += parseInt(chunksResult.trim()) || 0

            // Count cache entries
            const cacheResult = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM embedding_cache" 2>/dev/null || echo 0`, { encoding: 'utf-8' })
            totals.cacheEntries += parseInt(cacheResult.trim()) || 0

            // Check vector readiness (has chunks)
            if (totals.chunks > 0) totals.vectorReady = true
            totals.ftsReady = true // FTS is always available with SQLite
          } catch (e) {
            // Ignore individual DB errors
          }
        }
      }
    } catch (e) {
      // Memory dir not accessible
    }

    return {
      agentsCount: totals.agents,
      filesIndexed: totals.files,
      chunksTotal: totals.chunks,
      cacheEntries: totals.cacheEntries,
      vectorReady: totals.vectorReady,
      ftsReady: totals.ftsReady
    }
  } catch (err) {
    console.error(`[Metrics] Memory snapshot error: ${err.message}`)
    return null
  }
}

// Backfill historical Performance/Insights data
async function backfillHistoricalMetrics() {
  if (!metricsStore) return { error: 'Metrics store not available' }

  console.log('[Backfill] Starting historical metrics backfill...')
  const startTime = Date.now()

  try {
    const { messages, toolCalls } = await parseSessionFiles()

    // Import analysis functions
    const { calculateTaskMetrics } = await import('./domain/services/TaskCompletionTracker.js')
    const { extractLatencies, calculateLatencyMetrics } = await import('./domain/services/ResponseLatencyTracker.js')
    const { calculateReliabilityMetrics } = await import('./domain/services/ToolReliabilityTracker.js')
    const { calculateCorrectionScore } = await import('./domain/services/SelfCorrectionTracker.js')
    const { analyzeConversation, calculateFeedbackScore } = await import('./domain/services/SentimentAnalyzer.js')
    const { calculateContextHealth } = await import('./domain/services/ContextHealthTracker.js')

    // Group messages by 5-minute buckets
    const BUCKET_SIZE_MS = 5 * 60 * 1000
    const buckets = new Map()

    for (const msg of messages) {
      const ts = new Date(msg.timestamp || msg.message?.timestamp).getTime()
      if (isNaN(ts)) continue

      const bucketStart = Math.floor(ts / BUCKET_SIZE_MS) * BUCKET_SIZE_MS
      const bucketKey = new Date(bucketStart).toISOString()

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, { messages: [], toolCalls: [], assistantTexts: [] })
      }

      const bucket = buckets.get(bucketKey)
      bucket.messages.push(msg)

      // Extract assistant text
      if (msg.role === 'assistant' || msg.message?.role === 'assistant') {
        const content = msg.content || msg.message?.content || msg.text || ''
        if (typeof content === 'string') {
          bucket.assistantTexts.push(content)
        }
      }
    }

    // Group tool calls by bucket
    for (const tc of toolCalls) {
      const ts = new Date(tc.timestamp).getTime()
      if (isNaN(ts)) continue

      const bucketStart = Math.floor(ts / BUCKET_SIZE_MS) * BUCKET_SIZE_MS
      const bucketKey = new Date(bucketStart).toISOString()

      if (buckets.has(bucketKey)) {
        buckets.get(bucketKey).toolCalls.push(tc)
      }
    }

    // Process each bucket
    let perfCount = 0, insightsCount = 0

    for (const [bucketKey, data] of buckets) {
      if (data.messages.length === 0) continue

      try {
        // Performance metrics
        const taskMetrics = calculateTaskMetrics(data.messages)
        const latencies = extractLatencies(data.messages)
        const latencyMetrics = calculateLatencyMetrics(latencies)
        const toolReliability = calculateReliabilityMetrics(data.toolCalls)

        const perfStmt = metricsStore.db.prepare(`
          INSERT OR REPLACE INTO performance_metrics
          (bucket_start, task_completion_rate, avg_latency_ms, tool_success_rate,
           overall_score, tasks_completed, tool_calls_total, tool_calls_failed)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)

        perfStmt.run(
          bucketKey,
          taskMetrics.completionRate || 0,
          latencyMetrics.avgMs || 0,
          toolReliability.successRate || 0,
          Math.round((taskMetrics.completionRate + toolReliability.successRate) / 2),
          taskMetrics.completed || 0,
          toolReliability.total || 0,
          toolReliability.failed || 0
        )
        perfCount++

        // Insights metrics
        const corrections = calculateCorrectionScore({
          messages: data.messages,
          toolCalls: data.toolCalls,
          assistantTexts: data.assistantTexts
        })

        const userMessages = data.messages.filter(m =>
          m.role === 'user' || m.message?.role === 'user'
        )
        const sentiment = analyzeConversation(userMessages)
        const feedbackScore = calculateFeedbackScore(sentiment)

        const contextHealth = calculateContextHealth({
          assistantTexts: data.assistantTexts,
          systemTexts: [],
          toolCalls: data.toolCalls
        })

        const healthScore = Math.round(60 - corrections.score * 0.3 + (feedbackScore - 50) * 0.3)

        const insightsStmt = metricsStore.db.prepare(`
          INSERT OR REPLACE INTO insights_metrics
          (bucket_start, health_score, corrections_count, sentiment_score,
           context_health, confusion_signals, reask_count)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)

        insightsStmt.run(
          bucketKey,
          healthScore,
          corrections.totalCorrections || 0,
          feedbackScore,
          contextHealth.healthScore || 0,
          contextHealth.events?.confusionSignals || 0,
          contextHealth.events?.reasksCount || 0
        )
        insightsCount++

      } catch (err) {
        // Skip bucket on error
      }
    }

    const elapsed = Date.now() - startTime
    console.log(`[Backfill] Completed: ${perfCount} perf, ${insightsCount} insights buckets (${elapsed}ms)`)

    return {
      success: true,
      performance: perfCount,
      insights: insightsCount,
      totalBuckets: buckets.size,
      elapsedMs: elapsed
    }

  } catch (err) {
    console.error(`[Backfill] Error: ${err.message}`)
    return { error: err.message }
  }
}

// Middleware
app.use(express.json())

// OpenAPI documentation
setupOpenAPI(app)

// ============================================
// Infrastructure: Session File Repository
// ============================================

let lastParseTime = null
let lastParseStats = { files: 0, messages: 0, toolCalls: 0 }

async function parseSessionFiles(filterAgentId = null) {
  const startTime = Date.now()
  const files = await glob(sessionsPattern)
  const messages = []
  const toolCalls = []
  const toolResults = new Map() // toolCallId -> result
  const agentsSeen = new Set()

  for (const file of files) {
    try {
      // Extract agentId from path: .../agents/{agentId}/sessions/...
      const agentId = path.basename(path.dirname(path.dirname(file)))
      agentsSeen.add(agentId)
      
      // Skip if filtering by agent and this isn't the one
      if (filterAgentId && agentId !== filterAgentId) continue
      
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)

      for (const line of lines) {
        try {
          const entry = JSON.parse(line)

          // Only process message entries
          if (entry.type !== 'message') continue

          const msg = entry.message || {}

          // Extract full message data for performance tracking
          const messageData = {
            id: entry.id,
            role: msg.role,
            timestamp: entry.timestamp,
            model: msg.model,
            stopReason: msg.stopReason,
            usage: msg.usage,
            agentId
          }

          // Extract text content - keep both content (for trackers) and text (for convenience)
          const msgContent = msg.content || []
          messageData.content = msgContent // Keep original for trackers that parse it
          if (typeof msgContent === 'string') {
            messageData.text = msgContent
          } else if (Array.isArray(msgContent)) {
            // Extract text parts
            const textParts = msgContent
              .filter(c => c.type === 'text')
              .map(c => c.text || '')
            if (textParts.length > 0) {
              messageData.text = textParts.join('\n')
            }

            // Extract tool calls from assistant messages
            for (const item of msgContent) {
              if (item.type === 'toolCall' && item.name) {
                const toolCall = {
                  id: item.id,
                  name: item.name,
                  arguments: item.arguments || {},
                  timestamp: entry.timestamp,
                  messageId: entry.id,
                  agentId
                }
                toolCalls.push(toolCall)
              }
            }
          }

          // Handle tool results
          if (msg.role === 'toolResult') {
            const resultContent = Array.isArray(msg.content)
              ? msg.content.map(c => c.text || '').join('\n')
              : (typeof msg.content === 'string' ? msg.content : '')

            toolResults.set(msg.toolCallId, {
              toolCallId: msg.toolCallId,
              toolName: msg.toolName,
              content: resultContent,
              isError: msg.isError || resultContent.includes('"status":"error"'),
              timestamp: entry.timestamp
            })
          }

          messages.push(messageData)
        } catch { /* skip malformed lines */ }
      }
    } catch { /* skip unreadable files */ }
  }

  // Enrich tool calls with their results
  for (const toolCall of toolCalls) {
    const result = toolResults.get(toolCall.id)
    if (result) {
      toolCall.result = result
      toolCall.success = !result.isError
    }
  }

  // Log parsing stats
  const parseTime = Date.now() - startTime
  const newStats = { files: files.length, messages: messages.length, toolCalls: toolCalls.length }

  // Only log if stats changed or first parse
  if (!lastParseTime ||
      newStats.messages !== lastParseStats.messages ||
      newStats.toolCalls !== lastParseStats.toolCalls) {
    console.log(`[Data] Parsed ${files.length} files: ${messages.length} messages, ${toolCalls.length} tool calls (${parseTime}ms)`)
  }
  lastParseTime = Date.now()
  lastParseStats = newStats

  return { messages, toolCalls, toolResults: Array.from(toolResults.values()), agents: Array.from(agentsSeen).sort() }
}

// Helper to get recent tool calls (for routes)
async function getRecentToolCalls(limit = 100) {
  const { toolCalls } = await parseSessionFiles()
  return toolCalls
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    .slice(0, limit)
}

// Helper to get session data for insights
async function getSessionData() {
  const { messages, toolCalls } = await parseSessionFiles()

  // Extract assistant text content
  const assistantTexts = []
  for (const msg of messages) {
    if (msg.role === 'assistant' && typeof msg.content === 'string') {
      assistantTexts.push(msg.content)
    }
  }

  return { messages, toolCalls, assistantTexts }
}

// Helper to get user messages for sentiment analysis
async function getUserMessages() {
  const files = await glob(sessionsPattern)
  const userMessages = []

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)

      for (const line of lines) {
        try {
          const entry = JSON.parse(line)
          const msg = entry.message || {}

          if (msg.role === 'user' && msg.content) {
            // Extract text content
            let text = ''
            if (typeof msg.content === 'string') {
              text = msg.content
            } else if (Array.isArray(msg.content)) {
              text = msg.content
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join(' ')
            }

            if (text) {
              userMessages.push({
                text,
                timestamp: entry.timestamp
              })
            }
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  return userMessages.sort((a, b) =>
    (a.timestamp || '').localeCompare(b.timestamp || '')
  )
}

// Helper to get context data for health tracking
async function getContextData() {
  const files = await glob(sessionsPattern)
  const assistantTexts = []
  const systemTexts = []
  const toolCalls = []
  let totalMessages = 0

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)

      for (const line of lines) {
        try {
          const entry = JSON.parse(line)
          const msg = entry.message || {}
          totalMessages++

          // Extract assistant text
          if (msg.role === 'assistant') {
            if (typeof msg.content === 'string') {
              assistantTexts.push(msg.content)
            } else if (Array.isArray(msg.content)) {
              const text = msg.content
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join(' ')
              if (text) assistantTexts.push(text)
            }
          }

          // Extract system messages
          if (msg.role === 'system' || entry.type === 'system') {
            const text = typeof msg.content === 'string' ? msg.content :
                        (msg.text || entry.text || '')
            if (text) systemTexts.push(text)
          }

          // Extract tool calls
          if (Array.isArray(msg.content)) {
            for (const item of msg.content) {
              if (item.type === 'toolCall' && item.name) {
                toolCalls.push({
                  name: item.name,
                  arguments: item.arguments || {},
                  timestamp: entry.timestamp
                })
              }
            }
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  return { assistantTexts, systemTexts, toolCalls, totalMessages }
}

// Make helpers available to routes
app.locals.getRecentToolCalls = getRecentToolCalls
app.locals.getSessionData = getSessionData
app.locals.getUserMessages = getUserMessages
app.locals.getContextData = getContextData

// ============================================
// API Routes
// ============================================

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [Health]
 *     summary: Health check
 *     description: Returns server status and data parsing stats
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    data: {
      lastParse: lastParseTime ? new Date(lastParseTime).toISOString() : null,
      stats: lastParseStats
    }
  })
})

/**
 * @openapi
 * /api/agents:
 *   get:
 *     tags: [Health]
 *     summary: List all agents
 *     description: Returns list of all agent IDs found in session files
 *     responses:
 *       200:
 *         description: List of agents
 */
app.get('/api/agents', async (req, res) => {
  try {
    const { agents } = await parseSessionFiles()
    
    // Also get from metrics store if available
    const dbAgents = metricsStore ? metricsStore.listAgents() : []
    
    // Combine and dedupe
    const allAgents = [...new Set([...agents, ...dbAgents])].sort()
    
    res.json({
      agents: allAgents,
      count: allAgents.length
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Activity endpoint (for dashboard)
app.get('/api/activity', async (req, res) => {
  try {
    const { toolCalls } = await parseSessionFiles()

    // Get recent tool calls as file operations
    const fileOps = toolCalls
      .filter(tc => ['read', 'write', 'edit', 'exec'].includes(tc.tool?.toLowerCase()))
      .slice(0, 50)
      .map(tc => ({
        id: tc.id || `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: tc.tool,
        path: tc.args?.path || tc.args?.file_path || tc.args?.command || 'unknown',
        timestamp: tc.timestamp,
        risk: tc.risk || 'low'
      }))

    // Get network connections (placeholder - would need actual network monitoring)
    const connections = []

    res.json({
      file_ops: fileOps,
      tool_calls: toolCalls.slice(0, 50),
      connections,
      updated: new Date().toISOString()
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Alerts endpoint
app.get('/api/alerts', (req, res) => {
  const limit = parseInt(req.query.limit) || 50
  res.json(alertStore.getRecent(limit))
})

// OpenClaw Memory Status (reads SQLite directly, falls back to CLI)
app.get('/api/memory', async (req, res) => {
  const memoryDir = path.join(openclawDir, 'memory')

  // Try to read SQLite databases directly (works in Docker with mounted volume)
  try {
    const dbFiles = await fs.promises.readdir(memoryDir).catch(() => [])
    const sqliteFiles = dbFiles.filter(f => f.endsWith('.sqlite'))

    if (sqliteFiles.length > 0) {
      const agents = []
      let totalFiles = 0
      let totalChunks = 0
      let totalCache = 0

      for (const dbFile of sqliteFiles) {
        const dbPath = path.join(memoryDir, dbFile)
        const agentId = dbFile.replace('.sqlite', '')

        try {
          // Use sqlite3 CLI to query (available in most containers)
          const { stdout: filesOut } = await execAsync(
            `sqlite3 "${dbPath}" "SELECT COUNT(*), COALESCE(SUM(size), 0) FROM files" 2>/dev/null`,
            { timeout: 5000 }
          ).catch(() => ({ stdout: '0|0' }))

          const { stdout: chunksOut } = await execAsync(
            `sqlite3 "${dbPath}" "SELECT COUNT(*) FROM chunks" 2>/dev/null`,
            { timeout: 5000 }
          ).catch(() => ({ stdout: '0' }))

          const { stdout: cacheOut } = await execAsync(
            `sqlite3 "${dbPath}" "SELECT COUNT(*) FROM embedding_cache" 2>/dev/null`,
            { timeout: 5000 }
          ).catch(() => ({ stdout: '0' }))

          const [fileCount, fileSize] = filesOut.trim().split('|').map(Number)
          const chunkCount = parseInt(chunksOut.trim()) || 0
          const cacheCount = parseInt(cacheOut.trim()) || 0

          totalFiles += fileCount || 0
          totalChunks += chunkCount
          totalCache += cacheCount

          agents.push({
            id: agentId,
            files: fileCount || 0,
            fileSize: fileSize || 0,
            chunks: chunkCount,
            cache: { entries: cacheCount },
            vector: { enabled: chunkCount > 0, available: chunkCount > 0, dims: 1536 },
            fts: { enabled: true, available: true },
            sources: [],
            issues: []
          })
        } catch (dbErr) {
          console.error(`Error reading ${dbFile}:`, dbErr.message)
        }
      }

      if (agents.length > 0) {
        return res.json({
          agents,
          totals: {
            agents: agents.length,
            files: totalFiles,
            chunks: totalChunks,
            cacheEntries: totalCache,
            vectorReady: totalChunks > 0,
            ftsReady: true
          },
          timestamp: new Date().toISOString(),
          source: 'sqlite'
        })
      }
    }
  } catch (sqliteErr) {
    console.log('SQLite direct read failed, trying CLI:', sqliteErr.message)
  }

  // Fallback: try CLI (works when running natively)
  try {
    const env = {
      ...process.env,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OPENAI_API_KEY: '' // Force Gemini
    }

    const { stdout } = await execAsync('openclaw memory status --json 2>/dev/null', {
      env,
      timeout: 15000
    })

    // Extract JSON from output (skip doctor warnings)
    const jsonStart = stdout.indexOf('[')
    const jsonEnd = stdout.lastIndexOf(']') + 1
    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error('No JSON in output')
    }
    const jsonStr = stdout.slice(jsonStart, jsonEnd)
    const data = JSON.parse(jsonStr)

    // Transform to simpler format
    const agents = data.map(agent => ({
      id: agent.agentId,
      files: agent.status?.files || 0,
      chunks: agent.status?.chunks || 0,
      provider: agent.status?.provider || 'unknown',
      model: agent.status?.model || 'unknown',
      dirty: agent.status?.dirty || false,
      cache: agent.status?.cache || {},
      vector: {
        enabled: agent.status?.vector?.enabled || false,
        available: agent.status?.vector?.available || false,
        dims: agent.status?.vector?.dims || 0
      },
      fts: {
        enabled: agent.status?.fts?.enabled || false,
        available: agent.status?.fts?.available || false
      },
      batch: agent.status?.batch || {},
      sources: agent.status?.sourceCounts || [],
      issues: agent.scan?.issues || []
    }))

    const totals = {
      agents: agents.length,
      files: agents.reduce((sum, a) => sum + a.files, 0),
      chunks: agents.reduce((sum, a) => sum + a.chunks, 0),
      cacheEntries: agents.reduce((sum, a) => sum + (a.cache?.entries || 0), 0),
      vectorReady: agents.every(a => a.vector.available),
      ftsReady: agents.every(a => a.fts.available)
    }

    res.json({ agents, totals, timestamp: new Date().toISOString(), source: 'cli' })
  } catch (err) {
    console.error('Memory API error:', err.message)
    // Return a graceful response for Docker/environments without openclaw CLI
    res.json({
      agents: [],
      totals: {
        agents: 0,
        files: 0,
        chunks: 0,
        cacheEntries: 0,
        vectorReady: false,
        ftsReady: false
      },
      timestamp: new Date().toISOString(),
      unavailable: true,
      message: 'Memory databases not found. Mount ~/.openclaw to /data or run natively.'
    })
  }
})

/**
 * @openapi
 * /api/usage:
 *   get:
 *     tags: [Usage]
 *     summary: Get usage statistics
 *     description: Returns token usage, costs, and recent tool calls
 *     responses:
 *       200:
 *         description: Usage statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UsageResponse'
 */
app.get('/api/usage', async (req, res) => {
  try {
    const { messages, toolCalls } = await parseSessionFiles()
    const usage = aggregateUsage(messages)

    // Add tool calls
    usage.toolCalls = toolCalls
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      .slice(0, 50)

    res.json(usage)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ============================================
// Usage Metrics API (SQLite-backed)
// ============================================

/**
 * @openapi
 * /api/metrics/query:
 *   get:
 *     tags: [Metrics]
 *     summary: Query historical usage metrics
 *     description: Returns usage metrics aggregated by time buckets
 *     parameters:
 *       - name: start
 *         in: query
 *         description: Start timestamp (ISO 8601)
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: end
 *         in: query
 *         description: End timestamp (ISO 8601)
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: granularity
 *         in: query
 *         description: Time bucket size
 *         schema:
 *           type: string
 *           enum: [5min, hour, day]
 *           default: hour
 *     responses:
 *       200:
 *         description: Historical metrics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MetricsQuery'
 */
app.get('/api/metrics/query', (req, res) => {
  if (!metricsStore) {
    return res.status(503).json({ error: 'Metrics store not available' })
  }

  try {
    const now = new Date()
    const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const start = req.query.start || defaultStart.toISOString()
    const end = req.query.end || now.toISOString()
    const granularity = req.query.granularity || 'hour'
    const agentId = req.query.agent || null // Filter by agent (null = all)

    const data = metricsStore.queryUsage(start, end, granularity, agentId)
    const summary = metricsStore.getSummary(start, end, agentId)
    const byModel = metricsStore.queryByModel(start, end, agentId)

    res.json({
      range: { start, end, granularity },
      summary,
      byModel,
      timeseries: data
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/metrics/summary
 * Quick summary for a time range
 */
app.get('/api/metrics/summary', (req, res) => {
  if (!metricsStore) {
    return res.status(503).json({ error: 'Metrics store not available' })
  }

  try {
    const now = new Date()
    const ranges = {
      '5min': 5 * 60 * 1000,
      '1hour': 60 * 60 * 1000,
      '24hours': 24 * 60 * 60 * 1000,
      '7days': 7 * 24 * 60 * 60 * 1000,
      '30days': 30 * 24 * 60 * 60 * 1000
    }

    const agentId = req.query.agent || null
    
    const result = {}
    for (const [label, ms] of Object.entries(ranges)) {
      const start = new Date(now.getTime() - ms).toISOString()
      result[label] = metricsStore.getSummary(start, now.toISOString(), agentId)
    }

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/metrics/sync
 * Sync historical data from session files to metrics DB
 */
app.post('/api/metrics/sync', async (req, res) => {
  if (!metricsStore) {
    return res.status(503).json({ error: 'Metrics store not available' })
  }

  try {
    const { messages, toolCalls } = await parseSessionFiles()
    let synced = 0

    for (const msg of messages) {
      if (msg.usage || msg.message?.usage) {
        metricsStore.recordUsage(msg)
        synced++
      }
    }

    for (const tc of toolCalls) {
      metricsStore.recordToolCall(tc)
    }

    res.json({
      synced,
      toolCalls: toolCalls.length,
      message: `Synced ${synced} messages and ${toolCalls.length} tool calls`
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/metrics/backfill
 * Backfill historical performance and insights data
 */
app.post('/api/metrics/backfill', async (req, res) => {
  try {
    const result = await backfillHistoricalMetrics()
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/metrics/migrate
 * Full migration: re-sync ALL historical data from session files
 * This is a comprehensive import that covers usage, performance, insights
 */
app.post('/api/metrics/migrate', async (req, res) => {
  if (!metricsStore) {
    return res.status(503).json({ error: 'Metrics store not available' })
  }

  console.log('[Migration] Starting full data migration...')
  const startTime = Date.now()
  const stats = { usage: 0, performance: 0, insights: 0, memory: 0 }

  try {
    const { messages, toolCalls } = await parseSessionFiles()

    // 1. USAGE METRICS - Re-sync all from session files
    console.log('[Migration] Step 1: Usage metrics...')
    for (const msg of messages) {
      if (msg.usage || msg.message?.usage) {
        metricsStore.recordUsage(msg)
        stats.usage++
      }
    }
    for (const tc of toolCalls) {
      metricsStore.recordToolCall(tc)
    }

    // 2. PERFORMANCE & INSIGHTS - Use existing backfill
    console.log('[Migration] Step 2: Performance & Insights metrics...')
    const backfillResult = await backfillHistoricalMetrics()
    stats.performance = backfillResult.performance || 0
    stats.insights = backfillResult.insights || 0

    // 3. MEMORY STATS - Record current snapshot
    console.log('[Migration] Step 3: Memory stats...')
    const memoryData = await getMemorySnapshot()
    if (memoryData) {
      metricsStore.recordMemoryStats(memoryData)
      stats.memory = 1
    }

    const elapsed = Date.now() - startTime
    console.log(`[Migration] Complete: ${stats.usage} usage, ${stats.performance} perf, ${stats.insights} insights (${elapsed}ms)`)

    res.json({
      success: true,
      stats,
      totalMessages: messages.length,
      totalToolCalls: toolCalls.length,
      elapsedMs: elapsed
    })
  } catch (err) {
    console.error(`[Migration] Error: ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// Legacy backfill endpoint (kept for compatibility)
app.post('/api/metrics/backfill-legacy', async (req, res) => {
  try {
    const result = await backfillHistoricalMetrics()
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/metrics/performance
 * Query historical performance metrics
 */
app.get('/api/metrics/performance', (req, res) => {
  if (!metricsStore) {
    return res.status(503).json({ error: 'Metrics store not available' })
  }

  try {
    const now = new Date()
    const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const start = req.query.start || defaultStart.toISOString()
    const end = req.query.end || now.toISOString()
    const granularity = req.query.granularity || 'hour'
    const agentId = req.query.agent || null

    const data = metricsStore.queryPerformance(start, end, granularity, agentId)

    res.json({
      range: { start, end, granularity, agent: agentId },
      timeseries: data
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/metrics/insights
 * Query historical insights metrics
 */
app.get('/api/metrics/insights', (req, res) => {
  if (!metricsStore) {
    return res.status(503).json({ error: 'Metrics store not available' })
  }

  try {
    const now = new Date()
    const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const start = req.query.start || defaultStart.toISOString()
    const end = req.query.end || now.toISOString()
    const granularity = req.query.granularity || 'hour'
    const agentId = req.query.agent || null

    const data = metricsStore.queryInsights(start, end, granularity, agentId)

    res.json({
      range: { start, end, granularity },
      timeseries: data
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/metrics/memory
 * Query historical memory stats
 */
app.get('/api/metrics/memory', (req, res) => {
  if (!metricsStore) {
    return res.status(503).json({ error: 'Metrics store not available' })
  }

  try {
    const now = new Date()
    const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const start = req.query.start || defaultStart.toISOString()
    const end = req.query.end || now.toISOString()
    const granularity = req.query.granularity || 'hour'

    const data = metricsStore.queryMemoryStats(start, end, granularity)

    res.json({
      range: { start, end, granularity },
      timeseries: data
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/metrics/security
 * Query historical security events
 */
app.get('/api/metrics/security', (req, res) => {
  if (!metricsStore) {
    return res.status(503).json({ error: 'Metrics store not available' })
  }

  try {
    const now = new Date()
    const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const start = req.query.start || defaultStart.toISOString()
    const end = req.query.end || now.toISOString()

    const events = metricsStore.querySecurityEvents(start, end, {
      limit: parseInt(req.query.limit) || 100,
      severity: req.query.severity,
      unacknowledgedOnly: req.query.unacked === 'true'
    })

    const summary = metricsStore.getSecuritySummary(start, end)

    res.json({
      range: { start, end },
      summary,
      events
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Sessions list
app.get('/api/sessions', async (req, res) => {
  try {
    const files = await glob(sessionsPattern)
    const sessions = []

    for (const file of files) {
      try {
        const stat = fs.statSync(file)
        const sessionKey = path.basename(file, '.jsonl')
        const agentId = path.basename(path.dirname(path.dirname(file)))
        const content = fs.readFileSync(file, 'utf-8')
        const lines = content.trim().split('\n').filter(Boolean)

        sessions.push({
          key: sessionKey,
          agent: agentId,
          messageCount: lines.length,
          lastModified: stat.mtime.toISOString()
        })
      } catch { /* skip */ }
    }

    sessions.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''))
    res.json({ sessions: sessions.slice(0, 20) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Security routes
app.use('/api/security', securityRoutes)

// Insights routes (self-correction, sentiment)
app.use('/api/insights', insightsRoutes)

// Performance routes (tasks, latency, tools, memory, proactive, recovery)
app.use('/api/performance', performanceRoutes)

// ============================================
// WebSocket: Real-time Security Alerts
// ============================================

const server = createServer(app)

// Single WebSocketServer, handle paths manually
const wss = new WebSocketServer({ noServer: true })

// Handle upgrade requests
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname

  if (pathname === '/ws/security' || pathname === '/ws/live') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws._path = pathname
      wss.emit('connection', ws, request)
    })
  } else {
    socket.destroy()
  }
})

const wsClients = new Set()
const liveClients = new Set()

wss.on('connection', (ws, request) => {
  const pathname = ws._path || new URL(request.url, `http://${request.headers.host}`).pathname

  if (pathname === '/ws/security') {
    // Security WebSocket handler
    console.log('[WS Security] Client connected')
    wsClients.add(ws)

    // Send current risk level on connect
    getRecentToolCalls(100).then(toolCalls => {
      const { calculateSessionRisk } = require('./domain/services/RiskScorer.js')
      const assessment = calculateSessionRisk(toolCalls)
      ws.send(JSON.stringify({
        type: 'risk_update',
        data: {
          level: assessment.level,
          levelName: assessment.levelName,
          totalRisks: assessment.totalRisks
        }
      }))
    }).catch(() => {})

    ws.on('close', () => {
      wsClients.delete(ws)
      console.log('[WS Security] Client disconnected')
    })

    ws.on('error', (err) => {
      console.error('[WS Security] Error:', err.message)
      wsClients.delete(ws)
    })
  } else if (pathname === '/ws/live') {
    // Live feed WebSocket handler
    console.log('[WS Live] Client connected')
    liveClients.add(ws)

    // Send initial snapshot
    ws.send(JSON.stringify({
      type: 'snapshot',
      data: liveFeed.getSnapshot()
    }))

    ws.on('close', () => {
      liveClients.delete(ws)
      console.log('[WS Live] Client disconnected')
    })

    ws.on('error', (err) => {
      console.error('[WS Live] Error:', err.message)
      liveClients.delete(ws)
    })
  }
})

// Broadcast to all connected clients
function broadcastAlert(alert) {
  const message = JSON.stringify({ type: 'alert', data: alert })
  for (const client of wsClients) {
    if (client.readyState === 1) { // OPEN
      client.send(message)
    }
  }
}

// Export for use by alert store
export { broadcastAlert }

// ============================================
// Periodic Risk Check (for real-time alerts)
// ============================================

let lastToolCallCount = 0

async function checkForNewRisks() {
  try {
    const toolCalls = await getRecentToolCalls(50)

    // Check if there are new tool calls
    if (toolCalls.length !== lastToolCallCount) {
      lastToolCallCount = toolCalls.length

      // Score the most recent calls
      for (const tc of toolCalls.slice(0, 5)) {
        const risks = scoreToolCall(tc)
        for (const risk of risks) {
          if (risk.level >= RISK_LEVELS.HIGH) {
            const alert = {
              ...risk,
              toolCall: tc.name,
              timestamp: tc.timestamp || new Date().toISOString()
            }

            // Check if already alerted (dedup)
            const exists = alertStore.alerts.some(
              a => a.match === risk.match &&
                   Math.abs(Date.now() - new Date(a.timestamp).getTime()) < 30000
            )

            if (!exists) {
              alertStore.add(alert)
              broadcastAlert(alert)
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[RiskCheck] Error:', err.message)
  }
}

// Check every 5 seconds
setInterval(checkForNewRisks, 5000)

// ============================================
// WebSocket: Live Feed (OpenClaw Gateway Relay)
// ============================================

const liveFeed = new LiveFeed()
const baselineLearner = new BaselineLearner()

// Seed baseline from historical session data
async function refreshBaselineFromHistory() {
  try {
    const { toolCalls } = await parseSessionFiles()
    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        baselineLearner.recordToolCall({
          name: tc.name,
          arguments: tc.arguments
        })
      }
      return toolCalls.length
    }
  } catch (err) {
    console.error('[Baseline] Refresh failed:', err.message)
  }
  return 0
}

// Initial seed on startup
;(async () => {
  const count = await refreshBaselineFromHistory()
  if (count > 0) {
    console.log(`[Baseline] Seeded from ${count} historical tool calls`)
    console.log(`[Baseline] Status:`, baselineLearner.getStatus().stats)
  }
})()

// Refresh baseline every 5 minutes from session files (picks up new activity)
setInterval(async () => {
  const prevStats = { ...baselineLearner.getStatus().stats }
  await refreshBaselineFromHistory()
  const newStats = baselineLearner.getStatus().stats

  // Log if stats changed
  if (newStats.commandsLearned !== prevStats.commandsLearned ||
      newStats.toolsLearned !== prevStats.toolsLearned) {
    console.log(`[Baseline] Refreshed: ${newStats.toolsLearned} tools, ${newStats.commandsLearned} commands`)
  }
}, 5 * 60 * 1000)

// Train baseline from live feed tool calls
liveFeed.on('activity', (event) => {
  if (event.tool) {
    baselineLearner.recordToolCall({
      name: event.tool,
      arguments: event.toolInput
    })
  }
})

// OpenClaw Gateway Client
const gatewayClient = new OpenClawGatewayClient({
  url: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
  token: process.env.OPENCLAW_GATEWAY_TOKEN
})

gatewayClient.on('connected', ({ protocol, snapshot }) => {
  console.log(`[Gateway] Connected (protocol v${protocol})`)
  if (snapshot?.presence) {
    console.log(`[Gateway] Presence: ${snapshot.presence.length} clients`)
  }
})

// Throttle gateway error/disconnect logs (1 per minute max)
let lastGatewayLog = 0
const GATEWAY_LOG_THROTTLE = 60000

gatewayClient.on('disconnected', ({ code, reason }) => {
  const now = Date.now()
  if (now - lastGatewayLog > GATEWAY_LOG_THROTTLE) {
    console.log(`[Gateway] Disconnected (${code}): ${reason} (throttled - will retry silently)`)
    lastGatewayLog = now
  }
})

gatewayClient.on('error', (err) => {
  const now = Date.now()
  if (now - lastGatewayLog > GATEWAY_LOG_THROTTLE) {
    console.error(`[Gateway] Error: ${err.message} (throttled - will retry silently)`)
    lastGatewayLog = now
  }
})

gatewayClient.on('event', (eventData) => {
  // Process through LiveFeed
  liveFeed.processEvent(eventData)
})

// LiveFeed broadcasts to /ws/live clients
liveFeed.on('activity', (event) => {
  broadcastLive({ type: 'activity', data: event })
})

liveFeed.on('run:start', (run) => {
  broadcastLive({ type: 'run:start', data: run })
})

liveFeed.on('run:complete', (run) => {
  broadcastLive({ type: 'run:complete', data: run })
})

liveFeed.on('risk:alert', (alert) => {
  broadcastLive({ type: 'risk:alert', data: alert })
  // Also broadcast to security clients
  broadcastAlert(alert)
})

function broadcastLive(message) {
  const json = JSON.stringify(message)
  for (const client of liveClients) {
    if (client.readyState === 1) {
      client.send(json)
    }
  }
}

// API: Live feed stats
app.get('/api/live/stats', (req, res) => {
  res.json({
    gateway: gatewayClient.getStats(),
    feed: liveFeed.getStats(),
    clients: liveClients.size
  })
})

// API: Gateway status (for frontend connection indicator)
app.get('/api/gateway/status', (req, res) => {
  res.json({
    connected: gatewayClient.connected,
    url: gatewayClient.url,
    reconnects: gatewayClient.reconnectAttempts || 0
  })
})

// API: Baseline status
app.get('/api/baseline/status', (req, res) => {
  res.json(baselineLearner.getStatus())
})

// API: Baseline top patterns
app.get('/api/baseline/patterns', (req, res) => {
  const limit = parseInt(req.query.limit) || 10
  res.json(baselineLearner.getTopPatterns(limit))
})

// API: Check if tool call is anomaly
app.post('/api/baseline/check', express.json(), (req, res) => {
  const result = baselineLearner.isAnomaly(req.body)
  res.json(result)
})

// API: Whitelist a command/path/tool
app.post('/api/baseline/whitelist', express.json(), (req, res) => {
  const { type, value } = req.body
  if (!type || !value) {
    return res.status(400).json({ error: 'type and value required' })
  }
  const success = baselineLearner.whitelist(type, value)
  res.json({ success, message: success ? 'Added to whitelist' : 'Invalid type or already whitelisted' })
})

// API: Update baseline config
app.patch('/api/baseline/config', express.json(), (req, res) => {
  baselineLearner.updateConfig(req.body)
  res.json({ success: true, config: baselineLearner.getStatus().config })
})

// API: Reset baseline learning
app.post('/api/baseline/reset', (req, res) => {
  baselineLearner.reset()
  res.json({ success: true, message: 'Baseline reset, learning restarted' })
})

// API: Refresh baseline from session files
app.post('/api/baseline/refresh', async (req, res) => {
  const count = await refreshBaselineFromHistory()
  res.json({
    success: true,
    toolCallsProcessed: count,
    stats: baselineLearner.getStatus().stats
  })
})

// API: Recent activity
app.get('/api/live/events', (req, res) => {
  const limit = parseInt(req.query.limit) || 100
  res.json({
    events: liveFeed.getRecentEvents(limit),
    activeRuns: liveFeed.getActiveRuns(),
    completedRuns: liveFeed.getCompletedRuns(20)
  })
})

// Start gateway connection
gatewayClient.connect()

// ============================================
// Static files (Vite build)
// ============================================

const clientDist = path.join(process.cwd(), 'dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  // Express 5 requires named params for wildcards
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// ============================================
// Start Server
// ============================================

function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return 'localhost'
}

// Bind address: 127.0.0.1 for security (native), 0.0.0.0 for Docker (set via env)
const BIND_ADDRESS = process.env.BIND_ADDRESS || '127.0.0.1'

server.listen(PORT, BIND_ADDRESS, async () => {
  console.log(`
🦞 OpenClaw Sentinel
   Local:   http://localhost:${PORT}
   ${BIND_ADDRESS === '0.0.0.0' ? `Network: http://${getLocalIP()}:${PORT}` : '   (bound to localhost only)'}

   WebSocket endpoints:
   • /ws/live     — Real-time agent activity (via OpenClaw Gateway)
   • /ws/security — Security alerts

   Gateway: ${gatewayClient.url}
`)

  // Initial sync on startup
  if (metricsStore) {
    console.log('[Metrics] Running initial sync...')
    await syncAllMetrics()

    // Check if we need to backfill historical data
    const perfCount = metricsStore.db.prepare('SELECT COUNT(*) as c FROM performance_metrics').get().c
    const insightsCount = metricsStore.db.prepare('SELECT COUNT(*) as c FROM insights_metrics').get().c

    if (perfCount < 10 || insightsCount < 10) {
      console.log('[Metrics] Low historical data detected, running backfill...')
      const result = await backfillHistoricalMetrics()
      console.log(`[Metrics] Backfill complete: ${result.performance} perf, ${result.insights} insights`)
    }

    // Auto-sync every 5 minutes
    setInterval(syncAllMetrics, SYNC_INTERVAL_MS)
    console.log('[Metrics] Auto-sync enabled (every 5 minutes)')
  }
})
