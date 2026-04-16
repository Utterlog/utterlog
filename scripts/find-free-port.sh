#!/usr/bin/env bash
# ============================================================
# find-free-port.sh — find the first available TCP port
#
# Usage:  find-free-port.sh [START_PORT] [MAX_TRIES]
# Default: START_PORT=9527, MAX_TRIES=50
#
# Writes the chosen port to stdout. Exits non-zero if none free.
# Uses whichever tool is available: ss, netstat, or python3.
# ============================================================
set -euo pipefail

start="${1:-9527}"
max_tries="${2:-50}"
end=$((start + max_tries - 1))

# Try multiple detection methods — any Linux/macOS system has at least one.
is_port_free() {
  local port=$1

  # Method 1: ss (iproute2, modern Linux)
  if command -v ss >/dev/null 2>&1; then
    if ss -tln 2>/dev/null | awk '{print $4}' | grep -qE "[.:]${port}$"; then
      return 1
    fi
    return 0
  fi

  # Method 2: netstat (BSD, older Linux, macOS)
  if command -v netstat >/dev/null 2>&1; then
    if netstat -tln 2>/dev/null | awk '{print $4}' | grep -qE "[.:]${port}$"; then
      return 1
    fi
    return 0
  fi

  # Method 3: python3 bind test (most portable)
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<EOF
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    s.bind(('0.0.0.0', $port))
    s.close()
    sys.exit(0)
except OSError:
    sys.exit(1)
EOF
    return $?
  fi

  # No detection tool found — optimistically assume free
  echo "warning: no port detection tool (ss/netstat/python3) found — assuming port is free" >&2
  return 0
}

for ((p=start; p<=end; p++)); do
  if is_port_free "$p"; then
    echo "$p"
    exit 0
  fi
done

echo "No free port found in range $start-$end" >&2
exit 1
