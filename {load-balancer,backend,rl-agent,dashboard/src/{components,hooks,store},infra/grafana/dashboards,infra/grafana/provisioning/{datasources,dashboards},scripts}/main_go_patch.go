// ──────────────────────────────────────────────────────────────────────────────
// PATCH FOR load-balancer/main.go
// Add / replace the WebSocket broadcast logic so the dashboard gets properly
// shaped events. The three message types the new dashboard expects are:
//
//   { "type": "request",  "server": 1, "latency": 45, "algorithm": "rr" }
//   { "type": "metrics",  "servers": [ {id,cpu,conns,latency,alive}, … ] }
//   { "type": "rl_stats", "epsilon": 0.12, "avg_reward": -0.33 }
//   { "type": "algo",     "algorithm": "rr" }   ← emitted on POST /admin/algorithm
//
// ──────────────────────────────────────────────────────────────────────────────

// 1.  WS message structs  ─────────────────────────────────────────────────────
//     Put these near the top of main.go alongside your other types.

/*
type WSRequestMsg struct {
    Type      string  `json:"type"`       // "request"
    Server    int     `json:"server"`     // 1-indexed backend id
    Latency   float64 `json:"latency"`    // ms
    Algorithm string  `json:"algorithm"`  // "rr" | "lc" | "rl"
}

type WSServerState struct {
    ID      int     `json:"id"`
    CPU     float64 `json:"cpu"`
    Conns   int     `json:"conns"`
    Latency float64 `json:"latency"`
    Alive   bool    `json:"alive"`
}

type WSMetricsMsg struct {
    Type    string          `json:"type"`    // "metrics"
    Servers []WSServerState `json:"servers"`
}

type WSAlgoMsg struct {
    Type      string `json:"type"`      // "algo"
    Algorithm string `json:"algorithm"`
}
*/

// 2.  Broadcast after each proxied request  ───────────────────────────────────
//     Inside your reverse-proxy handler, after you get the response back,
//     call broadcastRequest(serverID, latencyMs, currentAlgo).

/*
func broadcastRequest(serverID int, latencyMs float64, algo string) {
    msg, _ := json.Marshal(WSRequestMsg{
        Type:      "request",
        Server:    serverID,
        Latency:   latencyMs,
        Algorithm: algo,
    })
    hub.broadcast(msg)
}
*/

// 3.  Metrics ticker  ─────────────────────────────────────────────────────────
//     Add a goroutine that pushes server state every 1 s.

/*
func startMetricsTicker(backends []*Backend) {
    go func() {
        for range time.Tick(1 * time.Second) {
            var states []WSServerState
            for _, b := range backends {
                b.mu.Lock()
                states = append(states, WSServerState{
                    ID:      b.ID,
                    CPU:     b.CPU,       // float64 0-100
                    Conns:   b.ActiveConns,
                    Latency: b.AvgLatency,
                    Alive:   b.Alive,
                })
                b.mu.Unlock()
            }
            msg, _ := json.Marshal(WSMetricsMsg{Type: "metrics", Servers: states})
            hub.broadcast(msg)
        }
    }()
}
*/

// 4.  Broadcast algo change  ──────────────────────────────────────────────────
//     Inside POST /admin/algorithm handler, after updating the algorithm:

/*
func broadcastAlgo(algo string) {
    msg, _ := json.Marshal(WSAlgoMsg{Type: "algo", Algorithm: algo})
    hub.broadcast(msg)
}
*/

// 5.  Hub helper (if not already present)  ────────────────────────────────────
//     A simple broadcast hub — skip if you already have one.

/*
type Hub struct {
    mu      sync.RWMutex
    clients map[*websocket.Conn]struct{}
}

var hub = &Hub{clients: make(map[*websocket.Conn]struct{})}

func (h *Hub) register(c *websocket.Conn) {
    h.mu.Lock(); defer h.mu.Unlock()
    h.clients[c] = struct{}{}
}

func (h *Hub) unregister(c *websocket.Conn) {
    h.mu.Lock(); defer h.mu.Unlock()
    delete(h.clients, c)
}

func (h *Hub) broadcast(msg []byte) {
    h.mu.RLock(); defer h.mu.RUnlock()
    for c := range h.clients {
        _ = c.WriteMessage(websocket.TextMessage, msg)
    }
}

// WebSocket endpoint handler
func wsHandler(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil { return }
    hub.register(conn)
    defer func() {
        hub.unregister(conn)
        conn.Close()
    }()
    for {
        if _, _, err := conn.ReadMessage(); err != nil { break }
    }
}
*/