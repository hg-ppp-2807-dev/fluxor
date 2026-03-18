import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

// ─── Constants ────────────────────────────────────────────────────────────────
const WS_URL   = import.meta.env.VITE_WS_URL || "ws://localhost:8080/ws";
const API_BASE = import.meta.env.VITE_LB_URL  || "http://localhost:8080";
const RL_URL   = import.meta.env.VITE_RL_URL  || "http://localhost:5005";

const ALGO_LABELS   = { rr: "Round Robin", lc: "Least Conn", rl: "RL Agent" };
const SERVER_COLORS = ["#00ffe7", "#ff6b35", "#a78bfa"];
const MAX_HISTORY   = 60;

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #060810; --surface: #0d1117;
    --border: rgba(0,255,231,0.15);
    --cyan: #00ffe7; --orange: #ff6b35; --purple: #a78bfa;
    --red: #ff3b5c; --green: #39ff7a;
    --dim: rgba(255,255,255,0.35);
    --font-mono: 'Share Tech Mono', monospace;
    --font-ui: 'Rajdhani', sans-serif;
  }
  body { background: var(--bg); color: #e0e8f0; font-family: var(--font-ui); overflow-x: hidden; }
  body::after {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 9999;
    background: repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px);
  }
  .fluxor-root { min-height: 100vh; display: grid; grid-template-rows: 56px 1fr; background: var(--bg); }
  .header { display: flex; align-items: center; justify-content: space-between; padding: 0 24px; background: rgba(13,17,23,0.9); border-bottom: 1px solid var(--border); backdrop-filter: blur(12px); position: sticky; top: 0; z-index: 100; }
  .header-logo { font-family: var(--font-mono); font-size: 22px; font-weight: 700; letter-spacing: 4px; color: var(--cyan); text-shadow: 0 0 20px var(--cyan), 0 0 40px rgba(0,255,231,0.3); }
  .header-logo span { color: var(--orange); }
  .header-status { display: flex; gap: 20px; align-items: center; font-family: var(--font-mono); font-size: 11px; color: var(--dim); }
  .ws-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--red); box-shadow: 0 0 8px var(--red); transition: all 0.3s; }
  .ws-dot.connected { background: var(--green); box-shadow: 0 0 8px var(--green); animation: pulse-green 2s infinite; }
  @keyframes pulse-green { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  .main { display: grid; grid-template-columns: 1fr 340px; grid-template-rows: auto 1fr; gap: 16px; padding: 16px; }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; position: relative; overflow: hidden; }
  .panel::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--cyan), transparent); opacity: 0.6; }
  .panel-title { font-family: var(--font-mono); font-size: 11px; letter-spacing: 3px; color: var(--cyan); opacity: 0.8; padding: 14px 16px 0; text-transform: uppercase; }
  .algo-panel { grid-column: 1 / -1; display: flex; gap: 12px; align-items: center; padding: 12px 16px; flex-wrap: wrap; }
  .algo-label { font-family: var(--font-mono); font-size: 11px; color: var(--dim); letter-spacing: 2px; margin-right: 4px; }
  .algo-btn { font-family: var(--font-mono); font-size: 13px; letter-spacing: 2px; padding: 8px 22px; border-radius: 4px; cursor: pointer; background: transparent; border: 1px solid rgba(0,255,231,0.2); color: var(--dim); transition: all 0.2s; text-transform: uppercase; }
  .algo-btn:hover { border-color: var(--cyan); color: var(--cyan); }
  .algo-btn.rr.active { border-color: var(--cyan); color: var(--bg); background: var(--cyan); box-shadow: 0 0 20px rgba(0,255,231,0.5); }
  .algo-btn.lc.active { border-color: var(--orange); color: var(--bg); background: var(--orange); box-shadow: 0 0 20px rgba(255,107,53,0.5); }
  .algo-btn.rl.active { border-color: var(--purple); color: var(--bg); background: var(--purple); box-shadow: 0 0 20px rgba(167,139,250,0.5); }
  .topology-panel { grid-row: 2; grid-column: 1; padding: 8px 16px 16px; min-height: 360px; display: flex; flex-direction: column; }
  .topology-svg { flex: 1; width: 100%; }
  .sidebar { grid-row: 2; grid-column: 2; display: flex; flex-direction: column; gap: 12px; }
  .server-cards { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px 16px; }
  .server-card { border: 1px solid rgba(255,255,255,0.07); border-radius: 6px; padding: 10px 12px; position: relative; overflow: hidden; transition: border-color 0.3s; }
  .server-card.online { border-color: rgba(0,255,231,0.15); }
  .server-card.offline { border-color: rgba(255,59,92,0.3); background: rgba(255,59,92,0.04); }
  .server-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; border-radius: 2px 0 0 2px; }
  .server-card.s0::before { background: var(--cyan); box-shadow: 0 0 8px var(--cyan); }
  .server-card.s1::before { background: var(--orange); box-shadow: 0 0 8px var(--orange); }
  .server-card.s2::before { background: var(--purple); box-shadow: 0 0 8px var(--purple); }
  .server-card.offline::before { background: var(--red) !important; }
  .sc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .sc-name { font-family: var(--font-mono); font-size: 12px; letter-spacing: 1px; }
  .sc-badge { font-family: var(--font-mono); font-size: 9px; letter-spacing: 2px; padding: 2px 6px; border-radius: 2px; }
  .sc-badge.online { background: rgba(57,255,122,0.15); color: var(--green); border: 1px solid rgba(57,255,122,0.3); }
  .sc-badge.offline { background: rgba(255,59,92,0.15); color: var(--red); border: 1px solid rgba(255,59,92,0.3); }
  .sc-metrics { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .sc-metric { text-align: center; }
  .sc-metric-val { font-family: var(--font-mono); font-size: 16px; font-weight: 700; }
  .sc-metric-lbl { font-size: 9px; letter-spacing: 1px; color: var(--dim); margin-top: 1px; }
  .bar-gauge { height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; margin-top: 6px; overflow: hidden; }
  .bar-gauge-fill { height: 100%; border-radius: 2px; transition: width 0.5s ease; }
  .charts-panel { display: flex; flex-direction: column; }
  .chart-section { padding: 10px 16px 6px; }
  .chart-title { font-family: var(--font-mono); font-size: 9px; letter-spacing: 2px; color: var(--dim); margin-bottom: 6px; }
  .rl-panel { padding: 12px 16px; }
  .rl-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .rl-stat { text-align: center; }
  .rl-stat-val { font-family: var(--font-mono); font-size: 22px; color: var(--purple); text-shadow: 0 0 12px rgba(167,139,250,0.5); }
  .rl-stat-lbl { font-size: 9px; letter-spacing: 2px; color: var(--dim); margin-top: 2px; }
  .rl-steps { font-family: var(--font-mono); font-size: 9px; color: var(--dim); text-align: center; margin-top: 8px; letter-spacing: 1px; }
  .ticker { grid-column: 1 / -1; font-family: var(--font-mono); font-size: 11px; color: var(--dim); border-top: 1px solid var(--border); padding: 6px 16px; overflow: hidden; white-space: nowrap; }
  .ticker-inner { display: inline-block; animation: ticker-scroll 30s linear infinite; }
  @keyframes ticker-scroll { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }
  .recharts-cartesian-axis-tick-value { font-family: var(--font-mono) !important; font-size: 9px !important; fill: rgba(255,255,255,0.3) !important; }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeSeedServers() {
  return [
    { id: 0, alive: true, cpu: 35 + Math.random()*20, conns: Math.floor(Math.random()*15+3), latency: 20+Math.random()*20 },
    { id: 1, alive: true, cpu: 40 + Math.random()*20, conns: Math.floor(Math.random()*15+3), latency: 25+Math.random()*20 },
    { id: 2, alive: true, cpu: 30 + Math.random()*20, conns: Math.floor(Math.random()*12+3), latency: 18+Math.random()*20 },
  ];
}

function normaliseServers(arr) {
  return arr.map(s => ({
    id:      s.id      ?? 0,
    alive:   s.alive   ?? s.healthy ?? true,
    cpu:     s.cpu     ?? 0,
    conns:   s.conns   ?? s.active_conn ?? 0,
    latency: s.latency ?? s.latency_ms  ?? 0,
  }));
}

// ─── Topology SVG ─────────────────────────────────────────────────────────────
function TopologyView({ servers, algorithm, packets }) {
  const W = 600, H = 280;
  const lb     = { x: 180, y: 140 };
  const client = { x: 40,  y: 140 };
  const srvPos = [{ x: 420, y: 60 }, { x: 420, y: 140 }, { x: 420, y: 220 }];
  const ac     = algorithm === "rr" ? "#00ffe7" : algorithm === "lc" ? "#ff6b35" : "#a78bfa";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="topology-svg" style={{ overflow: "visible" }}>
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,255,231,0.04)" strokeWidth="0.5"/>
        </pattern>
        <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="glow-strong" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="8" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        {SERVER_COLORS.map((_, i) => (
          <filter key={i} id={`glow-s${i}`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        ))}
      </defs>
      <rect width={W} height={H} fill="url(#grid)" rx="4"/>
      <line x1={client.x+20} y1={client.y} x2={lb.x-26} y2={lb.y} stroke={ac} strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="6 4"/>
      {srvPos.map((sp, i) => (
        <line key={i} x1={lb.x+26} y1={lb.y} x2={sp.x-26} y2={sp.y}
          stroke={servers[i]?.alive !== false ? SERVER_COLORS[i] : "#ff3b5c"}
          strokeWidth="1.5" strokeOpacity={servers[i]?.alive !== false ? 0.35 : 0.15}
          strokeDasharray={servers[i]?.alive !== false ? "none" : "4 8"}/>
      ))}
      {packets.map(p => <PacketDot key={p.id} pkt={p} lb={lb} client={client} srvPos={srvPos} ac={ac}/>)}
      {/* CLIENT */}
      <g transform={`translate(${client.x},${client.y})`}>
        <circle r="18" fill="rgba(0,255,231,0.06)" stroke={ac} strokeWidth="1.5" filter="url(#glow-cyan)"/>
        <circle r="10" fill="rgba(0,255,231,0.15)" stroke={ac} strokeWidth="1"/>
        <text textAnchor="middle" y="4" fill={ac} fontSize="8" fontFamily="Share Tech Mono">CLI</text>
        <text textAnchor="middle" y="32" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="Share Tech Mono">CLIENT</text>
      </g>
      {/* LB */}
      <g transform={`translate(${lb.x},${lb.y})`}>
        <circle r="24" fill={`rgba(${algorithm==="rr"?"0,255,231":algorithm==="lc"?"255,107,53":"167,139,250"},0.08)`} stroke={ac} strokeWidth="2" filter="url(#glow-strong)"/>
        <circle r="12" fill={`rgba(${algorithm==="rr"?"0,255,231":algorithm==="lc"?"255,107,53":"167,139,250"},0.2)`} stroke={ac} strokeWidth="1.5"/>
        <circle r="18" fill="none" stroke={ac} strokeWidth="1" strokeOpacity="0.5" strokeDasharray="4 6">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="6s" repeatCount="indefinite"/>
        </circle>
        <text textAnchor="middle" y="4" fill={ac} fontSize="8" fontFamily="Share Tech Mono" fontWeight="700">LB</text>
        <rect x="-22" y="30" width="44" height="14" rx="2" fill={`rgba(${algorithm==="rr"?"0,255,231":algorithm==="lc"?"255,107,53":"167,139,250"},0.15)`} stroke={ac} strokeWidth="0.5"/>
        <text textAnchor="middle" y="40" fill={ac} fontSize="8" fontFamily="Share Tech Mono">{algorithm.toUpperCase()}</text>
      </g>
      {/* SERVERS */}
      {srvPos.map((sp, i) => {
        const srv   = servers[i] || {};
        const alive = srv.alive !== false;
        const color = alive ? SERVER_COLORS[i] : "#ff3b5c";
        const cpu   = srv.cpu || 0;
        return (
          <g key={i} transform={`translate(${sp.x},${sp.y})`}>
            <circle r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4"/>
            <circle r="28" fill="none" stroke={color} strokeWidth="4" strokeOpacity="0.6"
              strokeDasharray={`${(cpu/100)*175.9} 175.9`} transform="rotate(-90)"
              style={{ transition: "stroke-dasharray 0.6s ease" }} filter={`url(#glow-s${i})`}/>
            <circle r="22" fill={`rgba(${alive?(i===0?"0,255,231":i===1?"255,107,53":"167,139,250"):"255,59,92"},0.06)`} stroke={color} strokeWidth="1.5"/>
            {alive && (
              <circle r="26" fill="none" stroke={color} strokeWidth="0.5" strokeOpacity="0.4" strokeDasharray="3 5">
                <animateTransform attributeName="transform" type="rotate" from="0" to={i%2===0?"360":"-360"} dur={`${5+i*2}s`} repeatCount="indefinite"/>
              </circle>
            )}
            <circle r="12" fill={`rgba(${alive?(i===0?"0,255,231":i===1?"255,107,53":"167,139,250"):"255,59,92"},0.12)`} stroke={color} strokeWidth="1"/>
            <text textAnchor="middle" y="-1" fill={color} fontSize="8" fontFamily="Share Tech Mono" fontWeight="700">{alive?`S${i+1}`:"✕"}</text>
            <text textAnchor="middle" y="9"  fill={color} fontSize="7" fontFamily="Share Tech Mono">{alive?`${Math.round(cpu)}%`:"OFF"}</text>
            <text textAnchor="middle" y="38" fill="rgba(255,255,255,0.5)" fontSize="8" fontFamily="Share Tech Mono">:{8081+i}</text>
          </g>
        );
      })}
    </svg>
  );
}

