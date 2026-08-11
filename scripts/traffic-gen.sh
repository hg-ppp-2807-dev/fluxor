#!/bin/sh
# ──────────────────────────────────────────────────────────────────
#  Fluxor Traffic Generator
#  Sends continuous requests to the load balancer so the dashboard
#  has live data to display. Runs as a Docker sidecar.
#  Uses wget (built into Alpine) instead of curl.
# ──────────────────────────────────────────────────────────────────

LB_URL="${LB_URL:-http://load-balancer:8080}"
RPS="${RPS:-5}"                 # requests per second

# Install curl (lightweight, more informative output)
apk add --no-cache curl > /dev/null 2>&1

DELAY=$(awk "BEGIN {printf \"%.3f\", 1/$RPS}")

echo "[traffic-gen] Targeting $LB_URL at ~${RPS} RPS (delay=${DELAY}s)"
echo "[traffic-gen] Waiting 15s for services to warm up..."
sleep 15

echo "[traffic-gen] Starting traffic..."
while true; do
  curl -s -o /dev/null -w "status=%{http_code} time=%{time_total}s\n" \
       "${LB_URL}/work" 2>/dev/null || \
  wget -q -O /dev/null "${LB_URL}/work" 2>/dev/null
  sleep "$DELAY"
done
