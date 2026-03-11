import React from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { useLBStore } from './store/useLBStore'
import TopologyCanvas from './components/TopologyCanvas'
import MetricsPanel from './components/MetricsPanel'

const ALGO_OPTIONS = [
  { value: 'rr', label: 'Round Robin', color: '#3b82f6', desc: 'Distributes evenly in sequence' },
  { value: 'lc', label: 'Least Conn', color: '#f59e0b', desc: 'Routes to least loaded server' },
  { value: 'rl', label: 'RL Agent', color: '#a78bfa', desc: 'DQN adaptive routing' },
]

export default function App() {
  const { setAlgorithm } = useWebSocket()
  const wsStatus   = useLBStore(s => s.wsStatus)
  const algorithm  = useLBStore(s => s.algorithm)
  const totalReqs  = useLBStore(s => s.totalRequests)

  return (
    <div style={{ minHeight: '100vh', padding: '16px 24px', background: '#0a0e1a' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid #1e293b', paddingBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.01em' }}>
            RL Load Balancer
            <span style={{ marginLeft: 10, fontSize: 12, color: '#2e86ab', fontWeight: 400, background: '#0d2137', padding: '2px 8px', borderRadius: 4 }}>
              LIVE
            </span>
          </h1>
          <p style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>Adaptive Reinforcement Learning — Distributed Server System</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Requests: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{totalReqs}</span>
          </div>
          <StatusBadge status={wsStatus} />
        </div>
      </div>

      {/* Algorithm Selector */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center', marginRight: 4 }}>ALGORITHM:</span>
        {ALGO_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setAlgorithm(opt.value)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: `2px solid ${algorithm === opt.value ? opt.color : '#1e293b'}`,
              background: algorithm === opt.value ? `${opt.color}20` : '#0f172a',
              color: algorithm === opt.value ? opt.color : '#64748b',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {opt.label}
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: algorithm === opt.value ? opt.color : '#475569' }}>
              {opt.desc}
            </span>
          </button>
        ))}
      </div>

      {/* Topology Canvas */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 4, marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: '#475569', padding: '8px 12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Request Flow Visualization — Real Time
        </div>
        <TopologyCanvas />
      </div>

      {/* Metrics */}
      <MetricsPanel />

      {/* Footer */}
      <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: '#334155' }}>
        Active Algorithm: <b style={{ color: '#2e86ab' }}>{algorithm.toUpperCase()}</b> &nbsp;·&nbsp;
        WebSocket: <b style={{ color: wsStatus === 'connected' ? '#22c55e' : '#ef4444' }}>{wsStatus}</b> &nbsp;·&nbsp;
        Backend: 3 servers &nbsp;·&nbsp;
        RL Agent: DQN (CPU)
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    connected:    { color: '#22c55e', bg: '#052e16', dot: '#4ade80' },
    disconnected: { color: '#ef4444', bg: '#1c0606', dot: '#f87171' },
    error:        { color: '#f59e0b', bg: '#1c1006', dot: '#fbbf24' },
  }
  const style = map[status] || map.disconnected
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: style.bg, padding: '5px 12px', borderRadius: 20, border: `1px solid ${style.color}30` }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: style.dot,
        animation: status === 'connected' ? 'pulse 2s infinite' : 'none' }} />
      <span style={{ fontSize: 11, color: style.color, fontWeight: 600 }}>{status.toUpperCase()}</span>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}
