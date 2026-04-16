# ============================================================
# Utterlog — top-level deployment convenience commands
# ============================================================

.PHONY: help
help:
	@echo "Utterlog deployment targets:"
	@echo ""
	@echo "  make deploy              — build locally + deploy (needs 2GB+ RAM during build)"
	@echo "  make deploy-pull         — pull pre-built images from ghcr.io (for low-RAM VPS, ~5x faster)"
	@echo "  make deploy-tls          — build + deploy + bundled Caddy auto-TLS (needs DOMAIN=your.site)"
	@echo "  make deploy-pull-tls     — pull + deploy + TLS"
	@echo "  make deploy-interactive  — prompt for DB_PASSWORD / JWT_SECRET (press Enter to auto-gen)"
	@echo "  make deploy-fast         — redeploy without rebuilding images"
	@echo "  make update              — pull latest ghcr.io images and restart"
	@echo "  make logs            — tail all container logs"
	@echo "  make logs-api        — tail api logs only"
	@echo "  make logs-web        — tail web logs only"
	@echo "  make ps              — list container status"
	@echo "  make stop            — stop all containers"
	@echo "  make down            — stop + remove containers (keeps data volumes)"
	@echo "  make clean           — down + remove volumes (WIPES DATABASE)"
	@echo ""
	@echo "  make dev             — start in development mode (slower, hot-reload)"
	@echo "  make schema          — dump current DB schema to api/schema.sql"
	@echo ""

.PHONY: deploy
deploy:
	@bash scripts/deploy.sh

.PHONY: deploy-interactive
deploy-interactive:
	@bash scripts/deploy.sh --interactive

.PHONY: deploy-tls
deploy-tls:
	@bash scripts/deploy.sh --tls

.PHONY: deploy-fast
deploy-fast:
	@bash scripts/deploy.sh --no-build

.PHONY: deploy-pull
deploy-pull:
	@bash scripts/deploy.sh --pull

.PHONY: deploy-pull-tls
deploy-pull-tls:
	@bash scripts/deploy.sh --pull --tls

.PHONY: update
update:
	@echo "==> Pulling latest pre-built images from ghcr.io ..."
	docker compose -f docker-compose.prod.yml -f docker-compose.pull.yml pull
	docker compose -f docker-compose.prod.yml -f docker-compose.pull.yml up -d

.PHONY: logs
logs:
	docker compose -f docker-compose.prod.yml logs -f

.PHONY: logs-api
logs-api:
	docker compose -f docker-compose.prod.yml logs -f api

.PHONY: logs-web
logs-web:
	docker compose -f docker-compose.prod.yml logs -f web

.PHONY: ps
ps:
	docker compose -f docker-compose.prod.yml ps

.PHONY: stop
stop:
	docker compose -f docker-compose.prod.yml stop

.PHONY: down
down:
	docker compose -f docker-compose.prod.yml down

.PHONY: clean
clean:
	@echo "This will DELETE the database and all uploads!"
	@read -p "Type 'yes' to confirm: " c && [ "$$c" = "yes" ] || exit 1
	docker compose -f docker-compose.prod.yml down -v

.PHONY: dev
dev:
	docker compose up -d --build

.PHONY: schema
schema:
	@bash scripts/dump-schema.sh
