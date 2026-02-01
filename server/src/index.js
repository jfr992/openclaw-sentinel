/**
 * OpenClaw Sentinel Server
 * Clean Architecture entry point
 */
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

const app = express()
const PORT = process.env.PORT || 5056

// Config
const openclawDir = process.env.OPENCLAW_DIR || path.join(os.homedir(), '.openclaw')
const sessionsPattern = path.join(openclawDir, 'agents', '*', 'sessions', '*.jsonl')

// Middleware
app.use(express.json())

// ============================================
// Infrastructure: Session File Repository
// ============================================

async function parseSessionFiles() {
  const files = await glob(sessionsPattern)
  const messages = []
  const toolCalls = []
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line)
          const msg = entry.message || {}
          
          // Extract usage data
          if (msg.usage) {
            messages.push({
              model: msg.model,
              timestamp: entry.timestamp,
              usage: msg.usage
            })
          }
          
          // Extract tool calls from content
          const content = msg.content || []
          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'toolCall' && item.name) {
                toolCalls.push({
                  name: item.name,
                  arguments: item.arguments || {},
                  timestamp: entry.timestamp
                })
              }
            }
          }
        } catch { /* skip malformed lines */ }
      }
    } catch { /* skip unreadable files */ }
  }
  
  return { messages, toolCalls }
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
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

// Usage stats (from domain service)
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

gatewayClient.on('disconnected', ({ code, reason }) => {
  console.log(`[Gateway] Disconnected (${code}): ${reason}`)
})

gatewayClient.on('error', (err) => {
  console.error(`[Gateway] Error: ${err.message}`)
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
🦞 OpenClaw Sentinel
   Local:   http://localhost:${PORT}
   Network: http://${getLocalIP()}:${PORT}
   
   WebSocket endpoints:
   • /ws/live     — Real-time agent activity (via OpenClaw Gateway)
   • /ws/security — Security alerts
   
   Gateway: ${gatewayClient.url}
`)
})
