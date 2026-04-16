# Utterlog

现代化自托管博客平台 · Go + Next.js · 单端口部署 · 内嵌管理后台 · 联盟身份

## 特性

- **主题系统** — 内置 5 套主题（Azure / Flux / 2026 / Chred / Westlife），每套独立组件和样式；支持用户上传自定义主题；每主题可带自己的页脚图标按钮配置
- **段落级点评** — 文章任意段落悬浮加号即可点评，不占评论区，支持 Utterlog 联盟身份跨站发表
- **AI Agent** — 内置工具集（AI 摘要、AI 阅读助手、段落点评生成、批量批处理）；多 provider 支持（OpenAI / Claude / DeepSeek / Gemini 等）
- **评论系统** — 带邮箱验证、水印验证码、Gravatar / Utterlog 头像可选、浏览器 / OS / 国家旗标识、关注标记
- **联盟身份（Utterlog Network）** — OAuth 2.0 跨站登录、联盟头像同步、跨站关注 / 评论 / 点评、Webhook 联邦
- **存储集** — 媒体库 + 相册 + 图书 / 电影 / 游戏 / 好物 / 音乐 / 视频，每类独立管理页
- **说说** — 微博式零散卡片流，支持图片上传、关键词、EXIF 自动解析、地图展示
- **RSS 订阅** — 聚合关注站点 RSS，看板式阅读流
- **安全** — Passkey 登录 / 2FA / IP 封禁 / CC 限流 / 地理封锁
- **媒体处理** — 本地 / S3 / R2 / Cloudflare 存储，自动 WebP 转换 + EXIF 读取
- **搜索** — pgvector 语义搜索，embedding 自动生成

## 技术栈

| 层 | 技术 |
|---|---|
| 博客前端 | Next.js 16 + React 19 + TypeScript 6 |
| 管理后台 | Vite + React + React Router + Zustand + TanStack Query（`go:embed` 内嵌进 Go 二进制） |
| 后端 API | Go 1.26 + Gin + sqlx |
| 数据库 | PostgreSQL 18（含 pgvector 扩展） |
| 缓存 | Redis 7 |
| 部署 | Docker Compose + 可选内置 Caddy |

## 项目结构

```
utterlog/
├── api/                          Go 后端
│   ├── main.go                   入口 + 路由注册
│   ├── web_proxy.go              内部反代到 Next.js 的 ReverseProxy
│   ├── admin.go                  embedded admin SPA 路由
│   ├── admin_embed.go            //go:embed all:admin/dist
│   ├── admin/                    管理后台 SPA（Vite + React）
│   │   ├── src/
│   │   │   ├── pages/            37 个后台页面（Posts / Comments / Annotations / ...）
│   │   │   ├── components/       共用 UI + FooterIconsEditor / VisitorMap 等
│   │   │   └── lib/              API client + stores + utils
│   │   ├── package.json
│   │   └── dist/                 Vite build 产物（运行时嵌入 Go binary）
│   ├── internal/
│   │   ├── handler/              HTTP handlers（文章、评论、点评、AI、安全、联盟等）
│   │   ├── model/                数据模型 + 头像解析
│   │   ├── middleware/           Auth / CORS / CC 保护 / 地理封锁
│   │   ├── storage/              本地 / S3 / R2 抽象
│   │   └── email/                模板 + SMTP/Resend/Sendflare 适配
│   ├── config/                   读 env / DB / Redis 初始化 + schema 自动导入
│   ├── schema.sql                全新安装自动加载的 DB schema
│   ├── public/                   logo / favicon / 主题 screenshot / uploads
│   ├── Dockerfile                开发镜像（bind-mount + go run）
│   ├── Dockerfile.prod           生产多阶段（stripped binary，25MB）
│   └── Makefile                  go build / release 等
│
├── web/                          Next.js 博客前端
│   ├── app/
│   │   ├── (blog)/               博客路由群（/ / about / archives / tags / links / music / ...）
│   │   ├── install/              首次安装向导（三步）
│   │   ├── api/revalidate/       服务器端缓存失效 API
│   │   └── login/                登录页（跳转 /admin/login）
│   ├── themes/
│   │   ├── Azure/                默认 · 蔚蓝极简
│   │   ├── Flux/                 金融科技风
│   │   ├── 2026/                 Utterlog 官方
│   │   ├── Chred/                红色商务
│   │   └── Westlife/             生活暖色
│   ├── plugins/                  analytics / copyright
│   ├── components/
│   │   ├── blog/                 AISummary / AnnotationProvider / ImageGrid / MusicPlayer / ...
│   │   ├── editor/               MarkdownEditor
│   │   ├── layout/               GlobalMiniPlayer（仅博客共用）
│   │   └── ui/                   Button / Modal / Toast / ...
│   ├── lib/                      API client / theme loader / slots / stores
│   ├── middleware.ts             /install 重定向逻辑
│   ├── public/                   favicon / emoji / 主题 screenshot
│   ├── Dockerfile                开发镜像
│   └── Dockerfile.prod           生产多阶段（next standalone，150MB）
│
├── scripts/                      部署脚本
│   ├── deploy.sh                 一键部署（端口探测 + 密码生成 + healthcheck）
│   ├── find-free-port.sh         端口扫描（ss/netstat/python3 三级兜底）
│   └── dump-schema.sh            导出 schema.sql
│
├── deploy/                       反代配置示例
│   ├── 1panel.md                 1Panel / 宝塔 / AAPanel 图形化配置指南
│   ├── nginx.conf.example        nginx + TLS
│   ├── Caddyfile.example         Caddy + 自动 TLS
│   ├── caddy/Caddyfile           内置 Caddy sidecar 模板（make deploy-tls 用）
│   └── README.md                 决策树
│
├── docker-compose.yml            开发编排
├── docker-compose.prod.yml       生产编排（单端口 127.0.0.1 + 可选 Caddy）
├── Makefile                      make deploy / deploy-tls / logs / ...
├── INSTALL.md                    安装指南
└── .env.example
```

