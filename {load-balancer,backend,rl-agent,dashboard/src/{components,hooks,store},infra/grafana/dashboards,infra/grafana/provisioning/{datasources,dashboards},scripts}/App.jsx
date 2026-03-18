import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

// ─── Constants ───────────────────────────────────────────────────────────────
const WS_URL = "ws://localhost:8080/ws";
const API_BASE = "http://localhost:8080";
const ALGO_LABELS = { rr: "Round Robin", lc: "Least Conn", rl: "RL Agent" };
const SERVER_COLORS = ["#00ffe7", "#ff6b35", "#a78bfa"];
const MAX_HISTORY = 40;

// ─── Styles injected into <head> ─────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:       #060810;
    --surface:  #0d1117;
    --border:   rgba(0,255,231,0.15);
    --cyan:     #00ffe7;
    --orange:   #ff6b35;
    --purple:   #a78bfa;
    --red:      #ff3b5c;
    --green:    #39ff7a;
    --dim:      rgba(255,255,255,0.35);
    --font-mono: 'Share Tech Mono', monospace;
    --font-ui:   'Rajdhani', sans-serif;
  }

  body { background: var(--bg); color: #e0e8f0; font-family: var(--font-ui); overflow-x: hidden; }

  /* scanline overlay */
  body::after {
    content: '';
    position: fixed; inset: 0; pointer-events: none; z-index: 9999;
    background: repeating-linear-gradient(
      to bottom,
      transparent 0px, transparent 3px,
      rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px
    );
  }

  .fluxor-root {
    min-height: 100vh;
    display: grid;
    grid-template-rows: 56px 1fr;
    grid-template-columns: 1fr;
    background: var(--bg);
  }

  /* ── Header ── */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px;
    background: rgba(13,17,23,0.9);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(12px);
    position: sticky; top: 0; z-index: 100;
  }
  .header-logo {
    font-family: var(--font-mono); font-size: 22px; font-weight: 700;
    letter-spacing: 4px; color: var(--cyan);
    text-shadow: 0 0 20px var(--cyan), 0 0 40px rgba(0,255,231,0.3);
  }
  .header-logo span { color: var(--orange); }
  .header-status {
    display: flex; gap: 20px; align-items: center;
    font-family: var(--font-mono); font-size: 11px; color: var(--dim);
  }
  .ws-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--red);
    box-shadow: 0 0 8px var(--red);
    transition: all 0.3s;
  }
  .ws-dot.connected { background: var(--green); box-shadow: 0 0 8px var(--green); animation: pulse-green 2s infinite; }
  @keyframes pulse-green { 0%,100% { opacity:1; } 50% { opacity:0.5; } }

  /* ── Main layout ── */
  .main {
    display: grid;
    grid-template-columns: 1fr 340px;
    grid-template-rows: auto 1fr;
    gap: 16px; padding: 16px;
  }

  /* ── Panel base ── */
  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    position: relative; overflow: hidden;
  }
  .panel::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, var(--cyan), transparent);
    opacity: 0.6;
  }
  .panel-title {
    font-family: var(--font-mono); font-size: 11px; letter-spacing: 3px;
    color: var(--cyan); opacity: 0.8; padding: 14px 16px 0;
    text-transform: uppercase;
  }

  /* ── Algorithm selector ── */
  .algo-panel {
    grid-column: 1 / -1;
    display: flex; gap: 12px; align-items: center; padding: 12px 16px;
    flex-wrap: wrap;
  }
  .algo-label {
    font-family: var(--font-mono); font-size: 11px; color: var(--dim);
    letter-spacing: 2px; margin-right: 4px;
  }
  .algo-btn {
    font-family: var(--font-mono); font-size: 13px; letter-spacing: 2px;
    padding: 8px 22px; border-radius: 4px; cursor: pointer;
    background: transparent; border: 1px solid rgba(0,255,231,0.2);
    color: var(--dim); transition: all 0.2s; text-transform: uppercase;
    position: relative; overflow: hidden;
  }
  .algo-btn::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(135deg, transparent 40%, rgba(0,255,231,0.06));
  }
  .algo-btn:hover { border-color: var(--cyan); color: var(--cyan); }
  .algo-btn.rr.active {
    border-color: var(--cyan); color: var(--bg);
    background: var(--cyan);
    box-shadow: 0 0 20px rgba(0,255,231,0.5), 0 0 40px rgba(0,255,231,0.2);
  }
  .algo-btn.lc.active {
    border-color: var(--orange); color: var(--bg);
    background: var(--orange);
    box-shadow: 0 0 20px rgba(255,107,53,0.5), 0 0 40px rgba(255,107,53,0.2);
  }
  .algo-btn.rl.active {
    border-color: var(--purple); color: var(--bg);
    background: var(--purple);
    box-shadow: 0 0 20px rgba(167,139,250,0.5), 0 0 40px rgba(167,139,250,0.2);
  }

  /* ── Topology canvas ── */
  .topology-panel {
    grid-row: 2; grid-column: 1;
    padding: 8px 16px 16px;
    min-height: 360px;
    display: flex; flex-direction: column;
  }
  .topology-svg { flex: 1; width: 100%; }

  /* ── Server nodes ── */
  .server-node { cursor: default; }
  .server-ring {
    fill: none; stroke-width: 2;
    animation: ring-spin 8s linear infinite;
    transform-origin: center;
    transform-box: fill-box;
  }
  @keyframes ring-spin { to { transform: rotate(360deg); } }
  .server-offline .server-ring { animation: none; }

  /* ── Packet animation ── */
  .packet { animation: none; }

  /* ── Right sidebar ── */
  .sidebar {
    grid-row: 2; grid-column: 2;
    display: flex; flex-direction: column; gap: 12px;
  }

  /* ── Server cards ── */
  .server-cards { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px 16px; }
  .server-card {
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 6px; padding: 10px 12px;
    position: relative; overflow: hidden;
    transition: border-color 0.3s;
  }
  .server-card.online { border-color: rgba(0,255,231,0.15); }
  .server-card.offline { border-color: rgba(255,59,92,0.3); background: rgba(255,59,92,0.04); }
  .server-card::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
    border-radius: 2px 0 0 2px;
  }
  .server-card.s0::before { background: var(--cyan); box-shadow: 0 0 8px var(--cyan); }
  .server-card.s1::before { background: var(--orange); box-shadow: 0 0 8px var(--orange); }
  .server-card.s2::before { background: var(--purple); box-shadow: 0 0 8px var(--purple); }
  .server-card.offline::before { background: var(--red) !important; box-shadow: 0 0 8px var(--red) !important; animation: offline-pulse 1.5s ease-in-out infinite; }
  @keyframes offline-pulse { 0%,100% { opacity:1; } 50% { opacity: 0.2; } }

  .sc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .sc-name { font-family: var(--font-mono); font-size: 12px; letter-spacing: 1px; }
  .sc-badge {
    font-family: var(--font-mono); font-size: 9px; letter-spacing: 2px;
    padding: 2px 6px; border-radius: 2px;
  }
  .sc-badge.online { background: rgba(57,255,122,0.15); color: var(--green); border: 1px solid rgba(57,255,122,0.3); }
  .sc-badge.offline { background: rgba(255,59,92,0.15); color: var(--red); border: 1px solid rgba(255,59,92,0.3); animation: offline-pulse 1.5s ease-in-out infinite; }

  .sc-metrics { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .sc-metric { text-align: center; }
  .sc-metric-val { font-family: var(--font-mono); font-size: 16px; font-weight: 700; }
  .sc-metric-lbl { font-size: 9px; letter-spacing: 1px; color: var(--dim); margin-top: 1px; }

  /* Bar gauge */
  .bar-gauge { height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; margin-top: 6px; overflow: hidden; }
  .bar-gauge-fill { height: 100%; border-radius: 2px; transition: width 0.5s ease; }

  /* ── Charts panel ── */
  .charts-panel { display: flex; flex-direction: column; gap: 0; }
  .chart-section { padding: 10px 16px 6px; }
  .chart-title { font-family: var(--font-mono); font-size: 9px; letter-spacing: 2px; color: var(--dim); margin-bottom: 6px; }
  .chart-divider { height: 1px; background: var(--border); margin: 0 16px; }

  /* ── RL stats ── */
  .rl-panel { padding: 12px 16px; }
  .rl-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .rl-stat { text-align: center; }
  .rl-stat-val { font-family: var(--font-mono); font-size: 22px; color: var(--purple); text-shadow: 0 0 12px rgba(167,139,250,0.5); }
  .rl-stat-lbl { font-size: 9px; letter-spacing: 2px; color: var(--dim); margin-top: 2px; }

  /* ── Ticker ── */
  .ticker {
    grid-column: 1 / -1;
    font-family: var(--font-mono); font-size: 11px; color: var(--dim);
    border-top: 1px solid var(--border); padding: 6px 16px;
    overflow: hidden; white-space: nowrap;
  }
  .ticker-inner { display: inline-block; animation: ticker-scroll 30s linear infinite; }
  @keyframes ticker-scroll { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }

  /* ── Glow text util ── */
  .glow-cyan { color: var(--cyan); text-shadow: 0 0 10px rgba(0,255,231,0.6); }
  .glow-orange { color: var(--orange); text-shadow: 0 0 10px rgba(255,107,53,0.6); }
  .glow-purple { color: var(--purple); text-shadow: 0 0 10px rgba(167,139,250,0.6); }
  .glow-red { color: var(--red); text-shadow: 0 0 10px rgba(255,59,92,0.6); }
  .glow-green { color: var(--green); text-shadow: 0 0 10px rgba(57,255,122,0.6); }

  /* Recharts overrides */
  .recharts-cartesian-axis-tick-value { font-family: var(--font-mono) !important; font-size: 9px !important; fill: rgba(255,255,255,0.3) !important; }
  .recharts-tooltip-wrapper { font-family: var(--font-mono) !important; font-size: 11px !important; }
`;

// ─── Simulated data generator ─────────────────────────────────────────────────
function makeSimServers() {
  return [
    { id: 1, alive: true,  cpu: 35 + Math.random()*30, conns: Math.floor(Math.random()*20+5),  latency: 20+Math.random()*30 },
    { id: 2, alive: true,  cpu: 40 + Math.random()*30, conns: Math.floor(Math.random()*20+5),  latency: 25+Math.random()*30 },
    { id: 3, alive: true,  cpu: 30 + Math.random()*25, conns: Math.floor(Math.random()*15+5),  latency: 18+Math.random()*25 },
  ];
}

// ─── WebSocket hook ───────────────────────────────────────────────────────────
function useFluxorWS(onMessage) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const retryRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen  = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        retryRef.current = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try { onMessage(JSON.parse(e.data)); } catch {}
      };
    } catch { retryRef.current = setTimeout(connect, 3000); }
  }, [onMessage]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return connected;
}

// ─── Topology SVG ─────────────────────────────────────────────────────────────
function TopologyView({ servers, algorithm, packets }) {
  const W = 600, H = 280;
  const lb = { x: 180, y: 140 };
  const client = { x: 40, y: 140 };
  const serverPositions = [
    { x: 420, y: 60  },
    { x: 420, y: 140 },
    { x: 420, y: 220 },
  ];

  const algoColor = algorithm === "rr" ? "#00ffe7" : algorithm === "lc" ? "#ff6b35" : "#a78bfa";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="topology-svg" style={{ overflow: "visible" }}>
      <defs>
        {/* Grid pattern */}
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,255,231,0.04)" strokeWidth="0.5"/>
        </pattern>
        {/* Glow filters */}
        <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="glow-strong" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="8" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        {SERVER_COLORS.map((c, i) => (
          <filter key={i} id={`glow-s${i}`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        ))}
        {/* Packet gradient */}
        <radialGradient id="packet-grad">
          <stop offset="0%" stopColor="white" stopOpacity="1"/>
          <stop offset="100%" stopColor={algoColor} stopOpacity="0"/>
        </radialGradient>
      </defs>

      {/* Background grid */}
      <rect width={W} height={H} fill="url(#grid)" rx="4"/>

      {/* Client → LB path */}
      <line x1={client.x+20} y1={client.y} x2={lb.x-26} y2={lb.y}
        stroke={algoColor} strokeWidth="1.5" strokeOpacity="0.4"
        strokeDasharray="6 4"/>

      {/* LB → Server paths */}
      {serverPositions.map((sp, i) => {
        const alive = servers[i]?.alive !== false;
        const color = SERVER_COLORS[i];
        return (
          <line key={i}
            x1={lb.x+26} y1={lb.y}
            x2={sp.x-26} y2={sp.y}
            stroke={alive ? color : "#ff3b5c"}
            strokeWidth="1.5"
            strokeOpacity={alive ? 0.35 : 0.15}
            strokeDasharray={alive ? "none" : "4 8"}
          />
        );
      })}

      {/* Animated packets */}
      {packets.map(pkt => <PacketDot key={pkt.id} pkt={pkt} lb={lb} client={client} serverPositions={serverPositions} algoColor={algoColor}/>)}

      {/* CLIENT node */}
      <g transform={`translate(${client.x},${client.y})`}>
        <circle r="18" fill="rgba(0,255,231,0.06)" stroke={algoColor} strokeWidth="1.5" filter="url(#glow-cyan)"/>
        <circle r="10" fill="rgba(0,255,231,0.15)" stroke={algoColor} strokeWidth="1"/>
        <text textAnchor="middle" y="4" fill={algoColor} fontSize="8" fontFamily="Share Tech Mono" letterSpacing="0.5">CLI</text>
        <text textAnchor="middle" y="32" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="Share Tech Mono">CLIENT</text>
      </g>

      {/* LOAD BALANCER node */}
      <g transform={`translate(${lb.x},${lb.y})`}>
        {/* Outer ring */}
        <circle r="30" fill="none" stroke={algoColor} strokeWidth="0.5" strokeOpacity="0.3" strokeDasharray="2 4"/>
        <circle r="24" fill={`rgba(${algorithm === 'rr' ? '0,255,231' : algorithm === 'lc' ? '255,107,53' : '167,139,250'},0.08)`}
          stroke={algoColor} strokeWidth="2" filter="url(#glow-strong)"/>
        <circle r="12" fill={`rgba(${algorithm === 'rr' ? '0,255,231' : algorithm === 'lc' ? '255,107,53' : '167,139,250'},0.2)`}
          stroke={algoColor} strokeWidth="1.5"/>
        {/* Spinning ring */}
        <circle r="18" fill="none" stroke={algoColor} strokeWidth="1" strokeOpacity="0.5"
          strokeDasharray="4 6">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="6s" repeatCount="indefinite"/>
        </circle>
        <text textAnchor="middle" y="4" fill={algoColor} fontSize="8" fontFamily="Share Tech Mono" letterSpacing="0.5" fontWeight="700">LB</text>
        {/* Algorithm label */}
        <rect x="-22" y="30" width="44" height="14" rx="2"
          fill={`rgba(${algorithm === 'rr' ? '0,255,231' : algorithm === 'lc' ? '255,107,53' : '167,139,250'},0.15)`}
          stroke={algoColor} strokeWidth="0.5"/>
        <text textAnchor="middle" y="40" fill={algoColor} fontSize="8" fontFamily="Share Tech Mono" letterSpacing="1">
          {algorithm.toUpperCase()}
        </text>
      </g>

      {/* SERVER nodes */}
      {serverPositions.map((sp, i) => {
        const srv = servers[i] || {};
        const alive = srv.alive !== false;
        const color = alive ? SERVER_COLORS[i] : "#ff3b5c";
        const cpu = srv.cpu || 0;

        return (
          <g key={i} transform={`translate(${sp.x},${sp.y})`} className={alive ? "server-node" : "server-node server-offline"}>
            {/* CPU arc background */}
            <circle r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4"/>
            {/* CPU arc fill */}
            <circle r="28" fill="none" stroke={color} strokeWidth="4" strokeOpacity="0.6"
              strokeDasharray={`${(cpu/100)*175.9} 175.9`}
              transform="rotate(-90)"
              style={{ transition: "stroke-dasharray 0.6s ease" }}
              filter={`url(#glow-s${i})`}/>
            {/* Outer glow ring */}
            <circle r="22" fill={`rgba(${alive ? (i===0?'0,255,231':i===1?'255,107,53':'167,139,250') : '255,59,92'},0.06)`}
              stroke={color} strokeWidth="1.5" strokeOpacity={alive ? 0.8 : 0.4}/>
            {alive && (
              <circle r="26" fill="none" stroke={color} strokeWidth="0.5" strokeOpacity="0.4" strokeDasharray="3 5">
                <animateTransform attributeName="transform" type="rotate"
                  from="0" to={i%2===0 ? "360" : "-360"} dur={`${5+i*2}s`} repeatCount="indefinite"/>
              </circle>
            )}
            {!alive && (
              <circle r="22" fill="none" stroke={color} strokeWidth="2">
                <animate attributeName="opacity" values="1;0.1;1" dur="1.5s" repeatCount="indefinite"/>
              </circle>
            )}
            {/* Inner content */}
            <circle r="12" fill={`rgba(${alive ? (i===0?'0,255,231':i===1?'255,107,53':'167,139,250') : '255,59,92'},0.12)`}
              stroke={color} strokeWidth="1"/>
            <text textAnchor="middle" y="-1" fill={color} fontSize="8" fontFamily="Share Tech Mono" fontWeight="700">
              {alive ? `S${i+1}` : "✕"}
            </text>
            <text textAnchor="middle" y="9" fill={color} fontSize="7" fontFamily="Share Tech Mono">
              {alive ? `${Math.round(cpu)}%` : "OFF"}
            </text>
            {/* Label */}
            <text textAnchor="middle" y="38" fill="rgba(255,255,255,0.5)" fontSize="8" fontFamily="Share Tech Mono">
              :{8081+i}
            </text>
            {/* Offline X */}
            {!alive && (
              <>
                <line x1="-16" y1="-16" x2="16" y2="16" stroke={color} strokeWidth="1" strokeOpacity="0.3"/>
                <line x1="16" y1="-16" x2="-16" y2="16" stroke={color} strokeWidth="1" strokeOpacity="0.3"/>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Animated packet dot ──────────────────────────────────────────────────────
function PacketDot({ pkt, lb, client, serverPositions, algoColor }) {
  const sp = serverPositions[pkt.server] || serverPositions[0];
  const color = SERVER_COLORS[pkt.server] || algoColor;

  // Phase 0: client→lb, Phase 1: lb→server
  const phase = pkt.phase;
  const t = pkt.t; // 0..1

  let x, y;
  if (phase === 0) {
    x = client.x + 20 + (lb.x - 26 - client.x - 20) * t;
    y = client.y + (lb.y - client.y) * t;
  } else {
    x = lb.x + 26 + (sp.x - 26 - lb.x - 26) * t;
    y = lb.y + (sp.y - lb.y) * t;
  }

  return (
    <g>
      {/* Trail */}
      <circle cx={x} cy={y} r="5" fill={color} opacity="0.1"/>
      {/* Packet */}
      <circle cx={x} cy={y} r="3.5" fill={color} opacity="0.9">
        <animate attributeName="opacity" values="0.9;0.5;0.9" dur="0.4s" repeatCount="indefinite"/>
      </circle>
      {/* Glow */}
      <circle cx={x} cy={y} r="6" fill={color} opacity="0.2"/>
    </g>
  );
}

// ─── Server card ──────────────────────────────────────────────────────────────
function ServerCard({ server, index }) {
  const alive = server.alive !== false;
  const color = alive ? SERVER_COLORS[index] : "#ff3b5c";
  const cpu = server.cpu || 0;

  const getCpuColor = (v) => v > 85 ? "#ff3b5c" : v > 65 ? "#ff6b35" : SERVER_COLORS[index];

  return (
    <div className={`server-card s${index} ${alive ? "online" : "offline"}`}>
      <div className="sc-header">
        <span className="sc-name" style={{ color }}>{`BACKEND-${index+1}`}</span>
        <span className={`sc-badge ${alive ? "online" : "offline"}`}>
          {alive ? "ONLINE" : "OFFLINE"}
        </span>
      </div>
      <div className="sc-metrics">
        <div className="sc-metric">
          <div className="sc-metric-val" style={{ color: getCpuColor(cpu) }}>
            {alive ? `${Math.round(cpu)}%` : "–"}
          </div>
          <div className="sc-metric-lbl">CPU</div>
        </div>
        <div className="sc-metric">
          <div className="sc-metric-val" style={{ color }}>
            {alive ? server.conns || 0 : "–"}
          </div>
          <div className="sc-metric-lbl">CONNS</div>
        </div>
        <div className="sc-metric">
          <div className="sc-metric-val" style={{ color }}>
            {alive ? `${Math.round(server.latency || 0)}` : "–"}
          </div>
          <div className="sc-metric-lbl">LAT ms</div>
        </div>
      </div>
      <div className="bar-gauge">
        <div className="bar-gauge-fill" style={{
          width: alive ? `${Math.min(cpu, 100)}%` : "100%",
          background: alive
            ? `linear-gradient(90deg, ${getCpuColor(cpu)}, ${getCpuColor(cpu)}88)`
            : "linear-gradient(90deg, #ff3b5c44, #ff3b5c22)"
        }}/>
      </div>
    </div>
  );
}

// ─── Custom chart tooltip ──────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0d1117", border: "1px solid rgba(0,255,231,0.2)",
      borderRadius: 4, padding: "6px 10px", fontFamily: "Share Tech Mono", fontSize: 11
    }}>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</div>
      ))}
    </div>
  );
};

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [algorithm, setAlgorithm] = useState("rr");
  const [servers, setServers] = useState(makeSimServers);
  const [packets, setPackets] = useState([]);
  const [latencyHistory, setLatencyHistory] = useState([]);
  const [rpsHistory, setRpsHistory] = useState([]);
  const [distribution, setDistribution] = useState([{name:"S1",reqs:0},{name:"S2",reqs:0},{name:"S3",reqs:0}]);
  const [rlStats, setRlStats] = useState({ epsilon: 1.0, reward: 0 });
  const [totalReqs, setTotalReqs] = useState(0);

  const packetIdRef = useRef(0);
  const simRef = useRef(null);

  // Handle incoming WS messages
  const handleMessage = useCallback((msg) => {
    if (msg.type === "metrics" && Array.isArray(msg.servers)) {
      setServers(msg.servers);
    }
    if (msg.type === "request") {
      const serverIdx = (msg.server || 1) - 1;
      spawnPacket(serverIdx);
      setTotalReqs(r => r + 1);
      setDistribution(prev => {
        const next = [...prev];
        if (next[serverIdx]) next[serverIdx] = { ...next[serverIdx], reqs: next[serverIdx].reqs + 1 };
        return next;
      });
      if (msg.latency != null) {
        setLatencyHistory(h => {
          const next = [...h, { t: Date.now(), v: msg.latency, s: serverIdx }].slice(-MAX_HISTORY);
          return next;
        });
      }
    }
    if (msg.type === "rl_stats") {
      setRlStats({ epsilon: msg.epsilon ?? 1.0, reward: msg.avg_reward ?? 0 });
    }
    if (msg.type === "algo") {
      setAlgorithm(msg.algorithm || "rr");
    }
  }, []);

  const wsConnected = useFluxorWS(handleMessage);

  // Spawn a packet animation
  const spawnPacket = useCallback((serverIdx) => {
    const id = ++packetIdRef.current;
    const pkt = { id, server: serverIdx, phase: 0, t: 0 };

    setPackets(prev => [...prev.slice(-12), pkt]);

    // Animate phase 0
    let t = 0;
    const step0 = setInterval(() => {
      t += 0.06;
      if (t >= 1) {
        clearInterval(step0);
        // Switch to phase 1
        setPackets(prev => prev.map(p => p.id === id ? { ...p, phase: 1, t: 0 } : p));
        let t2 = 0;
        const step1 = setInterval(() => {
          t2 += 0.06;
          if (t2 >= 1) {
            clearInterval(step1);
            setPackets(prev => prev.filter(p => p.id !== id));
          } else {
            setPackets(prev => prev.map(p => p.id === id ? { ...p, t: t2 } : p));
          }
        }, 16);
      } else {
        setPackets(prev => prev.map(p => p.id === id ? { ...p, t } : p));
      }
    }, 16);
  }, []);

  // Simulation (runs when WS not connected)
  useEffect(() => {
    if (wsConnected) { clearInterval(simRef.current); return; }

    let rps = 0;
    simRef.current = setInterval(() => {
      const srvs = servers.map(s => ({
        ...s,
        cpu: Math.min(99, Math.max(5, s.cpu + (Math.random()-0.48)*8)),
        conns: Math.max(0, (s.conns||0) + Math.floor((Math.random()-0.5)*4)),
        latency: Math.max(5, (s.latency||20) + (Math.random()-0.5)*10),
      }));
      setServers(srvs);

      // Random request
      const aliveSrvs = srvs.filter(s => s.alive !== false);
      if (aliveSrvs.length > 0) {
        const target = aliveSrvs[Math.floor(Math.random()*aliveSrvs.length)];
        const idx = srvs.indexOf(target);
        spawnPacket(idx);
        setTotalReqs(r => r + 1);
        rps++;
        setDistribution(prev => {
          const next = [...prev];
          next[idx] = { ...next[idx], reqs: next[idx].reqs + 1 };
          return next;
        });

        const lat = target.latency || 25;
        setLatencyHistory(h => [...h, { t: Date.now(), v: lat, s: idx }].slice(-MAX_HISTORY));
      }

      setRpsHistory(h => [...h, { t: Date.now(), rps: rps }].slice(-MAX_HISTORY));
      rps = 0;

      if (algorithm === "rl") {
        setRlStats(prev => ({
          epsilon: Math.max(0.05, prev.epsilon - 0.002),
          reward: parseFloat((-0.5 + Math.random() * 1.5).toFixed(2)),
        }));
      }
    }, 600);

    return () => clearInterval(simRef.current);
  }, [wsConnected, algorithm, servers, spawnPacket]);

  // Switch algorithm
  const switchAlgo = async (algo) => {
    setAlgorithm(algo);
    try {
      await fetch(`${API_BASE}/admin/algorithm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ algorithm: algo }),
      });
    } catch {}
  };

  // Chart data
  const chartLatency = latencyHistory.map((d, i) => ({ i, v: d.v, color: SERVER_COLORS[d.s] }));
  const avgLatency = latencyHistory.length
    ? (latencyHistory.reduce((a,b) => a+b.v, 0)/latencyHistory.length).toFixed(1) : "—";

  const tickerText = servers.map((s,i) =>
    `BACKEND-${i+1}: ${s.alive!==false ? `CPU ${Math.round(s.cpu||0)}%  LAT ${Math.round(s.latency||0)}ms  CONNS ${s.conns||0}` : "OFFLINE"}`
  ).join("   ◆   ");

  return (
    <>
      <style>{CSS}</style>
      <div className="fluxor-root">
        {/* Header */}
        <header className="header">
          <div className="header-logo">FLUX<span>OR</span></div>
          <div className="header-status">
            <div className={`ws-dot ${wsConnected ? "connected" : ""}`}/>
            <span>{wsConnected ? "LIVE" : "SIMULATED"}</span>
            <span style={{opacity:0.5}}>|</span>
            <span>ALGO: <strong style={{color: algorithm==="rr"?"#00ffe7":algorithm==="lc"?"#ff6b35":"#a78bfa"}}>{algorithm.toUpperCase()}</strong></span>
            <span style={{opacity:0.5}}>|</span>
            <span>REQ: <strong style={{color:"#00ffe7"}}>{totalReqs.toLocaleString()}</strong></span>
            <span style={{opacity:0.5}}>|</span>
            <span>AVG LAT: <strong style={{color:"#39ff7a"}}>{avgLatency}ms</strong></span>
          </div>
        </header>

        {/* Main content */}
        <div className="main">

          {/* Algorithm selector */}
          <div className="panel algo-panel">
            <span className="algo-label">ALGORITHM //</span>
            {["rr","lc","rl"].map(a => (
              <button key={a} className={`algo-btn ${a} ${algorithm===a ? "active" : ""}`}
                onClick={() => switchAlgo(a)}>
                {ALGO_LABELS[a]}
              </button>
            ))}
            <div style={{marginLeft:"auto", fontFamily:"var(--font-mono)", fontSize:10, color:"var(--dim)"}}>
              {servers.filter(s=>s.alive!==false).length}/{servers.length} servers up
            </div>
          </div>

          {/* Topology */}
          <div className="panel topology-panel">
            <div className="panel-title">// NETWORK TOPOLOGY</div>
            <TopologyView servers={servers} algorithm={algorithm} packets={packets}/>
          </div>

          {/* Right sidebar */}
          <div className="sidebar">

            {/* Server cards */}
            <div className="panel">
              <div className="panel-title">// SERVER STATUS</div>
              <div className="server-cards">
                {servers.map((s,i) => <ServerCard key={i} server={s} index={i}/>)}
              </div>
            </div>

            {/* RL stats (shown when rl active) */}
            {algorithm === "rl" && (
              <div className="panel">
                <div className="panel-title">// RL AGENT</div>
                <div className="rl-panel">
                  <div className="rl-stats">
                    <div className="rl-stat">
                      <div className="rl-stat-val">{rlStats.epsilon.toFixed(3)}</div>
                      <div className="rl-stat-lbl">EPSILON</div>
                    </div>
                    <div className="rl-stat">
                      <div className="rl-stat-val" style={{
                        color: rlStats.reward >= 0 ? "#39ff7a" : "#ff3b5c",
                        textShadow: rlStats.reward >= 0 ? "0 0 12px rgba(57,255,122,0.5)" : "0 0 12px rgba(255,59,92,0.5)"
                      }}>
                        {rlStats.reward > 0 ? "+" : ""}{rlStats.reward.toFixed(2)}
                      </div>
                      <div className="rl-stat-lbl">AVG REWARD</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, fontFamily:"var(--font-mono)", fontSize:9, color:"var(--dim)", letterSpacing:1 }}>
                    EXPLORATION: {Math.round(rlStats.epsilon*100)}% &nbsp;|&nbsp; EXPLOITATION: {Math.round((1-rlStats.epsilon)*100)}%
                  </div>
                  <div style={{ marginTop:6 }}>
                    <div className="bar-gauge">
                      <div className="bar-gauge-fill" style={{
                        width:`${rlStats.epsilon*100}%`,
                        background:"linear-gradient(90deg, #a78bfa, #6d28d9)"
                      }}/>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Distribution chart */}
            <div className="panel charts-panel">
              <div className="panel-title" style={{padding:"14px 16px 8px"}}>// REQUEST DISTRIBUTION</div>
              <div className="chart-section" style={{paddingTop:0}}>
                <ResponsiveContainer width="100%" height={80}>
                  <BarChart data={distribution} margin={{top:0,right:4,left:-20,bottom:0}}>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.05)"/>
                    <XAxis dataKey="name" tick={{fontSize:9, fontFamily:"Share Tech Mono", fill:"rgba(255,255,255,0.4)"}}/>
                    <YAxis tick={{fontSize:9, fontFamily:"Share Tech Mono", fill:"rgba(255,255,255,0.4)"}}/>
                    <Tooltip content={<ChartTooltip/>}/>
                    <Bar dataKey="reqs" name="Requests" radius={[2,2,0,0]}>
                      {distribution.map((_, i) => (
                        <rect key={i} fill={SERVER_COLORS[i]}/>
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Latency chart */}
          <div className="panel" style={{gridColumn:"1", padding:"12px 16px 16px"}}>
            <div className="chart-title">// LATENCY (ms) — REAL-TIME</div>
            <ResponsiveContainer width="100%" height={110}>
              <LineChart data={chartLatency} margin={{top:4,right:4,left:-20,bottom:0}}>
                <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.04)"/>
                <XAxis dataKey="i" hide/>
                <YAxis domain={['auto','auto']} tick={{fontSize:9, fontFamily:"Share Tech Mono", fill:"rgba(255,255,255,0.3)"}}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Line type="monotone" dataKey="v" name="Latency" dot={false} strokeWidth={2}
                  stroke="#00ffe7" strokeShadow="0 0 8px #00ffe7"
                  isAnimationActive={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Ticker */}
          <div className="ticker" style={{gridColumn:"1/-1"}}>
            <span className="ticker-inner">{tickerText}</span>
          </div>

        </div>
      </div>
    </>
  );
}
