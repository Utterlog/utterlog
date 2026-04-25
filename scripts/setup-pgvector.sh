#!/usr/bin/env bash
# ============================================================
# setup-pgvector.sh — ensure pgvector is available in an existing
#                     PostgreSQL, then create the utterlog DB+role.
# ------------------------------------------------------------
# Called by install.sh when the user picks "use existing postgres".
# The script is also safe to re-run by hand if 1Panel or another
# manager rebuilds the postgres container and the runtime-installed
# pgvector binary disappears.
#
# Usage:
#   bash scripts/setup-pgvector.sh \
#       --host 127.0.0.1 --port 5432 \
#       --superuser postgres --superpass <pw> \
#       --db utterlog --user utterlog --pass <pw> \
#       [--container 1Panel-postgresql-z8nZ] [--flavor alpine|debian]
#
# Strategy:
#   1. Connect as superuser.
#   2. Check pg_available_extensions for 'vector'.
#      ↳ if listed: just CREATE EXTENSION and we're done.
#      ↳ if missing: try to install the binary
#         - via `docker exec apk add pgvector` (Alpine container)
#         - via `docker exec apt install postgresql-XX-pgvector` (Debian)
#         - bail out with a clear message if neither path applies.
#   3. CREATE DATABASE / CREATE ROLE / GRANT, idempotent.
#   4. CREATE EXTENSION vector inside the new DB.
#
# Exit codes:
#   0  success
#   2  cannot connect (wrong host/port/credentials)
#   3  pgvector binary not available and auto-install failed
#   4  CREATE EXTENSION failed (binary present but rejected)
# ============================================================
set -euo pipefail

PG_HOST="127.0.0.1"
PG_PORT="5432"
PG_SUPER="postgres"
PG_SUPERPASS=""
DB_NAME="utterlog"
DB_USER="utterlog"
DB_PASS=""
CONTAINER=""
FLAVOR="other"

while [ $# -gt 0 ]; do
  case "$1" in
    --host)       PG_HOST="$2"; shift 2 ;;
    --port)       PG_PORT="$2"; shift 2 ;;
    --superuser)  PG_SUPER="$2"; shift 2 ;;
    --superpass)  PG_SUPERPASS="$2"; shift 2 ;;
    --db)         DB_NAME="$2"; shift 2 ;;
    --user)       DB_USER="$2"; shift 2 ;;
    --pass)       DB_PASS="$2"; shift 2 ;;
    --container)  CONTAINER="$2"; shift 2 ;;
    --flavor)     FLAVOR="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

