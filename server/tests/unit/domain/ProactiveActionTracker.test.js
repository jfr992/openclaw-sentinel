import { describe, it, expect } from 'vitest';
import {
  detectProactiveAction,
  assessActionValue,
  calculateProactiveMetrics
} from '../../../src/domain/services/ProactiveActionTracker.js';

describe('ProactiveActionTracker', () => {
  describe('detectProactiveAction', () => {
    it('detects heartbeat actions', () => {
      const result = detectProactiveAction('HEARTBEAT_OK');
      expect(result.isProactive).toBe(true);
      expect(result.type).toBe('heartbeat');
    });

    it('detects check actions', () => {
      const result = detectProactiveAction('Checking email for urgent messages');
      expect(result.isProactive).toBe(true);
      expect(result.type).toBe('check');
    });

    it('detects observations', () => {
      const result = detectProactiveAction('I noticed the build failed');
      expect(result.isProactive).toBe(true);
      expect(result.type).toBe('observation');
    });

    it('returns false when responding to request', () => {
      const result = detectProactiveAction('Done!', 'Can you fix the bug?');
      expect(result.isProactive).toBe(false);
    });
  });

  describe('assessActionValue', () => {
    it('returns high for urgent items', () => {
      expect(assessActionValue('Urgent email from boss')).toBe('high');
    });

    it('returns medium for reminders', () => {
      expect(assessActionValue('Reminder: meeting in 1 hour')).toBe('medium');
    });

    it('returns none for empty heartbeats', () => {
      expect(assessActionValue('HEARTBEAT_OK')).toBe('none');
    });
  });

  describe('calculateProactiveMetrics', () => {
    it('calculates proactive rate', () => {
      const actions = [
        { type: 'heartbeat', value: 'none' },
        { type: 'check', value: 'high' }
      ];

      const metrics = calculateProactiveMetrics(actions, 10);
      expect(metrics.totalActions).toBe(2);
      expect(metrics.proactiveRate).toBe(20);
    });

    it('calculates value score', () => {
      const actions = [
        { type: 'check', value: 'high' },
        { type: 'check', value: 'high' }
      ];

      const metrics = calculateProactiveMetrics(actions);
      expect(metrics.valueScore).toBe(100);
    });

    it('provides recommendations', () => {
      const actions = [];
      const metrics = calculateProactiveMetrics(actions);
      expect(metrics.recommendations.length).toBeGreaterThan(0);
    });
  });
});
