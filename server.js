/**
 * Simple Express server to serve session data from JSONL files
 * Same approach as MoltBot Guardian's /api/usage endpoint
 */
import express from 'express'
import { createServer as createViteServer } from 'vite'
import fs from 'fs'
import path from 'path'
import { glob } from 'glob'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import performanceRoutes from './server/src/interfaces/http/routes/performance.js'

const execAsync = promisify(exec)

const app = express()
const PORT = 5055

// Find OpenClaw config directory
const openclawDir = process.env.OPENCLAW_DIR || path.join(os.homedir(), '.openclaw')
const sessionsPattern = path.join(openclawDir, 'agents', '*', 'sessions', '*.jsonl')

// Helper: Parse all session messages (used by performance routes)
async function getSessionData() {
  const files = await glob(sessionsPattern)
  const messages = []
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line)
          const msg = entry.message || {}
          msg._timestamp = entry.timestamp
          messages.push(msg)
        } catch (e) {
          // Skip malformed lines
        }
      }
    } catch (e) {
      // Skip unreadable files
    }
  }
  
  return { messages }
}

// Inject getSessionData into app.locals for performance routes
app.locals.getSessionData = getSessionData

// Mount performance routes
app.use('/api/performance', performanceRoutes)

// Jaeger API proxy (for traces tab)
const JAEGER_URL = process.env.JAEGER_URL || 'http://localhost:16686'

