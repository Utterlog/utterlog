# AI Bridge for WordPress

AI Bridge 是 [ai-bridge-go](https://github.com/gentpan/ai-bridge-go) / [ai-bridge-php](https://github.com/gentpan/ai-bridge-php) 后端的配套 WordPress 插件。

插件本身不提供 AI 能力，而是将 WordPress 中的 AI 请求转发到你自己部署的后端网关，由网关代理访问 OpenAI、Claude、Gemini、DeepSeek 等 AI 服务商。

## 为什么需要这个插件？

由于网络环境和政策限制，中国大陆和香港的服务器无法稳定访问 OpenAI、Anthropic (Claude)、Google Gemini 等海外 AI 服务的 API。虽然本地电脑可以通过代理工具解决，但对于 WordPress 等线上服务端应用来说，直接从国内/港区服务器调用这些 AI API 几乎不可行。

AI Bridge 的解决方案：在一台海外服务器（如美国、日本、新加坡等地区的 VPS）上部署代理网关，由网关转发请求到 AI 服务商。你的 WordPress 站点只需将 AI 请求发送到这台网关即可。

**安全保障：** API Key 仅在你自己的服务器上流转，不经过任何第三方平台，完全由你掌控，杜绝密钥泄露风险。

## 工作原理

```
WordPress AI 功能 → AI Bridge 插件 → 你的后端网关 (海外 VPS) → AI 服务商
                                     纯反向代理，原样转发      (OpenAI/Claude/...)
```

- 插件拦截 WordPress 中的 AI 请求，转发到你配置的后端地址
- 后端网关根据请求中的 `provider` 字段，将请求转发到对应的 AI 服务商
- **网关不存储 API Key、不缓存对话内容**，是纯粹的网络中继
- API Key 仅在你自己的后端服务器上使用，WordPress 不直接接触 AI 服务商

## 使用前提

1. **准备一台海外服务器** — 美国、日本、新加坡等能正常访问 AI API 的地区（**请勿使用中国大陆或香港服务器**），绑定域名并配置 HTTPS
2. **部署后端** — 在服务器上部署后端，二选一：
   - [ai-bridge-go](https://github.com/gentpan/ai-bridge-go) — Go 版本，推荐，Docker 一键部署
   - [ai-bridge-php](https://github.com/gentpan/ai-bridge-php) — PHP 版本，单文件上传即可
3. **获取 AI 服务商 API Key** — 如 OpenAI、Anthropic、Google 等
4. **安装本插件** — 在 WordPress 后台配置后端地址和 API Key

## 安装

### 方法 1：上传 ZIP

从 [Releases](https://github.com/gentpan/global-ai-bridge/releases) 下载 ZIP → WordPress 后台 → 插件 → 安装插件 → 上传安装 → 启用。

### 方法 2：手动安装

```bash
cd wp-content/plugins/
git clone https://github.com/gentpan/global-ai-bridge.git
```

在 WordPress 后台启用插件。

## 配置

安装启用后，进入 WordPress 后台 → **工具** → **AI Bridge**。

### 第 1 步：选择连接方式

选择「使用自己的服务器（自托管）」。

### 第 2 步：填写后端地址

根据你部署的后端类型填写（需绑定域名，使用 HTTPS）：

| 后端类型 | 地址格式                                                           |
| -------- | ------------------------------------------------------------------ |
| Go 版本  | `https://your-domain.com/v1/chat/completions`                      |
| PHP 版本 | `https://your-domain.com/ai-bridge/bridge.php/v1/chat/completions` |

### 第 3 步：填写 API Key

| 设置项             | 说明                                  |
| ------------------ | ------------------------------------- |
| AI Bridge 访问令牌 | **留空**（自己部署的后端不需要）      |
| 模型 API Token     | 你的 AI 服务商 API Key（如 `sk-...`） |

### 第 4 步：选择默认提供商和模型

- 默认提供商：`openai` / `claude` / `google` / `deepseek`
- 默认模型：如 `gpt-4.1-mini`、`claude-sonnet-4-20250514` 等

### 第 5 步：保存并测试

保存设置后点击「测速当前节点」，显示成功即配置完成。

## 其他设置

| 设置项   | 说明                                                        |
| -------- | ----------------------------------------------------------- |
| 流量方向 | **出国模式**（中国→海外 AI）或 **回国模式**（海外→国内 AI） |
| 请求超时 | 默认 30 秒                                                  |
| 启用日志 | 记录请求日志，便于调试                                      |

## 工作原理

```
WordPress AI 功能 → AI Bridge 插件 → 你的后端网关 → AI 服务商
                                    (绑定域名)    (OpenAI/Claude/...)
```

- 插件拦截 WordPress 中的 AI 请求，转发到你配置的后端地址
- 后端网关代理请求到 AI 服务商，返回结果
- API Key 仅在你的后端服务器上使用，WordPress 不直接接触 AI 服务商

## 后端仓库

| 后端     | 仓库                                                              | 特点                     |
| -------- | ----------------------------------------------------------------- | ------------------------ |
| Go 版本  | [gentpan/ai-bridge-go](https://github.com/gentpan/ai-bridge-go)   | 高性能、Docker 部署      |
| PHP 版本 | [gentpan/ai-bridge-php](https://github.com/gentpan/ai-bridge-php) | 单文件、共享主机、零依赖 |

## 系统要求

- WordPress 6.0+
- PHP 7.4+
- 已部署的后端服务（需绑定域名，建议 HTTPS）

## 文档

- [插件详细说明](./PLUGIN.md)
- [使用指南](./USAGE.md)
- [部署指南](./DEPLOY.md)
- [1Panel 部署指南](./1PANEL-DEPLOY.md)
- [更新日志](./CHANGELOG.md)

## License

MIT
