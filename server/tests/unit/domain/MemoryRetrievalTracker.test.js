import { describe, it, expect } from 'vitest';
import {
  detectMemoryQuery,
  detectRetrievalUsed,
  detectContextLost,
  calculateMemoryMetrics
} from '../../../src/domain/services/MemoryRetrievalTracker.js';

describe('MemoryRetrievalTracker', () => {
  describe('detectMemoryQuery', () => {
    it('detects vector memory queries', () => {
      const result = detectMemoryQuery('curl localhost:5057/query');
      expect(result.isQuery).toBe(true);
      expect(result.type).toBe('vector');
    });

    it('detects memory file reads', () => {
      const result = detectMemoryQuery('Reading memory/2026-01-31.md');
      expect(result.isQuery).toBe(true);
      expect(result.type).toBe('file');
    });

    it('returns false for regular text', () => {
      const result = detectMemoryQuery('Hello world');
      expect(result.isQuery).toBe(false);
    });
  });

  describe('detectRetrievalUsed', () => {
    it('detects when memory was used', () => {
      const result = detectRetrievalUsed('Found in memory: the project is at ~/clawd');
      expect(result.wasUsed).toBe(true);
    });

    it('returns false when not used', () => {
      const result = detectRetrievalUsed('I created a new file');
      expect(result.wasUsed).toBe(false);
    });
  });

  describe('detectContextLost', () => {
    it('detects context loss signals', () => {
      expect(detectContextLost("I don't have context for that")).toBe(true);
      expect(detectContextLost('What were we working on?')).toBe(true);
    });

    it('returns false for normal messages', () => {
      expect(detectContextLost('Done!')).toBe(false);
    });
  });

  describe('calculateMemoryMetrics', () => {
    it('calculates usage rate', () => {
      const events = [
        { type: 'vector', wasUsed: true },
        { type: 'vector', wasUsed: false },
        { type: 'file', wasUsed: true }
      ];

      const metrics = calculateMemoryMetrics(events);
      expect(metrics.totalQueries).toBe(3);
      expect(metrics.usageRate).toBe(67);
    });

    it('detects underutilization', () => {
      const events = [];
      const messages = [
        { role: 'assistant', content: "I don't have context for that" }
      ];

      const metrics = calculateMemoryMetrics(events, messages);
      expect(metrics.effectiveness).toBe('underutilized');
    });
  });
});
