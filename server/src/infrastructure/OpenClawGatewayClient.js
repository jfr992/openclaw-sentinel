/**
 * OpenClawGatewayClient - Connect to OpenClaw Gateway WebSocket
 * 
 * Handles:
 * - Challenge-response auth
 * - Event subscription (agent, chat, presence)
 * - Auto-reconnect with backoff
 * 
 * @example
 * const client = new OpenClawGatewayClient({
 *   url: 'ws://127.0.0.1:18789',
 *   token: process.env.OPENCLAW_GATEWAY_TOKEN,
 *   onEvent: (event) => console.log(event)
 * })
 * client.connect()
 */

import WebSocket from 'ws'
import { EventEmitter } from 'events'

const PROTOCOL_VERSION = 3
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000

export class OpenClawGatewayClient extends EventEmitter {
  constructor(opts = {}) {
    super()
    this.url = opts.url || process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789'
    this.token = opts.token || process.env.OPENCLAW_GATEWAY_TOKEN || null
    this.clientId = opts.clientId || 'openclaw-probe'
    this.clientName = opts.clientName || 'OpenClaw Sentinel'
    
    this.ws = null
    this.connected = false
    this.messageId = 1
    this.pending = new Map()
    this.reconnectMs = RECONNECT_BASE_MS
    this.shouldReconnect = true
    this.connectNonce = null
    
    // Stats
    this.stats = {
      connectedAt: null,
      messagesReceived: 0,
      eventsReceived: 0,
      reconnects: 0
    }
  }

  connect() {
    if (this.ws) {
      this.ws.close()
    }

    this.shouldReconnect = true
    this._connect()
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connected = false
  }

  _connect() {
    try {
      this.ws = new WebSocket(this.url)
    } catch (err) {
      this.emit('error', err)
      this._scheduleReconnect()
      return
    }

    this.ws.on('open', () => {
      this.emit('connecting')
      // Wait for challenge
    })

    this.ws.on('message', (data) => {
      this._handleMessage(data.toString())
    })

    this.ws.on('close', (code, reason) => {
      const wasConnected = this.connected
      this.connected = false
      this.emit('disconnected', { code, reason: reason?.toString() || '' })
      
      if (wasConnected) {
        this.stats.reconnects++
      }
      
      this._scheduleReconnect()
    })

    this.ws.on('error', (err) => {
      this.emit('error', err)
    })
  }

  _scheduleReconnect() {
    if (!this.shouldReconnect) return
    
    setTimeout(() => {
      if (this.shouldReconnect) {
        this._connect()
      }
    }, this.reconnectMs)
    
    // Exponential backoff
    this.reconnectMs = Math.min(this.reconnectMs * 1.5, RECONNECT_MAX_MS)
  }

  _handleMessage(raw) {
    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    this.stats.messagesReceived++

    // Handle challenge
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      this.connectNonce = msg.payload?.nonce
      this._sendConnect()
      return
    }

    // Handle response
    if (msg.type === 'res') {
      const pending = this.pending.get(msg.id)
      if (pending) {
        this.pending.delete(msg.id)
        if (msg.ok) {
          pending.resolve(msg.payload)
        } else {
          pending.reject(new Error(msg.error?.message || 'Request failed'))
        }
      }

      // Check for hello-ok
      if (msg.payload?.type === 'hello-ok') {
        this.connected = true
        this.reconnectMs = RECONNECT_BASE_MS
        this.stats.connectedAt = Date.now()
        this.emit('connected', {
          protocol: msg.payload.protocol,
          snapshot: msg.payload.snapshot
        })
      }
      return
    }

    // Handle events
    if (msg.type === 'event') {
      this.stats.eventsReceived++
      this.emit('event', {
        event: msg.event,
        payload: msg.payload,
        seq: msg.seq,
        stateVersion: msg.stateVersion
      })

      // Emit specific event types
      this.emit(`event:${msg.event}`, msg.payload)
    }
  }

  _sendConnect() {
    this._send('connect', {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: this.clientId,
        displayName: this.clientName,
        version: '0.1.0',
        platform: 'node',
        mode: 'probe'
      },
      role: 'operator',
      scopes: ['operator.read'],
      caps: [],
      commands: [],
      permissions: {},
      auth: this.token ? { token: this.token } : undefined,
      locale: 'en-US',
      userAgent: `openclaw-sentinel/1.0.1`
    })
  }

  _send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Not connected'))
    }

    const id = String(this.messageId++)
    const msg = { type: 'req', id, method, params }
    
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify(msg))
    })
  }

  /**
   * Request health status from gateway
   */
  async health() {
    return this._send('health', {})
  }

  /**
   * Request status from gateway
   */
  async status() {
    return this._send('status', {})
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      ...this.stats,
      connected: this.connected,
      uptimeMs: this.stats.connectedAt ? Date.now() - this.stats.connectedAt : 0
    }
  }
}

export default OpenClawGatewayClient
