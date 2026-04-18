#!/usr/bin/env bash
# ============================================================
# Utterlog — one-liner installer (pull-only, no source checkout)
#
# Usage:
#   curl -fsSL https://utterlog.io/install.sh | bash
#
# What it does:
#   1. Verify Docker + compose plugin
#   2. Create ./utterlog/ and download 2 files:
#      - docker-compose.yml  (pull-only, direct from registry)
#      - .env.example
#   3. Generate .env with random DB_PASSWORD (16 chars) + JWT_SECRET (48)
#   4. docker compose pull   ← pulls prebuilt images from
#                              registry.utterlog.io (CF-accelerated)
#   5. docker compose up -d  ← starts services
#
# No git clone. No source download. No local compilation.
# Happy-path finishes in ~30 seconds on a fresh server.
#
# Env overrides:
#   UTTERLOG_DIR=/opt/utterlog             # install path
#   UTTERLOG_IMAGE_PREFIX=ghcr.io/utterlog # switch to GHCR registry
#   UTTERLOG_IMAGE_TAG=sha-xxxxxxx         # pin to a specific build
#   UTTERLOG_PORT=9260                     # bind port (127.0.0.1 only)
# ============================================================
set -euo pipefail

INSTALL_DIR="${UTTERLOG_DIR:-$(pwd)/utterlog}"
BASE_URL="${UTTERLOG_BASE_URL:-https://utterlog.io}"

# -------- Color helpers --------
if [ -t 1 ]; then
  C_BLUE=$'\e[34m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'
  C_RED=$'\e[31m'; C_BOLD=$'\e[1m'; C_DIM=$'\e[2m'; C_RESET=$'\e[0m'
else
  C_BLUE=; C_GREEN=; C_YELLOW=; C_RED=; C_BOLD=; C_DIM=; C_RESET=
fi
log()  { printf "%s==>%s %s\n" "$C_BLUE$C_BOLD" "$C_RESET" "$*"; }
ok()   { printf "%s✓%s %s\n" "$C_GREEN$C_BOLD" "$C_RESET" "$*"; }
warn() { printf "%s!%s %s\n" "$C_YELLOW$C_BOLD" "$C_RESET" "$*"; }
err()  { printf "%s✗%s %s\n" "$C_RED$C_BOLD" "$C_RESET" "$*" >&2; }

cat <<BANNER

${C_BOLD}  Utterlog — one-liner installer${C_RESET}
  ${C_BOLD}═══════════════════════════════════════${C_RESET}
  ${C_DIM}Docs:     https://docs.utterlog.io${C_RESET}
  ${C_DIM}Registry: ${UTTERLOG_IMAGE_PREFIX:-registry.utterlog.io/utterlog}${C_RESET}

BANNER

# -------- 1. Docker sanity --------
if ! command -v docker >/dev/null 2>&1; then
  err "Docker is not installed."
  echo "  Install first:  curl -fsSL https://get.docker.com | sh"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  err "docker compose plugin is not installed."
  echo "  Debian/Ubuntu:  sudo apt install -y docker-compose-plugin"
  echo "  RHEL/CentOS:    sudo yum install -y docker-compose-plugin"
  exit 1
fi
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# -------- 2. Prepare install dir --------
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
log "Install dir: $(pwd)"

# -------- 3. Fetch compose + env template --------
log "Downloading docker-compose.yml and .env.example from $BASE_URL ..."
curl -fsSL "$BASE_URL/docker-compose.yml" -o docker-compose.yml
curl -fsSL "$BASE_URL/.env.example" -o .env.example
ok "Compose files ready ($(wc -c < docker-compose.yml) bytes)"

# -------- 4. Generate .env with random secrets --------
rand_str() {
  local len="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$len"
  else
    LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$len"
  fi
  echo
}

if [ ! -f .env ]; then
  DB_PASS=$(rand_str 16)
  JWT=$(rand_str 48)
  cp .env.example .env
  # Replace empty DB_PASSWORD= / JWT_SECRET= with generated values
  sed -i.bak "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASS|" .env
  sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" .env
  # Write install dir so the one-click-update feature (admin UI) can
  # find the compose file after the api container restarts itself.
  grep -q '^UTTERLOG_INSTALL_DIR=' .env \
    || echo "UTTERLOG_INSTALL_DIR=$INSTALL_DIR" >> .env
  # Apply registry override if user set one.
  if [ -n "${UTTERLOG_IMAGE_PREFIX:-}" ]; then
    grep -q '^UTTERLOG_IMAGE_PREFIX=' .env \
      && sed -i.bak "s|^UTTERLOG_IMAGE_PREFIX=.*|UTTERLOG_IMAGE_PREFIX=$UTTERLOG_IMAGE_PREFIX|" .env \
      || echo "UTTERLOG_IMAGE_PREFIX=$UTTERLOG_IMAGE_PREFIX" >> .env
  fi
  rm -f .env.bak
  ok ".env created with random credentials"
else
  warn ".env already exists — keeping your configured values"
fi

# -------- 5. Pull prebuilt images --------
log "Pulling Utterlog images (postgres/redis/api/web)..."
if ! docker compose pull 2>&1; then
  err "Failed to pull images. Check your internet connection or set UTTERLOG_IMAGE_PREFIX=ghcr.io/utterlog to try the GitHub mirror."
  exit 1
fi
ok "Images pulled"

# -------- 6. Start --------
log "Starting services..."
docker compose up -d

# Wait for api to come up
log "Waiting for API to become healthy..."
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${UTTERLOG_PORT:-9260}/api/v1/install/status" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

PORT="${UTTERLOG_PORT:-9260}"
cat <<DONE

  ${C_GREEN}${C_BOLD}✓ Utterlog is running${C_RESET}

  Local:     ${C_BOLD}http://127.0.0.1:$PORT${C_RESET}
  Next step: open ${C_BOLD}http://127.0.0.1:$PORT/install${C_RESET} in your browser
             to create the admin account.

  ${C_DIM}- Install dir:  $INSTALL_DIR${C_RESET}
  ${C_DIM}- Credentials:  $INSTALL_DIR/.env  (keep this file safe)${C_RESET}
  ${C_DIM}- Logs:         docker compose -f $INSTALL_DIR/docker-compose.yml logs -f${C_RESET}
  ${C_DIM}- Upgrade:      admin → 版本 → 一键升级${C_RESET}
  ${C_DIM}                or: curl -fsSL https://utterlog.io/update.sh | bash${C_RESET}

  Point your nginx / caddy reverse proxy at 127.0.0.1:$PORT to expose
  Utterlog on a public domain. See docs.utterlog.io/install for examples.

DONE
