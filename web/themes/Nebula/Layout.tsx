import Header from './Header';
import Footer from './Footer';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="blog-shell nebula-theme">
      <Header />
      <main className="blog-main nebula-main">
        <div className="nebula-frame">
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}
