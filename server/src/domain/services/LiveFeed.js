/**
 * LiveFeed - Real-time agent activity feed
 *
 * Processes events from OpenClaw Gateway and maintains
 * a rolling buffer of recent activity for the dashboard.
 */

import { EventEmitter } from 'events'
import { scoreToolCall, RISK_LEVELS } from './RiskScorer.js'

const MAX_EVENTS = 500
const MAX_RUNS = 50

export class LiveFeed extends EventEmitter {
  constructor() {
    super()

    // Rolling buffer of recent events
    this.events = []

    // Active runs (by runId)
    this.activeRuns = new Map()

    // Completed runs (limited history)
    this.completedRuns = []

    // Stats
    this.stats = {
      totalEvents: 0,
      totalTokens: 0,
      totalToolCalls: 0,
      riskAlerts: 0,
      startedAt: Date.now()
    }
  }

  /**
   * Process an event from the gateway
   */
  processEvent(eventData) {
    const { event, payload, seq, stateVersion } = eventData

    this.stats.totalEvents++

    // Normalize and store
    const normalized = this._normalizeEvent(event, payload)
    if (normalized) {
      this.events.unshift(normalized)
      if (this.events.length > MAX_EVENTS) {
        this.events.pop()
      }

      // Emit for WebSocket broadcast
      this.emit('activity', normalized)
    }

    // Handle specific event types
    switch (event) {
      case 'agent':
        this._handleAgentEvent(payload)
        break
      case 'chat':
        this._handleChatEvent(payload)
        break
      case 'presence':
        this._handlePresenceEvent(payload)
        break
    }
  }

  _normalizeEvent(event, payload) {
    const base = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: event,
      ts: Date.now(),
      payload
    }

    switch (event) {
      case 'agent': {
        const { runId, stream, sessionKey, data, seq } = payload || {}

        // Extract tool details
        const toolName = data?.name || data?.tool?.name
        const toolInput = data?.input || data?.tool?.input || data?.arguments

        // Special handling for exec commands
        const isExec = toolName === 'exec'
        const command = isExec ? (toolInput?.command || toolInput) : null

        return {
          ...base,
          runId,
          stream,
          sessionKey,
          seq,
          text: data?.text,
          delta: data?.delta,
          // Tool info
          tool: toolName,
          toolInput,
          toolResult: data?.content,
          // Exec-specific
          command,
          isExec
        }
      }

      case 'chat': {
        const { runId, sessionKey, state, message } = payload || {}
        return {
          ...base,
          runId,
          sessionKey,
          state,
          role: message?.role,
          content: message?.content
        }
      }

      case 'health':
      case 'tick':
      case 'presence':
        return base

      default:
        return base
    }
  }

  _handleAgentEvent(payload) {
    if (!payload?.runId) return

    const { runId, stream, sessionKey, data } = payload

    // Get or create run
    let run = this.activeRuns.get(runId)
    if (!run) {
      run = {
        runId,
        sessionKey,
        startedAt: Date.now(),
        status: 'running',
        tokens: { text: 0, tools: 0 },
        toolCalls: [],
        risks: [],
        textLength: 0
      }
      this.activeRuns.set(runId, run)
      this.emit('run:start', run)
    }

    // Track text output
    if (stream === 'assistant' && data?.delta) {
      run.textLength += data.delta.length
    }

    // Track tool calls
    if (stream === 'tool' || data?.type === 'tool_use') {
      const toolCall = {
        name: data?.name,
        input: data?.input,
        timestamp: Date.now()
      }
      run.toolCalls.push(toolCall)
      this.stats.totalToolCalls++

      // Score for risk
      const risks = scoreToolCall({
        name: toolCall.name,
        arguments: toolCall.input
      })

      if (risks.length > 0) {
        run.risks.push(...risks)

        // Emit high-risk alerts
        const highRisks = risks.filter(r => r.level >= RISK_LEVELS.HIGH)
        for (const risk of highRisks) {
          this.stats.riskAlerts++
          this.emit('risk:alert', {
            runId,
            sessionKey,
            toolCall,
            risk
          })
        }
      }
    }

    // Check for run completion
    if (data?.type === 'done' || data?.type === 'complete' || payload.state === 'final') {
      run.status = 'completed'
      run.completedAt = Date.now()
      run.durationMs = run.completedAt - run.startedAt

      // Move to completed
      this.activeRuns.delete(runId)
      this.completedRuns.unshift(run)
      if (this.completedRuns.length > MAX_RUNS) {
        this.completedRuns.pop()
      }

      this.emit('run:complete', run)
    }
  }

  _handleChatEvent(payload) {
    if (!payload?.runId) return

    const { runId, state } = payload
    const run = this.activeRuns.get(runId)

    if (run && state === 'final') {
      run.status = 'completed'
      run.completedAt = Date.now()
      run.durationMs = run.completedAt - run.startedAt

      this.activeRuns.delete(runId)
      this.completedRuns.unshift(run)
      if (this.completedRuns.length > MAX_RUNS) {
        this.completedRuns.pop()
      }

      this.emit('run:complete', run)
    }
  }

  _handlePresenceEvent(payload) {
    this.emit('presence', payload)
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit = 100) {
    return this.events.slice(0, limit)
  }

  /**
   * Get active runs
   */
  getActiveRuns() {
    return Array.from(this.activeRuns.values())
  }

  /**
   * Get completed runs
   */
  getCompletedRuns(limit = 20) {
    return this.completedRuns.slice(0, limit)
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      activeRuns: this.activeRuns.size,
      completedRuns: this.completedRuns.length,
      bufferedEvents: this.events.length,
      uptimeMs: Date.now() - this.stats.startedAt
    }
  }

  /**
   * Get snapshot for initial WebSocket connection
   */
  getSnapshot() {
    return {
      recentEvents: this.getRecentEvents(50),
      activeRuns: this.getActiveRuns(),
      completedRuns: this.getCompletedRuns(10),
      stats: this.getStats()
    }
  }
}

export default LiveFeed
