# AI Bridge Gateway Dockerfile

# 构建阶段
FROM golang:1.24-alpine AS builder

WORKDIR /app

# 安装依赖
RUN apk add --no-cache git

# 复制依赖文件
COPY go.mod go.sum ./
RUN go mod download

# 复制源代码
COPY . .

# 编译
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o ai-bridge ./cmd/server

# 运行阶段
FROM alpine:latest

WORKDIR /app

# 安装 ca-certificates 用于 HTTPS
RUN apk --no-cache add ca-certificates

# 创建非 root 用户
RUN addgroup -g 1000 -S aibridge && \
    adduser -u 1000 -S aibridge -G aibridge

# 复制二进制文件
COPY --from=builder /app/ai-bridge /app/ai-bridge

# 复制静态文件
COPY --from=builder /app/static /app/static

# 创建数据目录
RUN mkdir -p /app/data && chown -R aibridge:aibridge /app

# 切换用户
USER aibridge

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:8080/healthz || exit 1

# 启动命令
ENTRYPOINT ["/app/ai-bridge"]
CMD ["-static", "/app/static"]
