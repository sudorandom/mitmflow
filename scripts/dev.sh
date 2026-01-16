#!/usr/bin/env bash
set -euo pipefail

# Clean up child processes on exit or interrupt
pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" || true
    fi
  done
  # Wait for all children to exit
  wait || true
}
trap cleanup INT TERM EXIT

# Start frontend
just frontend-dev &
pids+=($!)

# Start backend (use fauxrpc if USE_FAUXRPC=1, else real backend)
if [ "${USE_FAUXRPC:-0}" = "1" ]; then
  just fauxrpc &
  pids+=($!)
else
  just backend-dev &
  pids+=($!)
fi

# Monitor children; exit when any child exits, then cleanup will run via trap
while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      exit 0
    fi
  done
  sleep 1
done
