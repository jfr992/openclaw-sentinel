/**
 * ContextHealthTracker - Monitor context window health and continuity
 * Tracks: truncation events, re-explanation requests, continuity breaks
 */

export const CONTEXT_EVENTS = {
  TRUNCATION: 'truncation',
  REASK: 'reask',
  CONFUSION: 'confusion',
  MEMORY_READ: 'memory_read',
  CONTEXT_LOSS: 'context_loss'
}

// Patterns indicating the agent is ASKING USER for re-explanation
// Note: Exclude informational statements like "context got truncated" - that's transparency, not confusion
// Note: Exclude proactive context checks at session start - that's good practice
const REASK_PATTERNS = [
  // Actual re-asks: agent asking user to explain again
  { pattern: /can you (remind|tell) me (again |what )/i, weight: 0.8 },
  { pattern: /could you (clarify|explain|repeat) (that|what|the)/i, weight: 0.7 },
  { pattern: /what (did you|do you) mean by .+\?/i, weight: 0.6 },
  { pattern: /sorry,? (could|can) you (say that|explain)/i, weight: 0.8 },
  // Questions indicating confusion (must end with ?)
  { pattern: /what('s| is| was) the (number|value) .+\?/i, weight: 0.5 },
  { pattern: /referring to .+\?$/i, weight: 0.5 }
  // Removed: "context got truncated" - informational, not asking
  // Removed: "what were we working on" - proactive check, not confusion
  // Removed: "i don't have context" - explaining situation, not asking
  // Removed: "which file/project" - often legitimate clarifying question
]

// Patterns indicating confusion (might be context loss)
// Note: "let me check" is normal working behavior, NOT confusion
// Note: Must be clear confusion, not just careful clarifying questions
const CONFUSION_PATTERNS = [
  { pattern: /i'm (really )?(confused|lost|unclear) about/i, weight: 0.7 },
  { pattern: /sorry,? i don't understand (what|which|the)/i, weight: 0.6 },
  { pattern: /wait,? i (thought|assumed) (we|you) (were|said)/i, weight: 0.7 }
  // Removed: "not sure what" - often legitimate uncertainty, not confusion
  // Removed: "i need context" - agent being transparent about state
]

// Patterns in system messages indicating truncation
const TRUNCATION_PATTERNS = [
  { pattern: /context.*truncat/i, weight: 1.0 },
  { pattern: /compacted/i, weight: 1.0 },
  { pattern: /summary unavailable/i, weight: 0.9 },
  { pattern: /older messages were/i, weight: 0.8 }
]

/**
 * Detect re-explanation requests in assistant messages
 * @param {string} text - Assistant message
 * @returns {Array} Detected reask events
 */
export function detectReaskEvents(text) {
  if (!text || typeof text !== 'string') return []

  const events = []

  for (const { pattern, weight } of REASK_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      events.push({
        type: CONTEXT_EVENTS.REASK,
        match: match[0],
        confidence: weight,
        description: 'Agent requested re-explanation (possible context loss)'
      })
    }
  }

  return events
}

/**
 * Detect confusion signals in assistant messages
 * @param {string} text - Assistant message
 * @returns {Array} Detected confusion events
 */
export function detectConfusionEvents(text) {
  if (!text || typeof text !== 'string') return []

  const events = []

  for (const { pattern, weight } of CONFUSION_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      events.push({
        type: CONTEXT_EVENTS.CONFUSION,
        match: match[0],
        confidence: weight,
        description: 'Agent expressed confusion (possible context loss)'
      })
    }
  }

  return events
}

/**
 * Detect truncation events from system messages
 * @param {string} text - System message
 * @returns {Array} Detected truncation events
 */
export function detectTruncationEvents(text) {
  if (!text || typeof text !== 'string') return []

  const events = []

  for (const { pattern, weight } of TRUNCATION_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      events.push({
        type: CONTEXT_EVENTS.TRUNCATION,
        match: match[0],
        confidence: weight,
        description: 'Context truncation/compaction occurred'
      })
    }
  }

  return events
}

/**
 * Detect memory file reads (agent compensating for context loss)
 * @param {Array} toolCalls - Tool calls
 * @returns {Array} Memory read events
 */
export function detectMemoryReads(toolCalls) {
  if (!toolCalls || toolCalls.length === 0) return []

  const events = []
  const memoryPatterns = [
    /memory\//i,
    /MEMORY\.md/i,
    /\d{4}-\d{2}-\d{2}\.md/i, // Date-based memory files
    /heartbeat-state/i
  ]

  for (const tc of toolCalls) {
    if (tc.name !== 'Read') continue

    const path = tc.arguments?.path || tc.arguments?.file_path || ''

    for (const pattern of memoryPatterns) {
      if (pattern.test(path)) {
        events.push({
          type: CONTEXT_EVENTS.MEMORY_READ,
          path,
          timestamp: tc.timestamp,
          description: 'Agent read memory file (maintaining continuity)'
        })
        break
      }
    }
  }

  return events
}

/**
 * Calculate context health score
 * @param {Object} data - Session data
 * @returns {Object} Context health analysis
 */
export function calculateContextHealth(data) {
  const {
    assistantTexts = [],
    systemTexts = [],
    toolCalls = [],
    sessionDurationMs = 0,
    totalMessages = 0
  } = data

  const allEvents = []

  // Detect events from assistant messages
  for (const text of assistantTexts) {
    allEvents.push(...detectReaskEvents(text))
    allEvents.push(...detectConfusionEvents(text))
  }

  // Detect truncation events from system messages
  for (const text of systemTexts) {
    allEvents.push(...detectTruncationEvents(text))
  }

  // Detect memory reads
  const memoryReads = detectMemoryReads(toolCalls)
  allEvents.push(...memoryReads)

  // Calculate metrics
  const truncationCount = allEvents.filter(e => e.type === CONTEXT_EVENTS.TRUNCATION).length
  const reaskCount = allEvents.filter(e => e.type === CONTEXT_EVENTS.REASK).length
  const confusionCount = allEvents.filter(e => e.type === CONTEXT_EVENTS.CONFUSION).length
  const memoryReadCount = memoryReads.length

  // Calculate health score (100 = perfect, 0 = lots of issues)
  // Each truncation = -20, each reask = -15, each confusion = -5
  // Memory reads are neutral (compensating behavior)
  const penalties = (truncationCount * 20) + (reaskCount * 15) + (confusionCount * 5)
  const healthScore = Math.max(0, 100 - penalties)

  // Calculate continuity rate
  // If we had to reask a lot relative to messages, continuity is low
  const continuityRate = totalMessages > 0
    ? Math.max(0, 100 - (reaskCount / totalMessages * 500))
    : 100

  return {
    healthScore: Math.round(healthScore),
    continuityRate: Math.round(continuityRate),
    events: {
      truncations: truncationCount,
      reasksCount: reaskCount,
      confusionSignals: confusionCount,
      memoryReads: memoryReadCount
    },
    totalEvents: allEvents.length,
    recentEvents: allEvents.slice(-10),
    status: getHealthStatus(healthScore),
    recommendation: getRecommendation(truncationCount, reaskCount, memoryReadCount)
  }
}

function getHealthStatus(score) {
  if (score >= 90) return { label: 'Excellent', color: 'green', emoji: '🧠' }
  if (score >= 70) return { label: 'Good', color: 'blue', emoji: '✓' }
  if (score >= 50) return { label: 'Fair', color: 'yellow', emoji: '📋' }
  if (score >= 30) return { label: 'Degraded', color: 'orange', emoji: '⚠️' }
  return { label: 'Critical', color: 'red', emoji: '🚨' }
}

function getRecommendation(truncations, reasksCount, memoryReads) {
  if (truncations > 2) {
    return 'High truncation rate. Consider increasing context window or more aggressive memory logging.'
  }
  if (reasksCount > 3 && memoryReads < 2) {
    return 'Frequent re-explanations needed. Read memory files more proactively at session start.'
  }
  if (reasksCount > 0) {
    return 'Some context loss detected. Log important details to memory during conversations.'
  }
  if (memoryReads > 5) {
    return 'Good memory hygiene! Proactive context maintenance.'
  }
  return 'Context health is good. Continue current memory practices.'
}
