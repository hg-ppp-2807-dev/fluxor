"""
RL Agent — DQN-based load balancing decision maker.
Exposes REST API for the Go load balancer to call.

FIXES APPLIED:
  1. Added `threading` import (was missing — caused AttributeError on _thread_local)
  2. Fixed race condition: _last_state/_last_action now per-thread via threading.local()
  3. Fixed torch.load: added weights_only=True (crashes on PyTorch >= 2.6 without it)
  4. Wrapped load_checkpoint in try/except (handles shape mismatch if N_SERVERS changes)
  5. Added SYNTHETIC SIMULATION: background thread trains the agent continuously
     even with zero real traffic — model is warmed up when real requests arrive.
  6. Added /rl_stats endpoint for dashboard.
  7. Added SIM_ENABLED env var to toggle simulation on/off.
"""

import os
import json
import time
import random
import logging
import threading
import math
from collections import deque

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from prometheus_client import Gauge, Counter, generate_latest, CONTENT_TYPE_LATEST

logging.basicConfig(level=logging.INFO, format="[RL] %(message)s")
log = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Allow dashboard to poll /rl_stats directly

# ── Config ────────────────────────────────────────────────────
N_SERVERS    = int(os.getenv("N_SERVERS", 3))
STATE_DIM    = N_SERVERS * 3 + 2   # cpu, conns, latency per server + req_rate + queue
ACTION_DIM   = N_SERVERS
PROM_URL     = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
CKPT_DIR     = os.getenv("CKPT_DIR", "./checkpoints")
CKPT_PATH    = f"{CKPT_DIR}/dqn_latest.pt"
SIM_ENABLED  = os.getenv("SIM_ENABLED", "true").lower() == "true"
SIM_INTERVAL = float(os.getenv("SIM_INTERVAL_S", "0.1"))   # seconds between sim steps
os.makedirs(CKPT_DIR, exist_ok=True)


# ── DQN Model ─────────────────────────────────────────────────
class DQN(nn.Module):
    def __init__(self, state_dim, action_dim):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, action_dim),
        )

    def forward(self, x):
        return self.net(x)


# ── Replay Buffer ─────────────────────────────────────────────
class ReplayBuffer:
    def __init__(self, capacity=10000):
        self.buf = deque(maxlen=capacity)

    def push(self, state, action, reward, next_state):
        self.buf.append((state, action, reward, next_state))

    def sample(self, batch_size):
        batch = random.sample(self.buf, batch_size)
        s, a, r, ns = zip(*batch)
        return (
            np.array(s,  dtype=np.float32),
            np.array(a),
            np.array(r,  dtype=np.float32),
            np.array(ns, dtype=np.float32),
        )

    def __len__(self):
        return len(self.buf)


