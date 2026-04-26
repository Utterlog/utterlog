'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useThemeContext } from '@/lib/theme-context';

const defaultNavItems = [
  { href: '/', label: '首页' },
  { href: '/archives', label: '归档' },
  { href: '/moments', label: '说说' },
  { href: '/feeds', label: '订阅' },
  { href: '/about', label: '关于' },
];

export default function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { menus, site } = useThemeContext();
  const navItems = menus.header?.length ? menus.header : defaultNavItems;
  const siteName = site.title || 'Utterlog';

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header style={{
      background: '#fff', borderBottom: '1px solid #e9e9e9',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <div style={{
        maxWidth: '1280px', margin: '0 auto', padding: '0 40px',
        height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo — uploaded image takes precedence over text title.
            Empty site.logo (= admin hasn't uploaded one) falls back to
            the original text-only lockup so the minimal Utterlog look
            is preserved out of the box. Image height is capped to
            roughly the header's vertical padding so different
            aspect-ratio uploads (square favicon-style or wide
            wordmark) both fit without manual tuning. */}
        <Link href="/" className="site-title" style={{
          textDecoration: 'none', fontSize: '22px', fontWeight: 700,
          color: '#202020', letterSpacing: '-0.02em',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          {site.logo ? (
            <img
              src={site.logo}
              alt={siteName}
              style={{ height: '28px', maxWidth: '180px', objectFit: 'contain', display: 'block' }}
            />
          ) : (
            siteName
          )}
        </Link>

        {/* Desktop nav */}
        <nav style={{ display: 'flex', gap: '4px', alignItems: 'center' }} className="hidden md:flex">
          {navItems.map(item => (
            <Link key={item.href} href={item.href} style={{
              padding: '6px 14px', fontSize: '14px', borderRadius: '8px',
              color: isActive(item.href) ? '#3368d9' : '#6b7280',
              background: isActive(item.href) ? 'rgba(51,104,217,0.08)' : 'transparent',
              textDecoration: 'none', fontWeight: isActive(item.href) ? 600 : 400,
              transition: 'all 0.2s',
            }}>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile toggle */}
        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', color: '#6b7280' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden" style={{ background: '#fff', borderBottom: '1px solid #e9e9e9', padding: '8px 40px 16px' }}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
              style={{ display: 'block', padding: '10px 0', fontSize: '15px', color: isActive(item.href) ? '#3368d9' : '#6b7280', textDecoration: 'none' }}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
