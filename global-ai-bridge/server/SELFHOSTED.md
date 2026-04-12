# AI Bridge 自托管部署指南

## 为什么自托管？

**保护你的 API Key 隐私**

如果你不信任第三方服务会妥善处理你的 AI 服务商 API Key，可以选择自己部署后端：

- API Key **只在你自己的服务器上流转**
- 无需向任何第三方申请 Token
- 完全控制你的数据

## 两种后端选择

### 方案 1：Go 版本（推荐）

- ✅ 高性能、低资源占用
- ✅ Docker 一键部署
- ✅ 支持所有 AI 提供商

### 方案 2：PHP 版本

- ✅ 无需额外服务器
- ✅ 支持共享主机
- ✅ 单文件部署

---

## 方案 1：Go 版本部署

### 使用 Docker Compose（推荐）

```bash
# 1. 创建工作目录
mkdir -p ai-bridge && cd ai-bridge

# 2. 创建 docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  ai-bridge:
    image: ghcr.io/gentpan/ai-bridge:latest
    container_name: ai-bridge
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    environment:
      - LISTEN_ADDR=:8080
      - NODE_NAME=my-bridge
      # AI 提供商配置
      - OPENAI_BASE_URL=https://api.openai.com/v1
      - ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
EOF

# 3. 启动
docker-compose up -d

# 4. 测试
curl http://localhost:8080/healthz
```

**无需配置 MODE！** 后端会自动识别为自托管模式（因为没有配置 SITE_TOKEN）。

### 使用二进制文件

```bash
# 1. 下载对应系统的二进制
wget https://github.com/gentpan/ai-bridge/releases/latest/download/ai-bridge-linux-amd64

# 2. 添加执行权限
chmod +x ai-bridge-linux-amd64

# 3. 运行（无需 .env 文件）
./ai-bridge-linux-amd64

# 或使用环境变量
LISTEN_ADDR=:8080 \
OPENAI_BASE_URL=https://api.openai.com/v1 \
./ai-bridge-linux-amd64
```

---

## 方案 2：PHP 版本部署

### 上传到现有 PHP 服务器

```bash
# 1. 下载 PHP 文件
wget https://github.com/gentpan/ai-bridge-php/releases/latest/download/bridge.php

# 2. 上传到服务器
# 例如: /public_html/ai-bridge/bridge.php

# 3. 测试
curl https://your-domain.com/ai-bridge/bridge.php/healthz
```

### Nginx 配置

```nginx
location /ai-bridge/ {
    try_files $uri $uri/ /ai-bridge/bridge.php?$query_string;
}
```

---

## WordPress 插件配置

### 步骤 1：选择连接方式

进入 WordPress 后台 → 工具 → AI Bridge

**选择「使用自己的服务器（自托管）」**

### 步骤 2：配置后端地址

**Go 版本：**

```
http://your-server:8080/v1/chat/completions
```

**PHP 版本：**

```
https://your-domain.com/ai-bridge/bridge.php/v1/chat/completions
```

### 步骤 3：配置 API Key

- **AI Bridge 访问令牌**：**留空**（自托管不需要）
- **模型 API Token**：填入你的 OpenAI/Claude 等 API Key

### 步骤 4：保存并测试

点击「测速当前节点」验证连接。

---

## 对比：自托管 vs 官方托管

| 特性             | 自托管          | 官方托管           |
| ---------------- | --------------- | ------------------ |
| **API Key 隐私** | ✅ 只在你服务器 | 仅用于转发，不存储 |
| **部署难度**     | 需要服务器      | 一键使用           |
| **费用**         | 服务器费用      | 免费/按量付费      |
| **维护**         | 自己负责        | 官方维护           |
| **速度**         | 取决于服务器    | 优化的全球节点     |
| **Token 申请**   | ❌ 不需要       | ✅ 需要            |

---

## 安全建议

1. **防火墙配置**：只开放必要的端口
2. **HTTPS**：生产环境务必使用 HTTPS
3. **定期更新**：关注新版本安全更新
4. **访问日志**：定期检查异常请求

---

## 故障排查

### 服务无法启动

```bash
# 检查日志
docker-compose logs -f

# 检查端口占用
sudo lsof -i :8080
```

### 插件提示需要 Token

检查后端地址是否正确：

- 自托管地址不应包含官方域名
- 确保没有配置 SITE_TOKEN 环境变量

### 连接超时

```bash
# 测试后端连通性
curl -v http://your-server:8080/healthz

# 检查防火墙
sudo iptables -L | grep 8080
```

---

## 获取帮助

- GitHub Issues: https://github.com/gentpan/ai-bridge/issues
- 文档: https://docs.ai-bridge.example.com
