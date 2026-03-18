import { create } from 'zustand'

export const useLBStore = create((set, get) => ({
  // ── Connection ───────────────────────────────────────────────────────────────
  wsStatus: 'disconnected',
  setWsStatus: (s) => set({ wsStatus: s }),

  // ── Algorithm ────────────────────────────────────────────────────────────────
  algorithm: 'rr',
  setAlgorithm: (a) => set({ algorithm: a }),

  // ── Server states (from latest event / metrics tick) ──────────────────────────
  servers: [
    { id: 0, conns: 0, latency_ms: 0, healthy: true, cpu: 0 },
    { id: 1, conns: 0, latency_ms: 0, healthy: true, cpu: 0 },
    { id: 2, conns: 0, latency_ms: 0, healthy: true, cpu: 0 },
  ],
  updateServers: (states) => set({ servers: states }),

  // ── Animation particles ───────────────────────────────────────────────────────
  particles: [],
  addParticle:    (p) => set((s) => ({ particles: [...s.particles.slice(-30), p] })),
  removeParticle: (id) => set((s) => ({ particles: s.particles.filter(p => p.id !== id) })),

  // ── Time-series charts ────────────────────────────────────────────────────────
  latencyHistory: [],    // [{time, s0, s1, s2}]
  rpsHistory:     [],    // [{time, rps}]
  rewardHistory:  [],    // [{time, reward}]
  pushLatency: (entry) => set((s) => ({ latencyHistory: [...s.latencyHistory.slice(-60), entry] })),
  pushRps:     (entry) => set((s) => ({ rpsHistory:     [...s.rpsHistory.slice(-60),     entry] })),
  pushReward:  (entry) => set((s) => ({ rewardHistory:  [...s.rewardHistory.slice(-60),  entry] })),

  // ── Request counters ──────────────────────────────────────────────────────────
  totalRequests: 0,
  routingCounts: { 0: 0, 1: 0, 2: 0 },
  incRequest: (serverId) => set((s) => ({
    totalRequests: s.totalRequests + 1,
    routingCounts: { ...s.routingCounts, [serverId]: (s.routingCounts[serverId] || 0) + 1 },
  })),

  // ── RL Agent stats ────────────────────────────────────────────────────────────
  rlStats: { epsilon: 1.0, avgReward: 0, stepCount: 0 },
  setRlStats: (stats) => set({ rlStats: stats }),
}))
