import Header from './Header';
import Footer from './Footer';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f8', color: '#202020', fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif' }}>
      <Header />
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
