import { useState, useEffect, useCallback } from 'react'

export function useActivity(refreshInterval = 5000) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/activity')
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, refreshInterval)
    return () => clearInterval(interval)
  }, [refresh, refreshInterval])

  return { data, loading, error, refresh }
}

export function useAlerts(refreshInterval = 30000) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts')
      const json = await res.json()
      setAlerts(json)
    } catch (e) {
      console.error('Failed to fetch alerts:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, refreshInterval)
    return () => clearInterval(interval)
  }, [refresh, refreshInterval])

  return { alerts, loading, refresh }
}

export async function runSecurityCheck() {
  const res = await fetch('/api/security-check')
  return res.json()
}

export async function getAlertDetails(alertId) {
  const res = await fetch(`/api/alert-details/${alertId}`)
  return res.json()
}

export async function traceCommand(command) {
  const res = await fetch('/api/trace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  })
  return res.json()
}

export async function alertAction(action, alertId, sessionFile) {
  const res = await fetch('/api/alert-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, alertId, sessionFile }),
  })
  return res.json()
}
