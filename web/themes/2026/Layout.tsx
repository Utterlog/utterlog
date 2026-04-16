import BlogHeader from '@/components/blog/BlogHeader';
import BlogFooter from '@/components/blog/BlogFooter';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="blog-shell bg-main text-main" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <BlogHeader />
      <main className="blog-main" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 24px' }}>
          {children}
        </div>
        <div style={{ flexShrink: 0 }}>
          <BlogFooter />
        </div>
      </main>
    </div>
  );
}
