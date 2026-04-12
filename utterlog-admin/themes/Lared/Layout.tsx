import Header from './Header';
import Footer from './Footer';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#000', fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif' }}>
      <Header />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px' }}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
