'use client';

import Link from 'next/link';
import { useThemeContext } from '@/lib/theme-context';

/**
 * Flux Header — Stripe Link inspired
 * Flat, borderless, logo + nav + single CTA pill at right.
 */
export default function Header() {
  const ctx = useThemeContext();
  const siteTitle = ctx.site.title || 'Utterlog';

  // Primary nav — reads header menu if configured; otherwise default links
  const navItems = ctx.menus?.header?.length
    ? ctx.menus.header
    : [
        { href: '/', label: '首页' },
        { href: '/moments', label: '说说' },
        { href: '/archives', label: '归档' },
        { href: '/links', label: '友链' },
      ];

  return (
    <header className="flux-container">
      <div
        className="flux-header"
        style={{
          height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        {/* Brand lockup */}
        <Link href="/" className="flux-brand" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <div
            className="flux-logo"
            aria-hidden
            style={{
              width: 26, height: 26, borderRadius: 9999,
              background: '#00C767',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#034F28',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 6l6 6-6 6" stroke="#034F28" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span
            className="flux-brand-text"
            style={{ fontSize: 16, fontWeight: 500, color: '#011E0F', letterSpacing: 0 }}
          >
            {siteTitle}
          </span>
        </Link>

        {/* Nav + CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {navItems.map((item: any) => (
              <Link
                key={item.href}
                href={item.href}
                className="flux-nav-link"
                style={{
                  fontSize: 14, fontWeight: 500, color: '#011E0F',
                  textDecoration: 'none', transition: 'color 0.15s',
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Single CTA pill on right — subtle neutral */}
          <Link
            href="/feed"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              height: 40, padding: '6px 24px',
              fontSize: 14, fontWeight: 500,
              color: '#011E0F',
              background: '#F5F5F5',
              border: '1px solid #E5E5E5',
              borderRadius: 10,
              textDecoration: 'none',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#EBEBEB'; e.currentTarget.style.borderColor = '#D4D4D4'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#F5F5F5'; e.currentTarget.style.borderColor = '#E5E5E5'; }}
          >
            订阅
          </Link>
        </div>
      </div>
    </header>
  );
}