# Color helpers (no-op outside a tty)
if [ -t 1 ]; then
  C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'; C_RED=$'\e[31m'
  C_BOLD=$'\e[1m'; C_DIM=$'\e[2m'; C_RESET=$'\e[0m'
else
  C_GREEN=; C_YELLOW=; C_RED=; C_BOLD=; C_DIM=; C_RESET=
fi
ok()   { printf "%s✓%s %s\n" "$C_GREEN$C_BOLD" "$C_RESET" "$*"; }
warn() { printf "%s!%s %s\n" "$C_YELLOW$C_BOLD" "$C_RESET" "$*"; }
err()  { printf "%s✗%s %s\n" "$C_RED$C_BOLD" "$C_RESET" "$*" >&2; }

# Tiny psql wrapper — picks docker exec when we have a container so
# the user doesn't need a host-side psql client. Falls back to the
# host's psql if installed, else bails with a clear hint.
psql_exec() {
  local sql="$1" db="${2:-postgres}"
  if [ -n "$CONTAINER" ]; then
    docker exec -e PGPASSWORD="$PG_SUPERPASS" "$CONTAINER" \
      psql -h 127.0.0.1 -p 5432 -U "$PG_SUPER" -d "$db" -tAc "$sql"
  elif command -v psql >/dev/null 2>&1; then
    PGPASSWORD="$PG_SUPERPASS" psql -h "$PG_HOST" -p "$PG_PORT" \
      -U "$PG_SUPER" -d "$db" -tAc "$sql"
  else
    err "未指定 --container，宿主机也没有 psql 命令 —— 请安装 postgresql-client 或传入 --container"
    exit 2
  fi
}

# ============================================================
# Step 1: connectivity check
# ============================================================
if ! psql_exec 'SELECT 1' postgres >/dev/null 2>&1; then
  err "无法连接 PostgreSQL ($PG_HOST:$PG_PORT，用户 $PG_SUPER)"
  err "  - 密码是否正确？"
  err "  - 该用户是否有超级用户权限？(CREATE EXTENSION 需要)"
  exit 2
fi
ok "已连接 PostgreSQL ($PG_HOST:$PG_PORT)"

# ============================================================
# Step 2: check + install pgvector binary
# ============================================================
HAS_VECTOR=$(psql_exec "SELECT 1 FROM pg_available_extensions WHERE name='vector'" postgres || true)

if [ "$HAS_VECTOR" != "1" ]; then
  warn "PostgreSQL 中没有 pgvector 扩展 —— 尝试自动安装"

  if [ -z "$CONTAINER" ]; then
    err "未提供 --container，无法自动安装。手动安装步骤："
    err "  Debian/Ubuntu 宿主机： sudo apt install postgresql-\$(pg_config --version | grep -oE '[0-9]+' | head -1)-pgvector"
    err "  装完后重新运行本脚本"
    exit 3
  fi

  case "$FLAVOR" in
    alpine)
      # Alpine community repo names the package `postgresql-pgvector`,
      # NOT `pgvector` — searching `apk search pgvector` on a 3.23+
      # postgres image returns:
      #   postgresql-pgvector-0.8.1-r0
      #   postgresql-pgvector-bitcode-0.8.1-r0
      #   postgresql-pgvector-dev-0.8.1-r0
      # We only need the runtime package. Bitcode is for JIT-compiled
      # queries (rarely needed for blog-scale workloads) and -dev is
      # headers for compiling other extensions against pgvector.
      printf "  在容器 %s 内执行 'apk add postgresql-pgvector' ... " "$CONTAINER"
      if docker exec "$CONTAINER" sh -c 'apk update >/dev/null 2>&1 && apk add --no-cache postgresql-pgvector' >/dev/null 2>&1; then
        ok "已安装"
      else
        err "apk add postgresql-pgvector 失败"
        err "  当前 Alpine 仓库可能没有这个包。备选方案："
        err "    1. 把 postgres 镜像换成 pgvector/pgvector:pg\$(主版本号) —— 数据目录兼容，只多了 vector 扩展"
        err "    2. 改用独立容器模式（重新运行 install.sh 选择第 1 项）"
        exit 3
      fi
      ;;
    debian)
      # Need the major version to pick the right apt package.
      PG_MAJOR=$(psql_exec "SHOW server_version_num" postgres | awk '{ printf "%d", $1/10000 }')
      printf "  在容器 %s 内执行 'apt install postgresql-%s-pgvector' ... " "$CONTAINER" "$PG_MAJOR"
      if docker exec "$CONTAINER" bash -c "apt-get update >/dev/null && apt-get install -y postgresql-${PG_MAJOR}-pgvector >/dev/null"; then
        ok "已安装"
      else
        err "apt install postgresql-${PG_MAJOR}-pgvector 失败"
        err "  默认 Debian 仓库对老版本 PG 可能没有这个包。备选方案："
        err "    1. 把 postgres 镜像换成 pgvector/pgvector:pg${PG_MAJOR} —— 完全兼容直接替换"
        err "    2. 改用独立容器模式（重新运行 install.sh 选择第 1 项）"
        exit 3
      fi
      ;;
    *)
      err "未知的 PostgreSQL 镜像类型 —— 无法自动安装 pgvector"
      err "  请进入 postgres 容器/宿主机手动安装对应的包"
      err "  或者把镜像换成 pgvector/pgvector:pg\$(主版本号) 后重新运行本脚本"
      exit 3
      ;;
  esac

  # Re-check — the package install may need a server reload to be picked up,
  # but pg_available_extensions reads from the filesystem so it should be
  # immediate. If not, surface a clear error.
  HAS_VECTOR=$(psql_exec "SELECT 1 FROM pg_available_extensions WHERE name='vector'" postgres || true)
  if [ "$HAS_VECTOR" != "1" ]; then
    err "安装完仍未检测到 pgvector，请尝试重启 postgres 容器后再运行"
    exit 3
  fi
else
  ok "pgvector 扩展已就绪"
fi

# ============================================================
# Step 3: create role + database (idempotent)
# ============================================================
HAS_ROLE=$(psql_exec "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" postgres || true)
if [ "$HAS_ROLE" = "1" ]; then
  ok "用户 '$DB_USER' 已存在 —— 更新密码"
  # Single-quote-escape the password for safe SQL embedding.
  esc=$(printf '%s' "$DB_PASS" | sed "s/'/''/g")
  psql_exec "ALTER ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${esc}'" postgres >/dev/null
else
  esc=$(printf '%s' "$DB_PASS" | sed "s/'/''/g")
  psql_exec "CREATE ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${esc}'" postgres >/dev/null
  ok "已创建用户 '$DB_USER'"
fi

HAS_DB=$(psql_exec "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" postgres || true)
if [ "$HAS_DB" = "1" ]; then
  ok "数据库 '$DB_NAME' 已存在"
else
  psql_exec "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\"" postgres >/dev/null
  ok "已创建数据库 '$DB_NAME' (Owner: $DB_USER)"
fi

# ============================================================
# Step 4: enable extension inside the utterlog DB
# ============================================================
if ! psql_exec "CREATE EXTENSION IF NOT EXISTS vector" "$DB_NAME" >/dev/null; then
  err "在数据库 $DB_NAME 中执行 CREATE EXTENSION vector 失败 —— 详见上方错误"
  exit 4
fi
ok "数据库 '$DB_NAME' 已启用 vector 扩展"

cat <<EOF

${C_GREEN}${C_BOLD}pgvector 配置完成${C_RESET}
${C_DIM}请在 utterlog 的 .env 中使用以下连接配置：${C_RESET}

  DB_HOST=$PG_HOST
  DB_PORT=$PG_PORT
  DB_NAME=$DB_NAME
  DB_USER=$DB_USER
  DB_PASSWORD=<刚才提供的密码>

EOF
