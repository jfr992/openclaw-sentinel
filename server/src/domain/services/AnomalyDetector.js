/**
 * AnomalyDetector - Detect unusual patterns in tool usage
 * Compares current activity against historical baseline
 */

export const ANOMALY_TYPES = {
  BURST_ACTIVITY: 'burst_activity',
  OFF_HOURS: 'off_hours',
  NEW_TOOL: 'new_tool',
  UNUSUAL_FREQUENCY: 'unusual_frequency',
  RAPID_SUCCESSION: 'rapid_succession'
}

/**
 * Build a baseline from historical tool calls
 * @param {Array} toolCalls - Historical tool calls (7+ days recommended)
 * @returns {Object} Baseline statistics
 */
export function buildBaseline(toolCalls) {
  if (!toolCalls || toolCalls.length === 0) {
    return {
      toolFrequency: {},
      hourlyDistribution: Array(24).fill(0),
      averageCallsPerHour: 0,
      averageCallsPerDay: 0,
      totalDays: 0,
      knownTools: new Set()
    }
  }

  const toolFrequency = {}
  const hourlyDistribution = Array(24).fill(0)
  const dailyCounts = {}
  const knownTools = new Set()

  for (const tc of toolCalls) {
    // Tool frequency
    toolFrequency[tc.name] = (toolFrequency[tc.name] || 0) + 1
    knownTools.add(tc.name)

    // Time distribution
    if (tc.timestamp) {
      const date = new Date(tc.timestamp)
      const hour = date.getHours()
      hourlyDistribution[hour]++

      const day = tc.timestamp.slice(0, 10)
      dailyCounts[day] = (dailyCounts[day] || 0) + 1
    }
  }

  const totalDays = Object.keys(dailyCounts).length || 1
  const totalCalls = toolCalls.length

  return {
    toolFrequency,
    hourlyDistribution,
    averageCallsPerHour: totalCalls / (totalDays * 24),
    averageCallsPerDay: totalCalls / totalDays,
    totalDays,
    knownTools
  }
}

/**
 * Detect anomalies in current activity compared to baseline
 * @param {Array} currentCalls - Recent tool calls (last hour/session)
 * @param {Object} baseline - Historical baseline
 * @param {Object} options - Detection options
 * @returns {Array} Detected anomalies
 */
export function detectAnomalies(currentCalls, baseline, options = {}) {
  const {
    burstThreshold = 3,      // X times average = burst
    offHoursStart = 23,      // 11 PM
    offHoursEnd = 6,         // 6 AM
    rapidSuccessionMs = 1000 // Calls within 1 second
  } = options

  const anomalies = []

  if (!currentCalls || currentCalls.length === 0) {
    return anomalies
  }

  // 1. Burst Activity Detection
  const currentHour = new Date().getHours()
  const expectedThisHour = baseline.averageCallsPerHour || 1
  if (currentCalls.length > expectedThisHour * burstThreshold) {
    anomalies.push({
      type: ANOMALY_TYPES.BURST_ACTIVITY,
      severity: 'medium',
      description: `Unusual burst: ${currentCalls.length} calls this hour (expected ~${Math.round(expectedThisHour)})`,
      details: {
        current: currentCalls.length,
        expected: expectedThisHour,
        ratio: currentCalls.length / expectedThisHour
      }
    })
  }

  // 2. Off-Hours Activity
  const offHoursCalls = currentCalls.filter(tc => {
    if (!tc.timestamp) return false
    const hour = new Date(tc.timestamp).getHours()
    return hour >= offHoursStart || hour < offHoursEnd
  })

  if (offHoursCalls.length > 0) {
    // Check if off-hours activity is unusual
    const baselineOffHours = baseline.hourlyDistribution
      .slice(offHoursStart)
      .concat(baseline.hourlyDistribution.slice(0, offHoursEnd))
      .reduce((a, b) => a + b, 0)

    const totalBaseline = baseline.hourlyDistribution.reduce((a, b) => a + b, 0) || 1
    const offHoursRatio = baselineOffHours / totalBaseline

    // If less than 10% of activity is usually off-hours, flag it
    if (offHoursRatio < 0.1 && offHoursCalls.length > 3) {
      anomalies.push({
        type: ANOMALY_TYPES.OFF_HOURS,
        severity: 'low',
        description: `Activity detected during off-hours (${offHoursCalls.length} calls)`,
        details: {
          count: offHoursCalls.length,
          usualOffHoursRatio: offHoursRatio
        }
      })
    }
  }

  // 3. New Tool Detection
  const currentTools = new Set(currentCalls.map(tc => tc.name))
  const newTools = [...currentTools].filter(t => !baseline.knownTools.has(t))

  if (newTools.length > 0) {
    anomalies.push({
      type: ANOMALY_TYPES.NEW_TOOL,
      severity: 'low',
      description: `New tool(s) used: ${newTools.join(', ')}`,
      details: {
        newTools,
        knownToolCount: baseline.knownTools.size
      }
    })
  }

  // 4. Unusual Tool Frequency
  for (const [tool, count] of Object.entries(countTools(currentCalls))) {
    const baselineCount = baseline.toolFrequency[tool] || 0
    const baselineAvgPerSession = baselineCount / (baseline.totalDays || 1)

    if (baselineAvgPerSession > 0 && count > baselineAvgPerSession * burstThreshold) {
      anomalies.push({
        type: ANOMALY_TYPES.UNUSUAL_FREQUENCY,
        severity: 'medium',
        description: `Unusual frequency for '${tool}': ${count} calls (avg ~${Math.round(baselineAvgPerSession)}/day)`,
        details: {
          tool,
          current: count,
          dailyAverage: baselineAvgPerSession
        }
      })
    }
  }

  // 5. Rapid Succession Detection
  const sortedCalls = [...currentCalls]
    .filter(tc => tc.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

  let rapidCount = 0
  for (let i = 1; i < sortedCalls.length; i++) {
    const diff = new Date(sortedCalls[i].timestamp) - new Date(sortedCalls[i-1].timestamp)
    if (diff < rapidSuccessionMs) {
      rapidCount++
    }
  }

  if (rapidCount > 5) {
    anomalies.push({
      type: ANOMALY_TYPES.RAPID_SUCCESSION,
      severity: 'low',
      description: `Rapid succession detected: ${rapidCount} calls within ${rapidSuccessionMs}ms of each other`,
      details: {
        rapidPairs: rapidCount,
        threshold: rapidSuccessionMs
      }
    })
  }

  return anomalies
}

/**
 * Calculate anomaly score (0-100)
 * @param {Array} anomalies - Detected anomalies
 * @returns {number} Overall anomaly score
 */
export function calculateAnomalyScore(anomalies) {
  if (!anomalies || anomalies.length === 0) return 0

  const severityWeights = {
    high: 30,
    medium: 15,
    low: 5
  }

  const totalScore = anomalies.reduce((sum, a) => {
    return sum + (severityWeights[a.severity] || 5)
  }, 0)

  return Math.min(100, totalScore)
}

// Helper to count tools
function countTools(calls) {
  const counts = {}
  for (const tc of calls) {
    counts[tc.name] = (counts[tc.name] || 0) + 1
  }
  return counts
}
