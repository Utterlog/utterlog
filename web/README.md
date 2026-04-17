# web/ — Utterlog 博客前端

Next.js 16 + React 19 + TypeScript 6 渲染的博客前端。**不是独立产品** — 配合根目录的 [api/](../api) 一起跑，由 Go API 反代到本服务。

> 项目整体介绍、部署、特性，看根目录 [README.md](../README.md)。本文档只讲 web 子模块开发。

## 角色

```
浏览器
  ↓
Go API (:8080)        ← 唯一对外端口（生产 9260）
  ├─ /admin/*    embed 后台 SPA
  ├─ /api/*      Go handlers
  └─ /*          反代到 → web 容器 (Next.js, 本目录)
```

web 仅在 docker 内网可达，**不直接暴露公网端口**。SSR 走 `INTERNAL_API_URL`（容器名直连），客户端 fetch 走 `NEXT_PUBLIC_API_URL=/api/v1`（同源相对路径，无 CORS）。

## 目录关键点

| 路径 | 内容 |
|------|------|
| [app/(blog)/](app/(blog)) | 博客所有公开页（首页 / 文章 / 归档 / 标签 / 链接 / 音乐 / 说说） |
| [app/install/](app/install) | 首次安装向导（三步） |
| [app/feed/](app/feed) | RSS 聚合阅读 |
| [themes/](themes) | 5 套主题（Azure / Flux / 2026 / Chred / Westlife），每套独立组件 + 样式 |
| [plugins/](plugins) | 第三方扩展加载点，见 [plugins/README.md](plugins/README.md) |
| [middleware.ts](middleware.ts) | API 不可达时强制跳 `/install` 的 fail-closed 中间件 |
| [lib/api.ts](lib/api.ts) | 客户端 API 封装（带 token 刷新） |
| [lib/blog-api.ts](lib/blog-api.ts) | SSR 调用，走 INTERNAL_API_URL |

## 单独开发本子模块

通常用根目录 `make dev` 一起跑就够了。需要单独跑 web（连远程 API）时：

```bash
cd web
npm install
NEXT_PUBLIC_API_URL=https://your-api.com/api/v1 \
INTERNAL_API_URL=https://your-api.com/api/v1 \
npm run dev   # http://localhost:3000
```

## 主题开发

每套主题在 `themes/{Name}/`：

- `theme.json` — 清单（name / version / colors）
- 必须导出：`Header` / `Footer` / `Layout` / `HomePage` / `PostPage` / `PostCard`
- 可选：`PageFooterIcons`（自定义页脚图标按钮）

后台 → 主题管理切换，或上传 zip 自定义主题。
