# Utterlog

<p>
  <a href="https://github.com/utterlog/utterlog/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/utterlog/utterlog/ci.yml?branch=main&style=flat-square&label=CI" alt="CI">
  </a>
  <a href="https://github.com/utterlog/utterlog/actions/workflows/docker-publish.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/utterlog/utterlog/docker-publish.yml?branch=main&style=flat-square&label=Docker%20Images&logo=docker&logoColor=white" alt="Docker Images">
  </a>
  <a href="https://github.com/utterlog/utterlog/releases">
    <img src="https://img.shields.io/github/v/release/utterlog/utterlog?style=flat-square&label=Release" alt="Release">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/utterlog/utterlog?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/utterlog/utterlog/stargazers">
    <img src="https://img.shields.io/github/stars/utterlog/utterlog?style=flat-square" alt="GitHub Stars">
  </a>
  <a href="https://github.com/utterlog/utterlog/issues">
    <img src="https://img.shields.io/github/issues/utterlog/utterlog?style=flat-square" alt="Issues">
  </a>
</p>

<p>
  <a href="https://github.com/utterlog/utterlog/pkgs/container/utterlog-api">
    <img src="https://img.shields.io/badge/GHCR-utterlog--api-2496ED?style=flat-square&logo=github&logoColor=white" alt="GHCR API image">
  </a>
  <a href="https://github.com/utterlog/utterlog/pkgs/container/utterlog-web">
    <img src="https://img.shields.io/badge/GHCR-utterlog--web-2496ED?style=flat-square&logo=github&logoColor=white" alt="GHCR Web image">
  </a>
  <img src="https://img.shields.io/badge/Registry-registry.utterlog.io-0052D9?style=flat-square&logo=docker&logoColor=white" alt="Utterlog Registry">
</p>

<!-- Docker Hub 镜像同步启用后可打开拉取次数徽章：
<p>
  <a href="https://hub.docker.com/r/utterlog/utterlog-api">
    <img src="https://img.shields.io/docker/pulls/utterlog/utterlog-api?style=flat-square&logo=docker&label=API%20pulls" alt="Docker API pulls">
  </a>
  <a href="https://hub.docker.com/r/utterlog/utterlog-web">
    <img src="https://img.shields.io/docker/pulls/utterlog/utterlog-web?style=flat-square&logo=docker&label=Web%20pulls" alt="Docker Web pulls">
  </a>
</p>
-->

<p>
  <a href="https://demo.utterlog.io"><img src="https://img.shields.io/badge/在线演示-demo.utterlog.io-22c55e?style=for-the-badge&logo=safari&logoColor=white" alt="Live Demo" height="38"></a>
  <a href="https://utterlog.io"><img src="https://img.shields.io/badge/产品主页-utterlog.io-3b82f6?style=for-the-badge&logo=hugo&logoColor=white" alt="Website" height="38"></a>
  <a href="https://github.com/utterlog/utterlog/releases"><img src="https://img.shields.io/badge/下载-Latest%20Release-0f172a?style=for-the-badge&logo=github&logoColor=white" alt="Latest Release" height="38"></a>
</p>

Utterlog 是一个面向独立作者、个人站长和小型社区的自托管内容平台。

它不只是博客程序，还把文章、页面、评论、友链、相册、足迹、RSS 订阅、AI 辅助写作、访问统计和站点设置放在一个后台里，让个人网站可以长期维护、持续扩展，并且始终由你自己掌控。

## 为什么选择 Utterlog

- **内容归你所有**：部署在自己的服务器，用自己的域名，数据和附件都在自己手里。
- **为真实博客而设计**：文章、页面、分类、标签、归档、RSS、固定链接、SEO、评论、媒体和备份都是核心能力。
- **不只写文章**：说说、相册、音乐、电影、图书、游戏、好物、视频、足迹和友链都可以统一管理。
- **AI 是辅助，不是噱头**：摘要、关键词、Slug、排版、封面提示词、评论审核、智能回复和文章陪读都围绕写作与运营场景设计。
- **主题和内容分离**：文章数据不绑定主题，主题可以声明菜单位置、侧边栏、页脚按钮和页面样式。
- **部署路径清晰**：Docker 部署，单入口端口，适合放在 nginx、Caddy、1Panel、宝塔或 AAPanel 后面运行。

