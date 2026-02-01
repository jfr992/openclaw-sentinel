/**
 * MemoryRetrievalTracker - Tracks vector memory usage and effectiveness
 * 
 * Monitors:
 * - How often vector memory is queried
 * - Query latencies
 * - Whether retrievals helped (used in response)
 * - Memory file access patterns
 */

// Patterns indicating memory/context retrieval
const MEMORY_QUERY_PATTERNS = [
  /curl.*5057\/query/i,
  /localhost:5057/i,
  /cangrejo-memory/i,
  /vector.*search/i,
  /semantic.*search/i,
  /query.*memory/i,
];

// Patterns indicating memory file reads
const MEMORY_FILE_PATTERNS = [
  /memory\/\d{4}-\d{2}-\d{2}\.md/,
  /MEMORY\.md/,
  /HEARTBEAT\.md/,
  /reading.*memory/i,
  /checked.*memory/i,
];

// Patterns indicating the retrieval was used
const RETRIEVAL_USED_PATTERNS = [
  /found in memory/i,
  /from my memory/i,
  /I remember/i,
  /according to.*memory/i,
  /retrieved/i,
  /vector.*result/i,
];

// Patterns indicating context was lost (retrieval might have helped)
const CONTEXT_LOST_PATTERNS = [
  /I don't have context/i,
  /context.*truncated/i,
  /lost.*thread/i,
  /what were we/i,
  /remind me/i,
  /can you.*again/i,
];

/**
 * Detect memory query in message
 * @param {string} text - Message content
 * @returns {{isQuery: boolean, type: 'vector'|'file'|null}}
 */
export function detectMemoryQuery(text) {
  if (!text || typeof text !== 'string') {
    return { isQuery: false, type: null };
  }

  for (const pattern of MEMORY_QUERY_PATTERNS) {
    if (pattern.test(text)) {
      return { isQuery: true, type: 'vector' };
    }
  }

  for (const pattern of MEMORY_FILE_PATTERNS) {
    if (pattern.test(text)) {
      return { isQuery: true, type: 'file' };
    }
  }

  return { isQuery: false, type: null };
}

/**
 * Detect if retrieved memory was actually used
 * @param {string} text - Response after retrieval
 * @returns {{wasUsed: boolean, confidence: number}}
 */
export function detectRetrievalUsed(text) {
  if (!text || typeof text !== 'string') {
    return { wasUsed: false, confidence: 0 };
  }

  let signals = 0;

  for (const pattern of RETRIEVAL_USED_PATTERNS) {
    if (pattern.test(text)) {
      signals++;
    }
  }

  return {
    wasUsed: signals > 0,
    confidence: Math.min(1, signals / 2)
  };
}

/**
 * Detect if context was lost (retrieval should have been used)
 * @param {string} text - Message content
 * @returns {boolean}
 */
export function detectContextLost(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  return CONTEXT_LOST_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Parse memory retrieval events from conversation
 * @param {Array<{role: string, content: string, timestamp?: number}>} messages
 * @returns {Array<{type: string, timestamp: number, wasUsed: boolean, latencyMs?: number}>}
 */
export function parseRetrievalEvents(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const events = [];
  let pendingQuery = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const content = msg.content || '';

    const query = detectMemoryQuery(content);
    
    if (query.isQuery) {
      pendingQuery = {
        type: query.type,
        timestamp: msg.timestamp || Date.now(),
        index: i
      };
    } else if (pendingQuery && msg.role === 'assistant') {
      // Check if the response used the retrieved memory
      const usage = detectRetrievalUsed(content);
      
      events.push({
        type: pendingQuery.type,
        timestamp: pendingQuery.timestamp,
        wasUsed: usage.wasUsed,
        confidence: usage.confidence,
        latencyMs: msg.timestamp 
          ? msg.timestamp - pendingQuery.timestamp 
          : undefined
      });
      
      pendingQuery = null;
    }
  }

  return events;
}

/**
 * Calculate memory retrieval metrics
 * @param {Array<{type: string, wasUsed: boolean, latencyMs?: number}>} events
 * @param {Array<{role: string, content: string}>} messages - For context loss detection
 * @returns {object}
 */
export function calculateMemoryMetrics(events, messages = []) {
  const totalQueries = events.length;
  const vectorQueries = events.filter(e => e.type === 'vector').length;
  const fileQueries = events.filter(e => e.type === 'file').length;
  const usedQueries = events.filter(e => e.wasUsed).length;
  
  // Calculate latencies
  const latencies = events
    .filter(e => e.latencyMs !== undefined)
    .map(e => e.latencyMs);
  
  const avgLatency = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;

  // Detect missed opportunities (context was lost but memory wasn't queried)
  let contextLostCount = 0;
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      if (msg.role === 'assistant' && detectContextLost(msg.content || '')) {
        contextLostCount++;
      }
    }
  }

  const missedOpportunities = Math.max(0, contextLostCount - totalQueries);

  return {
    totalQueries,
    vectorQueries,
    fileQueries,
    usageRate: totalQueries > 0 
      ? Math.round((usedQueries / totalQueries) * 100)
      : 0,
    avgLatencyMs: Math.round(avgLatency),
    contextLostCount,
    missedOpportunities,
    effectiveness: totalQueries > 0 && usedQueries > 0
      ? 'good'
      : totalQueries === 0 && contextLostCount > 0
        ? 'underutilized'
        : 'unknown',
    byType: {
      vector: {
        count: vectorQueries,
        used: events.filter(e => e.type === 'vector' && e.wasUsed).length
      },
      file: {
        count: fileQueries,
        used: events.filter(e => e.type === 'file' && e.wasUsed).length
      }
    }
  };
}

export default {
  detectMemoryQuery,
  detectRetrievalUsed,
  detectContextLost,
  parseRetrievalEvents,
  calculateMemoryMetrics
};
