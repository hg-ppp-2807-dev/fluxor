# Diagnostic Results Report

Generated at: 2026-08-11 12:50 IST

---

## 1. Container Status (`docker compose ps`)

**Status:** All 9 containers are running and healthy.

```text
NAME            IMAGE                    COMMAND                  SERVICE         CREATED        STATUS                    PORTS
backend-1       project-backend-1        "docker-entrypoint.s…"   backend-1       4 months ago   Up 25 minutes (healthy)   0.0.0.0:8081->8081/tcp, [::]:8081->8081/tcp
backend-2       project-backend-2        "docker-entrypoint.s…"   backend-2       4 months ago   Up 25 minutes (healthy)   0.0.0.0:8082->8082/tcp, [::]:8082->8082/tcp
backend-3       project-backend-3        "docker-entrypoint.s…"   backend-3       4 months ago   Up 25 minutes (healthy)   0.0.0.0:8083->8083/tcp, [::]:8083->8083/tcp
dashboard       project-dashboard        "docker-entrypoint.s…"   dashboard       15 hours ago   Up 25 minutes             0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
grafana         grafana/grafana:latest   "/run.sh"                grafana         4 months ago   Up 25 minutes             0.0.0.0:3001->3000/tcp, [::]:3001->3000/tcp
load-balancer   project-load-balancer    "./lb"                   load-balancer   15 hours ago   Up 25 minutes             0.0.0.0:8080->8080/tcp, [::]:8080->8080/tcp
prometheus      prom/prometheus:latest   "/bin/prometheus --c…"   prometheus      4 months ago   Up 25 minutes             0.0.0.0:9090->9090/tcp, [::]:9090->9090/tcp
rl-agent        project-rl-agent         "python app.py"          rl-agent        4 months ago   Up 25 minutes (healthy)   0.0.0.0:5005->5000/tcp, [::]:5005->5000/tcp
traffic-gen     alpine:3.19              "/bin/sh /scripts/tr…"   traffic-gen     15 hours ago   Up 25 minutes
```

---

## 2. Load Balancer WebSocket / Admin Status Reachability (`curl http://localhost:8080/admin/status`)

**Status:** Endpoint is reachable and returning `200 OK`.

```http
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Content-Type: application/json
Date: Tue, 11 Aug 2026 07:20:08 GMT
Content-Length: 254

{
  "algorithm": "rr",
  "servers": [
    { "id": 0, "conns": 0, "latency_ms": 38.98, "healthy": true, "cpu": 7 },
    { "id": 1, "conns": 0, "latency_ms": 54.67, "healthy": true, "cpu": 5.6 },
    { "id": 2, "conns": 1, "latency_ms": 69.39, "healthy": true, "cpu": 4 }
  ]
}
```

---

## 3. Dashboard Container Logs (`docker compose logs dashboard`)

**Status:** Dashboard container is accepting connections on `http://localhost:3000`. No runtime/WebSocket errors logged.

```text
dashboard  |  INFO  Accepting connections at http://localhost:3000
dashboard  |  HTTP  8/10/2026 4:20:48 PM 151.101.210.132 GET /
dashboard  |  HTTP  8/10/2026 4:20:48 PM 151.101.210.132 Returned 200 in 13 ms
dashboard  |  HTTP  8/10/2026 4:20:48 PM 151.101.210.132 GET /assets/index-DP_26xoi.js
dashboard  |  HTTP  8/10/2026 4:20:48 PM 151.101.210.132 Returned 200 in 10 ms
dashboard  |  INFO  Gracefully shutting down. Please wait...
dashboard  |  INFO  Accepting connections at http://localhost:3000
dashboard  |  HTTP  8/11/2026 6:18:02 AM 151.101.210.132 GET /
dashboard  |  HTTP  8/11/2026 6:18:02 AM 151.101.210.132 Returned 304 in 18 ms
dashboard  |  HTTP  8/11/2026 6:18:03 AM 151.101.210.132 GET /assets/index-DP_26xoi.js
dashboard  |  HTTP  8/11/2026 6:18:03 AM 151.101.210.132 Returned 304 in 2 ms
```

---

## 4. Load Balancer Logs (`docker compose logs load-balancer`)

**Status:** Load balancer started cleanly on port `:8080` and algorithm switches were logged successfully.

```text
load-balancer  | 2026/08/11 06:18:00 [LB] Load balancer starting on :8080
load-balancer  | 2026/08/11 06:18:11 [LB] Algorithm switched to: rl
load-balancer  | 2026/08/11 06:18:11 [LB] Algorithm switched to: rl
load-balancer  | 2026/08/11 06:54:47 [LB] Load balancer starting on :8080
load-balancer  | 2026/08/11 07:16:19 [LB] Algorithm switched to: lc
load-balancer  | 2026/08/11 07:16:19 [LB] Algorithm switched to: lc
load-balancer  | 2026/08/11 07:16:23 [LB] Algorithm switched to: rr
load-balancer  | 2026/08/11 07:16:23 [LB] Algorithm switched to: rr
```

---

## 5. Manual Traffic Results (`50` requests to `http://localhost:8080/work`)

**Status:** All 50 requests completed successfully (`200 OK`) and were load balanced across backends 1, 2, and 3.

**Sample JSON Responses:**
```json
{"server_id":"3","latency_ms":64,"cpu_load":"6.5","active_conns":1,"timestamp":1786432825254}
{"server_id":"2","latency_ms":53,"cpu_load":"2.6","active_conns":1,"timestamp":1786432825538}
{"server_id":"1","latency_ms":52,"cpu_load":"9.8","active_conns":1,"timestamp":1786432825824}
{"server_id":"3","latency_ms":71,"cpu_load":"6.5","active_conns":1,"timestamp":1786432826125}
{"server_id":"2","latency_ms":39,"cpu_load":"2.6","active_conns":1,"timestamp":1786432826395}
{"server_id":"1","latency_ms":35,"cpu_load":"9.8","active_conns":1,"timestamp":1786432826659}
... (50 requests total, 100% success rate)
```
