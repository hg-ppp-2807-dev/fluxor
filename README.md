# Adaptive RL-Based Load Balancer

A production-grade distributed load balancing system comparing Round Robin, Least Connections, and a DQN-based RL agent — with real-time animated visualization.

## Architecture

```
Clients → Go Load Balancer (:8080) → Backend 1/2/3 (:8081-8083)
                ↕ REST                       ↕ /metrics
          Python RL Agent (:5000)      Prometheus (:9090)
                                            ↓
          React Dashboard (:3000) ←── WebSocket (:8080/ws)
                                       Grafana (:3001)
```

## Quick Start

### Prerequisites
- Docker Desktop (Mac) with at least 4GB RAM assigned
- Docker Compose v2

### 1. Start everything
```bash
docker compose up --build
```

### 2. Open services
| Service | URL |
|---|---|
| **Live Dashboard** | http://localhost:3000 |
| **Load Balancer** | http://localhost:8080 |
| **Grafana** | http://localhost:3001 (admin/admin) |
| **Prometheus** | http://localhost:9090 |
| **RL Agent** | http://localhost:5000/status |

### 3. Send test traffic (manual)
```bash
# Simple curl loop
for i in $(seq 1 100); do curl -s http://localhost:8080/work > /dev/null; done

# OR use k6 (brew install k6)
k6 run scripts/loadtest.js
```

---

## Switching Algorithms

### Via Dashboard UI
Click **Round Robin**, **Least Conn**, or **RL Agent** buttons in the dashboard.

### Via REST API
```bash
# Round Robin
curl -X POST http://localhost:8080/admin/algorithm \
  -H 'Content-Type: application/json' \
  -d '{"algorithm":"rr"}'

# Least Connections
curl -X POST http://localhost:8080/admin/algorithm \
  -d '{"algorithm":"lc"}'

# RL Agent (DQN)
curl -X POST http://localhost:8080/admin/algorithm \
  -d '{"algorithm":"rl"}'
```

---

## Running Experiments

### Experiment 1 — Normal Traffic (50 VUs, 60s)
```bash
# Set algorithm, then run test
curl -X POST http://localhost:8080/admin/algorithm -d '{"algorithm":"rr"}'
k6 run scripts/loadtest.js

# Repeat for lc and rl
```

### Experiment 2 — Traffic Spike
```bash
# Edit scripts/loadtest.js: change `export const options = spikeOptions`
k6 run scripts/loadtest.js
```

### Experiment 3 — Server Failure
```bash
# In one terminal, run load test
k6 run scripts/loadtest.js

# In another terminal, kill server 2 at t=30s
docker stop backend-2

# Observe dashboard — RL agent and LC should reroute; RR will hit errors briefly
# Restore:
docker start backend-2
```

---

## Project Structure

```
.
├── docker-compose.yml          # Full orchestration
├── load-balancer/
│   ├── main.go                 # Reverse proxy + WS hub + metrics
│   ├── go.mod
│   └── Dockerfile
├── backend/
│   ├── server.js               # Express server with prom metrics
│   ├── package.json
│   └── Dockerfile
├── rl-agent/
│   ├── app.py                  # DQN agent + Flask API
│   ├── requirements.txt
│   ├── Dockerfile
│   └── checkpoints/            # Auto-saved model weights
├── dashboard/
│   ├── src/
│   │   ├── App.jsx             # Main layout + algo selector
│   │   ├── components/
│   │   │   ├── TopologyCanvas.jsx  # D3 animated request flow
│   │   │   └── MetricsPanel.jsx    # Recharts latency/RPS/distribution
│   │   ├── hooks/useWebSocket.js   # WS connection + event handler
│   │   └── store/useLBStore.js     # Zustand global state
│   └── Dockerfile
├── infra/
│   ├── prometheus.yml
│   └── grafana/provisioning/   # Auto-provisioned datasource + dashboards
└── scripts/
    └── loadtest.js             # k6 test scenarios
```

---

## RL Agent Design

### State Vector (dim=11 for N=3 servers)
```
[cpu_0, conns_0, lat_0,  cpu_1, conns_1, lat_1,  cpu_2, conns_2, lat_2,  req_rate, queue]
```
All values normalised to [0, 1].

### Action Space
`{0, 1, 2}` — select which backend server receives the request.

### Reward Function
```
r = -0.5 * latency_ms/1000        # penalise slow responses
  - 0.3 * std_dev(cpu_utils)       # penalise uneven load
  - 2.0 * overload_penalty         # -10 if chosen server cpu > 85%
```
Clipped to [-15, 1].

### DQN Architecture
```
Input(11) → FC(64) → ReLU → FC(64) → ReLU → FC(32) → ReLU → Output(3)
```
~20K parameters. Trains entirely on CPU in milliseconds per step.

---

## Monitoring

### Grafana Dashboards
Auto-provisioned at startup. Login: `admin` / `admin`.

### Key Prometheus Metrics
| Metric | Description |
|---|---|
| `lb_requests_total{server_id, algorithm}` | Requests per server per algorithm |
| `lb_request_latency_ms` | Latency histogram |
| `lb_active_connections` | Live connection gauge |
| `backend_cpu_utilization` | Per-server CPU % |
| `rl_epsilon` | Exploration rate |
| `rl_avg_reward` | Moving average reward |

---

## Stopping
```bash
docker compose down          # stop containers
docker compose down -v       # stop + remove volumes
```
