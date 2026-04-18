#!/usr/bin/env bash
# ============================================================
# Utterlog — in-place upgrade (pull-only)
#
# Usage:
#   cd /path/to/utterlog && curl -fsSL https://utterlog.io/update.sh | bash
# or run from anywhere, it auto-detects $HOME/utterlog and /opt/utterlog.
#
# What it does:
#   1. Fetch the latest docker-compose.yml from utterlog.io
#      (installs new services / changes flow through automatically)
#   2. docker compose pull   ← new images from registry.utterlog.io
#   3. docker compose up -d  ← recreate containers with new images
#
# DATA IS PRESERVED:
#   ./pgdata/      PostgreSQL data  — untouched
#   ./redisdata/   Redis data       — untouched
#   ./uploads/     Uploaded files   — untouched (incl. custom themes)
#   ./.env         Configuration    — untouched
# Only the IMAGES (Go binary, web bundle, system themes) are updated.
# ============================================================
set -euo pipefail

BASE_URL="${UTTERLOG_BASE_URL:-https://utterlog.io}"

if [ -t 1 ]; then
  C_BLUE=$'\e[34m'; C_GREEN=$'\e[32m'; C_RED=$'\e[31m'; C_BOLD=$'\e[1m'; C_DIM=$'\e[2m'; C_RESET=$'\e[0m'
else
  C_BLUE=; C_GREEN=; C_RED=; C_BOLD=; C_DIM=; C_RESET=
fi
log()  { printf "%s==>%s %s\n" "$C_BLUE$C_BOLD" "$C_RESET" "$*"; }
ok()   { printf "%s✓%s %s\n" "$C_GREEN$C_BOLD" "$C_RESET" "$*"; }
err()  { printf "%s✗%s %s\n" "$C_RED$C_BOLD" "$C_RESET" "$*" >&2; }

# Locate install dir
if [ ! -f docker-compose.yml ]; then
  for cand in "${UTTERLOG_DIR:-}" "$HOME/utterlog" /opt/utterlog; do
    [ -z "$cand" ] && continue
    if [ -f "$cand/docker-compose.yml" ]; then
      cd "$cand"; break
    fi
  done
fi
if [ ! -f docker-compose.yml ]; then
  err "Can't find docker-compose.yml. Run this from your Utterlog install dir, or set UTTERLOG_DIR=..."
  exit 1
fi
ok "Utterlog dir: $(pwd)"

# Back up the old compose so a botched update can be rolled back manually.
cp docker-compose.yml docker-compose.yml.bak 2>/dev/null || true

log "Fetching latest docker-compose.yml..."
if ! curl -fsSL "$BASE_URL/docker-compose.yml" -o docker-compose.yml.new; then
  err "Failed to download latest compose. Keeping current version."
  exit 1
fi
mv docker-compose.yml.new docker-compose.yml
ok "Compose updated"

log "Pulling latest images..."
docker compose pull

log "Recreating containers..."
docker compose up -d --remove-orphans

# Wait for health
log "Waiting for API..."
PORT="${UTTERLOG_PORT:-9260}"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/api/v1/install/status" >/dev/null 2>&1; then
    ok "API is up (${i}s)"
    break
  fi
  sleep 1
done

cat <<DONE

  ${C_GREEN}${C_BOLD}✓ Upgrade complete${C_RESET}

  ${C_DIM}Rollback:  mv docker-compose.yml.bak docker-compose.yml${C_RESET}
  ${C_DIM}           docker compose up -d${C_RESET}

DONE
