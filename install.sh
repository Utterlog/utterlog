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

${C_BOLD}  Utterlog — 一键安装脚本${C_RESET}
  ${C_BOLD}═══════════════════════════════════════${C_RESET}

BANNER

# ============================================================
# Step 1: check for Docker
# ============================================================
if ! command -v docker >/dev/null 2>&1; then
  err "未检测到 Docker"
  echo
  echo "  请先安装 Docker："
  echo "    curl -fsSL https://get.docker.com | sh"
  echo "    sudo usermod -aG docker \$USER   # 装完需要重新登录一次"
  echo
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  err "未检测到 Docker Compose 插件"
  echo
  echo "  安装命令："
  echo "    sudo apt install -y docker-compose-plugin   # Debian / Ubuntu"
  echo "    sudo yum install -y docker-compose-plugin   # RHEL / CentOS"
  echo
  exit 1
fi
ok "Docker 版本：$(docker --version | awk '{print $3}' | tr -d ',')"

# ============================================================
# Step 2: check for git (or fall back to tarball)
# ============================================================
USE_GIT=1
if ! command -v git >/dev/null 2>&1; then
  warn "未检测到 git —— 将通过 tarball 下载源码（不影响安装，但 'make update' 自动升级会失效）"
  USE_GIT=0
fi

# ============================================================
# Step 3: clone or download
# ============================================================
if [ -d "$INSTALL_DIR" ]; then
  warn "目录 $INSTALL_DIR 已存在"
  if [ -d "$INSTALL_DIR/.git" ] && [ "$USE_GIT" -eq 1 ]; then
    log "拉取最新代码 ..."
    (cd "$INSTALL_DIR" && git pull --ff-only)
  else
    log "保留现有目录（不更新代码）"
  fi
else
  if [ "$USE_GIT" -eq 1 ]; then
    log "克隆 Utterlog 到 $INSTALL_DIR ..."
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  else
    log "下载源码 tarball 到 $INSTALL_DIR ..."
    mkdir -p "$INSTALL_DIR"
    curl -fsSL "https://github.com/utterlog/utterlog/archive/refs/heads/main.tar.gz" \
      | tar -xz --strip-components=1 -C "$INSTALL_DIR"
  fi
fi
ok "代码就绪：$INSTALL_DIR"

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
  log "扫描本机已有的 PostgreSQL / Redis 服务 ..."
  eval "$(bash scripts/detect-services.sh)"

  echo
  if [ "$PG_DETECTED" = 1 ]; then
    if [ -n "$PG_CONTAINER" ]; then
      ok "检测到 PostgreSQL：$PG_CONTAINER ($PG_IMAGE)，监听 127.0.0.1:$PG_PORT"
    else
      ok "检测到 PostgreSQL 在 127.0.0.1:$PG_PORT（非 Docker 容器，应该是宿主机原生安装）"
    fi
  else
    printf "  ${C_DIM}—${C_RESET} 127.0.0.1:$PG_PORT 没有 PostgreSQL\n"
  fi

  if [ "$REDIS_DETECTED" = 1 ]; then
    if [ -n "$REDIS_CONTAINER" ]; then
      ok "检测到 Redis：$REDIS_CONTAINER ($REDIS_IMAGE)，监听 127.0.0.1:$REDIS_PORT"
    else
      ok "检测到 Redis 在 127.0.0.1:$REDIS_PORT"
    fi
  else
    printf "  ${C_DIM}—${C_RESET} 127.0.0.1:$REDIS_PORT 没有 Redis\n"
  fi

  echo
  if [ "$PG_DETECTED" = 1 ] || [ "$REDIS_DETECTED" = 1 ]; then
    cat <<MENU
