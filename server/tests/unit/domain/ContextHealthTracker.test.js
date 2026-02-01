import { describe, it, expect } from 'vitest'
import {
  detectReaskEvents,
  detectConfusionEvents,
  detectTruncationEvents,
  detectMemoryReads,
  calculateContextHealth,
  CONTEXT_EVENTS
} from '../../../src/domain/services/ContextHealthTracker.js'

describe('ContextHealthTracker', () => {
  describe('detectReaskEvents', () => {
    it('returns empty for null/empty input', () => {
      expect(detectReaskEvents(null)).toEqual([])
      expect(detectReaskEvents('')).toEqual([])
    })

    it('returns empty for normal text', () => {
      expect(detectReaskEvents('Here is the code you requested.')).toEqual([])
    })

    // Note: "context got truncated" is now considered INFORMATIONAL, not a re-ask
    // The agent is explaining the situation, not asking for help
    it('does NOT detect "context got truncated" (informational, not asking)', () => {
      const result = detectReaskEvents('The context got truncated so I lost that info.')
      expect(result.length).toBe(0)
    })

    // Note: Removed "what was the number" without question context - too many false positives
    it('detects clarifying questions ending with "?"', () => {
      const result = detectReaskEvents("What do you mean by polling mode?")
      expect(result.length).toBeGreaterThan(0)
      expect(result[0].type).toBe(CONTEXT_EVENTS.REASK)
    })

    it('detects "can you remind me"', () => {
      const result = detectReaskEvents("Can you remind me what we were working on?")
      expect(result.length).toBeGreaterThan(0)
    })

    it('detects "could you explain that"', () => {
      const result = detectReaskEvents("Could you explain what you meant?")
      expect(result.length).toBeGreaterThan(0)
    })

    // Note: "I've lost context" is now considered informational
    it('does NOT detect "I\'ve lost context" (informational)', () => {
      const result = detectReaskEvents("I've lost the context from earlier.")
      expect(result.length).toBe(0)
    })

    // Note: "what were we working on" at session start is GOOD behavior
    it('does NOT detect "what were we working on" (proactive context check)', () => {
      const result = detectReaskEvents("What were we working on before?")
      expect(result.length).toBe(0)
    })
  })

  describe('detectConfusionEvents', () => {
    it('returns empty for clear text', () => {
      expect(detectConfusionEvents('Done! The file is created.')).toEqual([])
    })

    // Note: Made stricter - requires clear confusion like "really confused"
    it('detects "I\'m really confused about"', () => {
      const result = detectConfusionEvents("I'm really confused about what you want.")
      expect(result.length).toBeGreaterThan(0)
      expect(result[0].type).toBe(CONTEXT_EVENTS.CONFUSION)
    })

    it('detects "sorry I don\'t understand"', () => {
      const result = detectConfusionEvents("Sorry, I don't understand what you mean.")
      expect(result.length).toBeGreaterThan(0)
    })

    it('does NOT detect "let me check" (normal behavior)', () => {
      const result = detectConfusionEvents("Let me check the file first.")
      expect(result.length).toBe(0)
    })

    // Note: "I need context" removed - agent being transparent, not confused
    it('does NOT detect "I need context" (transparency, not confusion)', () => {
      const result = detectConfusionEvents("I need more context about this project.")
      expect(result.length).toBe(0)
    })

    // Note: "I'm not sure" without "really" is often legitimate uncertainty
    it('does NOT detect casual "I\'m not sure" (legitimate uncertainty)', () => {
      const result = detectConfusionEvents("I'm not sure what you mean.")
      expect(result.length).toBe(0)
    })
  })

  describe('detectTruncationEvents', () => {
    it('returns empty for normal system messages', () => {
      expect(detectTruncationEvents('Session started.')).toEqual([])
    })

    it('detects truncation notice', () => {
      const result = detectTruncationEvents('The context was truncated due to limits.')
      expect(result.length).toBeGreaterThan(0)
      expect(result[0].type).toBe(CONTEXT_EVENTS.TRUNCATION)
    })

    it('detects compaction notice', () => {
      const result = detectTruncationEvents('Context was compacted into summary.')
      expect(result.length).toBeGreaterThan(0)
    })

    it('detects "summary unavailable"', () => {
      const result = detectTruncationEvents('Summary unavailable due to context limits.')
      expect(result.some(e => e.type === CONTEXT_EVENTS.TRUNCATION)).toBe(true)
    })
  })

  describe('detectMemoryReads', () => {
    it('returns empty for no tool calls', () => {
      expect(detectMemoryReads([])).toEqual([])
    })

    it('detects memory file reads', () => {
      const calls = [
        { name: 'Read', arguments: { path: '/clawd/memory/2026-01-31.md' } }
      ]
      const result = detectMemoryReads(calls)
      expect(result.length).toBe(1)
      expect(result[0].type).toBe(CONTEXT_EVENTS.MEMORY_READ)
    })

    it('detects MEMORY.md reads', () => {
      const calls = [
        { name: 'Read', arguments: { path: '/clawd/MEMORY.md' } }
      ]
      const result = detectMemoryReads(calls)
      expect(result.length).toBe(1)
    })

    it('ignores non-memory file reads', () => {
      const calls = [
        { name: 'Read', arguments: { path: '/src/app.js' } }
      ]
      expect(detectMemoryReads(calls)).toEqual([])
    })

    it('ignores non-Read tool calls', () => {
      const calls = [
        { name: 'Write', arguments: { path: '/clawd/memory/2026-01-31.md' } }
      ]
      expect(detectMemoryReads(calls)).toEqual([])
    })
  })

  describe('calculateContextHealth', () => {
    it('returns 100 for perfect session', () => {
      const result = calculateContextHealth({
        assistantTexts: ['Here is the code.', 'Done!'],
        systemTexts: [],
        toolCalls: [],
        totalMessages: 10
      })
      expect(result.healthScore).toBe(100)
      expect(result.status.label).toBe('Excellent')
    })

    it('penalizes truncation events', () => {
      const result = calculateContextHealth({
        assistantTexts: [],
        systemTexts: ['Context was truncated.'],
        toolCalls: [],
        totalMessages: 10
      })
      expect(result.healthScore).toBeLessThan(100)
      expect(result.events.truncations).toBe(1)
    })

    it('penalizes reask events', () => {
      const result = calculateContextHealth({
        assistantTexts: ["Can you remind me what we discussed earlier?"],
        systemTexts: [],
        toolCalls: [],
        totalMessages: 10
      })
      expect(result.healthScore).toBeLessThan(100)
      expect(result.events.reasksCount).toBeGreaterThan(0)
    })

    it('tracks memory reads positively', () => {
      const result = calculateContextHealth({
        assistantTexts: [],
        systemTexts: [],
        toolCalls: [
          { name: 'Read', arguments: { path: '/clawd/memory/2026-01-31.md' } },
          { name: 'Read', arguments: { path: '/clawd/MEMORY.md' } }
        ],
        totalMessages: 10
      })
      expect(result.events.memoryReads).toBe(2)
      expect(result.healthScore).toBe(100) // Memory reads don't penalize
    })

    it('calculates continuity rate', () => {
      const goodResult = calculateContextHealth({
        assistantTexts: [],
        systemTexts: [],
        toolCalls: [],
        totalMessages: 100
      })

      const badResult = calculateContextHealth({
        assistantTexts: Array(10).fill("Can you remind me what we discussed?"),
        systemTexts: [],
        toolCalls: [],
        totalMessages: 20
      })

      expect(goodResult.continuityRate).toBeGreaterThan(badResult.continuityRate)
    })

    it('provides appropriate recommendations', () => {
      const truncatedResult = calculateContextHealth({
        assistantTexts: [],
        systemTexts: [
          'Context was truncated due to limits.',
          'Older messages were compacted.',
          'Context truncated again.'
        ],
        toolCalls: [],
        totalMessages: 10
      })
      expect(truncatedResult.recommendation).toContain('truncation')

      const reaskResult = calculateContextHealth({
        assistantTexts: Array(5).fill("Can you remind me what we discussed?"),
        systemTexts: [],
        toolCalls: [],
        totalMessages: 10
      })
      expect(reaskResult.recommendation).toContain('memory')
    })

    it('caps health score at 0', () => {
      const result = calculateContextHealth({
        assistantTexts: Array(20).fill("Can you remind me what we discussed?"),
        systemTexts: Array(10).fill('Context truncated.'),
        toolCalls: [],
        totalMessages: 50
      })
      expect(result.healthScore).toBeGreaterThanOrEqual(0)
    })
  })
})
