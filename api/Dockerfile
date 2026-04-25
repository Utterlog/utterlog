# ============================================================
# Utterlog API — development Dockerfile
# ------------------------------------------------------------
# Bind-mount mode: docker-compose mounts ./api into /app, so we
# compile at startup via `go run .`. The //go:embed all:admin/dist
# directive requires admin/dist/ to exist on disk at compile time.
# This image bundles Node so the entrypoint can build admin/dist
# inside the container on first start (no host-side npm run needed).
# ============================================================
FROM golang:1.26-alpine

RUN apk add --no-cache \
    git \
    gcc \
    musl-dev \
    libwebp-dev \
    aom-dev \
    nodejs \
    npm \
    bash \
    docker-cli \
    docker-cli-compose

WORKDIR /app

# Pre-download Go modules so iterative `go run` starts quick
COPY go.mod go.sum ./
RUN go mod download

EXPOSE 8080

# Entrypoint: ensure admin/dist exists, then run the API.
# `go run` picks up source changes on restart (dev workflow).
COPY <<'SH' /usr/local/bin/entrypoint.sh
#!/usr/bin/env bash
set -e

cd /app

if [ ! -d admin/dist ] || [ -z "$(ls -A admin/dist 2>/dev/null)" ]; then
  echo "==> admin/dist is empty — building admin SPA ..."
  cd admin
  if [ ! -d node_modules ]; then
    npm ci --no-audit --no-fund
  fi
  npm run build
  cd ..
  echo "==> admin/dist built."
fi

exec go run .
SH
RUN chmod +x /usr/local/bin/entrypoint.sh

CMD ["/usr/local/bin/entrypoint.sh"]
