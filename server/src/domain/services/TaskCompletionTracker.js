/**
 * TaskCompletionTracker - Measures whether tasks were actually completed
 *
 * Analyzes conversation patterns to detect:
 * - User requests and whether they were fulfilled
 * - Follow-up questions indicating incomplete work
 * - Explicit confirmations of completion
 */

// Patterns indicating a task request
const TASK_PATTERNS = [
  /can you\s+(\w+)/i,
  /please\s+(\w+)/i,
  /I need\s+(.+)/i,
  /create\s+(.+)/i,
  /build\s+(.+)/i,
  /add\s+(.+)/i,
  /fix\s+(.+)/i,
  /update\s+(.+)/i,
  /make\s+(.+)/i,
  /write\s+(.+)/i,
  /implement\s+(.+)/i,
  /set up\s+(.+)/i,
  /configure\s+(.+)/i,
];

// Patterns indicating completion
const COMPLETION_PATTERNS = [
  /done/i,
  /complete/i,
  /finished/i,
  /ready/i,
  /✅/,
  /all set/i,
  /working now/i,
  /fixed/i,
  /created/i,
  /built/i,
  /added/i,
];

// Patterns indicating incompletion or need for follow-up
const INCOMPLETE_PATTERNS = [
  /didn't work/i,
  /still broken/i,
  /not working/i,
  /try again/i,
  /wrong/i,
  /that's not/i,
  /no,?\s+(I|you)/i,
  /actually/i,
  /wait/i,
  /stop/i,
];

// Patterns indicating user satisfaction (task done well)
const SATISFACTION_PATTERNS = [
  /thanks/i,
  /perfect/i,
  /great/i,
  /awesome/i,
  /nice/i,
  /good job/i,
  /exactly/i,
  /👍/,
  /🙏/,
];

/**
 * Detect if a message contains a task request
 * @param {string} text - Message text
 * @returns {{isTask: boolean, taskType: string|null}}
 */
export function detectTaskRequest(text) {
  if (!text || typeof text !== 'string') {
    return { isTask: false, taskType: null };
  }

  for (const pattern of TASK_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        isTask: true,
        taskType: match[1]?.toLowerCase() || 'unknown'
      };
    }
  }

  return { isTask: false, taskType: null };
}

/**
 * Detect completion signals in assistant response
 * @param {string} text - Assistant message text
 * @returns {{isComplete: boolean, confidence: number}}
 */
export function detectCompletion(text) {
  if (!text || typeof text !== 'string') {
    return { isComplete: false, confidence: 0 };
  }

  let signals = 0;
  const maxSignals = COMPLETION_PATTERNS.length;

  for (const pattern of COMPLETION_PATTERNS) {
    if (pattern.test(text)) {
      signals++;
    }
  }

  const confidence = signals / Math.min(3, maxSignals); // Cap at 3 signals for 100%
  return {
    isComplete: signals > 0,
    confidence: Math.min(1, confidence)
  };
}

/**
 * Detect if user response indicates task was NOT completed properly
 * @param {string} text - User follow-up message
 * @returns {{isIncomplete: boolean, signals: string[]}}
 */
export function detectIncomplete(text) {
  if (!text || typeof text !== 'string') {
    return { isIncomplete: false, signals: [] };
  }

  const signals = [];

  for (const pattern of INCOMPLETE_PATTERNS) {
    if (pattern.test(text)) {
      signals.push(pattern.source);
    }
  }

  return {
    isIncomplete: signals.length > 0,
    signals
  };
}

/**
 * Detect user satisfaction
 * @param {string} text - User message
 * @returns {{isSatisfied: boolean, confidence: number}}
 */
export function detectSatisfaction(text) {
  if (!text || typeof text !== 'string') {
    return { isSatisfied: false, confidence: 0 };
  }

  let signals = 0;

  for (const pattern of SATISFACTION_PATTERNS) {
    if (pattern.test(text)) {
      signals++;
    }
  }

  return {
    isSatisfied: signals > 0,
    confidence: Math.min(1, signals / 2)
  };
}

/**
 * Extract text content from message (handles string or array format)
 * @param {string|Array} content - Message content
 * @returns {string}
 */
function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(item => item.type === 'text' && item.text)
      .map(item => item.text)
      .join('\n');
  }
  return '';
}

/**
 * Calculate task completion metrics from conversation
 * @param {Array<{role: string, content: string|Array}>} messages - Conversation messages
 * @returns {object} Task completion metrics
 */
export function calculateTaskMetrics(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      completionRate: 0,
      avgConfidence: 0,
      taskTypes: {}
    };
  }

  const tasks = [];
  let currentTask = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const content = extractText(msg.content);

    if (msg.role === 'user') {
      const taskDetection = detectTaskRequest(content);

      if (taskDetection.isTask) {
        // Save previous task if exists
        if (currentTask) {
          tasks.push(currentTask);
        }

        currentTask = {
          type: taskDetection.taskType,
          startIndex: i,
          completed: false,
          confidence: 0,
          satisfied: false
        };
      } else if (currentTask) {
        // Check if this is feedback on the task
        const incomplete = detectIncomplete(content);
        const satisfaction = detectSatisfaction(content);

        if (incomplete.isIncomplete) {
          currentTask.completed = false;
          currentTask.confidence = 0;
        } else if (satisfaction.isSatisfied) {
          currentTask.satisfied = true;
          currentTask.completed = true;
          currentTask.confidence = Math.max(currentTask.confidence, satisfaction.confidence);
        }
      }
    } else if (msg.role === 'assistant' && currentTask) {
      const completion = detectCompletion(content);

      if (completion.isComplete) {
        currentTask.completed = true;
        currentTask.confidence = Math.max(currentTask.confidence, completion.confidence);
      }
    }
  }

  // Don't forget the last task
  if (currentTask) {
    tasks.push(currentTask);
  }

  // Calculate metrics
  const completedTasks = tasks.filter(t => t.completed).length;
  const failedTasks = tasks.filter(t => !t.completed).length;
  const totalConfidence = tasks.reduce((sum, t) => sum + t.confidence, 0);

  // Count task types
  const taskTypes = {};
  for (const task of tasks) {
    taskTypes[task.type] = (taskTypes[task.type] || 0) + 1;
  }

  return {
    totalTasks: tasks.length,
    completedTasks,
    failedTasks,
    completionRate: tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0,
    avgConfidence: tasks.length > 0 ? (totalConfidence / tasks.length) * 100 : 0,
    satisfactionRate: tasks.length > 0
      ? (tasks.filter(t => t.satisfied).length / tasks.length) * 100
      : 0,
    taskTypes,
    tasks // Include raw tasks for debugging
  };
}

export default {
  detectTaskRequest,
  detectCompletion,
  detectIncomplete,
  detectSatisfaction,
  calculateTaskMetrics
};
