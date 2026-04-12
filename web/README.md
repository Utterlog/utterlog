# Utterlog

A modern, self-hosted blogging platform with a theme system, AI assistant, and federation support.

## Features

- **Theme System** - Switchable themes (Utterlog2026, Lared, Westlife), plugin architecture
- **Moments (Storyboard)** - Scattered card layout for micro-posts with image upload
- **RSS Subscriptions** - Follow sites, aggregate feeds into storyboard view
- **Comment System** - Threaded comments with Gravatar, country flags, browser/OS detection
- **AI Assistant** - Built-in AI chat with multi-provider support
- **Music Player** - 4 skins (Fullscreen, VinylCard, MiniBar, FloatingCard)
- **Federation** - Cross-site following, mutual follow detection, webhook notifications
- **Telegram Bot** - Publish moments, moderate comments, receive notifications
- **Media Management** - Local/S3/R2 storage, image processing, TinyPNG integration

## Tech Stack

- **Frontend**: Next.js 16 + React 19 + Tailwind v4
- **Backend**: Go (Gin) + PostgreSQL 17 + Redis
- **CDN**: Cloudflare + bluecdn.com (fonts, icons, gravatar, favicon proxy)

## Project Structure

```
utterlog-admin/
  app/                   # Next.js app router
    (blog)/              # Blog frontend (theme-aware)
    dashboard/           # Admin dashboard
    moments/             # Moments storyboard page
    feeds/               # RSS subscription page
  themes/                # Theme directory
    Utterlog2026/        # Default theme
    Lared/               # Minimal content-focused theme
    Westlife/            # Elegant card-based theme
  plugins/               # Plugin directory (extensible)
  components/
    blog/                # Shared blog components
    layout/              # Dashboard layout components
    ui/                  # UI component library
    icons/               # Custom SVG icons
  lib/
    api.ts               # Authenticated API client
    blog-api.ts          # Public blog API (SSR)
    theme.ts             # Theme loader & registry
    store.ts             # Zustand stores
utterlog-go/             # Go backend
```

## Themes

Each theme lives in `themes/{ThemeName}/` with:
- `theme.json` - Manifest (name, version, description, colors)
- Component exports: Header, Footer, Layout, HomePage, PostPage, PostCard

Switch themes from Dashboard > Themes.

## Development

```bash
# Frontend
cd utterlog-admin
npm install
npm run dev          # http://localhost:3000

# Backend
cd utterlog-go
go run main.go       # http://localhost:8080
```

## Environment

```bash
# utterlog-admin/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
```

## License

MIT
