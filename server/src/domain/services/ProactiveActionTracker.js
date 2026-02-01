/**
 * ProactiveActionTracker - Tracks actions taken without explicit user request
 * 
 * Monitors:
 * - Heartbeat-driven actions
 * - Autonomous checks (email, calendar, etc.)
 * - Preemptive maintenance (memory updates, cleanup)
 * - Self-initiated improvements
 */

// Patterns indicating a proactive action (not responding to explicit request)
const PROACTIVE_PATTERNS = [
  { pattern: /heartbeat/i, type: 'heartbeat' },
  { pattern: /HEARTBEAT_OK/i, type: 'heartbeat' },
  { pattern: /checking.*email/i, type: 'check' },
  { pattern: /checking.*calendar/i, type: 'check' },
  { pattern: /checking.*weather/i, type: 'check' },
  { pattern: /I noticed/i, type: 'observation' },
  { pattern: /I should mention/i, type: 'observation' },
  { pattern: /heads up/i, type: 'alert' },
  { pattern: /FYI/i, type: 'alert' },
  { pattern: /wanted to let you know/i, type: 'alert' },
  { pattern: /updating.*memory/i, type: 'maintenance' },
  { pattern: /cleaning up/i, type: 'maintenance' },
  { pattern: /committing/i, type: 'maintenance' },
  { pattern: /git push/i, type: 'maintenance' },
];

// Patterns indicating user-triggered (reactive) actions
const REACTIVE_PATTERNS = [
  /can you/i,
  /please/i,
  /could you/i,
  /I need/i,
  /do this/i,
  /make this/i,
  /\?$/,  // Questions
];

// Valuable proactive outcomes
const VALUABLE_OUTCOMES = [
  { pattern: /important email/i, value: 'high' },
  { pattern: /urgent/i, value: 'high' },
  { pattern: /reminder/i, value: 'medium' },
  { pattern: /upcoming event/i, value: 'medium' },
  { pattern: /updated.*memory/i, value: 'low' },
  { pattern: /committed/i, value: 'low' },
  { pattern: /nothing.*attention/i, value: 'none' },
  { pattern: /HEARTBEAT_OK/i, value: 'none' },
];

/**
 * Detect if a message is a proactive action
 * @param {string} text - Message content
 * @param {string} previousUserMessage - The user message before this
 * @returns {{isProactive: boolean, type: string|null, confidence: number}}
 */
export function detectProactiveAction(text, previousUserMessage = '') {
  if (!text || typeof text !== 'string') {
    return { isProactive: false, type: null, confidence: 0 };
  }

  // Check if previous message was a direct request (making this reactive)
  if (previousUserMessage) {
    for (const pattern of REACTIVE_PATTERNS) {
      if (pattern.test(previousUserMessage)) {
        return { isProactive: false, type: null, confidence: 0 };
      }
    }
  }

  // Check for proactive patterns
  for (const { pattern, type } of PROACTIVE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        isProactive: true,
        type,
        confidence: previousUserMessage ? 0.8 : 0.6 // Higher if we checked prev message
      };
    }
  }

  return { isProactive: false, type: null, confidence: 0 };
}

/**
 * Assess the value of a proactive action
 * @param {string} text - Action content
 * @returns {'high'|'medium'|'low'|'none'}
 */
export function assessActionValue(text) {
  if (!text || typeof text !== 'string') {
    return 'none';
  }

  for (const { pattern, value } of VALUABLE_OUTCOMES) {
    if (pattern.test(text)) {
      return value;
    }
  }

  // Default based on content length (longer = more substance)
  const words = text.split(/\s+/).length;
  if (words > 100) return 'medium';
  if (words > 30) return 'low';
  return 'none';
}

/**
 * Parse proactive actions from conversation
 * @param {Array<{role: string, content: string, timestamp?: number}>} messages
 * @returns {Array<{type: string, value: string, timestamp: number, content: string}>}
 */
export function parseProactiveActions(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const actions = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    if (msg.role !== 'assistant') continue;
    
    const previousUserMsg = i > 0 && messages[i - 1].role === 'user'
      ? messages[i - 1].content || ''
      : '';
    
    const detection = detectProactiveAction(msg.content || '', previousUserMsg);
    
    if (detection.isProactive) {
      actions.push({
        type: detection.type,
        value: assessActionValue(msg.content || ''),
        timestamp: msg.timestamp || Date.now(),
        content: (msg.content || '').slice(0, 200),
        confidence: detection.confidence
      });
    }
  }

  return actions;
}

/**
 * Calculate proactive action metrics
 * @param {Array<{type: string, value: string}>} actions
 * @param {number} totalMessages - Total assistant messages for rate calculation
 * @returns {object}
 */
export function calculateProactiveMetrics(actions, totalMessages = 0) {
  if (!Array.isArray(actions)) {
    return {
      totalActions: 0,
      proactiveRate: 0,
      byType: {},
      byValue: { high: 0, medium: 0, low: 0, none: 0 },
      valueScore: 0,
      mostCommonType: null
    };
  }

  const byType = {};
  const byValue = { high: 0, medium: 0, low: 0, none: 0 };

  for (const action of actions) {
    // Count by type
    byType[action.type] = (byType[action.type] || 0) + 1;
    
    // Count by value
    if (byValue[action.value] !== undefined) {
      byValue[action.value]++;
    }
  }

  // Calculate value score (weighted)
  const valueWeights = { high: 3, medium: 2, low: 1, none: 0 };
  const valueScore = actions.reduce((sum, a) => sum + (valueWeights[a.value] || 0), 0);
  const maxScore = actions.length * 3;
  const normalizedScore = maxScore > 0 ? Math.round((valueScore / maxScore) * 100) : 0;

  // Find most common type
  const sortedTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const mostCommonType = sortedTypes.length > 0 ? sortedTypes[0][0] : null;

  return {
    totalActions: actions.length,
    proactiveRate: totalMessages > 0 
      ? Math.round((actions.length / totalMessages) * 100)
      : 0,
    byType,
    byValue,
    valueScore: normalizedScore,
    mostCommonType,
    highValueActions: byValue.high + byValue.medium,
    recommendations: generateRecommendations(actions, byType, byValue)
  };
}

/**
 * Generate recommendations based on proactive patterns
 */
function generateRecommendations(actions, byType, byValue) {
  const recommendations = [];

  if (actions.length === 0) {
    recommendations.push('Consider enabling more proactive checks (heartbeat actions)');
  }

  if (byValue.none > byValue.high + byValue.medium) {
    recommendations.push('Many proactive actions have low value - focus on higher-impact checks');
  }

  if (byType.heartbeat > actions.length * 0.8) {
    recommendations.push('Most proactive actions are heartbeats - consider adding email/calendar checks');
  }

  if (!byType.maintenance) {
    recommendations.push('No maintenance actions detected - consider periodic memory/cleanup tasks');
  }

  return recommendations;
}

export default {
  detectProactiveAction,
  assessActionValue,
  parseProactiveActions,
  calculateProactiveMetrics
};
