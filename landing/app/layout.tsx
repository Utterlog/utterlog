import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Utterlog — 去中心化独立博客联盟',
  description:
    'Utterlog 是一个去中心化的独立博客联盟。每个站点各自部署、各自掌控数据，通过 utterlog.com 联盟中心站互相发现、互关互访。Go + Postgres，单容器部署，开源自托管。',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
  openGraph: {
    title: 'Utterlog — 去中心化独立博客联盟',
    description:
      '每个站点各自部署、各自掌控数据。一行命令安装，Docker 一键部署。',
    url: 'https://utterlog.io',
    siteName: 'Utterlog',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Utterlog — 去中心化独立博客联盟',
    description: '每个站点各自部署，通过联盟互相发现与互通。',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          rel="stylesheet"
          href="https://icons.bluecdn.com/fontawesome-pro/css/all.min.css"
        />
        {/* Ubuntu — Utterlog brand font, self-hosted from /fonts/ */}
        <link rel="preload" as="font" type="font/woff2" href="/fonts/ubuntu-500.woff2" crossOrigin="" />
        <link rel="stylesheet" href="/fonts/ubuntu.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
