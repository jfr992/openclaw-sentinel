import { describe, it, expect } from 'vitest';
import {
  parseToolCalls,
  isRetry,
  calculateReliabilityMetrics,
  getHealthStatus
} from '../../../src/domain/services/ToolReliabilityTracker.js';

describe('ToolReliabilityTracker', () => {
  describe('parseToolCalls', () => {
    it('parses structured tool_calls', () => {
      const message = {
        tool_calls: [
          { name: 'exec', error: null },
          { name: 'read', error: 'not found' }
        ]
      };
      
      const calls = parseToolCalls(message);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual({ tool: 'exec', success: true, error: null, duration: null });
      expect(calls[1].success).toBe(false);
    });

    it('detects errors in content', () => {
      const message = { content: 'Error: command not found' };
      const calls = parseToolCalls(message);
      expect(calls.some(c => !c.success)).toBe(true);
    });

    it('detects success patterns', () => {
      const message = { content: 'Successfully wrote 100 bytes' };
      const calls = parseToolCalls(message);
      expect(calls.some(c => c.success && c.tool === 'write')).toBe(true);
    });
  });

  describe('isRetry', () => {
    it('detects retry of failed call', () => {
      const history = [{ tool: 'exec', success: false }];
      expect(isRetry(history, 'exec')).toBe(true);
    });

    it('returns false for first call', () => {
      expect(isRetry([], 'exec')).toBe(false);
    });
  });

  describe('calculateReliabilityMetrics', () => {
    it('calculates success rate', () => {
      const calls = [
        { tool: 'exec', success: true },
        { tool: 'exec', success: true },
        { tool: 'exec', success: false }
      ];

      const metrics = calculateReliabilityMetrics(calls);
      expect(metrics.successRate).toBe(67);
      expect(metrics.failureRate).toBe(33);
    });

    it('groups by tool', () => {
      const calls = [
        { tool: 'exec', success: true },
        { tool: 'read', success: false }
      ];

      const metrics = calculateReliabilityMetrics(calls);
      expect(metrics.byTool.exec.successRate).toBe(100);
      expect(metrics.byTool.read.successRate).toBe(0);
    });
  });

  describe('getHealthStatus', () => {
    it('returns healthy for high success rate', () => {
      expect(getHealthStatus({ successRate: 98, totalCalls: 100 })).toBe('healthy');
    });

    it('returns degraded for medium success rate', () => {
      expect(getHealthStatus({ successRate: 85, totalCalls: 100 })).toBe('degraded');
    });

    it('returns unhealthy for low success rate', () => {
      expect(getHealthStatus({ successRate: 70, totalCalls: 100 })).toBe('unhealthy');
    });
  });
});
