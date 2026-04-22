import './globals.css';
import { Providers } from './providers';

const API_BASE = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || '';

// Resolves <title>, description, and favicon from site options at runtime.
// During `next build` (docker image build) there's no API running and
// INTERNAL_API_URL is blank — we skip the fetch entirely so prerender
// doesn't hang. At runtime ISR takes over and refreshes these every 60s.
export async function generateMetadata() {
  let favicon = '/favicon.ico';
  let title = 'Utterlog!';
  let description = '一个简洁优雅的博客';
  if (API_BASE) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 2000);
      const res = await fetch(`${API_BASE}/options`, { next: { revalidate: 60 }, signal: ac.signal });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        const opts = json.data || json || {};
        if (opts.site_favicon) favicon = opts.site_favicon;
        if (opts.site_title) title = opts.site_title;
        if (opts.site_description) description = opts.site_description;
      }
    } catch {}
  }
  return {
    title,
    description,
    icons: { icon: favicon, shortcut: favicon, apple: favicon },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.bluecdn.com" crossOrigin="anonymous" />
        <link href="https://fonts.bluecdn.com/css2?family=Fugaz+One&family=Ubuntu:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet" />
        {/* Font Awesome Pro 7.2 */}
        <link rel="stylesheet" href="https://icons.bluecdn.com/fontawesome-pro/css/all.min.css" />
      </head>
      <body className="font-sans antialiased bg-page text-primary">
        {/* Squircle clip-path (matches Utterlog logo shape) */}
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <clipPath id="squircle" clipPathUnits="objectBoundingBox">
              <path d="M0.5 0C0.9 0 1 0.1 1 0.5 1 0.9 0.9 1 0.5 1 0.1 1 0 0.9 0 0.5 0 0.1 0.1 0 0.5 0Z" />
            </clipPath>
          </defs>
        </svg>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
