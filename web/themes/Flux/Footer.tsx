'use client';

import { useThemeContext } from '@/lib/theme-context';

export default function Footer() {
  const ctx = useThemeContext();
  const siteName = ctx.site.title || 'Utterlog';
  const year = new Date().getFullYear();

  return (
    <footer style={{ borderTop: '1px solid #E5E5E5', marginTop: 80 }}>
      <div
        className="flux-container"
        style={{
          padding: '48px 64px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 24,
        }}
      >
        {/* Brand lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 22, height: 22, borderRadius: 9999,
              background: '#00C767',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M9 6l6 6-6 6" stroke="#034F28" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#011E0F' }}>{siteName}</span>
        </div>

        <div style={{ fontSize: 14, color: '#737373' }}>
          © {year} {siteName}. Powered by{' '}
          <a
            href="https://utterlog.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#737373', textDecoration: 'none', borderBottom: '1px dotted #D4D4D4' }}
          >
            Utterlog
          </a>
        </div>
      </div>
    </footer>
  );
}
