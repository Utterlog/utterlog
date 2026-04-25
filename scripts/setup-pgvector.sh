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
    err "Neither --container nor host-side psql available — install postgresql-client or pass --container"
    exit 2
  fi
}

# ============================================================
# Step 1: connectivity check
# ============================================================
if ! psql_exec 'SELECT 1' postgres >/dev/null 2>&1; then
  err "Can't connect to PostgreSQL at $PG_HOST:$PG_PORT as $PG_SUPER"
  err "  - Is the password correct?"
  err "  - Does the user have superuser privileges? (needed for CREATE EXTENSION)"
  exit 2
fi
ok "Connected to PostgreSQL at $PG_HOST:$PG_PORT"

# ============================================================
# Step 2: check + install pgvector binary
# ============================================================
HAS_VECTOR=$(psql_exec "SELECT 1 FROM pg_available_extensions WHERE name='vector'" postgres || true)

if [ "$HAS_VECTOR" != "1" ]; then
  warn "pgvector binary not present in this PostgreSQL — attempting auto-install"

  if [ -z "$CONTAINER" ]; then
    err "No --container given; cannot auto-install. To install manually:"
    err "  Debian/Ubuntu host: sudo apt install postgresql-\$(pg_config --version | grep -oE '[0-9]+' | head -1)-pgvector"
    err "  Then re-run this script."
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
      printf "  installing via 'apk add postgresql-pgvector' inside %s ... " "$CONTAINER"
      if docker exec "$CONTAINER" sh -c 'apk update >/dev/null 2>&1 && apk add --no-cache postgresql-pgvector' >/dev/null 2>&1; then
        ok "installed"
      else
        err "apk add postgresql-pgvector failed."
        err "  pgvector may not be in this Alpine version's repos. Options:"
        err "    1. Switch the postgres image to pgvector/pgvector:pg\$(major) — same data dir, just adds the extension binary."
        err "    2. Run utterlog with bundled postgres (re-run install.sh and pick option 1)."
        exit 3
      fi
      ;;
    debian)
      # Need the major version to pick the right apt package.
      PG_MAJOR=$(psql_exec "SHOW server_version_num" postgres | awk '{ printf "%d", $1/10000 }')
      printf "  installing via 'apt install postgresql-%s-pgvector' inside %s ... " "$PG_MAJOR" "$CONTAINER"
      if docker exec "$CONTAINER" bash -c "apt-get update >/dev/null && apt-get install -y postgresql-${PG_MAJOR}-pgvector >/dev/null"; then
        ok "installed"
      else
        err "apt install postgresql-${PG_MAJOR}-pgvector failed."
        err "  This package isn't in the default Debian repos for older PG versions."
        err "  Options:"
        err "    1. Switch the postgres image to pgvector/pgvector:pg${PG_MAJOR} — drop-in replacement."
        err "    2. Run utterlog with bundled postgres (re-run install.sh and pick option 1)."
        exit 3
      fi
      ;;
    *)
      err "Unknown postgres flavor — can't auto-install pgvector."
      err "  To install manually, exec into the postgres container/host and run the right package install."
      err "  Or switch the image to pgvector/pgvector:pg\$major and re-run this script."
      exit 3
      ;;
  esac

  # Re-check — the package install may need a server reload to be picked up,
  # but pg_available_extensions reads from the filesystem so it should be
  # immediate. If not, surface a clear error.
  HAS_VECTOR=$(psql_exec "SELECT 1 FROM pg_available_extensions WHERE name='vector'" postgres || true)
  if [ "$HAS_VECTOR" != "1" ]; then
    err "pgvector still not detected after install. Try restarting the postgres container."
    exit 3
  fi
else
  ok "pgvector binary already available"
fi

# ============================================================
# Step 3: create role + database (idempotent)
# ============================================================
HAS_ROLE=$(psql_exec "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" postgres || true)
if [ "$HAS_ROLE" = "1" ]; then
  ok "Role '$DB_USER' already exists — updating password"
  # Single-quote-escape the password for safe SQL embedding.
  esc=$(printf '%s' "$DB_PASS" | sed "s/'/''/g")
  psql_exec "ALTER ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${esc}'" postgres >/dev/null
else
  esc=$(printf '%s' "$DB_PASS" | sed "s/'/''/g")
  psql_exec "CREATE ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${esc}'" postgres >/dev/null
  ok "Role '$DB_USER' created"
fi

HAS_DB=$(psql_exec "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" postgres || true)
if [ "$HAS_DB" = "1" ]; then
  ok "Database '$DB_NAME' already exists"
else
  psql_exec "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\"" postgres >/dev/null
  ok "Database '$DB_NAME' created (owner: $DB_USER)"
fi

# ============================================================
# Step 4: enable extension inside the utterlog DB
# ============================================================
if ! psql_exec "CREATE EXTENSION IF NOT EXISTS vector" "$DB_NAME" >/dev/null; then
  err "CREATE EXTENSION vector failed in $DB_NAME — see error above"
  exit 4
fi
ok "Extension 'vector' active in database '$DB_NAME'"

cat <<EOF

${C_GREEN}${C_BOLD}pgvector setup complete.${C_RESET}
${C_DIM}Use these connection settings in utterlog's .env:${C_RESET}

  DB_HOST=$PG_HOST
  DB_PORT=$PG_PORT
  DB_NAME=$DB_NAME
  DB_USER=$DB_USER
  DB_PASSWORD=<the password you provided>

EOF
