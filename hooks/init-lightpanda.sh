#!/usr/bin/env bash
# Hook: SessionStart — auto-start Lightpanda if not already running
set -euo pipefail

HOST="${LIGHTPANDA_HOST:-127.0.0.1}"
PORT="${LIGHTPANDA_PORT:-9222}"
BINARY="${LIGHTPANDA_BINARY:-}"

# Check if CDP is already listening
if curl -sf "http://${HOST}:${PORT}/json/version" > /dev/null 2>&1; then
  echo "[pandabridge] Lightpanda already running at ${HOST}:${PORT}" >&2
  exit 0
fi

# If no binary configured, nothing to do
if [ -z "$BINARY" ]; then
  echo "[pandabridge] LIGHTPANDA_BINARY not set, skipping auto-start" >&2
  exit 0
fi

# Start Lightpanda in background
echo "[pandabridge] Starting Lightpanda: ${BINARY} serve --host ${HOST} --port ${PORT}" >&2
"$BINARY" serve --host "$HOST" --port "$PORT" &
LP_PID=$!
mkdir -p "$HOME/.pandabridge"
echo "$LP_PID" > "$HOME/.pandabridge/lightpanda.pid"
echo "[pandabridge] Lightpanda started (PID $LP_PID)" >&2

# Wait for CDP to become available
for i in $(seq 1 20); do
  if curl -sf "http://${HOST}:${PORT}/json/version" > /dev/null 2>&1; then
    echo "[pandabridge] Lightpanda ready" >&2
    exit 0
  fi
  sleep 0.5
done

echo "[pandabridge] Warning: Lightpanda did not become ready in 10s" >&2
exit 0
