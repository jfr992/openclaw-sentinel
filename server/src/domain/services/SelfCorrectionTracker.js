/**
 * SelfCorrectionTracker - Detect when the agent corrects its own mistakes
 * Tracks: verbal corrections, tool retries, file re-edits
 */

export const CORRECTION_TYPES = {
  VERBAL: 'verbal',           // "actually", "let me fix", "sorry"
  TOOL_RETRY: 'tool_retry',   // Same tool called twice in quick succession
  FILE_REEDIT: 'file_reedit', // Edit same file multiple times
  ERROR_RECOVERY: 'error_recovery' // Tool failed then retried
}

// Patterns indicating self-correction in text
const CORRECTION_PATTERNS = [
  { pattern: /\bactually\b/i, weight: 0.7 },
  { pattern: /\blet me fix/i, weight: 1.0 },
  { pattern: /\bsorry,?\s*(i|that)/i, weight: 0.8 },
  { pattern: /\bi meant/i, weight: 0.9 },
  { pattern: /\bthat('s| is)?\s*(not right|wrong|incorrect)/i, weight: 0.9 },
  { pattern: /\bwait,?\s*(let me|i need)/i, weight: 0.6 },
  { pattern: /\boops/i, weight: 1.0 },
  { pattern: /\bmy (bad|mistake)/i, weight: 1.0 },
  { pattern: /\bi made (a|an) (error|mistake)/i, weight: 1.0 },
  { pattern: /\blet me (try|do) (that|this) again/i, weight: 0.9 },
  { pattern: /\bi'll fix/i, weight: 0.8 },
  { pattern: /\bcorrecting/i, weight: 0.7 },
  { pattern: /\bshould (have been|be)\b/i, weight: 0.6 },
  { pattern: /\binstead of\b/i, weight: 0.5 }
]

/**
 * Detect verbal corrections in assistant message text
 * @param {string} text - Assistant message content
 * @returns {Array} Detected corrections with confidence
 */
export function detectVerbalCorrections(text) {
  if (!text || typeof text !== 'string') return []

  const corrections = []

  for (const { pattern, weight } of CORRECTION_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      corrections.push({
        type: CORRECTION_TYPES.VERBAL,
        pattern: pattern.source,
        match: match[0],
        confidence: weight,
        context: extractContext(text, match.index, 50)
      })
    }
  }

  return corrections
}

/**
 * Detect tool retries (same tool called multiple times)
 * @param {Array} toolCalls - Sequential tool calls with timestamps
 * @param {Object} options - Detection options
 * @returns {Array} Detected retries
 */
export function detectToolRetries(toolCalls, options = {}) {
  const {
    windowMs = 30000,  // 30 second window (tighter)
    sameArgsOnly = true  // Require same arguments to count as retry
  } = options

  if (!toolCalls || toolCalls.length < 2) return []

  const retries = []
  const sorted = [...toolCalls]
    .filter(tc => tc.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

  // Tools that are commonly called repeatedly (not retries)
  const pollingTools = ['process']

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]

    // Check if same tool
    if (prev.name !== curr.name) continue

    // Skip tools that are expected to be called repeatedly
    if (pollingTools.includes(curr.name)) continue

    // Check time window
    const timeDiff = new Date(curr.timestamp) - new Date(prev.timestamp)

    // Skip parallel calls (same timestamp or < 500ms apart = not a retry)
    if (timeDiff < 500) continue

    // Skip if too far apart (not related)
    if (timeDiff > windowMs) continue

    // Optionally check if arguments are similar
    if (sameArgsOnly) {
      const prevArgs = JSON.stringify(prev.arguments || {})
      const currArgs = JSON.stringify(curr.arguments || {})
      if (prevArgs !== currArgs) continue
    }

    // Only count as retry if previous call failed (when we have that info)
    // If success info is available and prev succeeded, skip
    if (prev.success === true) continue

    retries.push({
      type: CORRECTION_TYPES.TOOL_RETRY,
      tool: curr.name,
      count: 2,
      timeDiffMs: timeDiff,
      timestamps: [prev.timestamp, curr.timestamp],
      confidence: prev.success === false ? 1.0 : 0.7 // Higher if we know prev failed
    })
  }

  return retries
}

/**
 * Detect file re-edits (same file edited multiple times)
 * @param {Array} toolCalls - Tool calls including Write/Edit
 * @param {Object} options - Detection options
 * @returns {Array} Detected re-edits
 */
export function detectFileReedits(toolCalls, options = {}) {
  const { windowMs = 300000 } = options // 5 minute window

  if (!toolCalls || toolCalls.length < 2) return []

  const reedits = []
  const fileEdits = {}

  // Group edits by file
  for (const tc of toolCalls) {
    if (!['Write', 'Edit'].includes(tc.name)) continue

    const path = tc.arguments?.path || tc.arguments?.file_path
    if (!path) continue

    if (!fileEdits[path]) fileEdits[path] = []
    fileEdits[path].push(tc)
  }

  // Find files edited multiple times
  for (const [path, edits] of Object.entries(fileEdits)) {
    if (edits.length < 2) continue

    const sorted = edits
      .filter(e => e.timestamp)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

    for (let i = 1; i < sorted.length; i++) {
      const timeDiff = new Date(sorted[i].timestamp) - new Date(sorted[i-1].timestamp)

      if (timeDiff <= windowMs) {
        reedits.push({
          type: CORRECTION_TYPES.FILE_REEDIT,
          path,
          editCount: sorted.length,
          timeDiffMs: timeDiff,
          confidence: timeDiff < 60000 ? 0.8 : 0.5
        })
        break // Only count once per file
      }
    }
  }

  return reedits
}

/**
 * Detect error recovery patterns (failed tool -> retry)
 * @param {Array} messages - Messages including tool results
 * @returns {Array} Detected error recoveries
 */
export function detectErrorRecovery(messages) {
  if (!messages || messages.length < 2) return []

  const recoveries = []

  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1]
    const curr = messages[i]

    // Look for toolResult with error followed by similar tool call
    if (prev.role === 'toolResult' && prev.isError) {
      // Check if next assistant message retries
      if (curr.role === 'assistant' && curr.toolCalls) {
        const retriedTool = curr.toolCalls.find(tc => tc.name === prev.toolName)
        if (retriedTool) {
          recoveries.push({
            type: CORRECTION_TYPES.ERROR_RECOVERY,
            tool: prev.toolName,
            error: prev.content?.slice(0, 100),
            confidence: 0.9
          })
        }
      }
    }
  }

  return recoveries
}

