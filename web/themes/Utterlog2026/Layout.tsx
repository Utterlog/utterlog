import BlogHeader from '@/components/blog/BlogHeader';
import BlogFooter from '@/components/blog/BlogFooter';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-main text-main">
      <BlogHeader />
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 24px' }}>
        {children}
      </main>
      <BlogFooter />
    </div>
  );
}
