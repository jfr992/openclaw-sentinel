/**
 * ResponseLatencyTracker - Measures time between user message and assistant response
 * 
 * Tracks:
 * - Time to first response
 * - Average response time
 * - Response time by complexity (simple vs tool-heavy)
 * - Latency trends over time
 */

/**
 * Calculate latency between two timestamps
 * @param {number|string|Date} start - Start timestamp
 * @param {number|string|Date} end - End timestamp
 * @returns {number} Latency in milliseconds
 */
export function calculateLatency(start, end) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  
  if (isNaN(startMs) || isNaN(endMs)) {
    return 0;
  }
  
  return Math.max(0, endMs - startMs);
}

/**
 * Estimate message complexity based on content
 * @param {string} text - Message text
 * @param {number} toolCalls - Number of tool calls in response
 * @returns {'simple'|'moderate'|'complex'}
 */
export function estimateComplexity(text, toolCalls = 0) {
  if (!text) return 'simple';
  
  const wordCount = text.split(/\s+/).length;
  const hasCode = /```/.test(text);
  const hasMultipleSteps = /\d+\.\s/.test(text) || /step\s*\d/i.test(text);
  
  let score = 0;
  
  if (wordCount > 200) score += 2;
  else if (wordCount > 50) score += 1;
  
  if (hasCode) score += 2;
  if (hasMultipleSteps) score += 1;
  if (toolCalls > 3) score += 2;
  else if (toolCalls > 0) score += 1;
  
  if (score >= 4) return 'complex';
  if (score >= 2) return 'moderate';
  return 'simple';
}

/**
 * Extract response latencies from conversation with timestamps
 * @param {Array<{role: string, content: string, timestamp?: string|number}>} messages
 * @returns {Array<{latencyMs: number, complexity: string, timestamp: number}>}
 */
export function extractLatencies(messages) {
  if (!Array.isArray(messages) || messages.length < 2) {
    return [];
  }

  const latencies = [];
  
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];
    
    // Only measure user -> assistant transitions
    if (prev.role === 'user' && curr.role === 'assistant') {
      if (prev.timestamp && curr.timestamp) {
        const latencyMs = calculateLatency(prev.timestamp, curr.timestamp);
        const complexity = estimateComplexity(curr.content, curr.toolCalls || 0);
        
        latencies.push({
          latencyMs,
          complexity,
          timestamp: new Date(curr.timestamp).getTime()
        });
      }
    }
  }
  
  return latencies;
}

/**
 * Calculate percentile from sorted array
 * @param {number[]} sorted - Sorted array of numbers
 * @param {number} p - Percentile (0-100)
 * @returns {number}
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate comprehensive latency metrics
 * @param {Array<{latencyMs: number, complexity: string, timestamp: number}>} latencies
 * @returns {object} Latency metrics
 */
export function calculateLatencyMetrics(latencies) {
  if (!Array.isArray(latencies) || latencies.length === 0) {
    return {
      count: 0,
      avgMs: 0,
      minMs: 0,
      maxMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      byComplexity: {
        simple: { count: 0, avgMs: 0 },
        moderate: { count: 0, avgMs: 0 },
        complex: { count: 0, avgMs: 0 }
      },
      trend: 'stable',
      recentAvgMs: 0
    };
  }

  const times = latencies.map(l => l.latencyMs);
  const sorted = [...times].sort((a, b) => a - b);
  
  const sum = times.reduce((a, b) => a + b, 0);
  const avg = sum / times.length;
  
  // Group by complexity
  const byComplexity = {
    simple: { count: 0, total: 0 },
    moderate: { count: 0, total: 0 },
    complex: { count: 0, total: 0 }
  };
  
  for (const l of latencies) {
    const c = l.complexity;
    if (byComplexity[c]) {
      byComplexity[c].count++;
      byComplexity[c].total += l.latencyMs;
    }
  }
  
  // Calculate trend (compare first half to second half)
  let trend = 'stable';
  if (latencies.length >= 4) {
    const mid = Math.floor(latencies.length / 2);
    const firstHalf = latencies.slice(0, mid);
    const secondHalf = latencies.slice(mid);
    
    const firstAvg = firstHalf.reduce((s, l) => s + l.latencyMs, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, l) => s + l.latencyMs, 0) / secondHalf.length;
    
    const change = (secondAvg - firstAvg) / firstAvg;
    if (change > 0.2) trend = 'increasing';
    else if (change < -0.2) trend = 'improving';
  }
  
  // Recent average (last 5)
  const recent = latencies.slice(-5);
  const recentAvg = recent.reduce((s, l) => s + l.latencyMs, 0) / recent.length;

  return {
    count: times.length,
    avgMs: Math.round(avg),
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
    p50Ms: Math.round(percentile(sorted, 50)),
    p95Ms: Math.round(percentile(sorted, 95)),
    byComplexity: {
      simple: {
        count: byComplexity.simple.count,
        avgMs: byComplexity.simple.count > 0 
          ? Math.round(byComplexity.simple.total / byComplexity.simple.count)
          : 0
      },
      moderate: {
        count: byComplexity.moderate.count,
        avgMs: byComplexity.moderate.count > 0
          ? Math.round(byComplexity.moderate.total / byComplexity.moderate.count)
          : 0
      },
      complex: {
        count: byComplexity.complex.count,
        avgMs: byComplexity.complex.count > 0
          ? Math.round(byComplexity.complex.total / byComplexity.complex.count)
          : 0
      }
    },
    trend,
    recentAvgMs: Math.round(recentAvg)
  };
}

/**
 * Format latency for display
 * @param {number} ms - Milliseconds
 * @returns {string} Human-readable format
 */
export function formatLatency(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default {
  calculateLatency,
  estimateComplexity,
  extractLatencies,
  calculateLatencyMetrics,
  formatLatency
};
