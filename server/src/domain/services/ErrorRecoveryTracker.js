/**
 * ErrorRecoveryTracker - Tracks how quickly and effectively errors are recovered
 *
 * Monitors:
 * - Time between error and successful recovery
 * - Recovery strategies used
 * - Errors that weren't recovered
 * - Recovery patterns by error type
 */

// Patterns indicating an error occurred
const ERROR_PATTERNS = [
  { pattern: /error[:\s]/i, type: 'generic' },
  { pattern: /failed/i, type: 'failure' },
  { pattern: /command not found/i, type: 'command' },
  { pattern: /permission denied/i, type: 'permission' },
  { pattern: /ENOENT/i, type: 'file' },
  { pattern: /no such file/i, type: 'file' },
  { pattern: /Connection refused/i, type: 'network' },
  { pattern: /timeout/i, type: 'timeout' },
  { pattern: /404/i, type: 'notfound' },
  { pattern: /401|403/i, type: 'auth' },
  { pattern: /500|502|503/i, type: 'server' },
  { pattern: /syntax error/i, type: 'syntax' },
  { pattern: /undefined is not/i, type: 'runtime' },
  { pattern: /cannot read prop/i, type: 'runtime' },
];

// Patterns indicating recovery attempt
const RECOVERY_PATTERNS = [
  { pattern: /let me try/i, strategy: 'retry' },
  { pattern: /trying again/i, strategy: 'retry' },
  { pattern: /let me fix/i, strategy: 'fix' },
  { pattern: /I'll.*instead/i, strategy: 'alternative' },
  { pattern: /different approach/i, strategy: 'alternative' },
  { pattern: /workaround/i, strategy: 'workaround' },
  { pattern: /installing/i, strategy: 'install' },
  { pattern: /updating/i, strategy: 'update' },
  { pattern: /checking.*permission/i, strategy: 'permission' },
];

// Patterns indicating successful recovery
const SUCCESS_PATTERNS = [
  /now.*working/i,
  /fixed/i,
  /resolved/i,
  /success/i,
  /✅/,
  /done/i,
  /that worked/i,
];

/**
 * Detect error in message
 * @param {string} text - Message content
 * @returns {{isError: boolean, type: string|null, message: string|null}}
 */
export function detectError(text) {
  if (!text || typeof text !== 'string') {
    return { isError: false, type: null, message: null };
  }

  for (const { pattern, type } of ERROR_PATTERNS) {
    if (pattern.test(text)) {
      // Extract error message (first 100 chars after match)
      const match = text.match(pattern);
      const startIdx = match ? match.index : 0;
      const errorMsg = text.slice(startIdx, startIdx + 100);

      return {
        isError: true,
        type,
        message: errorMsg.trim()
      };
    }
  }

  return { isError: false, type: null, message: null };
}

/**
 * Detect recovery attempt in message
 * @param {string} text - Message content
 * @returns {{isRecovery: boolean, strategy: string|null}}
 */
export function detectRecoveryAttempt(text) {
  if (!text || typeof text !== 'string') {
    return { isRecovery: false, strategy: null };
  }

  for (const { pattern, strategy } of RECOVERY_PATTERNS) {
    if (pattern.test(text)) {
      return { isRecovery: true, strategy };
    }
  }

  return { isRecovery: false, strategy: null };
}

/**
 * Detect successful recovery
 * @param {string} text - Message content
 * @returns {boolean}
 */
export function detectSuccess(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  return SUCCESS_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Parse error recovery events from conversation
 * @param {Array<{role: string, content: string, timestamp?: number}>} messages
 * @returns {Array<{errorType: string, recoveryTimeMs: number|null, strategy: string|null, recovered: boolean}>}
 */
export function parseRecoveryEvents(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const events = [];
  let pendingError = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const content = msg.content || '';
    const timestamp = msg.timestamp || 0;

    const error = detectError(content);

    if (error.isError) {
      // Save pending error if not recovered
      if (pendingError && !pendingError.recovered) {
        events.push({
          ...pendingError,
          recoveryTimeMs: null,
          recovered: false
        });
      }

      pendingError = {
        errorType: error.type,
        errorMessage: error.message,
        timestamp,
        strategy: null,
        recovered: false
      };
    } else if (pendingError) {
      // Check for recovery attempt
      const recovery = detectRecoveryAttempt(content);
      if (recovery.isRecovery) {
        pendingError.strategy = recovery.strategy;
      }

      // Check for success
      if (detectSuccess(content)) {
        events.push({
          errorType: pendingError.errorType,
          errorMessage: pendingError.errorMessage,
          strategy: pendingError.strategy,
          recoveryTimeMs: timestamp > 0 && pendingError.timestamp > 0
            ? timestamp - pendingError.timestamp
            : null,
          recovered: true
        });
        pendingError = null;
      }
    }
  }

  // Handle last pending error
  if (pendingError) {
    events.push({
      errorType: pendingError.errorType,
      errorMessage: pendingError.errorMessage,
      strategy: pendingError.strategy,
      recoveryTimeMs: null,
      recovered: false
    });
  }

  return events;
}

/**
 * Calculate error recovery metrics
 * @param {Array<{errorType: string, recoveryTimeMs: number|null, strategy: string|null, recovered: boolean}>} events
 * @returns {object}
 */
export function calculateRecoveryMetrics(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      totalErrors: 0,
      recoveredErrors: 0,
      unrecoveredErrors: 0,
      recoveryRate: 100,
      avgRecoveryTimeMs: 0,
      byType: {},
      byStrategy: {},
      fastestRecoveryMs: null,
      slowestRecoveryMs: null
    };
  }

  const recovered = events.filter(e => e.recovered);
  const unrecovered = events.filter(e => !e.recovered);

  // Recovery times (only for recovered events with timing)
  const recoveryTimes = recovered
    .filter(e => e.recoveryTimeMs !== null)
    .map(e => e.recoveryTimeMs);

  const avgRecoveryTime = recoveryTimes.length > 0
    ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
    : 0;

  // Group by error type
  const byType = {};
  for (const event of events) {
    const type = event.errorType || 'unknown';
    if (!byType[type]) {
      byType[type] = { total: 0, recovered: 0 };
    }
    byType[type].total++;
    if (event.recovered) byType[type].recovered++;
  }

  // Calculate recovery rate per type
  for (const type of Object.keys(byType)) {
    byType[type].recoveryRate = byType[type].total > 0
      ? Math.round((byType[type].recovered / byType[type].total) * 100)
      : 0;
  }

  // Group by strategy
  const byStrategy = {};
  for (const event of recovered) {
    const strategy = event.strategy || 'unknown';
    byStrategy[strategy] = (byStrategy[strategy] || 0) + 1;
  }

  return {
    totalErrors: events.length,
    recoveredErrors: recovered.length,
    unrecoveredErrors: unrecovered.length,
    recoveryRate: events.length > 0
      ? Math.round((recovered.length / events.length) * 100)
      : 100,
    avgRecoveryTimeMs: Math.round(avgRecoveryTime),
    fastestRecoveryMs: recoveryTimes.length > 0 ? Math.min(...recoveryTimes) : null,
    slowestRecoveryMs: recoveryTimes.length > 0 ? Math.max(...recoveryTimes) : null,
    byType,
    byStrategy,
    mostCommonError: Object.entries(byType)
      .sort((a, b) => b[1].total - a[1].total)[0]?.[0] || null,
    mostEffectiveStrategy: Object.entries(byStrategy)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null
  };
}

/**
 * Format recovery time for display
 * @param {number|null} ms - Milliseconds
 * @returns {string}
 */
export function formatRecoveryTime(ms) {
  if (ms === null) return 'N/A';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default {
  detectError,
  detectRecoveryAttempt,
  detectSuccess,
  parseRecoveryEvents,
  calculateRecoveryMetrics,
  formatRecoveryTime
};