function PacketDot({ pkt, lb, client, srvPos, ac }) {
  const sp    = srvPos[pkt.server] || srvPos[0];
  const color = SERVER_COLORS[pkt.server] || ac;
  let x, y;
  if (pkt.phase === 0) {
    x = client.x + 20 + (lb.x - 26 - client.x - 20) * pkt.t;
    y = client.y + (lb.y - client.y) * pkt.t;
  } else {
    x = lb.x + 26 + (sp.x - 26 - lb.x - 26) * pkt.t;
    y = lb.y + (sp.y - lb.y) * pkt.t;
  }
  return (
    <g>
      <circle cx={x} cy={y} r="5"   fill={color} opacity="0.1"/>
      <circle cx={x} cy={y} r="3.5" fill={color} opacity="0.9">
        <animate attributeName="opacity" values="0.9;0.5;0.9" dur="0.4s" repeatCount="indefinite"/>
      </circle>
      <circle cx={x} cy={y} r="6"   fill={color} opacity="0.2"/>
    </g>
  );
}

function ServerCard({ server, index }) {
  const alive = server.alive !== false;
  const color = alive ? SERVER_COLORS[index] : "#ff3b5c";
  const cpu   = server.cpu || 0;
  const getCpuColor = v => v > 85 ? "#ff3b5c" : v > 65 ? "#ff6b35" : SERVER_COLORS[index];
  return (
    <div className={`server-card s${index} ${alive ? "online" : "offline"}`}>
      <div className="sc-header">
        <span className="sc-name" style={{ color }}>{`BACKEND-${index+1}`}</span>
        <span className={`sc-badge ${alive ? "online" : "offline"}`}>{alive ? "ONLINE" : "OFFLINE"}</span>
      </div>
      <div className="sc-metrics">
        <div className="sc-metric">
          <div className="sc-metric-val" style={{ color: getCpuColor(cpu) }}>{alive ? `${Math.round(cpu)}%` : "–"}</div>
          <div className="sc-metric-lbl">CPU</div>
        </div>
        <div className="sc-metric">
          <div className="sc-metric-val" style={{ color }}>{alive ? (server.conns || 0) : "–"}</div>
          <div className="sc-metric-lbl">CONNS</div>
        </div>
        <div className="sc-metric">
          <div className="sc-metric-val" style={{ color }}>{alive ? `${Math.round(server.latency || 0)}` : "–"}</div>
          <div className="sc-metric-lbl">LAT ms</div>
        </div>
      </div>
      <div className="bar-gauge">
        <div className="bar-gauge-fill" style={{
          width: alive ? `${Math.min(cpu,100)}%` : "100%",
          background: alive
            ? `linear-gradient(90deg, ${getCpuColor(cpu)}, ${getCpuColor(cpu)}88)`
            : "linear-gradient(90deg, #ff3b5c44, #ff3b5c22)"
        }}/>
      </div>
    </div>
  );
}

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0d1117", border:"1px solid rgba(0,255,231,0.2)", borderRadius:4, padding:"6px 10px", fontFamily:"Share Tech Mono", fontSize:11 }}>
      {payload.map((p,i) => <div key={i} style={{ color:p.color }}>{p.name}: {typeof p.value==="number" ? p.value.toFixed(1) : p.value}</div>)}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN APP