# ── DQN Agent ─────────────────────────────────────────────────
class DQNAgent:
    def __init__(self):
        # Networks
        self.policy_net = DQN(STATE_DIM, ACTION_DIM)
        self.target_net = DQN(STATE_DIM, ACTION_DIM)
        self.target_net.load_state_dict(self.policy_net.state_dict())
        self.target_net.eval()

        # Optimiser and loss
        self.optimizer = optim.Adam(self.policy_net.parameters(), lr=1e-3)
        self.loss_fn   = nn.SmoothL1Loss()
        self.buffer    = ReplayBuffer()

        # Hyper-params
        self.epsilon       = 1.0
        self.epsilon_min   = 0.05
        self.epsilon_decay = 0.995
        self.gamma         = 0.95
        self.batch_size    = 64
        self.target_sync   = 50

        # Stats
        self.step_count    = 0
        self.total_reward  = 0.0
        self.episode_steps = 0
        self.last_loss     = 0.0

        # Thread safety
        self.lock          = threading.Lock()
        # FIX: use thread-local so concurrent /decide calls don't clobber each other
        self._thread_local = threading.local()

        self.load_checkpoint()

    def select_action(self, state: np.ndarray) -> int:
        if random.random() < self.epsilon:
            return random.randint(0, ACTION_DIM - 1)
        with torch.no_grad():
            t = torch.FloatTensor(state).unsqueeze(0)
            q = self.policy_net(t)
            return int(q.argmax().item())

    def q_values(self, state: np.ndarray) -> list:
        with torch.no_grad():
            t = torch.FloatTensor(state).unsqueeze(0)
            return self.policy_net(t).squeeze().tolist()

    def store_and_train(self, state, action, reward, next_state):
        with self.lock:
            self.buffer.push(state, action, reward, next_state)
            self.total_reward  += reward
            self.episode_steps += 1

            if len(self.buffer) < self.batch_size:
                return

            s, a, r, ns = self.buffer.sample(self.batch_size)
            s  = torch.FloatTensor(s)
            a  = torch.LongTensor(a).unsqueeze(1)
            r  = torch.FloatTensor(r)
            ns = torch.FloatTensor(ns)

            current_q  = self.policy_net(s).gather(1, a).squeeze()
            with torch.no_grad():
                max_next_q = self.target_net(ns).max(1)[0]
            target_q = r + self.gamma * max_next_q

            loss = self.loss_fn(current_q, target_q)
            self.optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.policy_net.parameters(), 1.0)
            self.optimizer.step()
            self.last_loss = float(loss.item())

            self.step_count += 1
            self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)

            prom_epsilon.set(self.epsilon)
            prom_reward.set(self.total_reward / max(1, self.episode_steps))
            prom_loss.set(self.last_loss)

            if self.step_count % self.target_sync == 0:
                self.target_net.load_state_dict(self.policy_net.state_dict())

            if self.step_count % 100 == 0:
                self.save_checkpoint()
                log.info(
                    f"step={self.step_count}  eps={self.epsilon:.3f}  "
                    f"avg_reward={self.total_reward/max(1,self.episode_steps):.3f}  "
                    f"loss={self.last_loss:.4f}  buffer={len(self.buffer)}"
                )

    def save_checkpoint(self):
        torch.save({
            "policy":     self.policy_net.state_dict(),
            "target":     self.target_net.state_dict(),
            "epsilon":    self.epsilon,
            "step_count": self.step_count,
        }, CKPT_PATH)

    def load_checkpoint(self):
        if os.path.exists(CKPT_PATH):
            # FIX: weights_only=True required for PyTorch >= 2.6
            # FIX: try/except handles shape mismatch when N_SERVERS changes
            try:
                ck = torch.load(CKPT_PATH, map_location="cpu", weights_only=True)
                self.policy_net.load_state_dict(ck["policy"])
                self.target_net.load_state_dict(ck["target"])
                self.epsilon    = ck.get("epsilon",    self.epsilon)
                self.step_count = ck.get("step_count", 0)
                log.info(f"Checkpoint loaded — step={self.step_count}  eps={self.epsilon:.3f}")
            except Exception as e:
                log.warning(f"Checkpoint load failed ({e}), starting fresh")


# ── State Builder ─────────────────────────────────────────────
def build_state(payload: dict) -> np.ndarray:
    state       = []
    cpu_util    = payload.get("cpu_util",       [0.0]   * N_SERVERS)
    active_conn = payload.get("active_conns",   [0.0]   * N_SERVERS)
    avg_lat     = payload.get("avg_latency_ms", [100.0] * N_SERVERS)

    for i in range(N_SERVERS):
        cpu  = float(cpu_util[i])    if i < len(cpu_util)    else 0.0
        conn = float(active_conn[i]) if i < len(active_conn) else 0.0
        lat  = float(avg_lat[i])     if i < len(avg_lat)     else 100.0

        prom_cpu = _prom_metric(f'backend_cpu_utilization{{server_id="{i+1}"}}')
        if prom_cpu is not None:
            cpu = prom_cpu

        state.append(np.clip(cpu  / 100.0,  0, 1))
        state.append(np.clip(conn / 100.0,  0, 1))
        state.append(np.clip(lat  / 2000.0, 0, 1))

    req_rate = float(payload.get("request_rate", 0))
    state.append(np.clip(req_rate / 500.0, 0, 1))
    state.append(0.0)
    return np.array(state, dtype=np.float32)


