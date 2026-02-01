import { describe, it, expect } from 'vitest';
import {
  calculateLatency,
  estimateComplexity,
  extractLatencies,
  calculateLatencyMetrics,
  formatLatency
} from '../../../src/domain/services/ResponseLatencyTracker.js';

describe('ResponseLatencyTracker', () => {
  describe('calculateLatency', () => {
    it('calculates ms between timestamps', () => {
      const start = new Date('2026-01-31T10:00:00Z');
      const end = new Date('2026-01-31T10:00:05Z');
      expect(calculateLatency(start, end)).toBe(5000);
    });

    it('handles string timestamps', () => {
      expect(calculateLatency('2026-01-31T10:00:00Z', '2026-01-31T10:00:01Z')).toBe(1000);
    });

    it('returns 0 for invalid timestamps', () => {
      expect(calculateLatency('invalid', 'also invalid')).toBe(0);
    });
  });

  describe('estimateComplexity', () => {
    it('returns simple for short text', () => {
      expect(estimateComplexity('Yes')).toBe('simple');
    });

    it('returns complex for code blocks with many tools', () => {
      expect(estimateComplexity('```js\ncode\n```', 5)).toBe('complex');
    });

    it('returns moderate for medium complexity', () => {
      const mediumText = 'word '.repeat(60);
      expect(estimateComplexity(mediumText, 1)).toBe('moderate');
    });
  });

  describe('extractLatencies', () => {
    it('extracts user->assistant latencies', () => {
      const messages = [
        { role: 'user', content: 'Hi', timestamp: 1000 },
        { role: 'assistant', content: 'Hello', timestamp: 2000 }
      ];
      
      const latencies = extractLatencies(messages);
      expect(latencies).toHaveLength(1);
      expect(latencies[0].latencyMs).toBe(1000);
    });
  });

  describe('calculateLatencyMetrics', () => {
    it('calculates aggregate metrics', () => {
      const latencies = [
        { latencyMs: 100, complexity: 'simple', timestamp: 1 },
        { latencyMs: 200, complexity: 'simple', timestamp: 2 },
        { latencyMs: 300, complexity: 'complex', timestamp: 3 }
      ];

      const metrics = calculateLatencyMetrics(latencies);
      
      expect(metrics.count).toBe(3);
      expect(metrics.avgMs).toBe(200);
      expect(metrics.minMs).toBe(100);
      expect(metrics.maxMs).toBe(300);
    });

    it('handles empty input', () => {
      const metrics = calculateLatencyMetrics([]);
      expect(metrics.count).toBe(0);
      expect(metrics.avgMs).toBe(0);
    });
  });

  describe('formatLatency', () => {
    it('formats milliseconds', () => {
      expect(formatLatency(500)).toBe('500ms');
    });

    it('formats seconds', () => {
      expect(formatLatency(5000)).toBe('5.0s');
    });

    it('formats minutes', () => {
      expect(formatLatency(120000)).toBe('2.0m');
    });
  });
});
