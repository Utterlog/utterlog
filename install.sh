#!/usr/bin/env bash
# ============================================================
# Utterlog — one-line installer (with smart service detection)
# ------------------------------------------------------------
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | bash
#
# Or with TLS mode (bundled Caddy auto-acquires Let's Encrypt cert):
#   curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | \
#     DOMAIN=blog.example.com bash
#
# What it does:
#   1. Verifies Docker + Compose plugin
#   2. Clones the repo into ./utterlog
#   3. Detects existing PostgreSQL + Redis on this host
#      (e.g. 1Panel's managed services, or any host-bound 5432/6379)
#   4. Asks the user to pick a deploy mode:
#        a) Bundled (default)   — own postgres + redis containers, isolated
#        b) Reuse host services — saves ~70MB, auto-installs pgvector
#   5. Writes the choice into .env and runs scripts/deploy.sh
#
# Non-interactive override (skip the wizard):
#   UTTERLOG_DB_MODE=bundled  curl ... | bash         # force bundled
#   UTTERLOG_DB_MODE=external curl ... | bash         # force external (env vars must be set)
# ============================================================
set -euo pipefail

REPO_URL="${UTTERLOG_REPO:-https://github.com/utterlog/utterlog.git}"
INSTALL_DIR="${UTTERLOG_DIR:-$(pwd)/utterlog}"

# Color helpers
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

${C_BOLD}  Utterlog — one-line installer${C_RESET}
  ${C_BOLD}═══════════════════════════════════════${C_RESET}

BANNER

# ============================================================
# Step 1: check for Docker
# ============================================================
if ! command -v docker >/dev/null 2>&1; then
  err "Docker is not installed."
  echo
  echo "  Install Docker first:"
  echo "    curl -fsSL https://get.docker.com | sh"
  echo "    sudo usermod -aG docker \$USER   # log out and back in"
  echo
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  err "Docker Compose plugin is not installed."
  echo
  echo "  Install with:"
  echo "    sudo apt install -y docker-compose-plugin   # Debian/Ubuntu"
  echo "    sudo yum install -y docker-compose-plugin   # RHEL/CentOS"
  echo
  exit 1
fi
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# ============================================================
# Step 2: check for git (or fall back to tarball)
# ============================================================
USE_GIT=1
if ! command -v git >/dev/null 2>&1; then
  warn "git not found — will download tarball instead (no auto-update via 'make update')"
  USE_GIT=0
fi

# ============================================================
# Step 3: clone or download
# ============================================================
if [ -d "$INSTALL_DIR" ]; then
  warn "$INSTALL_DIR already exists"
  if [ -d "$INSTALL_DIR/.git" ] && [ "$USE_GIT" -eq 1 ]; then
    log "Pulling latest code ..."
    (cd "$INSTALL_DIR" && git pull --ff-only)
  else
    log "Using existing directory (no update)"
  fi
else
  if [ "$USE_GIT" -eq 1 ]; then
    log "Cloning Utterlog into $INSTALL_DIR ..."
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  else
    log "Downloading tarball into $INSTALL_DIR ..."
    mkdir -p "$INSTALL_DIR"
    curl -fsSL "https://github.com/utterlog/utterlog/archive/refs/heads/main.tar.gz" \
      | tar -xz --strip-components=1 -C "$INSTALL_DIR"
  fi
fi
ok "Code ready at $INSTALL_DIR"

cd "$INSTALL_DIR"

# ============================================================
# Step 4: detect existing host services and pick deploy mode
# ------------------------------------------------------------
# We only run the wizard when:
#   - stdin is a tty (interactive shell), AND
#   - UTTERLOG_DB_MODE is not preset, AND
#   - .env doesn't already have a UTTERLOG_DB_MODE recorded
# Otherwise we silently fall through to bundled (the previous default).
# ============================================================
DB_MODE="${UTTERLOG_DB_MODE:-}"
REDIS_MODE="${UTTERLOG_REDIS_MODE:-}"