def compute_reward(state: np.ndarray, action: int, latency_ms: float) -> float:
    cpu_utils  = [state[i * 3] for i in range(N_SERVERS)]
    chosen_cpu = cpu_utils[action] if action < len(cpu_utils) else 0.5

    r_latency  = -(latency_ms / 1000.0) * 0.5
    r_balance  = -float(np.std(cpu_utils)) * 0.3
    r_capacity = -10.0 if chosen_cpu > 0.85 else 0.0
    r_capacity *= 0.2

    return float(np.clip(r_latency + r_balance + r_capacity, -15.0, 1.0))


# ── Prometheus helpers ────────────────────────────────────────
_prom_cache    = {}
_prom_cache_ts = {}

def _prom_metric(query: str):
    now = time.time()
    if query in _prom_cache and now - _prom_cache_ts.get(query, 0) < 2:
        return _prom_cache[query]
    try:
        r = requests.get(f"{PROM_URL}/api/v1/query", params={"query": query}, timeout=1)
        result = r.json()["data"]["result"]
        if result:
            val = float(result[0]["value"][1])
            _prom_cache[query]    = val
            _prom_cache_ts[query] = now
            return val
    except Exception:
        pass
    return None


# ── Prometheus Metrics ────────────────────────────────────────
prom_epsilon  = Gauge("rl_epsilon",           "Current exploration rate")
prom_reward   = Gauge("rl_avg_reward",        "Average episodic reward")
prom_loss     = Gauge("rl_training_loss",     "Most recent training loss")
prom_sim_step = Counter("rl_sim_steps_total", "Total synthetic simulation steps")
prom_decides  = Counter("rl_decisions_total", "Total routing decisions made")


# ────────────────────────────────────────────────────────────────────────────
#  SYNTHETIC SIMULATION
#  Background thread that trains the DQN continuously even with zero real
#  traffic. Models 3 backends with:
#    - slowly drifting CPU load (sinusoidal drift per server + random noise)
#    - connections that rise when server is heavily loaded or chosen
#    - latency proportional to CPU pressure + jitter
#    - random load spikes to stress-test the agent's exploration
# ────────────────────────────────────────────────────────────────────────────

class SimulatedServer:
    def __init__(self, server_id: int):
        self.id          = server_id
        self.base_cpu    = 20.0 + server_id * 10.0
        self.cpu         = self.base_cpu
        self.conns       = 0.0
        self.latency_ms  = 20.0 + server_id * 15.0
        self.spike_until = 0.0

    def step(self, t: float, chosen: bool) -> float:
        """Advance one tick, return latency_ms experienced."""
        drift  = 15.0 * math.sin(t / 30.0 + self.id * 1.5)
        if random.random() < 0.005:
            self.spike_until = t + 10.0
        spike  = 35.0 if t < self.spike_until else 0.0
        noise  = random.gauss(0, 3.0)

        self.cpu = float(np.clip(self.base_cpu + drift + spike + noise, 5.0, 98.0))

        target_conns = self.cpu * 0.6 + (5.0 if chosen else 0.0)
        self.conns   = float(np.clip(
            self.conns * 0.8 + target_conns * 0.2 + random.gauss(0, 1),
            0, 80,
        ))

        cpu_pressure    = max(0.0, self.cpu - 50.0) * 1.5
        self.latency_ms = float(np.clip(
            20.0 + self.id * 15.0 + cpu_pressure + random.gauss(0, 5.0),
            5.0, 2000.0,
        ))
        return self.latency_ms


def _sim_build_state(servers: list) -> np.ndarray:
    state = []
    for s in servers:
        state.append(np.clip(s.cpu        / 100.0,  0, 1))
        state.append(np.clip(s.conns      / 100.0,  0, 1))
        state.append(np.clip(s.latency_ms / 2000.0, 0, 1))
    req_rate = random.uniform(10, 200)
    state.append(np.clip(req_rate / 500.0, 0, 1))
    state.append(0.0)
    return np.array(state, dtype=np.float32)


