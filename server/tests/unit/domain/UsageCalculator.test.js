import { describe, it, expect } from 'vitest'
import {
  calculateCacheHitRatio,
  aggregateUsage,
  calculateCostBreakdown
} from '../../../src/domain/services/UsageCalculator.js'

describe('UsageCalculator', () => {
  describe('calculateCacheHitRatio', () => {
    it('returns 0 when both values are 0', () => {
      expect(calculateCacheHitRatio(0, 0)).toBe(0)
    })

    it('returns 100 when all input is cached', () => {
      expect(calculateCacheHitRatio(1000, 0)).toBe(100)
    })

    it('returns 0 when nothing is cached', () => {
      expect(calculateCacheHitRatio(0, 1000)).toBe(0)
    })

    it('calculates 50% correctly', () => {
      expect(calculateCacheHitRatio(500, 500)).toBe(50)
    })

    it('calculates 80% correctly', () => {
      expect(calculateCacheHitRatio(800, 200)).toBe(80)
    })

    it('handles large numbers', () => {
      const ratio = calculateCacheHitRatio(867_000_000, 72_000)
      expect(ratio).toBeGreaterThan(99.9)
    })
  })

  describe('aggregateUsage', () => {
    it('returns zeros for empty array', () => {
      const result = aggregateUsage([])
      expect(result.totalInput).toBe(0)
      expect(result.totalOutput).toBe(0)
      expect(result.messageCount).toBe(0)
      expect(result.cacheHitRatio).toBe(0)
    })

    it('aggregates single message', () => {
      const messages = [{
        model: 'claude-opus-4-5',
        timestamp: '2026-01-31T12:00:00Z',
        usage: {
          input: 100,
          output: 200,
          cacheRead: 1000,
          cacheWrite: 50,
          cost: { total: 0.05 }
        }
      }]

      const result = aggregateUsage(messages)
      expect(result.totalInput).toBe(100)
      expect(result.totalOutput).toBe(200)
      expect(result.totalCacheRead).toBe(1000)
      expect(result.totalCost).toBe(0.05)
      expect(result.messageCount).toBe(1)
      expect(result.byModel['claude-opus-4-5'].calls).toBe(1)
    })

    it('aggregates multiple messages', () => {
      const messages = [
        {
          model: 'claude-opus-4-5',
          timestamp: '2026-01-31T12:00:00Z',
          usage: { input: 100, output: 200, cacheRead: 500, cost: { total: 0.05 } }
        },
        {
          model: 'claude-opus-4-5',
          timestamp: '2026-01-31T13:00:00Z',
          usage: { input: 150, output: 300, cacheRead: 600, cost: { total: 0.08 } }
        },
        {
          model: 'claude-sonnet-4',
          timestamp: '2026-02-01T10:00:00Z',
          usage: { input: 50, output: 100, cacheRead: 200, cost: { total: 0.01 } }
        }
      ]

      const result = aggregateUsage(messages)
      expect(result.totalInput).toBe(300)
      expect(result.totalOutput).toBe(600)
      expect(result.totalCacheRead).toBe(1300)
      expect(result.totalCost).toBeCloseTo(0.14)
      expect(result.messageCount).toBe(3)
      expect(result.byModel['claude-opus-4-5'].calls).toBe(2)
      expect(result.byModel['claude-sonnet-4'].calls).toBe(1)
      expect(result.byDay['2026-01-31'].tokens).toBe(750)
      expect(result.byDay['2026-02-01'].tokens).toBe(150)
    })

    it('skips messages without usage', () => {
      const messages = [
        { model: 'claude', timestamp: '2026-01-31T12:00:00Z' },
        { model: 'claude', timestamp: '2026-01-31T12:00:00Z', usage: null },
        { model: 'claude', timestamp: '2026-01-31T12:00:00Z', usage: { input: 100, output: 50 } }
      ]

      const result = aggregateUsage(messages)
      expect(result.messageCount).toBe(1)
      expect(result.totalInput).toBe(100)
    })

    it('handles missing fields gracefully', () => {
      const messages = [{
        model: 'claude',
        usage: { input: 100 }  // Missing output, cacheRead, cost
      }]

      const result = aggregateUsage(messages)
      expect(result.totalInput).toBe(100)
      expect(result.totalOutput).toBe(0)
      expect(result.totalCacheRead).toBe(0)
      expect(result.totalCost).toBe(0)
    })
  })

  describe('calculateCostBreakdown', () => {
    it('returns zeros for empty usage', () => {
      const result = calculateCostBreakdown({ totalCost: 0, byModel: {}, messageCount: 0 })
      expect(result.total).toBe(0)
      expect(result.topModel).toBeNull()
      expect(result.averagePerMessage).toBe(0)
    })

    it('calculates percentage by model', () => {
      const usage = {
        totalCost: 100,
        messageCount: 10,
        byModel: {
          'claude-opus-4-5': { cost: 80, tokens: 1000, calls: 8 },
          'claude-sonnet-4': { cost: 20, tokens: 500, calls: 2 }
        }
      }

      const result = calculateCostBreakdown(usage)
      expect(result.total).toBe(100)
      expect(result.byModel['claude-opus-4-5'].percentage).toBe(80)
      expect(result.byModel['claude-sonnet-4'].percentage).toBe(20)
      expect(result.topModel).toBe('claude-opus-4-5')
      expect(result.averagePerMessage).toBe(10)
    })
  })
})
