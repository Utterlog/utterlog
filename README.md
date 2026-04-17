# Utterlog

<p>
  <a href="https://github.com/utterlog/utterlog/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/utterlog/utterlog/ci.yml?branch=main&style=flat-square&label=CI" alt="CI"></a>
  <a href="https://github.com/utterlog/utterlog/actions/workflows/docker-publish.yml"><img src="https://img.shields.io/github/actions/workflow/status/utterlog/utterlog/docker-publish.yml?branch=main&style=flat-square&label=docker%20images&logo=docker&logoColor=white" alt="Docker images"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/utterlog/utterlog?style=flat-square" alt="License"></a>
  <a href="https://github.com/utterlog/utterlog/stargazers"><img src="https://img.shields.io/github/stars/utterlog/utterlog?style=flat-square" alt="Stars"></a>
  <img src="https://img.shields.io/github/go-mod/go-version/utterlog/utterlog?filename=api/go.mod&style=flat-square&logo=go&logoColor=white" alt="Go">
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs" alt="Next.js">
  <img src="https://img.shields.io/badge/PostgreSQL-18-336791?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/ghcr.io-utterlog-2496ED?style=flat-square&logo=docker&logoColor=white" alt="GHCR">
</p>

<p>
  <a href="https://demo.utterlog.io"><img src="https://img.shields.io/badge/Live%20Demo-demo.utterlog.io-22c55e?style=for-the-badge&logo=safari&logoColor=white" alt="Live Demo" height="40"></a>
  <a href="https://utterlog.io"><img src="https://img.shields.io/badge/Project-utterlog.io-3b82f6?style=for-the-badge&logo=hugo&logoColor=white" alt="Project Site" height="40"></a>
  <a href="https://utterlog.com"><img src="https://img.shields.io/badge/Network-utterlog.com-8b5cf6?style=for-the-badge&logo=mastodon&logoColor=white" alt="Federation Hub" height="40"></a>
</p>

> 为独立作者打造的一体化内容平台。

## ✨ 特性

- **5 套主题，开箱即用** — Azure / Flux / 2026 / Chred / Westlife，支持上传自定义主题；每个主题可带独立的页脚图标按钮
- **段落级点评** — 文章任意段落悬浮加号即可点评，不挤评论区，跨站联盟身份可发表
- **AI Agent** — 内置 AI 摘要 / 阅读助手 / 段落点评生成 / 批处理，多 provider（OpenAI / Claude / DeepSeek / Gemini）
- **评论系统** — 邮箱验证 + 水印验证码 + Gravatar/Utterlog 头像 + 浏览器/OS/国家旗 + 关注标记
- **联盟身份（Utterlog Network）** — OAuth 2.0 跨站登录，联盟头像同步，跨站关注 / 评论 / 点评
- **内容存储集** — 媒体库 + 相册 + 图书 / 电影 / 游戏 / 好物 / 音乐 / 视频，分门类管理
- **说说** — 微博式卡片流，图片上传 + 关键词 + EXIF 自动解析 + 地图展示
- **RSS 阅读** — 聚合订阅 + 看板式阅读流
- **安全** — Passkey / 2FA / IP 封禁 / CC 限流 / 地理封锁
- **媒体** — 本地 / S3 / R2 / Cloudflare 存储，自动 WebP + EXIF
- **搜索** — pgvector 语义搜索，embedding 自动生成

## 🚀 快速部署

**一行安装**（已有反代或公网域名暂未配 TLS）：

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | bash
```

**带自动 HTTPS**（无现成反代，内置 Caddy 自动签证书）：

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | DOMAIN=blog.yoursite.com bash
```

脚本自动：检查 Docker → clone → 按内存选本地构建 / 拉 GHCR 镜像 → 生成随机密码 → 找空闲端口（默认 9260）→ 启动 → 健康检查 → 打印凭据。

**日后更新**（在 utterlog 目录下）：

```bash
make update
```

## 🔌 反代

Utterlog 仅绑 `127.0.0.1:9260`，公网不可见，需反代：

| 你的环境 | 怎么做 |
|---|---|
| 有 1Panel / 宝塔 / AAPanel | GUI 加反向代理，指向 `127.0.0.1:9260` → [deploy/1panel.md](deploy/1panel.md) |
| 有自建 nginx / Caddy | 复制 [deploy/nginx.conf.example](deploy/nginx.conf.example) 或 [deploy/Caddyfile.example](deploy/Caddyfile.example) |
| 啥反代都没有 | `DOMAIN=blog.你域名 make deploy-tls`（自带 Caddy + 自动 TLS） |

## 🏗 架构

```
用户浏览器
   │
   ▼
你的 nginx / 1Panel / Caddy   ← 公网（443）
   │
   ▼
127.0.0.1:9260  ← Utterlog 唯一对外端口（loopback）
   │
   ├─ /admin/*    内嵌 Vite SPA（管理后台）
   ├─ /api/v1/*   Go handlers（数据 / 认证 / 业务）
   ├─ /uploads/*  本地 / S3 / R2 文件
   └─ 其他        反代到内网 web:3000（Next.js SSR 博客）
```

- 公网仅一个端口（你原 nginx/caddy 的 443）
- 生产内存 ~600MB，1GB VPS 舒适跑
- Go binary 25MB · Next.js standalone 150MB

## 📦 技术栈

| 层 | 技术 |
|---|---|
| 博客前端 | Next.js 16 + React 19 + TypeScript 6 |
| 管理后台 | Vite + React + Zustand + TanStack Query（go:embed 内嵌） |
| 后端 | Go 1.26 + Gin + sqlx |
| 数据 | PostgreSQL 18 (pgvector) + Redis 7 |
| 部署 | Docker Compose + 可选内置 Caddy |

## 📖 文档

- [INSTALL.md](INSTALL.md) — 安装指南（三种场景 + 故障排查）
- [deploy/README.md](deploy/README.md) — 反代决策树
- [deploy/1panel.md](deploy/1panel.md) — 1Panel / 宝塔图形化指南
- 相关项目：[utterlog-sync](https://github.com/utterlog/utterlog-sync)（WordPress 导入插件）

## ⚖ License

MIT — 详见 [LICENSE](LICENSE)
