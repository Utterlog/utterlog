import type { Metadata } from 'next';
import BlogHeader from '@/components/blog/BlogHeader';

export const metadata: Metadata = {
  title: '说说 | Utterlog!',
  description: '随想随记',
};

export default function MomentsLayout({
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
