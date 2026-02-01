/**
 * UsageCalculator - Pure domain logic for usage metrics
 * No external dependencies, fully testable
 */

/**
 * Calculate cache hit ratio
 * @param {number} cacheRead - Tokens read from cache
 * @param {number} freshInput - Fresh input tokens (not cached)
 * @returns {number} Percentage 0-100
 */
export function calculateCacheHitRatio(cacheRead, freshInput) {
  const total = cacheRead + freshInput
  if (total === 0) return 0
  return (cacheRead / total) * 100
}

/**
 * Aggregate usage from multiple messages
 * @param {Array} messages - Array of message objects with usage data
 * @returns {Object} Aggregated usage stats
 */
export function aggregateUsage(messages) {
  const result = {
    totalInput: 0,
    totalOutput: 0,
    totalCacheRead: 0,
    totalCacheWrite: 0,
    totalCost: 0,
    messageCount: 0,
    byModel: {},
    byDay: {}
  }

  for (const msg of messages) {
    const usage = msg.usage
    if (!usage) continue

    result.messageCount++
    result.totalInput += usage.input || 0
    result.totalOutput += usage.output || 0
    result.totalCacheRead += usage.cacheRead || 0
    result.totalCacheWrite += usage.cacheWrite || 0
    result.totalCost += usage.cost?.total || 0

    // By model
    const model = msg.model || 'unknown'
    if (!result.byModel[model]) {
      result.byModel[model] = { tokens: 0, cost: 0, calls: 0 }
    }
    result.byModel[model].tokens += (usage.input || 0) + (usage.output || 0)
    result.byModel[model].cost += usage.cost?.total || 0
    result.byModel[model].calls++

    // By day
    const day = msg.timestamp?.slice(0, 10)
    if (day) {
      if (!result.byDay[day]) {
        result.byDay[day] = { tokens: 0, cost: 0 }
      }
      result.byDay[day].tokens += (usage.input || 0) + (usage.output || 0)
      result.byDay[day].cost += usage.cost?.total || 0
    }
  }

  result.cacheHitRatio = calculateCacheHitRatio(result.totalCacheRead, result.totalInput)

  return result
}

/**
 * Calculate cost breakdown by category
 * @param {Object} usage - Aggregated usage object
 * @returns {Object} Cost breakdown
 */
export function calculateCostBreakdown(usage) {
  const totalCost = usage.totalCost || 0
  const byModel = usage.byModel || {}

  const breakdown = {
    total: totalCost,
    byModel: {},
    topModel: null,
    averagePerMessage: usage.messageCount > 0 ? totalCost / usage.messageCount : 0
  }

  let maxCost = 0
  for (const [model, data] of Object.entries(byModel)) {
    breakdown.byModel[model] = {
      cost: data.cost,
      percentage: totalCost > 0 ? (data.cost / totalCost) * 100 : 0
    }
    if (data.cost > maxCost) {
      maxCost = data.cost
      breakdown.topModel = model
    }
  }

  return breakdown
}
