import { describe, it, expect } from 'vitest'
import {
  detectVerbalCorrections,
  detectToolRetries,
  detectFileReedits,
  detectErrorRecovery,
  calculateCorrectionScore,
  CORRECTION_TYPES
} from '../../../src/domain/services/SelfCorrectionTracker.js'

describe('SelfCorrectionTracker', () => {
  describe('detectVerbalCorrections', () => {
    it('returns empty for null/empty input', () => {
      expect(detectVerbalCorrections(null)).toEqual([])
      expect(detectVerbalCorrections('')).toEqual([])
    })

    it('returns empty for text without corrections', () => {
      expect(detectVerbalCorrections('Here is the code you requested.')).toEqual([])
      expect(detectVerbalCorrections('The file has been created successfully.')).toEqual([])
    })

    it('detects "actually"', () => {
      const result = detectVerbalCorrections('Actually, I need to change that.')
      expect(result.length).toBe(1)
      expect(result[0].type).toBe(CORRECTION_TYPES.VERBAL)
      expect(result[0].match.toLowerCase()).toBe('actually')
    })

    it('detects "let me fix"', () => {
      const result = detectVerbalCorrections('Let me fix that error.')
      expect(result.length).toBe(1)
      expect(result[0].confidence).toBe(1.0)
    })

    it('detects "sorry"', () => {
      const result = detectVerbalCorrections('Sorry, I made a mistake.')
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('detects "oops"', () => {
      const result = detectVerbalCorrections('Oops, that was wrong.')
      expect(result.some(r => r.match.toLowerCase() === 'oops')).toBe(true)
    })

    it('detects "my bad"', () => {
      const result = detectVerbalCorrections('My bad, the path was incorrect.')
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('detects multiple corrections in one text', () => {
      const result = detectVerbalCorrections('Actually, let me fix that. Sorry, I meant to use a different approach.')
      expect(result.length).toBeGreaterThan(1)
    })
  })

  describe('detectToolRetries', () => {
    it('returns empty for insufficient calls', () => {
      expect(detectToolRetries([])).toEqual([])
      expect(detectToolRetries([{ name: 'exec' }])).toEqual([])
    })

    it('detects same tool called twice quickly', () => {
      const now = new Date()
      const calls = [
        { name: 'exec', timestamp: now.toISOString() },
        { name: 'exec', timestamp: new Date(now.getTime() + 5000).toISOString() }
      ]
      const result = detectToolRetries(calls)
      expect(result.length).toBe(1)
      expect(result[0].type).toBe(CORRECTION_TYPES.TOOL_RETRY)
      expect(result[0].tool).toBe('exec')
    })

    it('ignores different tools', () => {
      const now = new Date()
      const calls = [
        { name: 'exec', timestamp: now.toISOString() },
        { name: 'Read', timestamp: new Date(now.getTime() + 5000).toISOString() }
      ]
      expect(detectToolRetries(calls)).toEqual([])
    })

    it('ignores calls outside time window', () => {
      const now = new Date()
      const calls = [
        { name: 'exec', timestamp: now.toISOString() },
        { name: 'exec', timestamp: new Date(now.getTime() + 120000).toISOString() } // 2 minutes
      ]
      expect(detectToolRetries(calls, { windowMs: 60000 })).toEqual([])
    })

    it('has higher confidence when previous call failed', () => {
      const now = new Date()
      const failedFirstCalls = [
        { name: 'exec', timestamp: now.toISOString(), success: false },
        { name: 'exec', timestamp: new Date(now.getTime() + 2000).toISOString() }
      ]
      const unknownSuccessCalls = [
        { name: 'exec', timestamp: now.toISOString() }, // success undefined
        { name: 'exec', timestamp: new Date(now.getTime() + 2000).toISOString() }
      ]

      const failedResult = detectToolRetries(failedFirstCalls)
      const unknownResult = detectToolRetries(unknownSuccessCalls)

      expect(failedResult[0].confidence).toBe(1.0)  // Known failure
      expect(unknownResult[0].confidence).toBe(0.7) // Unknown success
    })
  })

  describe('detectFileReedits', () => {
    it('returns empty for insufficient edits', () => {
      expect(detectFileReedits([])).toEqual([])
    })

    it('detects same file edited twice', () => {
      const now = new Date()
      const calls = [
        { name: 'Write', arguments: { path: '/test.js' }, timestamp: now.toISOString() },
        { name: 'Edit', arguments: { path: '/test.js' }, timestamp: new Date(now.getTime() + 30000).toISOString() }
      ]
      const result = detectFileReedits(calls)
      expect(result.length).toBe(1)
      expect(result[0].type).toBe(CORRECTION_TYPES.FILE_REEDIT)
      expect(result[0].path).toBe('/test.js')
    })

    it('ignores different files', () => {
      const now = new Date()
      const calls = [
        { name: 'Write', arguments: { path: '/a.js' }, timestamp: now.toISOString() },
        { name: 'Write', arguments: { path: '/b.js' }, timestamp: new Date(now.getTime() + 30000).toISOString() }
      ]
      expect(detectFileReedits(calls)).toEqual([])
    })

    it('handles file_path argument variant', () => {
      const now = new Date()
      const calls = [
        { name: 'Edit', arguments: { file_path: '/test.js' }, timestamp: now.toISOString() },
        { name: 'Edit', arguments: { file_path: '/test.js' }, timestamp: new Date(now.getTime() + 30000).toISOString() }
      ]
      const result = detectFileReedits(calls)
      expect(result.length).toBe(1)
    })
  })

  describe('detectErrorRecovery', () => {
    it('returns empty for no errors', () => {
      const messages = [
        { role: 'assistant', content: 'Running command...' },
        { role: 'toolResult', isError: false, content: 'Success' }
      ]
      expect(detectErrorRecovery(messages)).toEqual([])
    })

    it('detects error followed by retry', () => {
      const messages = [
        { role: 'toolResult', toolName: 'exec', isError: true, content: 'Command failed' },
        { role: 'assistant', toolCalls: [{ name: 'exec', arguments: {} }] }
      ]
      const result = detectErrorRecovery(messages)
      expect(result.length).toBe(1)
      expect(result[0].type).toBe(CORRECTION_TYPES.ERROR_RECOVERY)
      expect(result[0].tool).toBe('exec')
    })

    it('ignores error without retry', () => {
      const messages = [
        { role: 'toolResult', toolName: 'exec', isError: true, content: 'Command failed' },
        { role: 'assistant', content: 'The command failed. Please check the path.' }
      ]
      expect(detectErrorRecovery(messages)).toEqual([])
    })
  })

  describe('calculateCorrectionScore', () => {
    it('returns 0 score for no corrections', () => {
      const result = calculateCorrectionScore({
        messages: [],
        toolCalls: [],
        assistantTexts: ['Task completed successfully.']
      })
      expect(result.score).toBe(0)
      expect(result.interpretation).toContain('Perfect')
    })

    it('calculates score with verbal corrections', () => {
      const result = calculateCorrectionScore({
        messages: [],
        toolCalls: [],
        assistantTexts: ['Actually, let me fix that. Oops, my bad.']
      })
      expect(result.score).toBeGreaterThan(0)
      expect(result.byType.verbal).toBeGreaterThan(0)
    })

    it('combines multiple correction types', () => {
      const now = new Date()
      const result = calculateCorrectionScore({
        messages: [],
        toolCalls: [
          { name: 'exec', timestamp: now.toISOString() },
          { name: 'exec', timestamp: new Date(now.getTime() + 5000).toISOString() }
        ],
        assistantTexts: ['Actually, I need to retry that.']
      })
      expect(result.byType.verbal).toBeGreaterThan(0)
      expect(result.byType.toolRetry).toBeGreaterThan(0)
    })

    it('caps score at 100', () => {
      const result = calculateCorrectionScore({
        messages: [],
        toolCalls: [],
        assistantTexts: Array(50).fill('Actually, oops, my bad, let me fix that, sorry I meant something else.')
      })
      expect(result.score).toBeLessThanOrEqual(100)
    })

    it('provides interpretation based on score', () => {
      const lowScore = calculateCorrectionScore({ assistantTexts: ['Actually'] })
      const highScore = calculateCorrectionScore({
        assistantTexts: Array(20).fill('Oops, my bad, let me fix that.')
      })

      expect(lowScore.interpretation).not.toBe(highScore.interpretation)
    })
  })
})
