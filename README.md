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

<!-- Docker Hub pull-count badges can be enabled after Docker Hub mirrors exist.
<p>
  <a href="https://hub.docker.com/r/utterlog/utterlog-api">
    <img src="https://img.shields.io/docker/pulls/utterlog/utterlog-api?style=flat-square&logo=docker&label=api%20pulls" alt="Docker API pulls">
  </a>
  <a href="https://hub.docker.com/r/utterlog/utterlog-web">
    <img src="https://img.shields.io/docker/pulls/utterlog/utterlog-web?style=flat-square&logo=docker&label=web%20pulls" alt="Docker Web pulls">
  </a>
</p>
-->

<p>
  <a href="https://demo.utterlog.io"><img src="https://img.shields.io/badge/Live%20Demo-demo.utterlog.io-22c55e?style=for-the-badge&logo=safari&logoColor=white" alt="Live Demo" height="38"></a>
  <a href="https://utterlog.io"><img src="https://img.shields.io/badge/Website-utterlog.io-3b82f6?style=for-the-badge&logo=hugo&logoColor=white" alt="Website" height="38"></a>
  <a href="https://github.com/utterlog/utterlog/releases"><img src="https://img.shields.io/badge/Download-Latest%20Release-0f172a?style=for-the-badge&logo=github&logoColor=white" alt="Latest Release" height="38"></a>
</p>

Utterlog is a self-hosted publishing platform for independent writers, bloggers, makers, and small communities.

It gives you a complete personal content hub: long-form posts, custom pages, themes, comments, links, albums, footprints, RSS subscriptions, AI writing tools, analytics, and site settings in one place.

中文介绍：Utterlog 是为独立作者准备的一体化内容平台。它不只是博客程序，还可以管理页面、评论、友链、相册、足迹、RSS 订阅、AI 辅助写作和站点数据。

## Why Utterlog

- **Own your content**: run your site on your own server, with your own domain and your own data.
- **Built for real blogs**: posts, pages, categories, tags, feeds, permalinks, archives, comments, media, SEO, and backups are first-class features.
- **More than articles**: publish albums, moments, reading lists, movies, music, goods, videos, travel footprints, and friend links.
- **AI where it helps**: generate summaries, tags, slugs, cover prompts, formatting suggestions, comment replies, and article Q&A without turning the product into an AI toy.
- **Theme-driven publishing**: switch between built-in themes, configure menus and buttons, and keep your content independent from presentation.
- **Self-hosting friendly**: one install command, Docker-based deployment, single public entry port behind your reverse proxy.

## Product Highlights

### Publishing

Write posts and pages with Markdown, HTML fragments, cover images, excerpts, categories, tags, public post numbers, and custom permalink structures.

Utterlog automatically serves article pages, category pages, tag pages, archive pages, RSS feeds, sitemap, robots.txt, and SEO metadata.

### Themes

Utterlog ships with multiple built-in themes, including Azure, Utterlog, Flux, and Chred. Themes can declare their own menu locations, sidebars, footer buttons, search controls, and page styles.

You can switch themes from the admin panel, upload your logo and favicon, set custom buttons, and keep the writing experience separated from the visual layer.

### Comments and Interaction

The comment system supports nested replies, moderation, email notifications, avatars, country flags, browser and OS labels, captcha, visitor metadata, and admin replies.

Readers can also leave paragraph-level annotations, which is useful for tutorials, translations, prompts, notes, and long-form discussions.

### AI Assistant

Utterlog includes AI tools for summaries, keywords, slugs, formatting, cover prompts, batch generation, smart comment review, and smart replies.

On the public site, you can enable article-level AI reading assistance or a site-wide chat bubble that helps visitors explore your content.

### Footprints and Collections

Mark posts with countries or cities and generate a footprint page with a map and travel timeline. Post hero images can display related country flags.

Utterlog also includes albums, music, movies, books, games, goods, and videos, so personal collections can live beside your writing instead of being scattered across platforms.

### Links and RSS

Friend links support categories, icons, avatars, descriptions, RSS addresses, and multiple display modes. Categories can be displayed as rich cards or compact icon grids.

The feeds page can aggregate RSS from your links, turning your site into a small personal reading hub.

### Analytics and Site Operations

The admin dashboard includes post stats, comments, visits, online users, referrers, visitor locations, recent visitors, word counts, cache actions, media settings, language, timezone, email, security, and third-party service configuration.

## Feature Overview

| Area | Capabilities |
|---|---|
| Writing | Markdown, pages, excerpts, covers, categories, tags, permalinks, public post numbers |
| Themes | Built-in themes, custom menus, sidebar navigation, footer buttons, logo and favicon |
| Comments | Nested replies, moderation, email notifications, captcha, avatars, country flags |
| AI | Summaries, tags, slugs, formatting, cover prompts, smart replies, AI reader chat |
| Footprints | Country/city markers, Mapbox map, travel timeline, post flags |
| Links | Link categories, icons, avatars, RSS, card and icon display modes |
| Collections | Albums, music, movies, books, games, goods, videos |
| Feeds | RSS output, subscription page, friend-link feed aggregation |
| Analytics | Views, words, visitors, online users, referrers, visitor map |
| Settings | Language, timezone, SEO, email, media, security, third-party services |

## Quick Start

Install Utterlog on a server with Docker:

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | bash
```

Install with automatic HTTPS:

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | DOMAIN=blog.yoursite.com bash
```

After installation, open the URL printed by the installer, create the admin account, and finish site setup in the admin panel.

## Documentation

- Live demo: [demo.utterlog.io](https://demo.utterlog.io)
- Product site: [utterlog.io](https://utterlog.io)
- Installation guide: [INSTALL.md](INSTALL.md)
- Reverse proxy and deployment notes: [deploy/README.md](deploy/README.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- WordPress import plugin: [utterlog-sync](https://github.com/utterlog/utterlog-sync)

## Container Images

Utterlog publishes production images to both GitHub Container Registry and the first-party registry:

| Component | GHCR | First-party registry |
|---|---|---|
| API | `ghcr.io/utterlog/utterlog-api` | `registry.utterlog.io/utterlog/utterlog-api` |
| Web | `ghcr.io/utterlog/utterlog-web` | `registry.utterlog.io/utterlog/utterlog-web` |

The installer uses the first-party registry by default and can fall back to GHCR.

> Docker pull count badges are only reliable for Docker Hub repositories. Utterlog currently publishes to GHCR and `registry.utterlog.io`, which do not expose public pull-count metrics through shields.io.

## License

Utterlog is released under the [MIT License](LICENSE).