## 快速部署

**一行命令：**

```bash
curl -fsSL https://raw.githubusercontent.com/Utterlog/utterlog/main/install.sh | bash
```

自动 HTTPS（内置 Caddy）：

```bash
curl -fsSL https://raw.githubusercontent.com/Utterlog/utterlog/main/install.sh | DOMAIN=blog.yoursite.com bash
```

脚本自动：检查 Docker → clone 仓库 → 按内存选本地构建或拉预构建镜像 → 生成随机密码 → 找空闲端口 → 启动 → 健康检查 → 打印凭据和反代提示。

**日后更新**（在 utterlog 目录下）：
```bash
git pull && bash scripts/deploy.sh
```

## 反代

Utterlog 只绑 `127.0.0.1:9527`，公网不可见。需要反代：

| 你的 VPS | 怎么做 |
|---|---|
| 有 1Panel / 宝塔 | GUI 加反向代理，指向 `127.0.0.1:9527` → [deploy/1panel.md](deploy/1panel.md) |
| 有自建 nginx / Caddy | 复制 [deploy/nginx.conf.example](deploy/nginx.conf.example) 或 [deploy/Caddyfile.example](deploy/Caddyfile.example) |
| 啥都没有 | 改用 `DOMAIN=blog.你域名 make deploy-tls`（自带 Caddy + 自动 TLS） |

## 架构

```
用户浏览器
   │
   ▼
你的 nginx / 1Panel / Caddy
   │
   ▼
127.0.0.1:9527 (Utterlog API 容器)
   │
   ├─ /admin/*        → 内嵌 Vite SPA（管理后台）
   ├─ /api/v1/*       → Go handlers（数据 / 认证 / 业务）
   ├─ /uploads/*      → 本地文件
   ├─ /themes/*       → 主题预览 SVG
   └─ 其他            → 内部反代到 web 容器（Next.js SSR 博客）
                        │
                        └─ web:3000（仅 docker 内部网络，无公网端口）
```

- **公网仅暴露一个端口**（你原本的 nginx/caddy 的 443），Utterlog 自己绑 loopback
- **生产内存 ~600MB**（1GB VPS 舒适跑）
- **单二进制 + 静态前端**（Go binary 25MB，Next.js standalone 150MB）

## 常用命令

```bash
make help      # 看命令列表（默认只显示 2 条核心）
make logs      # 看日志
make ps        # 容器状态
make stop      # 停止
```

高级命令 `make help-advanced` 查看（TLS / 交互式 / 开发模式 / 数据清理等）。

## 相关仓库

- **[utterlog](https://github.com/Utterlog/utterlog)** — 主项目（本仓库）
- **[utterlog-sync](https://github.com/Utterlog/utterlog-sync)** — WordPress 导入 / 同步插件

## 文档

- [INSTALL.md](./INSTALL.md) — 安装指南（三种场景 + 裸机部署 + 故障排查）
- [deploy/README.md](./deploy/README.md) — 反代配置决策树
- [deploy/1panel.md](./deploy/1panel.md) — 1Panel / 宝塔 / AAPanel 图形化指南

## 许可

MIT
