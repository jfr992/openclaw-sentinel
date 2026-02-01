import { describe, it, expect } from 'vitest';
import {
  detectTaskRequest,
  detectCompletion,
  detectIncomplete,
  detectSatisfaction,
  calculateTaskMetrics
} from '../../../src/domain/services/TaskCompletionTracker.js';

describe('TaskCompletionTracker', () => {
  describe('detectTaskRequest', () => {
    it('detects "can you" requests', () => {
      const result = detectTaskRequest('Can you build a dashboard?');
      expect(result.isTask).toBe(true);
      expect(result.taskType).toBe('build');
    });

    it('detects "please" requests', () => {
      const result = detectTaskRequest('Please fix the bug');
      expect(result.isTask).toBe(true);
      expect(result.taskType).toBe('fix');
    });

    it('detects "create" requests', () => {
      const result = detectTaskRequest('Create a new component');
      expect(result.isTask).toBe(true);
    });

    it('returns false for non-task messages', () => {
      const result = detectTaskRequest('Looks good!');
      expect(result.isTask).toBe(false);
    });
  });

  describe('detectCompletion', () => {
    it('detects completion signals', () => {
      const result = detectCompletion('Done! The file is ready.');
      expect(result.isComplete).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('detects emoji completion', () => {
      const result = detectCompletion('✅ Created successfully');
      expect(result.isComplete).toBe(true);
    });

    it('returns false for incomplete', () => {
      const result = detectCompletion('Working on it...');
      expect(result.isComplete).toBe(false);
    });
  });

  describe('detectIncomplete', () => {
    it('detects dissatisfaction', () => {
      const result = detectIncomplete("That didn't work");
      expect(result.isIncomplete).toBe(true);
    });

    it('detects corrections', () => {
      const result = detectIncomplete("No, I meant something else");
      expect(result.isIncomplete).toBe(true);
    });
  });

  describe('detectSatisfaction', () => {
    it('detects thanks', () => {
      const result = detectSatisfaction('Thanks!');
      expect(result.isSatisfied).toBe(true);
    });

    it('detects emoji satisfaction', () => {
      const result = detectSatisfaction('👍');
      expect(result.isSatisfied).toBe(true);
    });
  });

  describe('calculateTaskMetrics', () => {
    it('calculates metrics from conversation', () => {
      const messages = [
        { role: 'user', content: 'Can you create a file?' },
        { role: 'assistant', content: 'Done! File created ✅' },
        { role: 'user', content: 'Thanks!' }
      ];

      const metrics = calculateTaskMetrics(messages);
      
      expect(metrics.totalTasks).toBe(1);
      expect(metrics.completedTasks).toBe(1);
      expect(metrics.completionRate).toBe(100);
    });

    it('tracks failed tasks', () => {
      const messages = [
        { role: 'user', content: 'Please fix the bug' },
        { role: 'assistant', content: 'I fixed it' },
        { role: 'user', content: "That didn't work" }
      ];

      const metrics = calculateTaskMetrics(messages);
      
      expect(metrics.totalTasks).toBe(1);
      expect(metrics.failedTasks).toBe(1);
    });

    it('handles empty messages', () => {
      const metrics = calculateTaskMetrics([]);
      expect(metrics.totalTasks).toBe(0);
      expect(metrics.completionRate).toBe(0);
    });
  });
});
