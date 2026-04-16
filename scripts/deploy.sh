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
INTERACTIVE=0
TLS_MODE=0
NO_BUILD=0
PULL_MODE=-1   # -1 = auto-detect, 0 = force build, 1 = force pull
# Parse flags
for arg in "$@"; do
  case "$arg" in
    --interactive|-i) INTERACTIVE=1 ;;
    --tls)            TLS_MODE=1 ;;
    --no-build)       NO_BUILD=1 ;;
    --pull)           PULL_MODE=1 ;;
    --build)          PULL_MODE=0 ;;
  esac
done

# Auto-detect deployment strategy based on available RAM.
# Building images locally needs ~2GB RAM (Node + Go + Next.js build).
# Below that, pulling pre-built images from GHCR is faster and safer.
if [ "$PULL_MODE" -eq -1 ]; then
  if [ -r /proc/meminfo ]; then
    total_kb=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)
    total_mb=$((total_kb / 1024))
    if [ "$total_mb" -lt 1800 ]; then
      PULL_MODE=1
      log "Detected ${total_mb}MB RAM → using pre-built images from ghcr.io (safer on small VPS)"
    else
      PULL_MODE=0
      log "Detected ${total_mb}MB RAM → building images locally (faster iteration on code changes)"
    fi
  elif [ "$(uname)" = "Darwin" ]; then
    # macOS dev machine — always plenty of RAM
    PULL_MODE=0
  else
    # Unknown platform — play safe, pull
    PULL_MODE=1
  fi
fi

if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    err ".env.example not found — is this an Utterlog checkout?"
    exit 1
  fi

  if [ "$INTERACTIVE" -eq 1 ] && [ -t 0 ]; then
    # --- Interactive mode: prompt user ---
    log "Interactive setup. Press Enter to auto-generate, or type your own value."
    echo
    suggested_db=$(rand_str 24)
    suggested_jwt=$(rand_str 48)
    printf "  DB_PASSWORD (24-char random by default): "
    read -r USER_DB_PASSWORD
    [ -z "$USER_DB_PASSWORD" ] && USER_DB_PASSWORD="$suggested_db"
    printf "  JWT_SECRET  (48-char random by default): "
    read -r USER_JWT_SECRET
    [ -z "$USER_JWT_SECRET" ] && USER_JWT_SECRET="$suggested_jwt"
    cp .env.example .env
    sed -i.bak "s|^DB_PASSWORD=.*|DB_PASSWORD=$USER_DB_PASSWORD|" .env
    sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$USER_JWT_SECRET|" .env
    rm -f .env.bak
    DB_PASSWORD_GEN="$USER_DB_PASSWORD"
    JWT_SECRET_GEN="$USER_JWT_SECRET"
    GENERATED=1
    ok ".env created"
  else
    # --- Auto mode: generate randoms ---
    log "Generating .env with cryptographically random secrets (/dev/urandom)..."
    log "  — each deploy produces unique values; no shared defaults."
    log "  — run 'make deploy-interactive' if you prefer to supply your own."
    DB_PASSWORD_GEN=$(rand_str 24)
    JWT_SECRET_GEN=$(rand_str 48)
    cp .env.example .env
    if command -v sed >/dev/null 2>&1; then
      sed -i.bak "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD_GEN|" .env
      sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET_GEN|" .env
      rm -f .env.bak
    fi
    GENERATED=1
    ok ".env created with auto-generated credentials"
  fi
else
  ok ".env exists — using your configured values (not regenerating)"
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
# Step 3b: TLS mode — prompt for / validate domain
# ============================================================
if [ "$TLS_MODE" -eq 1 ]; then
  if [ -z "${DOMAIN:-}" ]; then
    if [ -t 0 ]; then
      echo
      log "TLS mode enabled. Caddy will auto-acquire a Let's Encrypt certificate."
      printf "  Enter your domain (e.g. blog.example.com): "
      read -r DOMAIN
    fi
    if [ -z "${DOMAIN:-}" ]; then
      err "DOMAIN is required in TLS mode. Re-run:"
      err "  DOMAIN=blog.example.com make deploy-tls"
      exit 1
    fi
  fi
  # Persist DOMAIN to .env for later `make` commands
  if grep -q "^DOMAIN=" .env 2>/dev/null; then
    sed -i.bak "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" .env && rm -f .env.bak
  else
    echo "DOMAIN=$DOMAIN" >> .env
  fi
  export DOMAIN
  # Also set APP_URL to the public https URL so Go serves correct absolute links
  if grep -q "^APP_URL=" .env; then
    sed -i.bak "s|^APP_URL=.*|APP_URL=https://$DOMAIN|" .env && rm -f .env.bak
  fi
  export COMPOSE_PROFILES=tls
  ok "TLS mode: $DOMAIN"
fi

# ============================================================
# Step 4: build & start containers
# ============================================================
if [ "$PULL_MODE" -eq 1 ]; then
  # Pull pre-built images from GHCR — skips all local compilation
  COMPOSE="docker compose -f docker-compose.prod.yml -f docker-compose.pull.yml"
  log "Pulling pre-built images from ghcr.io/utterlog ..."
  $COMPOSE pull
  log "Starting containers ..."
  $COMPOSE up -d
elif [ "$NO_BUILD" -eq 1 ]; then
  COMPOSE="docker compose -f docker-compose.prod.yml"
  log "Starting containers (no rebuild) ..."
  $COMPOSE up -d
else
  COMPOSE="docker compose -f docker-compose.prod.yml"
  log "Building & starting containers locally (first run ~3-5 min, needs 2GB+ RAM) ..."
  log "  Tip: use 'make deploy-pull' instead to skip local build (pulls from ghcr.io)"
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
if [ "$TLS_MODE" -eq 1 ]; then
  cat <<EOF

${C_GREEN}${C_BOLD}============================================================${C_RESET}
${C_GREEN}${C_BOLD}  Utterlog is live at https://$DOMAIN ${C_RESET}
${C_GREEN}${C_BOLD}============================================================${C_RESET}

  ${C_BOLD}Caddy is obtaining Let's Encrypt cert in the background.${C_RESET}
  First visit may take 5-30 seconds while the cert is issued.

  ${C_BOLD}Check cert status:${C_RESET}
    $COMPOSE logs caddy | grep -i "certificate obtained\|error"

  ${C_BOLD}Next:${C_RESET}
    Open https://$DOMAIN  →  /install wizard creates the admin user

EOF
else
  cat <<EOF

${C_GREEN}${C_BOLD}============================================================${C_RESET}
${C_GREEN}${C_BOLD}  Utterlog is ready!${C_RESET}
${C_GREEN}${C_BOLD}============================================================${C_RESET}

  ${C_BOLD}Access URL:${C_RESET}
    http://127.0.0.1:$UTTERLOG_PORT  (loopback only, not public)

  ${C_BOLD}Point your reverse proxy at 127.0.0.1:$UTTERLOG_PORT${C_RESET}

  ${C_BOLD}Quick setup by tool:${C_RESET}
    • 1Panel / 宝塔 / AAPanel → see deploy/1panel.md
    • nginx (your own)        → see deploy/nginx.conf.example
    • Caddy (your own)        → see deploy/Caddyfile.example
    • No reverse proxy yet?   → re-run: DOMAIN=your.site make deploy-tls
                                 (bundled Caddy takes 80/443)

  ${C_BOLD}SSH tunnel to test locally (before domain setup):${C_RESET}
    ssh -L 9527:127.0.0.1:$UTTERLOG_PORT your-vps
    # then open http://localhost:9527 in your local browser

EOF
fi

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
