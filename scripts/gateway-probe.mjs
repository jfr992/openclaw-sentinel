#!/usr/bin/env node
/**
 * Gateway Probe — Connect to OpenClaw WebSocket and log all events
 * Usage: node scripts/gateway-probe.mjs
 *
 * Purpose: Understand what events OpenClaw broadcasts so we can
 * wire up live streaming to Cangrejo Monitor.
 */

import WebSocket from 'ws'

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789'
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || 'b3c5ba63f676ed74b0e20d0fde52857bd87686ee61f2a661'

console.log(`\n🦀 Gateway Probe`)
console.log(`   Connecting to: ${GATEWAY_URL}\n`)

const ws = new WebSocket(GATEWAY_URL)

let messageId = 1

function send(method, params = {}) {
  const msg = {
    type: 'req',
    id: String(messageId++),  // Must be string per schema
    method,
    params
  }
  const json = JSON.stringify(msg)
  console.log(`→ REQ [${msg.id}] ${method}`, params.auth ? '(auth hidden)' : '')
  console.log(`  RAW: ${json.slice(0, 200)}...`)
  ws.send(json)
}

ws.on('open', () => {
  console.log('✓ WebSocket connected')
  console.log('  Waiting for challenge...\n')
})

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString())
    const ts = new Date().toISOString().slice(11, 23)

    // Handle challenge-response auth
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      console.log(`⚡ Challenge received, responding with token...`)
      send('connect', {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'openclaw-probe',  // Must be in allowed list
          displayName: 'Cangrejo Monitor',
          version: '0.1.0',
          platform: 'node',
          mode: 'probe'  // Must be: webchat|cli|ui|backend|node|probe|test
        },
        role: 'operator',
        scopes: ['operator.read'],
        caps: [],
        commands: [],
        permissions: {},
        auth: { token: GATEWAY_TOKEN },
        locale: 'en-US',
        userAgent: 'cangrejo-monitor/0.1.0'
      })
      return
    }

    if (msg.type === 'res') {
      // Response to our request
      console.log(`← RES [${msg.id}] ok=${msg.ok}`)

      if (msg.payload?.type === 'hello-ok') {
        console.log('  ✓ Handshake successful')
        console.log(`  • Protocol: ${msg.payload.protocol}`)
        console.log(`  • Uptime: ${Math.round(msg.payload.snapshot?.uptimeMs / 1000)}s`)
        console.log(`  • Presence: ${msg.payload.snapshot?.presence?.length || 0} clients`)
        console.log('')
        console.log('📡 Listening for events... (do something in Telegram)\n')
      } else if (msg.payload) {
        console.log('  Payload:', JSON.stringify(msg.payload, null, 2).slice(0, 500))
      }
      if (msg.error) {
        console.log('  ❌ Error:', msg.error)
      }
    }
    else if (msg.type === 'event') {
      // Event pushed from gateway
      console.log(`\n⚡ EVENT [${ts}] ${msg.event}`)

      if (msg.event === 'agent') {
        // This is what we want!
        const p = msg.payload || {}
        console.log(`  • kind: ${p.kind}`)
        console.log(`  • runId: ${p.runId}`)

        if (p.kind === 'tool_use') {
          console.log(`  • tool: ${p.name}`)
          console.log(`  • args: ${JSON.stringify(p.input || {}).slice(0, 200)}...`)
        }
        else if (p.kind === 'tool_result') {
          console.log(`  • tool: ${p.name}`)
          console.log(`  • success: ${!p.isError}`)
        }
        else if (p.kind === 'text' || p.kind === 'text_delta') {
          console.log(`  • text: "${(p.text || '').slice(0, 100)}..."`)
        }
        else if (p.kind === 'usage') {
          console.log(`  • input: ${p.input} tokens`)
          console.log(`  • output: ${p.output} tokens`)
          console.log(`  • cacheRead: ${p.cacheRead || 0}`)
        }
        else if (p.kind === 'done' || p.kind === 'complete') {
          console.log(`  • status: ${p.status || 'complete'}`)
        }
        else {
          console.log(`  • payload:`, JSON.stringify(p, null, 2).slice(0, 300))
        }
      }
      else if (msg.event === 'presence') {
        console.log(`  • entries: ${msg.payload?.length || 0}`)
      }
      else if (msg.event === 'tick') {
        // Keepalive, just note it
        process.stdout.write('·')
      }
      else {
        console.log(`  • payload:`, JSON.stringify(msg.payload, null, 2).slice(0, 300))
      }
    }
    else {
      console.log(`← ${msg.type}:`, JSON.stringify(msg, null, 2).slice(0, 300))
    }
  } catch (e) {
    console.log('← RAW:', data.toString().slice(0, 200))
  }
})

ws.on('error', (err) => {
  console.error('❌ WebSocket error:', err.message)
  if (err.message.includes('ECONNREFUSED')) {
    console.log('\n   Is the gateway running? Try: openclaw gateway status')
  }
})

ws.on('close', (code, reason) => {
  console.log(`\n🔌 Connection closed (code=${code})`)
  if (reason) console.log(`   Reason: ${reason}`)
  process.exit(0)
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down probe...')
  ws.close()
})

console.log('Press Ctrl+C to stop\n')
