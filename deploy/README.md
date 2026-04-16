# 反向代理配置示例

Utterlog 生产部署（`make deploy`）会把服务绑在 `127.0.0.1:9527`（或自动检测到的其他端口），**不占用** `80/443`。

你需要用自己的 nginx 或 Caddy 把公网域名反代过去。以下是现成配置。

## 文件一览

| 文件 | 适用 |
|---|---|
| `nginx.conf.example` | nginx + 已有 TLS 证书（certbot/acme.sh） |
| `Caddyfile.example` | Caddy v2 + 自动 TLS |

## 关键点

- **单端口**：只需反代一个端口到 `127.0.0.1:9527`，无需分别处理 `/api` 和 `/admin`。Go 后端内部已经把请求分发给 admin SPA 和 Next.js 博客。
- **WebSocket / SSE**：AI 流式输出、在线用户推送用 SSE，确保 nginx 配 `proxy_http_version 1.1` 和 `Connection upgrade`。
- **缓存**：`/_next/static/*` 和 `/admin/assets/*` 都是 hash 化 immutable 资源，可以缓存 1 年。
- **上传大小**：默认 100MB，按需调整。
