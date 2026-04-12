# AI Bridge 部署指南

## 模式说明

AI Bridge 后端**自动识别**运行模式：

| 配置 | 模式 | 说明 |
|------|------|------|
| 配置了 `SITE_TOKEN` | 托管模式 | 用户需要申请 Token |
| 未配置 `SITE_TOKEN` | 自托管模式 | 直接使用，无需 Token |

## 托管模式部署

适用于：你想提供 AI Bridge 服务给他人使用

### 1. 准备配置

```bash
cat > .env << 'EOF'
# 关键：配置 SITE_TOKEN 启用托管模式
SITE_TOKEN=your-secure-admin-token

# 邮件配置（用于发送 Token 给用户）
EMAIL_PROVIDER=sendflare
EMAIL_API_KEY=your-api-key
EMAIL_FROM_ADDR=noreply@your-domain.com
EMAIL_FROM_NAME=AI Bridge

# 节点配置
NODE_NAME=us-aibridge
NODE_TRAFFIC_MODE=outbound

# AI 提供商
OPENAI_BASE_URL=https://api.openai.com/v1
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
EOF
```

### 2. 启动

```bash
docker-compose up -d
```

## 自托管模式部署

适用于：你想自己部署，保护自己的 API Key

### 1. 准备配置

**注意：不需要配置 SITE_TOKEN！**

```bash
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  ai-bridge:
    image: ghcr.io/gentpan/ai-bridge:latest
    ports:
      - "8080:8080"
    environment:
      - OPENAI_BASE_URL=https://api.openai.com/v1
      # 不需要 SITE_TOKEN！
EOF
```

### 2. 启动

```bash
docker-compose up -d
```

## 验证部署

```bash
# 健康检查
curl http://localhost:8080/healthz

# 托管模式返回：{"mode": "Managed", ...}
# 自托管模式返回：{"mode": "Self-Hosted", ...}
```

## 部署到生产环境

### 使用 systemd

```bash
# 1. 创建服务文件
sudo tee /etc/systemd/system/ai-bridge.service << 'EOF'
[Unit]
Description=AI Bridge
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ai-bridge
ExecStart=/opt/ai-bridge/ai-bridge
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 2. 启动
sudo systemctl enable ai-bridge
sudo systemctl start ai-bridge
```

### 使用 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name api.your-domain.com;
    
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 更多部署方式

- [自托管详细指南](SELFHOSTED.md)
- [PHP 版本](php-version/)
- [Docker 部署检查清单](DEPLOY-CHECKLIST.md)
