import { describe, it, expect } from 'vitest';
import {
  detectError,
  detectRecoveryAttempt,
  detectSuccess,
  calculateRecoveryMetrics,
  formatRecoveryTime
} from '../../../src/domain/services/ErrorRecoveryTracker.js';

describe('ErrorRecoveryTracker', () => {
  describe('detectError', () => {
    it('detects generic errors', () => {
      const result = detectError('Error: something went wrong');
      expect(result.isError).toBe(true);
      expect(result.type).toBe('generic');
    });

    it('detects file errors', () => {
      const result = detectError('ENOENT: no such file');
      expect(result.isError).toBe(true);
      expect(result.type).toBe('file');
    });

    it('detects permission errors', () => {
      const result = detectError('Permission denied');
      expect(result.isError).toBe(true);
      expect(result.type).toBe('permission');
    });

    it('returns false for success messages', () => {
      const result = detectError('Successfully completed');
      expect(result.isError).toBe(false);
    });
  });

  describe('detectRecoveryAttempt', () => {
    it('detects retry attempts', () => {
      const result = detectRecoveryAttempt('Let me try again');
      expect(result.isRecovery).toBe(true);
      expect(result.strategy).toBe('retry');
    });

    it('detects alternative approaches', () => {
      const result = detectRecoveryAttempt("I'll use a different approach");
      expect(result.isRecovery).toBe(true);
      expect(result.strategy).toBe('alternative');
    });
  });

  describe('detectSuccess', () => {
    it('detects success signals', () => {
      expect(detectSuccess('Fixed!')).toBe(true);
      expect(detectSuccess('✅')).toBe(true);
      expect(detectSuccess('That worked')).toBe(true);
    });

    it('returns false for failures', () => {
      expect(detectSuccess('Still broken')).toBe(false);
    });
  });

  describe('calculateRecoveryMetrics', () => {
    it('calculates recovery rate', () => {
      const events = [
        { errorType: 'file', recovered: true, recoveryTimeMs: 1000 },
        { errorType: 'file', recovered: false }
      ];

      const metrics = calculateRecoveryMetrics(events);
      expect(metrics.recoveryRate).toBe(50);
      expect(metrics.avgRecoveryTimeMs).toBe(1000);
    });

    it('groups by error type', () => {
      const events = [
        { errorType: 'file', recovered: true },
        { errorType: 'network', recovered: false }
      ];

      const metrics = calculateRecoveryMetrics(events);
      expect(metrics.byType.file.recoveryRate).toBe(100);
      expect(metrics.byType.network.recoveryRate).toBe(0);
    });
  });

  describe('formatRecoveryTime', () => {
    it('formats null', () => {
      expect(formatRecoveryTime(null)).toBe('N/A');
    });

    it('formats milliseconds', () => {
      expect(formatRecoveryTime(500)).toBe('500ms');
    });

    it('formats seconds', () => {
      expect(formatRecoveryTime(5000)).toBe('5.0s');
    });
  });
});
