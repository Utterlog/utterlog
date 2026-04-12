# AI Bridge Gateway

AI Bridge 的统一后端网关，支持两种部署方式：

## 🚀 快速选择

| 部署方式     | 适用场景                    | 是否需要 SITE_TOKEN |
| ------------ | --------------------------- | ------------------- |
| **官方托管** | 快速开始，不想维护服务器    | ✅ 需要             |
| **自托管**   | 保护 API Key 隐私，自己控制 | ❌ 不需要           |

## 部署方式详解

### 方式 1：官方托管服务

使用我们提供的服务（如 `us-aibridge.bluecdn.com`）：

**特点：**

- 零维护，即开即用
- 需要申请访问 Token
- 优化的全球网络

**配置：**

```bash
# 必须配置 SITE_TOKEN 才能启用 Token 申请
SITE_TOKEN=your-admin-token
EMAIL_PROVIDER=sendflare
EMAIL_API_KEY=your-key
```

### 方式 2：自托管

在你自己的服务器上部署：

**特点：**

- API Key 只在你服务器上流转
- 无需申请 Token
- 完全控制

**配置：**

```bash
# 不需要 SITE_TOKEN！
# 只要没有配置 SITE_TOKEN，就是自托管模式
LISTEN_ADDR=:8080
OPENAI_BASE_URL=https://api.openai.com/v1
```

## 快速开始

### Docker 部署（自托管）

```bash
# 无需 .env 文件，直接运行
docker run -d \
  -p 8080:8080 \
  -e OPENAI_BASE_URL=https://api.openai.com/v1 \
  ghcr.io/gentpan/ai-bridge:latest
```

### 二进制部署（自托管）

```bash
# 下载并运行（无需配置）
./ai-bridge
```

### Docker 部署（托管）

```bash
# 需要配置 SITE_TOKEN
docker run -d \
  -p 8080:8080 \
  -e SITE_TOKEN=your-admin-token \
  -e EMAIL_PROVIDER=sendflare \
  -e EMAIL_API_KEY=your-key \
  ghcr.io/gentpan/ai-bridge:latest
```

## 配置说明

后端**自动识别**模式：

- **配置了 SITE_TOKEN** → 托管模式（需要 Token 申请）
- **未配置 SITE_TOKEN** → 自托管模式（无需 Token）

## 支持的 AI 提供商

- OpenAI (GPT-4, GPT-3.5)
- Claude (Anthropic)
- Google Gemini
- DeepSeek
- 以及任何 OpenAI 兼容的 API

## API 端点

### 公共端点

- `GET /healthz` - 健康检查
- `POST /api/apply-token` - 申请 Token（仅托管模式）

### AI 服务端点

- `POST /v1/chat/completions` - 聊天完成
- `POST /v1/connectors/proxy` - 代理连接器

### 管理端点（仅托管模式）

- `GET /api/tokens` - Token 列表
- `GET /api/tokens/stats` - 使用统计
- `POST /api/tokens/revoke` - 吊销 Token

## 更多文档

- [自托管部署指南](SELFHOSTED.md)
- [PHP 版本](https://github.com/gentpan/ai-bridge-php)
- [部署检查清单](DEPLOY-CHECKLIST.md)

## 获取帮助

- GitHub Issues: https://github.com/gentpan/ai-bridge/issues
