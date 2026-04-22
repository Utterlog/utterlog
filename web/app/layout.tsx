import './globals.css';
import { Providers } from './providers';
import { getOptions } from '@/lib/blog-api';

export async function generateMetadata() {
  let favicon = '/favicon.ico';
  let title = 'Utterlog!';
  let description = '一个简洁优雅的博客';
  try {
    const optRes: any = await getOptions();
    const opts = optRes.data || optRes || {};
    if (opts.site_favicon) favicon = opts.site_favicon;
    if (opts.site_title) title = opts.site_title;
    if (opts.site_description) description = opts.site_description;
  } catch {}
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
