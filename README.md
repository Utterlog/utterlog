# Utterlog

A modern, self-hosted blogging platform built with Go + Next.js. Features a theme system, AI assistant, federation, and storyboard-style moments.

## Features

- **Theme System** — Switchable themes (Utterlog2026, Lared, Westlife), user-uploadable themes
- **Storyboard Moments** — Scattered card layout for micro-posts with image upload, keyword tags
- **RSS Subscriptions** — Follow sites, aggregate feeds into a storyboard view
- **Comment System** — Threaded comments with Gravatar, country flags, browser/OS detection
- **AI Assistant** — Built-in AI chat with multi-provider support (8 presets)
- **Music Player** — 4 skins: Fullscreen, VinylCard, MiniBar, FloatingCard
- **Federation** — Cross-site following, mutual follow, webhook notifications
- **Telegram Bot** — Publish moments, moderate comments, receive notifications
- **Media Management** — Local/S3/R2 storage, WebP conversion, TinyPNG compression

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind v4, TypeScript |
| Backend | Go (Gin), PostgreSQL 17, Redis 8 |
| CDN | Cloudflare, bluecdn.com (fonts, gravatar, favicon, icons) |
| Hosting | Hetzner, 1Panel + OpenResty |

## Project Structure

```
utterlog/
├── utterlog-admin/          # Frontend (Next.js 16)
│   ├── app/                 # App Router
│   │   ├── (blog)/          # Blog frontend (theme-aware)
│   │   ├── dashboard/       # Admin dashboard
│   │   ├── moments/         # Storyboard moments
│   │   └── feeds/           # RSS subscription feed
│   ├── themes/              # Theme directory
│   │   ├── Utterlog2026/    # Default theme
│   │   ├── Lared/           # Minimal, red accent
│   │   └── Westlife/        # Elegant, blue accent
│   ├── plugins/             # Plugin directory
│   ├── components/          # Shared components
│   │   ├── blog/            # Blog components (comments, posts)
│   │   ├── layout/          # Dashboard layout
│   │   ├── ui/              # UI library (Button, Input, Toggle, Modal...)
│   │   └── icons/           # Custom SVG icons
│   └── lib/                 # API clients, stores, theme loader
│
├── utterlog-go/             # Backend (Go)
│   ├── internal/
│   │   ├── handler/         # HTTP handlers
│   │   ├── model/           # Data models
│   │   └── middleware/      # Auth, CORS, rate limiting
│   ├── config/              # Configuration
│   └── main.go              # Entry point
│
├── Lared/                   # WordPress Lared theme (reference)
├── Westlife/                # WordPress Westlife theme (reference)
└── LiMhy_v3.0_正式版/       # LiMhy blog system (reference)
```

## Getting Started

### Prerequisites
- Go 1.21+
- Node.js 18+
- PostgreSQL 17
- Redis (optional)

### Backend

```bash
cd utterlog-go
cp .env.example .env     # Edit database credentials
go run main.go           # http://localhost:8080
```

### Frontend

```bash
cd utterlog-admin
npm install
cp .env.example .env.local
npm run dev              # http://localhost:3000
```

### Environment

```bash
# utterlog-admin/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1

# utterlog-go/.env
APP_URL=http://localhost:8080
PORT=8080
DB_HOST=localhost
DB_NAME=utterlog
DB_USER=your_user
```

## Dashboard

The admin dashboard at `/dashboard` includes:
- Post management (create, edit, categories, tags)
- Page management (10 templates)
- Moments (keyword tags, image upload, storyboard)
- Music management (playlists, 4 player skins)
- Comment moderation
- Friend links (categories, RSS, favicon)
- Media library (local/S3/R2)
- Theme switching
- AI assistant & settings
- Security (2FA, Passkey, rate limiting)
- System settings (7 tabs)

## Themes

Themes live in `themes/{ThemeName}/`:

```
themes/MyTheme/
├── theme.json    # Manifest
├── index.ts      # Component exports
├── Layout.tsx    # Page layout
├── Header.tsx    # Site header
├── Footer.tsx    # Site footer
├── HomePage.tsx  # Homepage
├── PostPage.tsx  # Single post
└── PostCard.tsx  # Post list item
```

Switch active theme from Dashboard > Themes.

## License

MIT
