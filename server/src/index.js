/**
 * Cangrejo Monitor Server
 * Clean Architecture entry point
 */
import express from 'express'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import path from 'path'
import os from 'os'
import { glob } from 'glob'
import fs from 'fs'

import securityRoutes, { alertStore } from './interfaces/http/routes/security.js'
import { aggregateUsage } from './domain/services/UsageCalculator.js'
import { scoreToolCall, RISK_LEVELS } from './domain/services/RiskScorer.js'

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

// Make helper available to routes
app.locals.getRecentToolCalls = getRecentToolCalls

// ============================================
// API Routes
// ============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
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

// ============================================
// WebSocket: Real-time Security Alerts
// ============================================

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws/security' })

const wsClients = new Set()

wss.on('connection', (ws) => {
  console.log('[WS] Client connected')
  wsClients.add(ws)
  
  // Send current risk level on connect
  getRecentToolCalls(100).then(toolCalls => {
    const { scoreToolCall, calculateSessionRisk } = require('./domain/services/RiskScorer.js')
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
    console.log('[WS] Client disconnected')
  })
  
  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message)
    wsClients.delete(ws)
  })
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
// Static files (Vite build)
// ============================================

const clientDist = path.join(process.cwd(), 'dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get('*', (req, res) => {
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
🦀 Don Cangrejo Monitor
   Local:   http://localhost:${PORT}
   Network: http://${getLocalIP()}:${PORT}
   WebSocket: ws://localhost:${PORT}/ws/security
`)
})
