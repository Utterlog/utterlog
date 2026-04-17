#!/usr/bin/env bash
# ============================================================
# Utterlog — one-line installer
# ------------------------------------------------------------
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | bash
#
# Or with TLS mode:
#   curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | \
#     DOMAIN=blog.example.com bash
#
# What it does:
#   1. Checks for Docker (offers to install if missing)
#   2. Clones https://github.com/utterlog/utterlog into ./utterlog
#   3. Runs scripts/deploy.sh (which handles the rest automatically)
#
# No need to install git, make, Node, Go, or anything else first —
# only Docker is required.
# ============================================================

set -euo pipefail

REPO_URL="${UTTERLOG_REPO:-https://github.com/utterlog/utterlog.git}"
INSTALL_DIR="${UTTERLOG_DIR:-$(pwd)/utterlog}"

# Color helpers
if [ -t 1 ]; then
  C_BLUE=$'\e[34m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'
  C_RED=$'\e[31m'; C_BOLD=$'\e[1m'; C_RESET=$'\e[0m'
else
  C_BLUE=; C_GREEN=; C_YELLOW=; C_RED=; C_BOLD=; C_RESET=
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

# ============================================================
# Step 4: run the deploy script
# ============================================================
cd "$INSTALL_DIR"

DEPLOY_ARGS=()
if [ -n "${DOMAIN:-}" ]; then
  DEPLOY_ARGS+=(--tls)
  log "DOMAIN=$DOMAIN detected → enabling TLS mode (bundled Caddy)"
fi

log "Running scripts/deploy.sh ..."
echo
# Note: ${ARR[@]+"${ARR[@]}"} expands safely under `set -u` even when empty.
# Plain "${DEPLOY_ARGS[@]}" would error with "unbound variable" on empty arrays.
bash scripts/deploy.sh ${DEPLOY_ARGS[@]+"${DEPLOY_ARGS[@]}"}
