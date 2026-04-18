import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Utterlog 文档', template: '%s — Utterlog 文档' },
  description: 'Utterlog — 去中心化独立博客联盟的完整文档。',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="stylesheet" href="https://icons.bluecdn.com/fontawesome-pro/css/all.min.css" />
        <link rel="stylesheet" href="https://utterlog.io/fonts/ubuntu.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
