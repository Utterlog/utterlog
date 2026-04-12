import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Utterlog!',
  description: '一个简洁优雅的博客',
};

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
      </head>
      <body className="font-sans antialiased bg-page text-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
