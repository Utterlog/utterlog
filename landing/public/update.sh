#!/usr/bin/env bash
# ============================================================
# Utterlog — in-place upgrade (served from utterlog.io)
#
# Usage:
#   cd /path/to/utterlog && curl -fsSL https://utterlog.io/update.sh | bash
# ============================================================
set -euo pipefail

# Color helpers
if [ -t 1 ]; then
  C_BLUE=$'\e[34m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'
  C_RED=$'\e[31m'; C_BOLD=$'\e[1m'; C_RESET=$'\e[0m'
else
  C_BLUE=; C_GREEN=; C_YELLOW=; C_RED=; C_BOLD=; C_RESET=
fi
log()  { printf "%s==>%s %s\n" "$C_BLUE$C_BOLD" "$C_RESET" "$*"; }
ok()   { printf "%s✓%s %s\n" "$C_GREEN$C_BOLD" "$C_RESET" "$*"; }
err()  { printf "%s✗%s %s\n" "$C_RED$C_BOLD" "$C_RESET" "$*" >&2; }

# Locate the Utterlog install directory
if [ ! -f docker-compose.yml ] && [ ! -f docker-compose.pull.yml ]; then
  if [ -d "$HOME/utterlog" ]; then cd "$HOME/utterlog";
  elif [ -d /opt/utterlog ]; then cd /opt/utterlog;
  else err "Run this from your Utterlog install directory (e.g. cd ~/utterlog && ...)"; exit 1; fi
fi
ok "Utterlog dir: $(pwd)"

COMPOSE_FILE="docker-compose.pull.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
  COMPOSE_FILE="docker-compose.yml"
fi
log "Using $COMPOSE_FILE"

# Pull latest images
log "Pulling latest utterlog images..."
docker compose -f "$COMPOSE_FILE" pull

# Rolling restart (compose detects changed images automatically)
log "Recreating containers with new images..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

# Wait for API to come back healthy
log "Waiting for API to become healthy..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${UTTERLOG_PORT:-9260}/api/v1/install/status" >/dev/null 2>&1; then
    ok "API is up (${i}s)"
    break
  fi
  sleep 1
done

ok "Upgrade complete. Visit your Utterlog dashboard to verify."
