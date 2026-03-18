import { useEffect, useRef, useCallback } from 'react'
import { useLBStore } from '../store/useLBStore'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws'
const LB_URL = import.meta.env.VITE_LB_URL || 'http://localhost:8080'

let rpsWindow = []

export function useWebSocket() {
  const wsRef    = useRef(null)
  const retryRef = useRef(null)
  const store    = useLBStore()

  // ── Connect / Reconnect ────────────────────────────────────────────────────
  const connect = useCallback(() => {
    // Close any lingering socket so we don't double-connect
    if (wsRef.current) {
      wsRef.current.onclose = null // prevent duplicate retry trigger
      wsRef.current.close()
      wsRef.current = null
    }

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        store.setWsStatus('connected')
        clearTimeout(retryRef.current)
        console.log('[Fluxor] WS connected')
      }

      ws.onclose = () => {
        store.setWsStatus('disconnected')
        console.log('[Fluxor] WS closed — retrying in 3s')
        retryRef.current = setTimeout(connect, 3000)
      }

      ws.onerror = (e) => {
        store.setWsStatus('error')
        console.warn('[Fluxor] WS error', e)
        ws.close() // triggers onclose → retry
      }

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          handleMessage(msg, store)
        } catch {
          console.warn('[Fluxor] Bad WS message:', evt.data)
        }
      }
    } catch (err) {
      console.error('[Fluxor] WS init error:', err)
      retryRef.current = setTimeout(connect, 3000)
    }
  }, [store])

  // ── Algorithm change ───────────────────────────────────────────────────────
  const setAlgorithm = useCallback((algo) => {
    store.setAlgorithm(algo)
    // POST to REST endpoint
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

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    connect()

    // Poll /admin/status every 3 s for initial / fallback state
    const pollInterval = setInterval(() => {
      fetch(`${LB_URL}/admin/status`)
        .then(r => r.json())
        .then(data => {
          if (data.servers) store.updateServers(normaliseServers(data.servers))
          if (data.algorithm) store.setAlgorithm(data.algorithm)
        })
        .catch(() => {})
    }, 3000)

    return () => {
      clearInterval(pollInterval)
      clearTimeout(retryRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null // stop retry on unmount
        wsRef.current.close()
      }
    }
  }, [connect, store])

  return { setAlgorithm }
}

// ─────────────────────────────────────────────────────────────────────────────
// Message router
// ─────────────────────────────────────────────────────────────────────────────

function handleMessage(msg, store) {
  switch (msg.type) {
    case 'ROUTE_EVENT':
      handleRouteEvent(msg, store)
      break

    case 'request':
      handleRequestMsg(msg, store)
      break

    case 'metrics':
      handleMetricsMsg(msg, store)
      break

    case 'rl_stats':
      store.setRlStats({
        epsilon:   msg.epsilon   ?? store.rlStats.epsilon,
        avgReward: msg.avg_reward ?? store.rlStats.avgReward,
        stepCount: msg.step_count ?? store.rlStats.stepCount,
      })
      break

    case 'algo':
      if (msg.algorithm) store.setAlgorithm(msg.algorithm)
      break

    default:
      break
  }
}

// ─── Handler: new "request" message ──────────────────────────────────────────
function handleRequestMsg(msg, store) {
  const serverId = (msg.server ?? 1) - 1 // convert to 0-indexed
  const timeLabel = new Date().toLocaleTimeString()

  store.incRequest(serverId)
  store.addParticle({
    id:       `req_${Date.now()}_${Math.random()}`,
    serverId,
    ts:       Date.now(),
  })

  // Track RPS
  const nowMs = Date.now()
  rpsWindow.push(nowMs)
  rpsWindow = rpsWindow.filter(t => nowMs - t < 5000)
  store.pushRps({ time: timeLabel, rps: (rpsWindow.length / 5).toFixed(1) })

  // Track latency (spread to all servers using latest known state)
  const servers = useLBStore.getState().servers
  const latEntry = { time: timeLabel }
  servers.forEach(s => { latEntry[`s${s.id}`] = Math.round(s.latency_ms || 0) })
  if (msg.latency !== undefined) latEntry[`s${serverId}`] = Math.round(msg.latency)
  store.pushLatency(latEntry)
}

// ─── Handler: new "metrics" message ──────────────────────────────────────────
function handleMetricsMsg(msg, store) {
  if (!Array.isArray(msg.servers)) return
  const normalised = msg.servers.map(s => ({
    id:         s.id,
    cpu:        s.cpu ?? 0,
    conns:      s.conns ?? 0,
    latency_ms: s.latency ?? 0,
    healthy:    s.alive ?? true,
  }))
  store.updateServers(normalised)
}

// ─── Handler: legacy ROUTE_EVENT ─────────────────────────────────────────────
function handleRouteEvent(event, store) {
  const now = new Date(event.timestamp)
  const timeLabel = now.toLocaleTimeString()

  // Update server states
  if (event.server_states) {
    store.updateServers(normaliseServers(event.server_states))
  }

  // Increment request counters + add particle
  store.incRequest(event.server_id)
  store.addParticle({
    id:       event.request_id + '_' + Date.now(),
    serverId: event.server_id,
    ts:       Date.now(),
  })

  // Track latency per server
  const latEntry = { time: timeLabel }
  if (event.server_states) {
    event.server_states.forEach(s => { latEntry[`s${s.id}`] = Math.round(s.latency_ms ?? 0) })
  }
  store.pushLatency(latEntry)

  // Track RPS
  const nowMs = Date.now()
  rpsWindow.push(nowMs)
  rpsWindow = rpsWindow.filter(t => nowMs - t < 5000)
  store.pushRps({ time: timeLabel, rps: (rpsWindow.length / 5).toFixed(1) })
}

// ─── Normalize server shape from /admin/status or ROUTE_EVENT ────────────────
function normaliseServers(servers) {
  return servers.map(s => ({
    id:         s.id,
    cpu:        s.cpu ?? 0,
    conns:      s.conns ?? s.active_conn ?? 0,
    latency_ms: s.latency_ms ?? s.latency ?? 0,
    healthy:    s.healthy ?? s.alive ?? true,
  }))
}
