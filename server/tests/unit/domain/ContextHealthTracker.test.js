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

    it('detects "context got truncated"', () => {
      const result = detectReaskEvents('The context got truncated so I lost that info.')
      expect(result.length).toBeGreaterThan(0)
      expect(result[0].type).toBe(CONTEXT_EVENTS.REASK)
    })

    it('detects "what was the number"', () => {
      const result = detectReaskEvents("What was the 7000 referring to?")
      expect(result.some(e => e.type === CONTEXT_EVENTS.REASK)).toBe(true)
    })

    it('detects "can you remind me"', () => {
      const result = detectReaskEvents("Can you remind me what we were working on?")
      expect(result.length).toBeGreaterThan(0)
    })

    it('detects "I\'ve lost context"', () => {
      const result = detectReaskEvents("I've lost the context from earlier.")
      expect(result.some(e => e.confidence === 1.0)).toBe(true)
    })

    it('detects "what were we working on"', () => {
      const result = detectReaskEvents("What were we working on before?")
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('detectConfusionEvents', () => {
    it('returns empty for clear text', () => {
      expect(detectConfusionEvents('Done! The file is created.')).toEqual([])
    })

    it('detects "I\'m not sure"', () => {
      const result = detectConfusionEvents("I'm not sure what you mean.")
      expect(result.length).toBeGreaterThan(0)
      expect(result[0].type).toBe(CONTEXT_EVENTS.CONFUSION)
    })

    it('detects "let me check"', () => {
      const result = detectConfusionEvents("Let me check the file first.")
      expect(result.length).toBeGreaterThan(0)
    })

    it('detects "I need more context"', () => {
      const result = detectConfusionEvents("I need more context about this.")
      expect(result.some(e => e.confidence >= 0.7)).toBe(true)
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
        assistantTexts: ["What was the 7000 referring to?"],
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
        assistantTexts: Array(10).fill("What was the number again?"),
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
        assistantTexts: Array(5).fill("What was the 7000 referring to?"),
        systemTexts: [],
        toolCalls: [],
        totalMessages: 10
      })
      expect(reaskResult.recommendation).toContain('memory')
    })

    it('caps health score at 0', () => {
      const result = calculateContextHealth({
        assistantTexts: Array(20).fill("I've lost the context."),
        systemTexts: Array(10).fill('Context truncated.'),
        toolCalls: [],
        totalMessages: 50
      })
      expect(result.healthScore).toBeGreaterThanOrEqual(0)
    })
  })
})