if [ -z "$DB_MODE" ] && [ -f .env ] && grep -q '^UTTERLOG_DB_MODE=' .env; then
  DB_MODE=$(grep '^UTTERLOG_DB_MODE=' .env | tail -1 | cut -d= -f2-)
fi
if [ -z "$REDIS_MODE" ] && [ -f .env ] && grep -q '^UTTERLOG_REDIS_MODE=' .env; then
  REDIS_MODE=$(grep '^UTTERLOG_REDIS_MODE=' .env | tail -1 | cut -d= -f2-)
fi

if [ -z "$DB_MODE" ] && [ -t 0 ]; then
  log "Scanning for existing PostgreSQL + Redis on this host ..."
  eval "$(bash scripts/detect-services.sh)"

  echo
  if [ "$PG_DETECTED" = 1 ]; then
    if [ -n "$PG_CONTAINER" ]; then
      ok "PostgreSQL detected: $PG_CONTAINER ($PG_IMAGE) on 127.0.0.1:$PG_PORT"
    else
      ok "PostgreSQL detected on 127.0.0.1:$PG_PORT (no docker container — system-installed?)"
    fi
  else
    printf "  ${C_DIM}—${C_RESET} no PostgreSQL on 127.0.0.1:$PG_PORT\n"
  fi

  if [ "$REDIS_DETECTED" = 1 ]; then
    if [ -n "$REDIS_CONTAINER" ]; then
      ok "Redis detected: $REDIS_CONTAINER ($REDIS_IMAGE) on 127.0.0.1:$REDIS_PORT"
    else
      ok "Redis detected on 127.0.0.1:$REDIS_PORT"
    fi
  else
    printf "  ${C_DIM}—${C_RESET} no Redis on 127.0.0.1:$REDIS_PORT\n"
  fi

  echo
  if [ "$PG_DETECTED" = 1 ] || [ "$REDIS_DETECTED" = 1 ]; then
    cat <<MENU