def _simulation_loop():
    """Background daemon thread: generates synthetic experience, trains agent."""
    log.info("=== Synthetic simulation started (SIM_INTERVAL=%.2fs) ===", SIM_INTERVAL)
    servers = [SimulatedServer(i) for i in range(N_SERVERS)]
    t       = 0.0

    while True:
        try:
            t += SIM_INTERVAL

            state  = _sim_build_state(servers)
            action = agent.select_action(state)

            latencies           = [srv.step(t, chosen=(srv.id == action)) for srv in servers]
            experienced_latency = latencies[action]

            next_state = _sim_build_state(servers)
            reward     = compute_reward(state, action, experienced_latency)

            agent.store_and_train(state, action, reward, next_state)
            prom_sim_step.inc()

        except Exception as e:
            log.warning(f"[SIM] step error: {e}")

        time.sleep(SIM_INTERVAL)


# ── Create agent (after all class definitions) ────────────────
agent = DQNAgent()

# Start simulation daemon
if SIM_ENABLED:
    _sim_thread = threading.Thread(target=_simulation_loop, daemon=True, name="sim-loop")
    _sim_thread.start()
    log.info("Synthetic simulation ENABLED")
else:
    log.info("Synthetic simulation DISABLED (set SIM_ENABLED=true to enable)")


# ── Flask routes ──────────────────────────────────────────────

@app.route("/")
def index():
    return jsonify({
        "message":   "RL Agent API is running.",
        "sim_enabled": SIM_ENABLED,
        "endpoints": [
            "/decide (POST)",
            "/feedback (POST)",
            "/status (GET)",
            "/rl_stats (GET)",
            "/metrics (GET)",
            "/health (GET)",
        ],
    })


@app.route("/decide", methods=["POST"])
def decide():
    """
    POST /decide — called by Go load balancer per request.
    Body:    { cpu_util: [], active_conns: [], avg_latency_ms: [], request_rate: N }
    Returns: { action: int, q_value: float }
    """
    payload = request.get_json(force=True) or {}
    state   = build_state(payload)
    action  = agent.select_action(state)
    q_vals  = agent.q_values(state)

    # FIX: thread-local — concurrent requests no longer clobber each other
    agent._thread_local.last_state  = state
    agent._thread_local.last_action = action
    prom_decides.inc()

    return jsonify({"action": action, "q_value": float(max(q_vals))})


@app.route("/feedback", methods=["POST"])
def feedback():
    """
    POST /feedback — called by Go after request completes.
    Body: { server_id: int, latency_ms: float }
    """
    payload    = request.get_json(force=True) or {}
    latency_ms = float(payload.get("latency_ms", 200))

    # FIX: read from thread-local
    prev_state  = getattr(agent._thread_local, "last_state",  None)
    prev_action = getattr(agent._thread_local, "last_action", None)

    if prev_state is None:
        return jsonify({"status": "skipped"})

    reward = compute_reward(prev_state, prev_action, latency_ms)

    next_payload = {"cpu_util": [], "active_conns": [], "avg_latency_ms": []}
    next_state   = build_state(next_payload)

    agent.store_and_train(prev_state, prev_action, reward, next_state)
    return jsonify({"status": "ok", "reward": reward})


@app.route("/status", methods=["GET"])
def status():
    return jsonify({
        "epsilon":     round(agent.epsilon, 4),
        "step_count":  agent.step_count,
        "buffer_len":  len(agent.buffer),
        "avg_reward":  round(agent.total_reward / max(1, agent.episode_steps), 4),
        "last_loss":   round(agent.last_loss, 6),
        "sim_enabled": SIM_ENABLED,
    })


@app.route("/rl_stats", methods=["GET"])
def rl_stats():
    """Dashboard-friendly snapshot — matches WSRLStats message shape."""
    return jsonify({
        "type":       "rl_stats",
        "epsilon":    round(agent.epsilon, 4),
        "avg_reward": round(agent.total_reward / max(1, agent.episode_steps), 4),
        "step_count": agent.step_count,
        "buffer_len": len(agent.buffer),
        "loss":       round(agent.last_loss, 6),
    })


@app.route("/metrics")
def metrics():
    return generate_latest(), 200, {"Content-Type": CONTENT_TYPE_LATEST}


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


# ── Entry point ───────────────────────────────────────────────
if __name__ == "__main__":
    log.info(f"RL Agent starting — state_dim={STATE_DIM}  action_dim={ACTION_DIM}")
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, threaded=True)