/**
 * Calculate overall self-correction score for a session
 * @param {Object} data - Session data with messages and tool calls
 * @returns {Object} Correction summary
 */
export function calculateCorrectionScore(data) {
  const { messages = [], toolCalls = [], assistantTexts = [] } = data

  const allCorrections = []

  // Verbal corrections
  for (const text of assistantTexts) {
    allCorrections.push(...detectVerbalCorrections(text))
  }

  // Tool retries
  allCorrections.push(...detectToolRetries(toolCalls))

  // File re-edits
  allCorrections.push(...detectFileReedits(toolCalls))

  // Error recovery
  allCorrections.push(...detectErrorRecovery(messages))

  // Calculate score (0 = perfect, 100 = lots of corrections)
  const weightedSum = allCorrections.reduce((sum, c) => sum + c.confidence, 0)
  const normalizedScore = Math.min(100, weightedSum * 10)

  return {
    score: Math.round(normalizedScore),
    totalCorrections: allCorrections.length,
    byType: {
      verbal: allCorrections.filter(c => c.type === CORRECTION_TYPES.VERBAL).length,
      toolRetry: allCorrections.filter(c => c.type === CORRECTION_TYPES.TOOL_RETRY).length,
      fileReedit: allCorrections.filter(c => c.type === CORRECTION_TYPES.FILE_REEDIT).length,
      errorRecovery: allCorrections.filter(c => c.type === CORRECTION_TYPES.ERROR_RECOVERY).length
    },
    corrections: allCorrections.slice(0, 20),
    interpretation: getInterpretation(normalizedScore)
  }
}

function extractContext(text, index, chars) {
  const start = Math.max(0, index - chars)
  const end = Math.min(text.length, index + chars)
  return text.slice(start, end).trim()
}

function getInterpretation(score) {
  if (score === 0) return 'Perfect - no corrections needed'
  if (score < 20) return 'Excellent - minimal corrections'
  if (score < 40) return 'Good - some minor adjustments'
  if (score < 60) return 'Fair - moderate corrections'
  if (score < 80) return 'Needs improvement - frequent corrections'
  return 'Poor - many corrections needed'
}
