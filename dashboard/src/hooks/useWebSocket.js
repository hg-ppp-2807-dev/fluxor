import { useEffect, useRef, useCallback } from 'react'
import { useLBStore } from '../store/useLBStore'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws'
const LB_URL = import.meta.env.VITE_LB_URL || 'http://localhost:8080'

let rpsWindow = []

export function useWebSocket() {
  const wsRef = useRef(null)
  const retryRef = useRef(null)
  const store = useLBStore()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      store.setWsStatus('connected')
      clearTimeout(retryRef.current)
      console.log('[WS] connected')
    }

    ws.onclose = () => {
      store.setWsStatus('disconnected')
      retryRef.current = setTimeout(connect, 2000)
    }

    ws.onerror = () => {
      store.setWsStatus('error')
    }

    ws.onmessage = (evt) => {
      try {
        const event = JSON.parse(evt.data)
        if (event.type === 'ROUTE_EVENT') {
          handleRouteEvent(event, store)
        }
      } catch {}
    }
  }, [store])

  // Send algorithm change command
  const setAlgorithm = useCallback((algo) => {
    store.setAlgorithm(algo)
    // Also POST to REST endpoint
    fetch(`${LB_URL}/admin/algorithm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ algorithm: algo }),
    }).catch(() => {})
    // Also send via WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SET_ALGO', algo }))
    }
  }, [store])

  useEffect(() => {
    connect()
    // Poll /admin/status every 3s for initial state
    const pollInterval = setInterval(() => {
      fetch(`${LB_URL}/admin/status`)
        .then(r => r.json())
        .then(data => {
          if (data.servers) store.updateServers(data.servers)
          if (data.algorithm) store.setAlgorithm(data.algorithm)
        })
        .catch(() => {})
    }, 3000)

    return () => {
      clearInterval(pollInterval)
      clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [connect, store])

  return { setAlgorithm }
}

function handleRouteEvent(event, store) {
  const now = new Date(event.timestamp)
  const timeLabel = now.toLocaleTimeString()

  // Update server states
  if (event.server_states) {
    store.updateServers(event.server_states)
  }

  // Increment counters
  store.incRequest(event.server_id)

  // Add particle for animation
  store.addParticle({
    id: event.request_id + '_' + Date.now(),
    serverId: event.server_id,
    ts: Date.now(),
  })

  // Track latency per server
  const latEntry = { time: timeLabel }
  if (event.server_states) {
    event.server_states.forEach(s => { latEntry[`s${s.id}`] = Math.round(s.latency_ms) })
  }
  store.pushLatency(latEntry)

  // Track RPS
  const nowMs = Date.now()
  rpsWindow.push(nowMs)
  rpsWindow = rpsWindow.filter(t => nowMs - t < 5000)
  store.pushRps({ time: timeLabel, rps: (rpsWindow.length / 5).toFixed(1) })
}