${C_BOLD}请选择部署模式：${C_RESET}

  ${C_BOLD}1)${C_RESET} ${C_GREEN}独立容器（默认推荐）${C_RESET} — Utterlog 自带 postgres + redis，
       完全隔离不影响其他应用，约占 ~150MB 内存。

  ${C_BOLD}2)${C_RESET} ${C_BLUE}仅复用宿主 Redis${C_RESET} — postgres 仍用独立容器（保护数据 +
       pgvector 扩展），但 Redis 直连宿主已有的（省 ~10MB，避免
       多个 redis 进程互相竞争内存）。如果宿主 Redis 有密码会
       提示你输入。${C_BOLD}最适合 1Panel / 宝塔用户。${C_RESET}

  ${C_BOLD}3)${C_RESET} ${C_YELLOW}两者都复用宿主${C_RESET} — postgres + redis 都连宿主（省 ~70MB）。
       会自动给宿主 postgres 装 pgvector 扩展，建立 utterlog 专用
       数据库。需要 postgres 超级用户密码。

MENU
    printf "  请选择 [1]: "
    read -r CHOICE
    CHOICE="${CHOICE:-1}"
    case "$CHOICE" in
      2)
        DB_MODE="bundled"
        REDIS_MODE="external"
        ;;
      3)
        DB_MODE="external"
        REDIS_MODE="external"
        ;;
      *)
        DB_MODE="bundled"
        REDIS_MODE="bundled"
        ;;
    esac
  else
    log "本机没有现成的 postgres / redis —— 使用独立容器模式（唯一可选）"
    DB_MODE="bundled"
    REDIS_MODE="bundled"
  fi
fi

# ============================================================
# Step 4a: external Redis — discover its password if any
# ------------------------------------------------------------
# When the user picks mode 2 or 3 we need REDIS_PASSWORD in the .env.
# Try a no-auth ping first; if AUTH is required, prompt.
# ============================================================
DETECTED_REDIS_PASSWORD=""
if [ "$REDIS_MODE" = "external" ] && [ -t 0 ]; then
  if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli -h 127.0.0.1 -p "${REDIS_PORT:-6379}" ping >/dev/null 2>&1; then
      ok "宿主 Redis 无密码"
    else
      printf "  宿主 Redis 密码（输入不显示，无密码直接回车）: "
      stty -echo
      read -r DETECTED_REDIS_PASSWORD
      stty echo
      echo
      if [ -n "$DETECTED_REDIS_PASSWORD" ]; then
        if redis-cli -h 127.0.0.1 -p "${REDIS_PORT:-6379}" -a "$DETECTED_REDIS_PASSWORD" --no-auth-warning ping >/dev/null 2>&1; then
          ok "Redis 密码验证通过"
        else
          warn "密码验证未通过，先继续 —— 启动后 utterlog 连不上 Redis 时再回来改 .env 里的 REDIS_PASSWORD"
        fi
      fi
    fi
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
    err "UTTERLOG_DB_MODE=external 需要 127.0.0.1:5432 上有可访问的 PostgreSQL"
    err "请先启动 postgres，或者改用 UTTERLOG_DB_MODE=bundled。"
    exit 1
  fi

  echo
  log "在已有 PostgreSQL 中为 utterlog 准备数据库 ..."

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

  printf "  PostgreSQL 超级用户名 [postgres]: "
  read -r PG_SUPER
  PG_SUPER="${PG_SUPER:-postgres}"
  printf "  PostgreSQL 超级用户密码（输入不显示）: "
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
    err "pgvector 配置失败"
    err "可以重新运行并选择 UTTERLOG_DB_MODE=bundled 改用独立容器模式"
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
  upsert_env "REDIS_HOST"     "host.docker.internal"
  upsert_env "REDIS_PORT"     "${REDIS_PORT:-6379}"
  upsert_env "REDIS_PASSWORD" "$DETECTED_REDIS_PASSWORD"
fi

ok "已选模式：数据库=$DB_MODE，Redis=$REDIS_MODE"

# ============================================================
# Step 6: run the deploy script
# ============================================================
DEPLOY_ARGS=()
if [ -n "${DOMAIN:-}" ]; then
  DEPLOY_ARGS+=(--tls)
  log "检测到 DOMAIN=$DOMAIN → 启用 TLS 模式（自动配置 Caddy + Let's Encrypt）"
fi

log "调用 scripts/deploy.sh ..."
echo
# ${ARR[@]+"${ARR[@]}"} expands safely under set -u even when empty.
bash scripts/deploy.sh ${DEPLOY_ARGS[@]+"${DEPLOY_ARGS[@]}"}
