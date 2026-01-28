import { useState, useEffect, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'

export function useActivity(refreshInterval = 5000) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [liveEvents, setLiveEvents] = useState([])
  const [connectionMode, setConnectionMode] = useState('connecting') // 'live', 'polling', 'connecting', 'error'
  const [gatewayConnected, setGatewayConnected] = useState(false)
  const socketRef = useRef(null)
  const lastLiveEventRef = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/activity')
      const json = await res.json()
      setData(json)
      setError(null)

      // If we haven't received live events in 30s, we're in polling mode
      const now = Date.now()
      if (lastLiveEventRef.current && (now - lastLiveEventRef.current) < 30000) {
        setConnectionMode('live')
      } else if (!error) {
        setConnectionMode('polling')
      }
    } catch (e) {
      setError(e.message)
      setConnectionMode('error')
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

    socket.on('connect', () => {
      setConnectionMode('polling') // Start as polling until we get gateway events
    })

    socket.on('disconnect', () => {
      setConnectionMode('error')
    })

    socket.on('tool_call', (event) => {
      lastLiveEventRef.current = Date.now()
      setConnectionMode('live')
      setLiveEvents(prev => [event, ...prev].slice(0, 50))
      // Merge into data
      setData(prev => prev ? {
        ...prev,
        file_ops: [event, ...(prev.file_ops || [])].slice(0, 50)
      } : prev)
    })

    socket.on('activity_update', (newData) => {
      setData(newData)
    })

    socket.on('gateway_status', (status) => {
      setGatewayConnected(status.connected)
      if (status.connected) {
        setConnectionMode('live')
      }
    })

    socket.on('agent_lifecycle', () => {
      lastLiveEventRef.current = Date.now()
      setConnectionMode('live')
    })

    return () => {
      clearInterval(interval)
      socket.disconnect()
    }
  }, [refresh, refreshInterval])

  return { data, loading, error, refresh, liveEvents, connectionMode, gatewayConnected }
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
      setAlerts(prev => [alert, ...prev])
    })

    socket.on('new_alerts', (newAlerts) => {
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
