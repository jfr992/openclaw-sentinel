import { describe, it, expect } from 'vitest'
import {
  buildBaseline,
  detectAnomalies,
  calculateAnomalyScore,
  ANOMALY_TYPES
} from '../../../src/domain/services/AnomalyDetector.js'

describe('AnomalyDetector', () => {
  describe('buildBaseline', () => {
    it('returns empty baseline for no data', () => {
      const baseline = buildBaseline([])
      expect(baseline.averageCallsPerHour).toBe(0)
      expect(baseline.averageCallsPerDay).toBe(0)
      expect(baseline.knownTools.size).toBe(0)
    })

    it('calculates tool frequency correctly', () => {
      const calls = [
        { name: 'exec', timestamp: '2026-01-30T10:00:00Z' },
        { name: 'exec', timestamp: '2026-01-30T11:00:00Z' },
        { name: 'Read', timestamp: '2026-01-30T12:00:00Z' }
      ]
      const baseline = buildBaseline(calls)
      expect(baseline.toolFrequency['exec']).toBe(2)
      expect(baseline.toolFrequency['Read']).toBe(1)
      expect(baseline.knownTools.has('exec')).toBe(true)
      expect(baseline.knownTools.has('Read')).toBe(true)
    })

    it('calculates hourly distribution', () => {
      // Use local time to avoid timezone conversion issues
      const now = new Date()
      const hour1 = new Date(now.setHours(10, 0, 0, 0))
      const hour2 = new Date(now.setHours(10, 30, 0, 0))
      const hour3 = new Date(now.setHours(14, 0, 0, 0))

      const calls = [
        { name: 'exec', timestamp: hour1.toISOString() },
        { name: 'exec', timestamp: hour2.toISOString() },
        { name: 'exec', timestamp: hour3.toISOString() }
      ]
      const baseline = buildBaseline(calls)
      expect(baseline.hourlyDistribution[10]).toBe(2)
      expect(baseline.hourlyDistribution[14]).toBe(1)
    })

    it('calculates daily averages', () => {
      const calls = [
        { name: 'exec', timestamp: '2026-01-30T10:00:00Z' },
        { name: 'exec', timestamp: '2026-01-30T11:00:00Z' },
        { name: 'exec', timestamp: '2026-01-31T10:00:00Z' }
      ]
      const baseline = buildBaseline(calls)
      expect(baseline.totalDays).toBe(2)
      expect(baseline.averageCallsPerDay).toBe(1.5)
    })
  })

  describe('detectAnomalies', () => {
    const baseline = buildBaseline([
      { name: 'exec', timestamp: '2026-01-30T10:00:00Z' },
      { name: 'exec', timestamp: '2026-01-30T11:00:00Z' },
      { name: 'Read', timestamp: '2026-01-30T12:00:00Z' },
      { name: 'Write', timestamp: '2026-01-30T13:00:00Z' }
    ])

    it('returns empty for no current calls', () => {
      const anomalies = detectAnomalies([], baseline)
      expect(anomalies).toEqual([])
    })

    it('detects burst activity', () => {
      // Baseline: 4 calls in 1 day = ~0.17 per hour
      // Current: 10 calls = burst
      const currentCalls = Array(10).fill().map((_, i) => ({
        name: 'exec',
        timestamp: new Date().toISOString()
      }))

      const anomalies = detectAnomalies(currentCalls, baseline, { burstThreshold: 3 })
      expect(anomalies.some(a => a.type === ANOMALY_TYPES.BURST_ACTIVITY)).toBe(true)
    })

    it('detects new tools', () => {
      const currentCalls = [
        { name: 'newTool', timestamp: new Date().toISOString() }
      ]

      const anomalies = detectAnomalies(currentCalls, baseline)
      const newToolAnomaly = anomalies.find(a => a.type === ANOMALY_TYPES.NEW_TOOL)
      expect(newToolAnomaly).toBeDefined()
      expect(newToolAnomaly.details.newTools).toContain('newTool')
    })

    it('does not flag known tools as new', () => {
      const currentCalls = [
        { name: 'exec', timestamp: new Date().toISOString() }
      ]

      const anomalies = detectAnomalies(currentCalls, baseline)
      expect(anomalies.some(a => a.type === ANOMALY_TYPES.NEW_TOOL)).toBe(false)
    })

    it('detects rapid succession', () => {
      const baseTime = new Date('2026-01-31T10:00:00Z')
      const currentCalls = Array(10).fill().map((_, i) => ({
        name: 'exec',
        timestamp: new Date(baseTime.getTime() + i * 100).toISOString() // 100ms apart
      }))

      const anomalies = detectAnomalies(currentCalls, baseline, { rapidSuccessionMs: 500 })
      expect(anomalies.some(a => a.type === ANOMALY_TYPES.RAPID_SUCCESSION)).toBe(true)
    })

    it('detects off-hours activity', () => {
      // Create baseline with only daytime activity (10 AM - 6 PM local time)
      const now = new Date()
      const daytimeCalls = Array(100).fill().map((_, i) => {
        const d = new Date(now)
        d.setDate(d.getDate() - (i % 7))
        d.setHours(10 + (i % 8), 0, 0, 0) // Hours 10-17 (10 AM - 5 PM)
        return { name: 'exec', timestamp: d.toISOString() }
      })
      const daytimeBaseline = buildBaseline(daytimeCalls)

      // Current calls at 2 AM local time
      const offHoursTime = new Date(now)
      offHoursTime.setHours(2, 0, 0, 0)
      const currentCalls = Array(5).fill().map(() => ({
        name: 'exec',
        timestamp: offHoursTime.toISOString()
      }))

      const anomalies = detectAnomalies(currentCalls, daytimeBaseline, {
        offHoursStart: 23,
        offHoursEnd: 6
      })
      expect(anomalies.some(a => a.type === ANOMALY_TYPES.OFF_HOURS)).toBe(true)
    })
  })

  describe('calculateAnomalyScore', () => {
    it('returns 0 for no anomalies', () => {
      expect(calculateAnomalyScore([])).toBe(0)
    })

    it('calculates score based on severity', () => {
      const anomalies = [
        { severity: 'low' },    // 5 points
        { severity: 'medium' }  // 15 points
      ]
      expect(calculateAnomalyScore(anomalies)).toBe(20)
    })

    it('caps score at 100', () => {
      const anomalies = Array(10).fill({ severity: 'high' }) // 10 * 30 = 300
      expect(calculateAnomalyScore(anomalies)).toBe(100)
    })

    it('handles mixed severities', () => {
      const anomalies = [
        { severity: 'high' },   // 30
        { severity: 'medium' }, // 15
        { severity: 'low' },    // 5
        { severity: 'low' }     // 5
      ]
      expect(calculateAnomalyScore(anomalies)).toBe(55)
    })
  })
})
