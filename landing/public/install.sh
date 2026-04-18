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
# Kill any interactive prompt: we never want to ask the user for git
# credentials — this is a headless installer. If auth is needed, we fail
# and fall through to anonymous tarball download.
export GIT_TERMINAL_PROMPT=0
GIT_NO_CRED=(-c credential.helper= -c core.askPass=true)

# Tarball fallback — always works, no auth, public HTTPS download.
download_tarball() {
  log "Downloading tarball from GitHub..."
  mkdir -p "$INSTALL_DIR"
  if ! curl -fsSL "https://github.com/utterlog/utterlog/archive/refs/heads/main.tar.gz" \
       | tar -xz --strip-components=1 -C "$INSTALL_DIR"; then
    err "Tarball download failed. Check your internet connection."
    exit 1
  fi
}

# Try to update an existing checkout in place. Returns 0 on success.
try_update_inplace() {
  [ ! -d "$INSTALL_DIR/.git" ] && return 1
  [ "$USE_GIT" -eq 1 ] || return 1
  # Force canonical remote — overrides any fork / old URL left behind.
  (cd "$INSTALL_DIR" && git remote set-url origin "$REPO_URL") 2>/dev/null || return 1
  # ff-only + disabled credential helpers. If auth is needed, this fails
  # fast (no stdin prompt) and the caller backs up + re-clones.
  (cd "$INSTALL_DIR" && git "${GIT_NO_CRED[@]}" pull --ff-only 2>&1) || return 1
  return 0
}

if [ -d "$INSTALL_DIR" ]; then
  warn "$INSTALL_DIR already exists"
  if try_update_inplace; then
    ok "Updated existing checkout to latest main"
  else
    BAK="${INSTALL_DIR}.bak-$(date +%s)"
    warn "Couldn't update in place (likely: remote points at a private fork, dirty working tree, or auth-required remote). Moving aside to $BAK and refetching."
    mv "$INSTALL_DIR" "$BAK"
    # Fall through to clone/tarball below.
  fi
fi

if [ ! -d "$INSTALL_DIR" ]; then
  if [ "$USE_GIT" -eq 1 ]; then
    log "Cloning Utterlog into $INSTALL_DIR..."
    if ! git "${GIT_NO_CRED[@]}" clone --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>&1; then
      warn "git clone failed (auth or network) — falling back to tarball."
      rm -rf "$INSTALL_DIR"
      download_tarball
    fi
  else
    download_tarball
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
