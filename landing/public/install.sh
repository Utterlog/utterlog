#!/usr/bin/env bash
# ============================================================
# Utterlog — one-line installer (served from utterlog.io)
#
# Usage:
#   curl -fsSL https://utterlog.io/install.sh | bash
#
# Optional env vars:
#   DOMAIN=blog.example.com   # enables bundled Caddy TLS mode
#   REGISTRY=ghcr.io/utterlog # use GitHub Container Registry instead
#   UTTERLOG_DIR=~/utterlog   # install path (default: ./utterlog)
# ============================================================
set -euo pipefail

REPO_URL="${UTTERLOG_REPO:-https://github.com/utterlog/utterlog.git}"
INSTALL_DIR="${UTTERLOG_DIR:-$(pwd)/utterlog}"
REGISTRY="${REGISTRY:-registry.utterlog.io}"

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
  Docs:     https://utterlog.io
  GitHub:   https://github.com/utterlog/utterlog
  Registry: ${REGISTRY}

BANNER

# --- Step 1: Docker ---
if ! command -v docker >/dev/null 2>&1; then
  err "Docker is not installed."
  echo "  Install Docker first:"
  echo "    curl -fsSL https://get.docker.com | sh"
  echo "    sudo usermod -aG docker \$USER   # log out and back in"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  err "docker compose plugin is not installed."
  echo "    Debian/Ubuntu: sudo apt install -y docker-compose-plugin"
  echo "    RHEL/CentOS:   sudo yum install -y docker-compose-plugin"
  exit 1
fi
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# --- Step 2: git (optional) ---
USE_GIT=1
if ! command -v git >/dev/null 2>&1; then
  warn "git not found — will download tarball instead"
  USE_GIT=0
fi

# --- Step 3: clone or download ---
if [ -d "$INSTALL_DIR" ]; then
  warn "$INSTALL_DIR already exists"
  if [ -d "$INSTALL_DIR/.git" ] && [ "$USE_GIT" -eq 1 ]; then
    # An existing checkout may point at a fork / old remote. Reset the
    # origin to the canonical repo before pulling so we don't prompt for
    # credentials against a private remote.
    current_remote=$(cd "$INSTALL_DIR" && git config --get remote.origin.url 2>/dev/null || echo "")
    if [ -n "$current_remote" ] && [ "$current_remote" != "$REPO_URL" ]; then
      warn "Existing remote ($current_remote) differs from canonical $REPO_URL — resetting."
      (cd "$INSTALL_DIR" && git remote set-url origin "$REPO_URL")
    fi
    log "Pulling latest code..."
    if ! (cd "$INSTALL_DIR" && git pull --ff-only 2>&1); then
      err "git pull failed. Check network or remove $INSTALL_DIR and re-run."
      exit 1
    fi
  else
    log "Using existing directory (no update)"
  fi
else
  if [ "$USE_GIT" -eq 1 ]; then
    log "Cloning Utterlog into $INSTALL_DIR..."
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  else
    log "Downloading tarball into $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR"
    curl -fsSL "https://github.com/utterlog/utterlog/archive/refs/heads/main.tar.gz" \
      | tar -xz --strip-components=1 -C "$INSTALL_DIR"
  fi
fi
ok "Code ready at $INSTALL_DIR"

# --- Step 4: run deploy ---
cd "$INSTALL_DIR"

DEPLOY_ARGS=()
if [ -n "${DOMAIN:-}" ]; then
  DEPLOY_ARGS+=(--tls)
  log "DOMAIN=$DOMAIN detected → enabling TLS mode"
fi
# Let deploy.sh know which registry to pull from
export REGISTRY

log "Running scripts/deploy.sh..."
echo
bash scripts/deploy.sh ${DEPLOY_ARGS[@]+"${DEPLOY_ARGS[@]}"}