app.get('/api/traces', async (req, res) => {
  try {
    const { service = 'cangrejo-memory', limit = 20 } = req.query
    const url = `${JAEGER_URL}/api/traces?service=${service}&limit=${limit}`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Jaeger returned ${response.status}`)
    const data = await response.json()
    res.json(data)
  } catch (err) {
    console.error('Jaeger proxy error:', err.message)
    res.status(502).json({ error: err.message, hint: 'Is Jaeger running on port 16686?' })
  }
})

app.get('/api/traces/services', async (req, res) => {
  try {
    const response = await fetch(`${JAEGER_URL}/api/services`)
    if (!response.ok) throw new Error(`Jaeger returned ${response.status}`)
    const data = await response.json()
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// API: Get usage stats from session files
app.get('/api/usage', async (req, res) => {
  try {
    const files = await glob(sessionsPattern)
    
    const usage = {
      totalInput: 0,
      totalOutput: 0,
      totalCacheRead: 0,
      totalCacheWrite: 0,
      totalCost: 0,
      messageCount: 0,
      sessionsAnalyzed: 0,
      byModel: {},
      byDay: {},
      toolCalls: [],
      recentMessages: []
    }

    for (const file of files) {
      try {
        usage.sessionsAnalyzed++
        const content = fs.readFileSync(file, 'utf-8')
        const lines = content.trim().split('\n').filter(Boolean)

        for (const line of lines) {
          try {
            const entry = JSON.parse(line)
            const msg = entry.message || {}
            const msgUsage = msg.usage || {}

            if (msgUsage.input || msgUsage.output) {
              usage.messageCount++
              usage.totalInput += msgUsage.input || 0
              usage.totalOutput += msgUsage.output || 0
              usage.totalCacheRead += msgUsage.cacheRead || 0
              usage.totalCacheWrite += msgUsage.cacheWrite || 0
              usage.totalCost += msgUsage.cost?.total || 0

              // By model
              const model = msg.model || 'unknown'
              if (!usage.byModel[model]) {
                usage.byModel[model] = { tokens: 0, cost: 0, calls: 0 }
              }
              usage.byModel[model].tokens += (msgUsage.input || 0) + (msgUsage.output || 0)
              usage.byModel[model].cost += msgUsage.cost?.total || 0
              usage.byModel[model].calls++

              // By day
              const ts = entry.timestamp || ''
              if (ts) {
                const day = ts.slice(0, 10)
                if (!usage.byDay[day]) {
                  usage.byDay[day] = { tokens: 0, cost: 0 }
                }
                usage.byDay[day].tokens += (msgUsage.input || 0) + (msgUsage.output || 0)
                usage.byDay[day].cost += msgUsage.cost?.total || 0
              }

              // Recent messages (last 20)
              if (usage.recentMessages.length < 20) {
                usage.recentMessages.push({
                  model,
                  tokens: (msgUsage.input || 0) + (msgUsage.output || 0),
                  cost: msgUsage.cost?.total || 0,
                  timestamp: entry.timestamp,
                  cacheRead: msgUsage.cacheRead || 0
                })
              }
            }

            // Tool calls - check content array for toolCall type
            const content = msg.content || []
            if (Array.isArray(content)) {
              for (const item of content) {
                if (item.type === 'toolCall' && item.name) {
                  usage.toolCalls.push({
                    name: item.name,
                    timestamp: entry.timestamp
                  })
                }
              }
            }
          } catch (e) {
            // Skip malformed lines
          }
        }
      } catch (e) {
        console.error(`Error reading ${file}:`, e.message)
      }
    }

    // Sort tool calls by timestamp (newest first)
    usage.toolCalls.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    usage.toolCalls = usage.toolCalls.slice(0, 50)

    // Calculate cache hit ratio (cached / total input requests)
    const totalInputRequests = usage.totalCacheRead + usage.totalInput
    usage.cacheHitRatio = totalInputRequests > 0
      ? ((usage.totalCacheRead / totalInputRequests) * 100).toFixed(1)
      : '0'

    res.json(usage)
  } catch (err) {
    console.error('Usage API error:', err)
    res.status(500).json({ error: err.message })
  }
})

// API: Get sessions list
app.get('/api/sessions', async (req, res) => {
  try {
    const files = await glob(sessionsPattern)
    const sessions = []

    for (const file of files) {
      try {
        const stat = fs.statSync(file)
        const sessionKey = path.basename(file, '.jsonl')
        const agentId = path.basename(path.dirname(path.dirname(file)))
        
        // Read last few lines for preview
        const content = fs.readFileSync(file, 'utf-8')
        const lines = content.trim().split('\n').filter(Boolean)
        const messageCount = lines.length

        sessions.push({
          key: sessionKey,
          agent: agentId,
          messageCount,
          lastModified: stat.mtime.toISOString(),
          file: file
        })
      } catch (e) {
        // Skip unreadable files
      }
    }

    // Sort by last modified
    sessions.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''))

    res.json({ sessions: sessions.slice(0, 20) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// API: Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API: OpenClaw Memory Status (calls CLI)
app.get('/api/memory', async (req, res) => {
  try {
    // Use Gemini key, unset OpenAI to force Gemini provider
    const env = {
      ...process.env,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OPENAI_API_KEY: '' // Force Gemini
    }
    
    const { stdout } = await execAsync('openclaw memory status --json 2>/dev/null', {
      env,
      timeout: 15000
    })
    
    // Extract JSON from output (skip doctor warnings with box chars)
    const jsonStart = stdout.indexOf('[')
    const jsonEnd = stdout.lastIndexOf(']') + 1
    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error('No JSON in output')
    }
    const jsonStr = stdout.slice(jsonStart, jsonEnd)
    const data = JSON.parse(jsonStr)
    
    // Transform to simpler format for dashboard
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
    
    // Aggregate stats
    const totals = {
      agents: agents.length,
      files: agents.reduce((sum, a) => sum + a.files, 0),
      chunks: agents.reduce((sum, a) => sum + a.chunks, 0),
      cacheEntries: agents.reduce((sum, a) => sum + (a.cache?.entries || 0), 0),
      vectorReady: agents.every(a => a.vector.available),
      ftsReady: agents.every(a => a.fts.available)
    }
    
    res.json({ agents, totals, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('Memory API error:', err.message)
    res.status(500).json({ 
      error: err.message,
      hint: 'Is openclaw CLI installed and in PATH?'
    })
  }
})

async function startServer() {
  // Create Vite server in middleware mode
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  })

  // Use vite's connect instance as middleware
  app.use(vite.middlewares)

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🦀 Don Cangrejo Monitor`)
    console.log(`   Local:   http://localhost:${PORT}`)
    console.log(`   Network: http://${getLocalIP()}:${PORT}\n`)
  })
}

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

startServer().catch(console.error)
