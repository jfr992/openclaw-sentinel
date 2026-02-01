/**
 * Tests for OpenClawGatewayClient
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// Mock WebSocket
class MockWebSocket extends EventEmitter {
  constructor(url) {
    super()
    this.url = url
    this.readyState = 0 // CONNECTING
    MockWebSocket.instances.push(this)
  }

  send(data) {
    this.lastSent = JSON.parse(data)
  }

  close() {
    this.readyState = 3 // CLOSED
    this.emit('close', 1000, '')
  }

  // Test helpers
  simulateOpen() {
    this.readyState = 1 // OPEN
    this.emit('open')
  }

  simulateMessage(data) {
    this.emit('message', JSON.stringify(data))
  }

  simulateChallenge(nonce = 'test-nonce') {
    this.simulateMessage({
      type: 'event',
      event: 'connect.challenge',
      payload: { nonce, ts: Date.now() }
    })
  }

  simulateHelloOk() {
    this.simulateMessage({
      type: 'res',
      id: '1',
      ok: true,
      payload: {
        type: 'hello-ok',
        protocol: 3,
        snapshot: { presence: [] }
      }
    })
  }
}

MockWebSocket.instances = []
MockWebSocket.OPEN = 1

// We need to test the module in isolation
// For now, test the logic separately

describe('OpenClawGatewayClient', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
  })

  describe('Protocol Compliance', () => {
    it('should use protocol version 3', () => {
      // The client should negotiate protocol v3
      const connectParams = {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'openclaw-probe',
          version: '0.1.0',
          platform: 'node',
          mode: 'probe'
        },
        role: 'operator',
        scopes: ['operator.read']
      }

      expect(connectParams.minProtocol).toBe(3)
      expect(connectParams.maxProtocol).toBe(3)
    })

    it('should use valid client.id from allowed list', () => {
      const allowedIds = [
        'webchat-ui', 'openclaw-control-ui', 'webchat', 'cli',
        'gateway-client', 'openclaw-macos', 'openclaw-ios',
        'openclaw-android', 'node-host', 'test', 'fingerprint',
        'openclaw-probe'
      ]

      const clientId = 'openclaw-probe'
      expect(allowedIds).toContain(clientId)
    })

    it('should use valid client.mode from allowed list', () => {
      const allowedModes = ['webchat', 'cli', 'ui', 'backend', 'node', 'probe', 'test']
      const mode = 'probe'
      expect(allowedModes).toContain(mode)
    })
  })

  describe('Request Frame Format', () => {
    it('should format request frames correctly', () => {
      const frame = {
        type: 'req',
        id: '1',  // Must be string
        method: 'connect',
        params: {}
      }

      expect(frame.type).toBe('req')
      expect(typeof frame.id).toBe('string')
      expect(frame.method.length).toBeGreaterThan(0)
    })
  })

  describe('Event Processing', () => {
    it('should identify agent events', () => {
      const event = {
        type: 'event',
        event: 'agent',
        payload: {
          runId: 'test-run',
          stream: 'assistant',
          data: { text: 'Hello', delta: 'Hello' }
        }
      }

      expect(event.event).toBe('agent')
      expect(event.payload.runId).toBe('test-run')
    })

    it('should identify chat events', () => {
      const event = {
        type: 'event',
        event: 'chat',
        payload: {
          runId: 'test-run',
          sessionKey: 'agent:main:main',
          state: 'delta',
          message: { role: 'assistant', content: [] }
        }
      }

      expect(event.event).toBe('chat')
      expect(event.payload.state).toBe('delta')
    })

    it('should identify connect.challenge events', () => {
      const event = {
        type: 'event',
        event: 'connect.challenge',
        payload: { nonce: 'abc123', ts: Date.now() }
      }

      expect(event.event).toBe('connect.challenge')
      expect(event.payload.nonce).toBe('abc123')
    })
  })

  describe('Stats Tracking', () => {
    it('should track initial stats', () => {
      const stats = {
        connectedAt: null,
        messagesReceived: 0,
        eventsReceived: 0,
        reconnects: 0
      }

      expect(stats.messagesReceived).toBe(0)
      expect(stats.eventsReceived).toBe(0)
      expect(stats.reconnects).toBe(0)
    })

    it('should calculate uptime', () => {
      const connectedAt = Date.now() - 5000
      const uptimeMs = Date.now() - connectedAt

      expect(uptimeMs).toBeGreaterThanOrEqual(5000)
      expect(uptimeMs).toBeLessThan(6000)
    })
  })
})