## 核心能力

### 内容发布

使用 Markdown 写文章和页面，支持封面、摘要、分类、标签、公开编号、固定链接和自定义页面。发布后自动生成文章页、分类页、标签页、归档页、RSS、站点地图和 SEO 信息。

### 主题系统

内置 Utterlog、Azure、Renascent、Flux、Chred 等主题。主题可以定义顶部导航、侧栏导航、页脚按钮、搜索入口和页面结构。你可以在后台切换主题、上传 Logo 和 Favicon、配置社交按钮，让站点呈现自己的风格。

### 评论与互动

评论系统支持嵌套回复、审核、邮件通知、验证码、头像、国家旗、浏览器和系统标识。文章还支持段落级点评，适合教程、翻译、读书笔记、prompt 分享和长文讨论。

### AI 写作与陪读

后台可以使用 AI 生成摘要、关键词、Slug、排版建议、封面提示词、文章问题和评论回复。前台可以启用文章页 AI 陪读，也可以启用全站 AI 聊天气泡，帮助访客理解文章和站点内容。

### 足迹与收藏

文章可以标记国家或城市，在足迹页面生成地图和时间线。相册、音乐、电影、图书、游戏、好物、视频等内容类型也可以独立管理，适合整理生活记录、作品集和长期收藏。

### 友链与订阅

友情链接支持分类、图标、头像、站点描述、RSS 地址和不同展示样式。订阅页可以聚合友链 RSS，让个人站点成为自己的阅读入口。

### 统计与运营

后台提供文章数、评论数、访问量、在线用户、访客来源、访客地图、最近访客、字数统计、缓存清理、媒体设置、安全设置、语言、时区和第三方服务配置。

## 功能概览

| 模块 | 功能 |
|---|---|
| 写作 | Markdown、页面、封面、摘要、分类、标签、固定链接、公开编号 |
| 主题 | 多主题切换、菜单位置、侧栏导航、页脚按钮、Logo、Favicon |
| 评论 | 嵌套回复、审核、邮件通知、验证码、头像、国家旗、等级 |
| AI | 摘要、关键词、Slug、排版、封面提示词、智能回复、文章陪读 |
| 足迹 | 国家/城市标记、Mapbox 地图、旅行时间线、文章国家旗 |
| 友链 | 分类、图标、头像、RSS、卡片式和图标式展示 |
| 收藏 | 相册、音乐、电影、图书、游戏、好物、视频 |
| 订阅 | 站点 RSS、订阅页、友链 RSS 聚合 |
| 统计 | 阅读量、字数、访客、在线人数、来源、访客地图 |
| 设置 | 多语言、时区、SEO、邮件、媒体、安全、第三方服务 |

## 快速开始

已有 Docker 环境时，一行命令安装：

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | bash
```

需要自动配置 HTTPS 时：

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | DOMAIN=blog.yoursite.com bash
```

安装完成后，按终端输出访问后台，创建管理员账号，然后在后台完成站点基础配置。

## Docker 镜像

Utterlog 生产镜像同时发布到 GitHub Container Registry 和一方镜像源：

| 组件 | GHCR | 一方镜像源 |
|---|---|---|
| API | `ghcr.io/utterlog/utterlog-api` | `registry.utterlog.io/utterlog/utterlog-api` |
| Web | `ghcr.io/utterlog/utterlog-web` | `registry.utterlog.io/utterlog/utterlog-web` |

安装脚本默认优先使用 `registry.utterlog.io`，也可以切换到 GHCR。

> GHCR 和 `registry.utterlog.io` 目前不向 shields.io 暴露公开拉取次数。Docker Hub 镜像同步启用后，README 顶部预留的 Docker pulls 徽章可以直接打开。

## 文档与链接

- 在线演示：[demo.utterlog.io](https://demo.utterlog.io)
- 产品主页：[utterlog.io](https://utterlog.io)
- 安装指南：[INSTALL.md](INSTALL.md)
- 反代和部署：[deploy/README.md](deploy/README.md)
- 更新日志：[CHANGELOG.md](CHANGELOG.md)
- WordPress 导入插件：[utterlog-sync](https://github.com/utterlog/utterlog-sync)

## License

Utterlog 使用 [MIT License](LICENSE) 发布。
