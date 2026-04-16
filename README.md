# Utterlog

A modern, self-hosted blogging platform built with Go + Next.js. Features a theme system, AI assistant, federation, and storyboard-style moments.

## Features

- **Theme System** — Switchable themes (Utterlog2026, Lared, Westlife), user-uploadable themes
- **Storyboard Moments** — Scattered card layout for micro-posts with image upload, keyword tags
- **RSS Subscriptions** — Follow sites, aggregate feeds into a storyboard view
- **Comment System** — Threaded comments with Gravatar, country flags, browser/OS detection
- **AI Assistant** — Built-in AI chat with multi-provider support
- **Music Player** — 4 skins: Fullscreen, VinylCard, MiniBar, FloatingCard
- **Federation** — Cross-site following, mutual follow, webhook notifications
- **Telegram Bot** — Publish moments, moderate comments, receive notifications
- **Media Management** — Local/S3/R2 storage, WebP conversion, TinyPNG compression

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19.2, Tailwind v4, TypeScript 6.0 |
| Backend | Go 1.26.2, PostgreSQL 18, Redis 8 |
| Runtime | Node.js 25 |

## Project Structure

```
utterlog/
├── web/                     # Frontend (Next.js)
│   ├── app/
│   │   ├── (blog)/          # Blog pages (theme-aware)
│   │   ├── dashboard/       # Admin dashboard
│   │   ├── moments/         # Storyboard moments
│   │   └── feeds/           # RSS subscription feed
│   ├── themes/
│   │   ├── Utterlog2026/    # Default theme
│   │   ├── Lared/           # Minimal, red accent
│   │   └── Westlife/        # Elegant, blue accent
│   ├── plugins/             # Plugin directory
│   ├── components/
│   │   ├── blog/            # Comments, posts, pagination
│   │   ├── layout/          # Dashboard sidebar, header
│   │   ├── ui/              # Button, Input, Toggle, Modal...
│   │   └── icons/           # Custom SVG icons
│   └── lib/                 # API clients, stores, theme loader
│
├── api/                     # Backend (Go)
│   ├── internal/
│   │   ├── handler/         # HTTP handlers
│   │   ├── model/           # Data models
│   │   └── middleware/      # Auth, CORS, rate limiting
│   ├── config/              # Configuration
│   └── main.go
│
└── uploads/                 # Shared upload directory
```

## Quick Install (Docker)

```bash
git clone https://github.com/<you>/utterlog.git
cd utterlog
cp .env.example .env          # edit DB_PASSWORD and JWT_SECRET
docker compose up -d
```

Open **http://localhost:3000** — you'll be auto-redirected to `/install` for a 3-step wizard (admin → site info → done). Postgres creates the DB, the API auto-loads `api/schema.sql` on first boot.

See [INSTALL.md](./INSTALL.md) for bare-metal install, troubleshooting, and schema regeneration.

## Manual (no Docker)

### Prerequisites
- Go 1.21+ · Node.js 18+ · PostgreSQL 15+ · Redis (optional)

### Backend

```bash
cd api
cp .env.example .env     # Edit database credentials
psql -U <user> -d utterlog < schema.sql
go run main.go           # http://localhost:8080
```

### Frontend

```bash
cd web
npm install
cp .env.example .env.local
npm run dev              # http://localhost:3000
```

### Environment

```env
# web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1

# api/.env
APP_URL=http://localhost:8080
PORT=8080
DB_HOST=localhost
DB_NAME=utterlog
DB_USER=your_user
```

## Themes

Themes live in `web/themes/{ThemeName}/`:

```
themes/MyTheme/
├── theme.json    # Manifest
├── index.ts      # Component exports
├── Layout.tsx
├── Header.tsx
├── Footer.tsx
├── HomePage.tsx
├── PostPage.tsx
└── PostCard.tsx
```

Switch themes from Dashboard > Themes.

## Deployment

Use Nginx to reverse proxy both services under one domain:

```
yourdomain.com/          → Next.js (port 3000)
yourdomain.com/api/      → Go API (port 8080)
yourdomain.com/uploads/  → Static uploads directory
```

Frontend `.env` for production:
```env
NEXT_PUBLIC_API_URL=/api/v1
```

## License

MIT
