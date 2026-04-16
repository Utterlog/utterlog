#!/usr/bin/env bash
# ============================================================
# deploy.sh — one-command production deployment for Utterlog
#
# Does:
#   1. Auto-generate .env with random DB_PASSWORD / JWT_SECRET (if missing)
#   2. Scan for a free TCP port starting from UTTERLOG_PORT
#   3. docker compose up -d --build
#   4. Poll /api/v1/install/status until healthy
#   5. Print access URL + all credentials + nginx / caddy snippet
#
# Usage:
#   bash scripts/deploy.sh             # full deploy
#   bash scripts/deploy.sh --no-build  # skip rebuild
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)

# Color helpers (no-op if not a tty)
if [ -t 1 ]; then
  C_BLUE=$'\e[34m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'
  C_RED=$'\e[31m'; C_DIM=$'\e[2m'; C_BOLD=$'\e[1m'; C_RESET=$'\e[0m'
else
  C_BLUE=; C_GREEN=; C_YELLOW=; C_RED=; C_DIM=; C_BOLD=; C_RESET=
fi

log()  { printf "%s==>%s %s\n" "$C_BLUE$C_BOLD" "$C_RESET" "$*"; }
ok()   { printf "%s✓%s %s\n" "$C_GREEN$C_BOLD" "$C_RESET" "$*"; }
warn() { printf "%s!%s %s\n" "$C_YELLOW$C_BOLD" "$C_RESET" "$*"; }
err()  { printf "%s✗%s %s\n" "$C_RED$C_BOLD" "$C_RESET" "$*" >&2; }

# ============================================================
# Step 1: ensure docker is installed
# ============================================================
if ! command -v docker >/dev/null 2>&1; then
  err "docker not found. Install Docker first: https://docs.docker.com/engine/install/"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  err "docker compose plugin not found. Install with: sudo apt install docker-compose-plugin"
  exit 1
fi

# ============================================================
# Step 2: auto-generate .env if missing (with random secrets)
# ============================================================
rand_str() {
  local len="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$len"
  else
    LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$len"
  fi
  echo
}

GENERATED=0
if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    err ".env.example not found — is this an Utterlog checkout?"
    exit 1
  fi
  log "Generating .env from .env.example with random secrets ..."
  DB_PASSWORD_GEN=$(rand_str 24)
  JWT_SECRET_GEN=$(rand_str 48)
  cp .env.example .env
  # Replace placeholder values with generated ones
  if command -v sed >/dev/null 2>&1; then
    # BSD/GNU sed compatibility via .bak trick
    sed -i.bak "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD_GEN|" .env
    sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET_GEN|" .env
    rm -f .env.bak
  fi
  GENERATED=1
  ok ".env created with auto-generated credentials"
fi

# Source .env
set -a
. ./.env
set +a

# ============================================================
# Step 3: find a free port (starting from UTTERLOG_PORT)
# ============================================================
START_PORT="${UTTERLOG_PORT:-9527}"
log "Checking port $START_PORT availability ..."

if ! NEW_PORT=$(bash scripts/find-free-port.sh "$START_PORT" 50); then
  err "No free port found in range $START_PORT-$((START_PORT+49))"
  exit 1
fi

if [ "$NEW_PORT" != "$START_PORT" ]; then
  warn "Port $START_PORT is busy — using $NEW_PORT instead"
  if grep -q "^UTTERLOG_PORT=" .env; then
    sed -i.bak "s|^UTTERLOG_PORT=.*|UTTERLOG_PORT=$NEW_PORT|" .env
  else
    echo "UTTERLOG_PORT=$NEW_PORT" >> .env
  fi
  rm -f .env.bak
  UTTERLOG_PORT="$NEW_PORT"
else
  ok "Port $START_PORT is available"
fi

# ============================================================
# Step 4: build & start containers
# ============================================================
COMPOSE="docker compose -f docker-compose.prod.yml"

if [ "${1:-}" = "--no-build" ]; then
  log "Starting containers (no rebuild) ..."
  $COMPOSE up -d
else
  log "Building & starting containers (first run ~3-5 min) ..."
  $COMPOSE up -d --build
fi

# ============================================================
# Step 5: wait for api to respond
# ============================================================
log "Waiting for API to be healthy (up to 180s) ..."
HEALTHY=0
for i in $(seq 1 36); do
  if curl -fsS "http://127.0.0.1:$UTTERLOG_PORT/api/v1/install/status" >/dev/null 2>&1; then
    HEALTHY=1
    ok "API responding after ${i}×5s"
    break
  fi
  printf "   %s... still starting (%ds)%s\r" "$C_DIM" "$((i*5))" "$C_RESET"
  sleep 5
done
echo

if [ "$HEALTHY" -eq 0 ]; then
  err "API did not respond within 180s. Showing last 40 lines of api logs:"
  $COMPOSE logs api --tail=40
  exit 1
fi

# ============================================================
# Step 6: print access details
# ============================================================
cat <<EOF

${C_GREEN}${C_BOLD}============================================================${C_RESET}
${C_GREEN}${C_BOLD}  Utterlog is ready!${C_RESET}
${C_GREEN}${C_BOLD}============================================================${C_RESET}

  ${C_BOLD}Access URL:${C_RESET}
    http://127.0.0.1:$UTTERLOG_PORT

  ${C_BOLD}Next step:${C_RESET}
    1. Point your nginx / caddy at 127.0.0.1:$UTTERLOG_PORT
       (see deploy/nginx.conf.example or deploy/Caddyfile.example)
    2. Or SSH tunnel for local check:
         ssh -L 9527:127.0.0.1:$UTTERLOG_PORT your-vps
       then open http://localhost:9527
    3. Browser → /install wizard creates the admin user

EOF

if [ "$GENERATED" -eq 1 ]; then
  cat <<EOF
  ${C_YELLOW}${C_BOLD}⚠  Save these credentials (auto-generated, only shown once):${C_RESET}

    DB_PASSWORD = $DB_PASSWORD
    JWT_SECRET  = $JWT_SECRET

  Both are stored in .env — back up that file somewhere safe.

EOF
fi

cat <<EOF
  ${C_BOLD}Useful commands:${C_RESET}
    $COMPOSE logs -f              # tail all logs
    $COMPOSE logs -f api          # only api logs
    $COMPOSE ps                   # container status
    $COMPOSE down                 # stop
    make deploy                   # redeploy (same as bash scripts/deploy.sh)

  ${C_BOLD}Reverse proxy snippets:${C_RESET} see deploy/ directory

${C_DIM}============================================================${C_RESET}

EOF
