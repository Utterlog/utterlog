import type { Metadata } from 'next';
import BlogHeader from '@/components/blog/BlogHeader';

export const metadata: Metadata = {
  title: '订阅 | Utterlog!',
  description: '来自友链的最新文章',
};

export default function FeedsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ background: '#f2f0eb', color: '#2b2a28' }}>
      <BlogHeader />
      {children}
    </div>
  );
}
