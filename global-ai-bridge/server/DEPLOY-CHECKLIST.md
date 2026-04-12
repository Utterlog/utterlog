# AI Bridge 部署检查清单

## 📋 部署前准备

- [ ] 服务器配置要求
  - [ ] Linux 系统 (Ubuntu 20.04+, CentOS 7+, Debian 10+)
  - [ ] 至少 512MB RAM
  - [ ] 至少 1GB 磁盘空间
  - [ ] 公网 IP 或域名

- [ ] 准备配置文件
  - [ ] 复制 `.env.example` 为 `.env`
  - [ ] 设置强密码的 `SITE_TOKEN`（至少 32 位随机字符）
  - [ ] 配置邮件服务（Sendflare 或 Resend 的 API Key）
  - [ ] 配置 AI 提供商（OpenAI、Claude 等）

## 🚀 部署步骤

### 方式 1：二进制部署（推荐）

```bash
# 1. 下载并运行部署脚本
curl -fsSL https://raw.githubusercontent.com/gentpan/ai-bridge/main/server/deploy.sh | sudo bash

# 2. 编辑配置文件
sudo nano /opt/ai-bridge/.env

# 3. 重启服务
sudo systemctl restart ai-bridge
```

检查清单：
- [ ] 运行部署脚本
- [ ] 修改 `.env` 中的 `SITE_TOKEN`
- [ ] 配置邮件服务（可选但推荐）
- [ ] 重启服务
- [ ] 检查服务状态: `sudo systemctl status ai-bridge`

### 方式 2：Docker 部署

```bash
# 1. 克隆代码
git clone https://github.com/gentpan/ai-bridge.git
cd ai-bridge/server

# 2. 配置
cp .env.example .env
nano .env

# 3. 启动
docker-compose up -d
```

检查清单：
- [ ] 克隆代码
- [ ] 配置 `.env` 文件
- [ ] 运行 `docker-compose up -d`
- [ ] 检查容器状态: `docker-compose ps`
- [ ] 查看日志: `docker-compose logs -f`

### 方式 3：开发环境

```bash
cd server
go mod download
go run ./cmd/server -static ./static
```

## ✅ 部署后验证

### 基础功能测试

- [ ] 健康检查
  ```bash
  curl http://localhost:8080/healthz
  # 应返回: {"ok": true, ...}
  ```

- [ ] Token 申请页面
  ```bash
  curl http://localhost:8080/
  # 应返回 HTML 页面
  ```

- [ ] Token 申请 API
  ```bash
  curl -X POST http://localhost:8080/api/apply-token \
    -d '{"email": "test@example.com"}'
  # 应返回: {"success": true, "token": "abt_..."}
  ```

- [ ] 邮件发送（如果配置了邮件）
  ```bash
  # 检查邮箱是否收到 Token 邮件
  ```

- [ ] AI API 测试
  ```bash
  curl -X POST http://localhost:8080/v1/chat/completions \
    -H "Authorization: Bearer <your-token>" \
    -H "X-AIBRIDGE-PROVIDER-TOKEN: <openai-key>" \
    -d '{"provider":"openai","messages":[{"role":"user","content":"hi"}]}'
  ```

### 管理功能测试

- [ ] 查看 Token 列表
  ```bash
  curl -H "Authorization: Bearer <SITE_TOKEN>" \
    http://localhost:8080/api/tokens
  ```

- [ ] 查看统计信息
  ```bash
  curl -H "Authorization: Bearer <SITE_TOKEN>" \
    http://localhost:8080/api/tokens/stats
  ```

## 🔒 安全配置

- [ ] 修改默认的 `SITE_TOKEN`（至少 32 位随机字符）
- [ ] 配置防火墙（仅开放 80/443，关闭 8080 直接访问）
- [ ] 配置 HTTPS（使用 Nginx 或 Caddy）
- [ ] 配置邮件服务（防止 Token 被滥用）
- [ ] 定期备份 `./data` 目录
- [ ] 配置日志轮转

## 📊 监控配置

- [ ] 启用 systemd 自动重启
- [ ] 配置健康检查
- [ ] 设置监控告警（可选）

## 🌐 域名和 HTTPS（生产环境必需）

### 使用 Caddy（自动 HTTPS，推荐）

1. 安装 Docker Compose 中的 Caddy
2. 修改 `Caddyfile` 中的域名
3. 确保 80/443 端口开放
4. 启动：`docker-compose up -d`

### 使用 Nginx + Certbot

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 申请证书
sudo certbot --nginx -d your-domain.com
```

## 🔄 备份策略

- [ ] 定期备份数据目录
  ```bash
  # 备份脚本
  tar -czf ai-bridge-backup-$(date +%Y%m%d).tar.gz /opt/ai-bridge/data
  ```

- [ ] 备份配置文件
  ```bash
  cp /opt/ai-bridge/.env .env.backup
  ```

## 🆘 故障排查

### 服务无法启动

```bash
# 查看日志
sudo journalctl -u ai-bridge -n 50

# 检查配置
sudo cat /opt/ai-bridge/.env

# 检查权限
ls -la /opt/ai-bridge/
ls -la /opt/ai-bridge/data/
```

### Token 申请失败

```bash
# 检查邮件配置
grep EMAIL /opt/ai-bridge/.env

# 测试邮件
curl -X POST http://localhost:8080/api/apply-token \
  -d '{"email": "your-email@example.com"}'
```

### API 返回 401

```bash
# 检查 Token 是否正确
curl -H "Authorization: Bearer <token>" \
  http://localhost:8080/api/tokens/stats
```

## 📞 获取帮助

- 查看日志：`sudo journalctl -u ai-bridge -f`
- 查看文档：`cat DEPLOY.md`
- 提交 Issue：https://github.com/gentpan/ai-bridge/issues

## ✨ 完成部署

当以上所有检查项都完成后，你的 AI Bridge 就可以使用了！

访问你的域名或 IP，开始申请 Token 并使用 AI 服务吧 🎉
