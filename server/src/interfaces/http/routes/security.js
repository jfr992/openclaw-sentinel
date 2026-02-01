/**
 * Security API Routes
 * Exposes risk scoring and alert endpoints
 */
import { Router } from 'express'
import { scoreToolCall, calculateSessionRisk, RISK_LEVELS } from '../../../domain/services/RiskScorer.js'

const router = Router()

// In-memory alert store (would be persisted in production)
const alertStore = {
  alerts: [],
  maxAlerts: 1000,

  add(alert) {
    this.alerts.unshift({
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      acknowledged: false,
      ...alert
    })
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts)
    }
  },

  getRecent(limit = 50) {
    return this.alerts.slice(0, limit)
  },

  acknowledge(id) {
    const alert = this.alerts.find(a => a.id === id)
    if (alert) alert.acknowledged = true
    return alert
  }
}

/**
 * GET /api/security/risks
 * Current risk assessment from recent tool calls
 */
router.get('/risks', async (req, res) => {
  try {
    const { getRecentToolCalls } = req.app.locals
    const toolCalls = await getRecentToolCalls(100)

    const riskAssessment = calculateSessionRisk(toolCalls)

    // Store any new critical/high risks as alerts
    for (const risk of riskAssessment.risks) {
      if (risk.level >= RISK_LEVELS.HIGH) {
        const exists = alertStore.alerts.some(
          a => a.match === risk.match &&
               Date.now() - new Date(a.timestamp).getTime() < 60000 // Dedup within 1 min
        )
        if (!exists) {
          alertStore.add(risk)
        }
      }
    }

    res.json({
      level: riskAssessment.level,
      levelName: riskAssessment.levelName,
      totalRisks: riskAssessment.totalRisks,
      criticalCount: riskAssessment.criticalCount,
      highCount: riskAssessment.highCount,
      summary: {
        byType: Object.fromEntries(
          Object.entries(riskAssessment.byType).map(([type, risks]) => [type, risks.length])
        )
      },
      recentRisks: riskAssessment.risks.slice(0, 20)
    })
  } catch (err) {
    console.error('Security risks error:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/security/alerts
 * Alert history with filtering
 */
router.get('/alerts', (req, res) => {
  const { limit = 50, level, acknowledged } = req.query

  let alerts = alertStore.getRecent(parseInt(limit))

  if (level) {
    const minLevel = RISK_LEVELS[level.toUpperCase()] || 0
    alerts = alerts.filter(a => a.level >= minLevel)
  }

  if (acknowledged !== undefined) {
    const ack = acknowledged === 'true'
    alerts = alerts.filter(a => a.acknowledged === ack)
  }

  res.json({
    alerts,
    total: alertStore.alerts.length,
    unacknowledged: alertStore.alerts.filter(a => !a.acknowledged).length
  })
})

/**
 * POST /api/security/alerts/:id/acknowledge
 * Mark alert as reviewed
 */
router.post('/alerts/:id/acknowledge', (req, res) => {
  const alert = alertStore.acknowledge(req.params.id)
  if (alert) {
    res.json({ success: true, alert })
  } else {
    res.status(404).json({ error: 'Alert not found' })
  }
})

/**
 * POST /api/security/alerts/acknowledge-all
 * Mark all alerts as acknowledged
 */
router.post('/alerts/acknowledge-all', (req, res) => {
  let count = 0
  for (const alert of alertStore.alerts) {
    if (!alert.acknowledged) {
      alert.acknowledged = true
      count++
    }
  }
  res.json({ success: true, acknowledged: count })
})

/**
 * DELETE /api/security/alerts
 * Clear all alerts
 */
router.delete('/alerts', (req, res) => {
  const count = alertStore.alerts.length
  alertStore.alerts = []
  res.json({ success: true, cleared: count })
})

/**
 * GET /api/security/exposure
 * External network calls and data flow
 */
router.get('/exposure', async (req, res) => {
  try {
    const { getRecentToolCalls } = req.app.locals
    const toolCalls = await getRecentToolCalls(200)

    const exposure = {
      externalCalls: [],
      destinations: {},
      dataFlowOut: 0,
      sensitiveAccess: []
    }

    for (const tc of toolCalls) {
      // Track web_fetch and web_search calls
      if (tc.name === 'web_fetch' || tc.name === 'web_search') {
        const url = tc.arguments?.url || tc.arguments?.query || ''
        try {
          const domain = new URL(url).hostname
          exposure.destinations[domain] = (exposure.destinations[domain] || 0) + 1
          exposure.externalCalls.push({
            tool: tc.name,
            target: url.slice(0, 100),
            timestamp: tc.timestamp
          })
        } catch {
          // Not a valid URL (probably a search query)
          exposure.externalCalls.push({
            tool: tc.name,
            target: url.slice(0, 100),
            timestamp: tc.timestamp
          })
        }
      }

      // Track message sends
      if (tc.name === 'message' || tc.name === 'sessions_send') {
        exposure.dataFlowOut++
      }

      // Track sensitive file access
      const risks = scoreToolCall(tc)
      const sensitiveRisks = risks.filter(r =>
        r.type === 'credential_access' || r.type === 'sensitive_file'
      )
      for (const risk of sensitiveRisks) {
        exposure.sensitiveAccess.push({
          tool: tc.name,
          path: risk.match,
          level: risk.level,
          timestamp: tc.timestamp
        })
      }
    }

    // Sort by most common destinations
    exposure.topDestinations = Object.entries(exposure.destinations)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count }))

    exposure.externalCalls = exposure.externalCalls.slice(0, 50)
    exposure.sensitiveAccess = exposure.sensitiveAccess.slice(0, 20)

    res.json(exposure)
  } catch (err) {
    console.error('Security exposure error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
export { alertStore }
