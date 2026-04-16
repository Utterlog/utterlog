# ============================================================
# Utterlog Core — build pipeline
#
# Produces a single Go binary that embeds:
#   - Dashboard SPA (Vite build of api/admin/)
#   - schema.sql (auto-loaded on fresh DB)
#   - All Go API handlers
# ============================================================

BINARY_NAME := utterlog
BUILD_FLAGS := -ldflags="-s -w -X main.Version=$(shell git rev-parse --short HEAD 2>/dev/null || echo dev)" -trimpath

.PHONY: help
help:
	@echo "Utterlog Core build targets:"
	@echo "  make dev          — run in development mode (hot reload)"
	@echo "  make admin        — build only the Dashboard SPA"
	@echo "  make build        — full production build (admin + Go binary)"
	@echo "  make build-fast   — Go build only, assumes admin/dist already exists"
	@echo "  make clean        — remove build artifacts"
	@echo "  make release      — build for linux-amd64, linux-arm64, macos, windows"

.PHONY: dev
dev:
	go run .

.PHONY: admin
admin:
	cd admin && npm install && npm run build

.PHONY: build-fast
build-fast:
	go build $(BUILD_FLAGS) -o $(BINARY_NAME) .
	@echo ""
	@echo "✓ Built: ./$(BINARY_NAME) ($$(du -h $(BINARY_NAME) | cut -f1))"

.PHONY: build
build: admin build-fast

.PHONY: clean
clean:
	rm -f $(BINARY_NAME)
	rm -rf admin/dist
	mkdir -p admin/dist
	touch admin/dist/.gitkeep

.PHONY: release
release: admin
	@mkdir -p release
	GOOS=linux GOARCH=amd64 go build $(BUILD_FLAGS) -o release/$(BINARY_NAME)-linux-amd64 .
	GOOS=linux GOARCH=arm64 go build $(BUILD_FLAGS) -o release/$(BINARY_NAME)-linux-arm64 .
	GOOS=darwin GOARCH=arm64 go build $(BUILD_FLAGS) -o release/$(BINARY_NAME)-macos-arm64 .
	GOOS=darwin GOARCH=amd64 go build $(BUILD_FLAGS) -o release/$(BINARY_NAME)-macos-amd64 .
	GOOS=windows GOARCH=amd64 go build $(BUILD_FLAGS) -o release/$(BINARY_NAME)-windows-amd64.exe .
	@echo ""
	@echo "✓ Release binaries in ./release/:"
	@ls -lh release/
