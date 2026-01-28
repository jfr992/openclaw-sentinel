import { useState, useEffect, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'

export function useActivity(refreshInterval = 5000) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [liveEvents, setLiveEvents] = useState([])
  const socketRef = useRef(null)

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

    // Socket.IO for real-time events
    const socket = io(window.location.origin)
    socketRef.current = socket

    socket.on('tool_call', (event) => {
      console.log('[LIVE] tool_call:', event)
      setLiveEvents(prev => [event, ...prev].slice(0, 50))
      // Merge into data
      setData(prev => prev ? {
        ...prev,
        file_ops: [event, ...(prev.file_ops || [])].slice(0, 50)
      } : prev)
    })

    socket.on('activity_update', (newData) => {
      console.log('[LIVE] activity_update')
      setData(newData)
    })

    return () => {
      clearInterval(interval)
      socket.disconnect()
    }
  }, [refresh, refreshInterval])

  return { data, loading, error, refresh, liveEvents }
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

    // Socket.IO for real-time alerts
    const socket = io(window.location.origin)

    socket.on('security_alert', (alert) => {
      console.log('[LIVE] security_alert:', alert)
      setAlerts(prev => [alert, ...prev])
    })

    socket.on('new_alerts', (newAlerts) => {
      console.log('[LIVE] new_alerts:', newAlerts.length)
      setAlerts(prev => [...newAlerts, ...prev])
    })

    return () => {
      clearInterval(interval)
      socket.disconnect()
    }
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