//  Data flow:
//    1. On mount → immediately fetch /admin/status (REST) so UI is never blank
//    2. WebSocket connects → live metrics replace REST data
//    3. If WS drops → simulation keeps the UI alive until reconnect
//    4. RL mode → poll /rl_stats every 2s for training progress
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [algorithm,      setAlgorithm]      = useState("rr");
  const [servers,        setServers]        = useState(makeSeedServers);
  const [packets,        setPackets]        = useState([]);
  const [latencyHistory, setLatencyHistory] = useState([]);
  const [distribution,   setDistribution]   = useState([{name:"S1",reqs:0},{name:"S2",reqs:0},{name:"S3",reqs:0}]);
  const [rlStats,        setRlStats]        = useState({ epsilon:1.0, reward:0, stepCount:0 });
  const [totalReqs,      setTotalReqs]      = useState(0);
  const [wsConnected,    setWsConnected]    = useState(false);

  // ── Refs that never cause re-renders ────────────────────────────────────────
  const wsRef        = useRef(null);
  const retryRef     = useRef(null);
  const simRef       = useRef(null);
  const packetIdRef  = useRef(0);
  // KEY FIX: store latest state in refs so WS/sim closures always see fresh values
  // without needing them in dependency arrays (which caused reconnect loops).
  const serversRef   = useRef(servers);
  const algorithmRef = useRef(algorithm);
  useEffect(() => { serversRef.current   = servers;   }, [servers]);
  useEffect(() => { algorithmRef.current = algorithm; }, [algorithm]);

  // ── Packet animation (stable — empty deps, uses only setters) ───────────────
  const spawnPacket = useCallback((idx) => {
    const id  = ++packetIdRef.current;
    setPackets(prev => [...prev.slice(-12), { id, server: idx, phase: 0, t: 0 }]);
    let t = 0;
    const go = (phase, done) => {
      const iv = setInterval(() => {
        t += 0.06;
        if (t >= 1) {
          clearInterval(iv);
          done();
        } else {
          setPackets(prev => prev.map(p => p.id === id ? { ...p, t } : p));
        }
      }, 16);
      return iv;
    };
    const iv0 = go(0, () => {
      t = 0;
      setPackets(prev => prev.map(p => p.id === id ? { ...p, phase:1, t:0 } : p));
      go(1, () => setPackets(prev => prev.filter(p => p.id !== id)));
    });
    return () => clearInterval(iv0);
  }, []); // empty — only uses setPackets (stable setter) and packetIdRef (ref)

  // ── Handle a routed request event ───────────────────────────────────────────
  // NOTE: This is a plain function called inside the WS handler ref,
  // NOT a useCallback — so it can never cause WS reconnects.
  const handleRequest = (serverIdx, latency) => {
    spawnPacket(serverIdx);
    setTotalReqs(r => r + 1);
    setDistribution(prev => {
      const next = [...prev];
      if (next[serverIdx]) next[serverIdx] = { ...next[serverIdx], reqs: next[serverIdx].reqs + 1 };
      return next;
    });
    if (latency != null) {
      setLatencyHistory(h => [...h, { t: Date.now(), v: latency, s: serverIdx }].slice(-MAX_HISTORY));
    }
  };

  // ── WebSocket — single useEffect, stable forever ─────────────────────────────
  // CORE FIX: The WS message handler is stored in a ref (msgHandlerRef).
  // This means we can update what "handleMessage" does (e.g. call spawnPacket)
  // without ever recreating the WebSocket or triggering a reconnect.
  const msgHandlerRef = useRef(null);
  msgHandlerRef.current = (msg) => {
    if (msg.type === "metrics" && Array.isArray(msg.servers)) {
      setServers(normaliseServers(msg.servers));
    }
    if (msg.type === "request") {
      handleRequest((msg.server || 1) - 1, msg.latency);
    }
    if (msg.type === "ROUTE_EVENT") {
      if (msg.server_states) setServers(normaliseServers(msg.server_states));
      handleRequest(msg.server_id ?? 0, msg.latency_ms);
    }
    if (msg.type === "rl_stats") {
      setRlStats({ epsilon: msg.epsilon ?? 1.0, reward: msg.avg_reward ?? 0, stepCount: msg.step_count ?? 0 });
    }
    if (msg.type === "algo" && msg.algorithm) {
      setAlgorithm(msg.algorithm);
    }
  };

  useEffect(() => {
    // ── Connect / reconnect ────────────────────────────────────────────────
    function connect() {
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent duplicate retry
        wsRef.current.close();
        wsRef.current = null;
      }
      try {
        const ws    = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          clearTimeout(retryRef.current);
        };

        ws.onclose = () => {
          setWsConnected(false);
          // Retry in 1 s (was 3s — much faster recovery after refresh)
          retryRef.current = setTimeout(connect, 1000);
        };

        ws.onerror = () => ws.close(); // triggers onclose → retry

        ws.onmessage = (e) => {
          try {
            // Call through ref so we always use the latest handler
            // without ever needing to recreate this WebSocket.
            msgHandlerRef.current(JSON.parse(e.data));
          } catch {}
        };
      } catch {
        retryRef.current = setTimeout(connect, 1000);
      }
    }

    // ── Fetch initial state immediately so UI is never blank on refresh ──
    fetch(`${API_BASE}/admin/status`)
      .then(r => r.json())
      .then(data => {
        if (data.algorithm) setAlgorithm(data.algorithm);
        if (Array.isArray(data.servers)) setServers(normaliseServers(data.servers));
      })
      .catch(() => {}); // backend not ready yet — seed data stays

    connect();

    return () => {
      clearTimeout(retryRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []); // ← EMPTY DEPS — runs once on mount, never reconnects due to re-renders

  // ── Simulation fallback (runs only when WS is disconnected) ─────────────────
  useEffect(() => {
    if (wsConnected) {
      clearInterval(simRef.current);
      simRef.current = null;
      return;
    }
    // Start simulation — reads from serversRef to avoid stale closure
    simRef.current = setInterval(() => {
      const srvs = serversRef.current.map(s => ({
        ...s,
        cpu:     Math.min(99, Math.max(5,  (s.cpu     || 30) + (Math.random()-0.48)*8)),
        conns:   Math.max(0,              (s.conns    || 0)  + Math.floor((Math.random()-0.5)*4)),
        latency: Math.max(5,              (s.latency  || 25) + (Math.random()-0.5)*10),
      }));
      setServers(srvs);

      const alive = srvs.filter(s => s.alive !== false);
      if (alive.length > 0) {
        const target = alive[Math.floor(Math.random() * alive.length)];
        const idx    = srvs.indexOf(target);
        spawnPacket(idx);
        setTotalReqs(r => r + 1);
        setDistribution(prev => {
          const next = [...prev];
          next[idx]  = { ...next[idx], reqs: next[idx].reqs + 1 };
          return next;
        });
        setLatencyHistory(h =>
          [...h, { t: Date.now(), v: target.latency || 25, s: idx }].slice(-MAX_HISTORY)
        );
      }

      if (algorithmRef.current === "rl") {
        setRlStats(prev => ({
          ...prev,
          epsilon:   Math.max(0.05, prev.epsilon - 0.001),
          reward:    parseFloat((-0.5 + Math.random() * 1.5).toFixed(2)),
          stepCount: prev.stepCount + 1,
        }));
      }
    }, 600);

    return () => { clearInterval(simRef.current); simRef.current = null; };
  }, [wsConnected, spawnPacket]); // spawnPacket is stable (empty deps)

  // ── Poll RL agent stats directly when in RL mode ─────────────────────────────
  useEffect(() => {
    if (algorithm !== "rl") return;
    const poll = () =>
      fetch(`${RL_URL}/rl_stats`)
        .then(r => r.json())
        .then(d => setRlStats({ epsilon: d.epsilon ?? 1.0, reward: d.avg_reward ?? 0, stepCount: d.step_count ?? 0 }))
        .catch(() => {});
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [algorithm]);

  // ── Poll /admin/status as live fallback when WS is down ──────────────────────
  useEffect(() => {
    if (wsConnected) return;
    const id = setInterval(() =>
      fetch(`${API_BASE}/admin/status`)
        .then(r => r.json())
        .then(d => {
          if (d.algorithm) setAlgorithm(d.algorithm);
          if (Array.isArray(d.servers)) setServers(normaliseServers(d.servers));
        })
        .catch(() => {}),
      3000
    );
    return () => clearInterval(id);
  }, [wsConnected]);

  // ── Algorithm switch ──────────────────────────────────────────────────────────
  const switchAlgo = (algo) => {
    setAlgorithm(algo);
    fetch(`${API_BASE}/admin/algorithm`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ algorithm: algo }),
    }).catch(() => {});
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "SET_ALGO", algo }));
    }
  };

  // ── Derived chart data ────────────────────────────────────────────────────────
  const chartLatency = latencyHistory.map((d, i) => ({ i, v: d.v }));
  const avgLatency   = latencyHistory.length
    ? (latencyHistory.reduce((a,b) => a+b.v, 0) / latencyHistory.length).toFixed(1)
    : "—";

  const tickerText = servers.map((s,i) =>
    `BACKEND-${i+1}: ${s.alive!==false
      ? `CPU ${Math.round(s.cpu||0)}%  LAT ${Math.round(s.latency||0)}ms  CONNS ${s.conns||0}`
      : "OFFLINE"}`
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
            <span>ALGO: <strong style={{color:algorithm==="rr"?"#00ffe7":algorithm==="lc"?"#ff6b35":"#a78bfa"}}>{algorithm.toUpperCase()}</strong></span>
            <span style={{opacity:0.5}}>|</span>
            <span>REQ: <strong style={{color:"#00ffe7"}}>{totalReqs.toLocaleString()}</strong></span>
            <span style={{opacity:0.5}}>|</span>
            <span>AVG LAT: <strong style={{color:"#39ff7a"}}>{avgLatency}ms</strong></span>
          </div>
        </header>

        <div className="main">

          {/* Algorithm selector */}
          <div className="panel algo-panel">
            <span className="algo-label">ALGORITHM //</span>
            {["rr","lc","rl"].map(a => (
              <button key={a} className={`algo-btn ${a} ${algorithm===a?"active":""}`} onClick={() => switchAlgo(a)}>
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

          {/* Sidebar */}
          <div className="sidebar">

            <div className="panel">
              <div className="panel-title">// SERVER STATUS</div>
              <div className="server-cards">
                {servers.map((s,i) => <ServerCard key={i} server={s} index={i}/>)}
              </div>
            </div>

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
                  <div style={{marginTop:10, fontFamily:"var(--font-mono)", fontSize:9, color:"var(--dim)", letterSpacing:1}}>
                    EXPLORE: {Math.round(rlStats.epsilon*100)}% &nbsp;|&nbsp; EXPLOIT: {Math.round((1-rlStats.epsilon)*100)}%
                  </div>
                  <div style={{marginTop:6}}>
                    <div className="bar-gauge">
                      <div className="bar-gauge-fill" style={{width:`${rlStats.epsilon*100}%`, background:"linear-gradient(90deg, #a78bfa, #6d28d9)"}}/>
                    </div>
                  </div>
                  <div className="rl-steps">STEPS: {(rlStats.stepCount||0).toLocaleString()}</div>
                </div>
              </div>
            )}

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
                      {distribution.map((_,i) => <Cell key={i} fill={SERVER_COLORS[i]}/>)}
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
                <YAxis domain={["auto","auto"]} tick={{fontSize:9, fontFamily:"Share Tech Mono", fill:"rgba(255,255,255,0.3)"}}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Line type="monotone" dataKey="v" name="Latency" dot={false} strokeWidth={2} stroke="#00ffe7" isAnimationActive={false}/>
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