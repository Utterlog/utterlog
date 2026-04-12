.PHONY: build run test docker-build docker-run deploy clean

# 变量
BINARY_NAME=ai-bridge
DOCKER_IMAGE=ai-bridge:latest
STATIC_DIR=./static
DATA_DIR=./data
PORT=8080

# 构建二进制文件
build:
	go build -o $(BINARY_NAME) ./cmd/server

# 运行开发服务器
run:
	go run ./cmd/server -static $(STATIC_DIR)

# 运行测试
test:
	go test -v ./...

# 清理
clean:
	rm -f $(BINARY_NAME)
	rm -rf $(DATA_DIR)

# Docker 构建
docker-build:
	docker build -t $(DOCKER_IMAGE) .

# Docker 运行
docker-run:
	docker run -d \
		--name ai-bridge \
		-p $(PORT):8080 \
		-v $(PWD)/$(DATA_DIR):/app/data \
		-e DATA_DIR=/app/data \
		--env-file .env \
		$(DOCKER_IMAGE)

# Docker 停止
docker-stop:
	docker stop ai-bridge && docker rm ai-bridge

# Docker 日志
docker-logs:
	docker logs -f ai-bridge

# 部署到服务器（需要配置 SSH）
DEPLOY_HOST=us-aibridge.bluecdn.com
DEPLOY_PATH=/opt/ai-bridge

deploy: build
	@echo "Deploying to $(DEPLOY_HOST)..."
	ssh $(DEPLOY_HOST) "mkdir -p $(DEPLOY_PATH)/static $(DEPLOY_PATH)/data"
	scp $(BINARY_NAME) $(DEPLOY_HOST):$(DEPLOY_PATH)/
	scp -r $(STATIC_DIR)/* $(DEPLOY_HOST):$(DEPLOY_PATH)/static/
	scp .env $(DEPLOY_HOST):$(DEPLOY_PATH)/
	ssh $(DEPLOY_HOST) "cd $(DEPLOY_PATH) && sudo systemctl restart ai-bridge"
	@echo "Deployment complete!"

# 一键启动（开发）
dev: build
	./$(BINARY_NAME) -static $(STATIC_DIR)

# 初始化数据目录
init:
	mkdir -p $(DATA_DIR)
	chmod 755 $(DATA_DIR)

# 查看帮助
help:
	@echo "Available targets:"
	@echo "  build        - Build the binary"
	@echo "  run          - Run development server"
	@echo "  test         - Run tests"
	@echo "  clean        - Clean build artifacts"
	@echo "  docker-build - Build Docker image"
	@echo "  docker-run   - Run Docker container"
	@echo "  docker-stop  - Stop Docker container"
	@echo "  docker-logs  - View Docker logs"
	@echo "  deploy       - Deploy to remote server"
	@echo "  dev          - Build and run locally"
	@echo "  init         - Initialize data directory"
