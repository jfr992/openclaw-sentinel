import { describe, it, expect } from 'vitest'
import {
  analyzeMessage,
  analyzeConversation,
  calculateFeedbackScore,
  SENTIMENT
} from '../../../src/domain/services/SentimentAnalyzer.js'

describe('SentimentAnalyzer', () => {
  describe('analyzeMessage', () => {
    it('returns neutral for empty input', () => {
      expect(analyzeMessage(null).sentiment).toBe(SENTIMENT.NEUTRAL)
      expect(analyzeMessage('').sentiment).toBe(SENTIMENT.NEUTRAL)
    })

    describe('positive sentiment', () => {
      it('detects "thanks"', () => {
        const result = analyzeMessage('Thanks!')
        expect(result.sentiment).toBe(SENTIMENT.POSITIVE)
        expect(result.score).toBeGreaterThan(0)
      })

      it('detects "perfect"', () => {
        const result = analyzeMessage('Perfect, that works!')
        expect(result.sentiment).toBe(SENTIMENT.POSITIVE)
        expect(result.score).toBeGreaterThan(0.5)
      })

      it('detects "great job"', () => {
        const result = analyzeMessage('Great job on that!')
        expect(result.sentiment).toBe(SENTIMENT.POSITIVE)
      })

      it('detects positive emojis', () => {
        const result = analyzeMessage('👍')
        expect(result.sentiment).toBe(SENTIMENT.POSITIVE)
      })

      it('detects "yes"', () => {
        const result = analyzeMessage('Yes')
        expect(result.positiveScore).toBeGreaterThan(0)
      })
    })

    describe('negative sentiment', () => {
      it('detects "wrong"', () => {
        const result = analyzeMessage('That is wrong')
        expect(result.sentiment).toBe(SENTIMENT.NEGATIVE)
        expect(result.score).toBeLessThan(0)
      })

      it('detects "doesn\'t work"', () => {
        const result = analyzeMessage("It doesn't work")
        expect(result.sentiment).toBe(SENTIMENT.NEGATIVE)
      })

      it('detects "try again"', () => {
        const result = analyzeMessage('Try again')
        expect(result.negativeScore).toBeGreaterThan(0)
      })

      it('detects "that\'s not right"', () => {
        const result = analyzeMessage("That's not right")
        expect(result.sentiment).toBe(SENTIMENT.NEGATIVE)
      })

      it('detects negative emojis', () => {
        const result = analyzeMessage('👎')
        expect(result.sentiment).toBe(SENTIMENT.NEGATIVE)
      })

      it('detects frustration signals', () => {
        const result = analyzeMessage('Why??? I already told you!')
        expect(result.negativeScore).toBeGreaterThan(0)
      })
    })

    describe('neutral sentiment', () => {
      it('returns neutral for factual statements', () => {
        const result = analyzeMessage('The file is located in /home/user')
        expect(result.sentiment).toBe(SENTIMENT.NEUTRAL)
      })

      it('returns neutral for questions', () => {
        const result = analyzeMessage('What is the status?')
        expect(result.sentiment).toBe(SENTIMENT.NEUTRAL)
      })
    })

    describe('mixed sentiment', () => {
      it('balances positive and negative', () => {
        const result = analyzeMessage('Thanks, but that is wrong')
        // Should be slightly negative due to "wrong" outweighing "thanks"
        expect(result.positiveScore).toBeGreaterThan(0)
        expect(result.negativeScore).toBeGreaterThan(0)
      })
    })

    it('provides confidence based on signal strength', () => {
      const strong = analyzeMessage('Perfect! Amazing! Awesome!')
      const weak = analyzeMessage('ok')
      expect(strong.confidence).toBeGreaterThan(weak.confidence)
    })
  })

  describe('analyzeConversation', () => {
    it('returns neutral for empty conversation', () => {
      const result = analyzeConversation([])
      expect(result.overall).toBe(SENTIMENT.NEUTRAL)
      expect(result.totalMessages).toBe(0)
    })

    it('calculates distribution correctly', () => {
      const messages = [
        'Thanks!',      // positive
        'Perfect',      // positive
        'What next?',   // neutral
        "Doesn't work"  // negative
      ]
      const result = analyzeConversation(messages)
      expect(result.distribution.positive).toBe(2)
      expect(result.distribution.neutral).toBe(1)
      expect(result.distribution.negative).toBe(1)
    })

    it('determines overall positive sentiment', () => {
      const messages = ['Thanks!', 'Perfect!', 'Great!', 'ok']
      const result = analyzeConversation(messages)
      expect(result.overall).toBe(SENTIMENT.POSITIVE)
    })

    it('determines overall negative sentiment', () => {
      const messages = ['Wrong', "Doesn't work", 'Try again', 'Still broken']
      const result = analyzeConversation(messages)
      expect(result.overall).toBe(SENTIMENT.NEGATIVE)
    })

    it('calculates satisfaction rate', () => {
      const messages = ['Thanks! Perfect!', 'Great job!', 'Awesome!', 'Amazing!']
      const result = analyzeConversation(messages)
      expect(result.satisfactionRate).toBe(100)
    })

    it('calculates frustration rate', () => {
      const messages = ['Wrong', 'Error', 'ok', 'yes']
      const result = analyzeConversation(messages)
      expect(result.frustrationRate).toBe(50)
    })

    it('detects improving trend', () => {
      const messages = [
        'Wrong',
        "Doesn't work",
        'Better',
        'Thanks!',
        'Perfect!',
        'Great!'
      ]
      const result = analyzeConversation(messages)
      expect(result.trend).toBe('improving')
    })

    it('detects declining trend', () => {
      const messages = [
        'Perfect!',
        'Thanks!',
        'Great!',
        'hmm',
        'Wrong',
        "Doesn't work"
      ]
      const result = analyzeConversation(messages)
      expect(result.trend).toBe('declining')
    })

    it('handles message objects with text property', () => {
      const messages = [
        { text: 'Thanks!', timestamp: '2026-01-31T10:00:00Z' },
        { text: 'Perfect!', timestamp: '2026-01-31T10:01:00Z' }
      ]
      const result = analyzeConversation(messages)
      expect(result.overall).toBe(SENTIMENT.POSITIVE)
    })

    it('provides recent sentiment', () => {
      const messages = [
        'Wrong', 'Wrong', 'Wrong', // old negative
        'Thanks! Perfect!', 'Awesome! Great job!', 'Amazing work!' // recent strong positive
      ]
      const result = analyzeConversation(messages)
      expect(result.recentSentiment).toBe(SENTIMENT.POSITIVE)
    })
  })

  describe('calculateFeedbackScore', () => {
    it('returns 50 for empty analysis', () => {
      expect(calculateFeedbackScore(null)).toBe(50)
      expect(calculateFeedbackScore({ totalMessages: 0 })).toBe(50)
    })

    it('returns high score for positive conversation', () => {
      const analysis = {
        totalMessages: 10,
        distribution: { positive: 8, negative: 1, neutral: 1 }, // 8:1 positive ratio
        satisfactionRate: 80,
        frustrationRate: 10,
        trend: 'improving',
        recentSentiment: SENTIMENT.POSITIVE
      }
      const score = calculateFeedbackScore(analysis)
      // Base: 50 + (7/9)*40 = 81, + improving(8) + recent positive(5) = 94
      expect(score).toBeGreaterThan(80)
    })

    it('returns low score for negative conversation', () => {
      const analysis = {
        totalMessages: 10,
        distribution: { positive: 1, negative: 8, neutral: 1 }, // 1:8 negative ratio
        satisfactionRate: 10,
        frustrationRate: 80,
        trend: 'declining',
        recentSentiment: SENTIMENT.NEGATIVE
      }
      const score = calculateFeedbackScore(analysis)
      // Base: 50 + (-7/9)*40 = 19, - declining(8) - recent negative(5) = 6
      expect(score).toBeLessThan(30)
    })

    it('adjusts for trend', () => {
      const improving = {
        totalMessages: 10,
        distribution: { positive: 5, negative: 5, neutral: 0 }, // Neutral ratio
        satisfactionRate: 50,
        frustrationRate: 50,
        trend: 'improving',
        recentSentiment: SENTIMENT.NEUTRAL
      }
      const declining = {
        ...improving,
        trend: 'declining'
      }

      expect(calculateFeedbackScore(improving)).toBeGreaterThan(
        calculateFeedbackScore(declining)
      )
    })

    it('caps score between 0 and 100', () => {
      const veryPositive = {
        totalMessages: 10,
        distribution: { positive: 10, negative: 0, neutral: 0 },
        satisfactionRate: 100,
        frustrationRate: 0,
        trend: 'improving',
        recentSentiment: SENTIMENT.POSITIVE
      }
      const veryNegative = {
        totalMessages: 10,
        distribution: { positive: 0, negative: 10, neutral: 0 },
        satisfactionRate: 0,
        frustrationRate: 100,
        trend: 'declining',
        recentSentiment: SENTIMENT.NEGATIVE
      }

      expect(calculateFeedbackScore(veryPositive)).toBeLessThanOrEqual(100)
      expect(calculateFeedbackScore(veryNegative)).toBeGreaterThanOrEqual(0)
    })
  })
})
