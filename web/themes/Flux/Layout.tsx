'use client';

import { useEffect } from 'react';
import Header from './Header';
import Footer from './Footer';

export default function Layout({ children }: { children: React.ReactNode }) {
  // Apply Flux theme scope to <html> so design tokens activate
  useEffect(() => {
    const prev = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = 'Flux';
    return () => {
      if (prev !== undefined) document.documentElement.dataset.theme = prev;
      else delete document.documentElement.dataset.theme;
    };
  }, []);

  return (
    <div
      className="blog-shell flux-theme"
      style={{
        display: 'flex', flexDirection: 'column', minHeight: '100vh',
        background: '#FFFFFF', color: '#171717',
        fontFamily: 'Matter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      <Header />
      <main className="blog-main" style={{ flex: 1 }}>
        <div className="flux-container" style={{ paddingTop: 40, paddingBottom: 80 }}>
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