${C_BOLD}Choose a deployment mode:${C_RESET}

  ${C_BOLD}1)${C_RESET} ${C_GREEN}Bundled${C_RESET} (recommended) — Utterlog brings its own postgres + redis
       containers. Fully isolated from other apps on this host. ~150MB
       memory footprint.

  ${C_BOLD}2)${C_RESET} ${C_YELLOW}Reuse host services${C_RESET} — connect to the postgres + redis above
       (saves ~70MB). Auto-installs pgvector if the host postgres
       doesn't have it yet. You'll be asked for the postgres
       superuser password so we can CREATE EXTENSION + a dedicated
       \`utterlog\` database with a random password.

MENU
    printf "  Choice [1]: "
    read -r CHOICE
    CHOICE="${CHOICE:-1}"
    if [ "$CHOICE" = "2" ]; then
      DB_MODE="external"
      REDIS_MODE="external"
    else
      DB_MODE="bundled"
      REDIS_MODE="bundled"
    fi
  else
    log "No host services found — using bundled containers (the only option)"
    DB_MODE="bundled"
    REDIS_MODE="bundled"
  fi
fi

# Default if still unset (non-interactive curl|bash with no override)
DB_MODE="${DB_MODE:-bundled}"
REDIS_MODE="${REDIS_MODE:-bundled}"

# ============================================================
# Step 4b: external mode — provision pgvector + utterlog DB
# ============================================================
if [ "$DB_MODE" = "external" ]; then
  if [ -z "${PG_CONTAINER:-}" ] && [ -z "${PG_DETECTED:-}" ]; then
    # When DB_MODE was set via env var, we haven't run detection yet.
    eval "$(bash scripts/detect-services.sh)"
  fi

  if [ "${PG_DETECTED:-0}" != "1" ]; then
    err "UTTERLOG_DB_MODE=external requires a reachable postgres on 127.0.0.1:5432"
    err "Start one first, or run with UTTERLOG_DB_MODE=bundled."
    exit 1
  fi

  echo
  log "Provisioning utterlog database in the existing postgres ..."

  # Random per-install creds for the dedicated `utterlog` role —
  # keeps utterlog's data isolated from anything else sharing this
  # postgres instance.
  rand_pw() {
    if command -v openssl >/dev/null 2>&1; then
      openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 20
    else
      LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20
    fi
  }
  UTTERLOG_DB_PASSWORD=$(rand_pw)

  printf "  Postgres superuser [postgres]: "
  read -r PG_SUPER
  PG_SUPER="${PG_SUPER:-postgres}"
  printf "  Postgres superuser password (input hidden): "
  stty -echo
  read -r PG_SUPERPASS
  stty echo
  echo

  EXTRA_ARGS=()
  [ -n "${PG_CONTAINER:-}" ] && EXTRA_ARGS+=(--container "$PG_CONTAINER")
  [ -n "${PG_FLAVOR:-}" ]   && EXTRA_ARGS+=(--flavor "$PG_FLAVOR")

  if ! bash scripts/setup-pgvector.sh \
        --host "$PG_HOST" --port "$PG_PORT" \
        --superuser "$PG_SUPER" --superpass "$PG_SUPERPASS" \
        --db utterlog --user utterlog --pass "$UTTERLOG_DB_PASSWORD" \
        ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}; then
    err "pgvector setup failed — falling back is up to you."
    err "Re-run with UTTERLOG_DB_MODE=bundled to use the isolated containers instead."
    exit 1
  fi
fi

# ============================================================
# Step 5: write/refresh the chosen mode + external creds into .env
# ------------------------------------------------------------
# deploy.sh reads UTTERLOG_DB_MODE / UTTERLOG_REDIS_MODE to decide
# whether to add the docker-compose.external-db.yml overlay.
# ============================================================
upsert_env() {
  local key="$1" val="$2"
  if [ -f .env ] && grep -q "^${key}=" .env; then
    # macOS sed needs '' after -i; GNU sed doesn't take an argument.
    # The .bak workaround is portable.
    sed -i.bak "s|^${key}=.*|${key}=${val}|" .env && rm -f .env.bak
  else
    echo "${key}=${val}" >> .env
  fi
}

# Touch .env if missing so upsert_env has something to operate on.
# deploy.sh will fill in the rest (DB_PASSWORD, JWT_SECRET) for the
# bundled mode. For external mode we need to write the real DB_HOST/
# DB_USER/DB_PASSWORD ourselves before deploy.sh runs.
[ -f .env ] || cp .env.example .env

upsert_env "UTTERLOG_DB_MODE"    "$DB_MODE"
upsert_env "UTTERLOG_REDIS_MODE" "$REDIS_MODE"

if [ "$DB_MODE" = "external" ]; then
  upsert_env "DB_HOST"     "host.docker.internal"
  upsert_env "DB_PORT"     "$PG_PORT"
  upsert_env "DB_USER"     "utterlog"
  upsert_env "DB_NAME"     "utterlog"
  upsert_env "DB_PASSWORD" "$UTTERLOG_DB_PASSWORD"
fi
if [ "$REDIS_MODE" = "external" ]; then
  upsert_env "REDIS_HOST" "host.docker.internal"
  upsert_env "REDIS_PORT" "${REDIS_PORT:-6379}"
fi

ok "Mode: db=$DB_MODE, redis=$REDIS_MODE"

# ============================================================
# Step 6: run the deploy script
# ============================================================
DEPLOY_ARGS=()
if [ -n "${DOMAIN:-}" ]; then
  DEPLOY_ARGS+=(--tls)
  log "DOMAIN=$DOMAIN detected → enabling TLS mode (bundled Caddy)"
fi

log "Running scripts/deploy.sh ..."
echo
# ${ARR[@]+"${ARR[@]}"} expands safely under set -u even when empty.
bash scripts/deploy.sh ${DEPLOY_ARGS[@]+"${DEPLOY_ARGS[@]}"}
