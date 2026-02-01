/**
 * ToolReliabilityTracker - Tracks tool success/failure rates
 *
 * Monitors:
 * - Which tools succeed vs fail
 * - Error patterns by tool
 * - Retry rates
 * - Tool usage frequency
 */

// Known tool names (expand as needed)
const KNOWN_TOOLS = [
  'read', 'write', 'edit', 'exec', 'process',
  'web_search', 'web_fetch', 'browser',
  'canvas', 'nodes', 'cron', 'message',
  'gateway', 'sessions_spawn', 'sessions_send',
  'session_status', 'image', 'tts'
];

/**
 * Parse tool calls from a message
 * @param {object} message - Message with potential tool calls
 * @returns {Array<{tool: string, success: boolean, error?: string, duration?: number}>}
 */
export function parseToolCalls(message) {
  const calls = [];

  if (!message) return calls;

  // Handle OpenClaw format: content array with type: "toolCall"
  if (Array.isArray(message.content)) {
    for (const item of message.content) {
      if (item.type === 'toolCall' && item.name) {
        calls.push({
          tool: item.name,
          success: true, // Assume success, toolResult will update
          error: null,
          id: item.id
        });
      }
      // Check for tool errors in toolResult
      if (item.type === 'toolResult' || item.type === 'tool_result') {
        const hasError = item.error ||
          (typeof item.content === 'string' && /error|failed|denied|ENOENT/i.test(item.content));
        if (hasError && item.toolCallId) {
          calls.push({
            tool: item.name || 'unknown',
            success: false,
            error: typeof item.content === 'string' ? item.content.slice(0, 100) : 'Error',
            id: item.toolCallId
          });
        }
      }
    }
  }

  // Handle structured tool_calls array (fallback for other formats)
  if (Array.isArray(message.tool_calls)) {
    for (const call of message.tool_calls) {
      calls.push({
        tool: call.name || call.function?.name || 'unknown',
        success: !call.error,
        error: call.error || null,
        duration: call.duration || null
      });
    }
  }

  // Handle tool_results in content string
  if (message.content && typeof message.content === 'string') {
    // Detect error patterns in tool output
    const errorPatterns = [
      { pattern: /error[:\s]/i, tool: 'exec' },
      { pattern: /command not found/i, tool: 'exec' },
      { pattern: /permission denied/i, tool: 'exec' },
      { pattern: /ENOENT/i, tool: 'read' },
      { pattern: /no such file/i, tool: 'read' },
      { pattern: /Failed to fetch/i, tool: 'web_fetch' },
      { pattern: /timeout/i, tool: 'unknown' },
      { pattern: /Connection refused/i, tool: 'unknown' },
    ];

    for (const { pattern, tool } of errorPatterns) {
      if (pattern.test(message.content)) {
        calls.push({
          tool,
          success: false,
          error: message.content.slice(0, 100)
        });
      }
    }

    // Detect success patterns
    const successPatterns = [
      { pattern: /Successfully wrote/i, tool: 'write' },
      { pattern: /Successfully replaced/i, tool: 'edit' },
      { pattern: /Process exited with code 0/i, tool: 'exec' },
    ];

    for (const { pattern, tool } of successPatterns) {
      if (pattern.test(message.content)) {
        calls.push({
          tool,
          success: true
        });
      }
    }
  }

  return calls;
}

/**
 * Detect if a tool call is a retry of a previous failed call
 * @param {Array<{tool: string, success: boolean}>} history - Previous calls
 * @param {string} tool - Current tool being called
 * @returns {boolean}
 */
export function isRetry(history, tool) {
  if (!Array.isArray(history) || history.length === 0) return false;

  // Check last 3 calls for a failed call of the same tool
  const recent = history.slice(-3);
  return recent.some(call => call.tool === tool && !call.success);
}

/**
 * Calculate tool reliability metrics
 * @param {Array<{tool: string, success: boolean, error?: string}>} calls - All tool calls
 * @returns {object} Reliability metrics
 */
export function calculateReliabilityMetrics(calls) {
  if (!Array.isArray(calls) || calls.length === 0) {
    return {
      totalCalls: 0,
      successRate: 100,
      failureRate: 0,
      byTool: {},
      topFailures: [],
      retryRate: 0,
      mostUsed: [],
      leastReliable: []
    };
  }

  const byTool = {};
  let retries = 0;

  // Track call history for retry detection
  const history = [];

  for (const call of calls) {
    const tool = call.tool || 'unknown';

    if (!byTool[tool]) {
      byTool[tool] = {
        total: 0,
        success: 0,
        failures: 0,
        errors: [],
        retries: 0
      };
    }

    byTool[tool].total++;

    if (call.success) {
      byTool[tool].success++;
    } else {
      byTool[tool].failures++;
      if (call.error) {
        byTool[tool].errors.push(call.error);
      }
    }

    if (isRetry(history, tool)) {
      byTool[tool].retries++;
      retries++;
    }

    history.push(call);
  }

  // Calculate aggregate stats
  const totalCalls = calls.length;
  const totalSuccess = calls.filter(c => c.success).length;
  const totalFailures = totalCalls - totalSuccess;

  // Format byTool with rates
  const formattedByTool = {};
  for (const [tool, stats] of Object.entries(byTool)) {
    formattedByTool[tool] = {
      total: stats.total,
      success: stats.success,
      failures: stats.failures,
      successRate: stats.total > 0
        ? Math.round((stats.success / stats.total) * 100)
        : 100,
      retryRate: stats.total > 0
        ? Math.round((stats.retries / stats.total) * 100)
        : 0,
      commonErrors: [...new Set(stats.errors)].slice(0, 3)
    };
  }

  // Sort for rankings
  const toolList = Object.entries(formattedByTool);

  const mostUsed = toolList
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([tool, stats]) => ({ tool, count: stats.total }));

  const leastReliable = toolList
    .filter(([_, stats]) => stats.total >= 3) // At least 3 calls
    .sort((a, b) => a[1].successRate - b[1].successRate)
    .slice(0, 5)
    .map(([tool, stats]) => ({
      tool,
      successRate: stats.successRate,
      failures: stats.failures
    }));

  const topFailures = toolList
    .sort((a, b) => b[1].failures - a[1].failures)
    .slice(0, 5)
    .filter(([_, stats]) => stats.failures > 0)
    .map(([tool, stats]) => ({
      tool,
      failures: stats.failures,
      commonErrors: stats.commonErrors
    }));

  return {
    totalCalls,
    successRate: totalCalls > 0
      ? Math.round((totalSuccess / totalCalls) * 100)
      : 100,
    failureRate: totalCalls > 0
      ? Math.round((totalFailures / totalCalls) * 100)
      : 0,
    retryRate: totalCalls > 0
      ? Math.round((retries / totalCalls) * 100)
      : 0,
    byTool: formattedByTool,
    mostUsed,
    leastReliable,
    topFailures
  };
}

/**
 * Get health status based on reliability
 * @param {object} metrics - Reliability metrics
 * @returns {'healthy'|'degraded'|'unhealthy'}
 */
export function getHealthStatus(metrics) {
  if (!metrics || metrics.totalCalls === 0) return 'healthy';

  if (metrics.successRate >= 95) return 'healthy';
  if (metrics.successRate >= 80) return 'degraded';
  return 'unhealthy';
}

export default {
  parseToolCalls,
  isRetry,
  calculateReliabilityMetrics,
  getHealthStatus
};
