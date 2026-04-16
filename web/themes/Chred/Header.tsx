'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useThemeContext } from '@/lib/theme-context';

const defaultNavItems = [
  { href: '/', label: '首页' },
  { href: '/about', label: '关于' },
  { href: '/archives', label: '归档' },
  { href: '/moments', label: '说说' },
  { href: '/links', label: '链接' },
  { href: '/themes', label: '主题' },
];

export default function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { menus, site } = useThemeContext();
  const navItems = menus.header?.length ? menus.header : defaultNavItems;

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid #e5e5e5',
    }}>
      <div style={{
        maxWidth: '1400px', margin: '0 auto', height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="#f53004" />
            <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
          </svg>
          <span style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.02em' }}>西风</span>
        </Link>

        {/* Center Nav */}
        <nav style={{ display: 'flex', gap: '0', alignItems: 'center' }} className="hidden md:flex">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: '16px 14px', fontSize: '14px',
                color: isActive(item.href) ? '#f53004' : '#555',
                textDecoration: 'none', fontWeight: isActive(item.href) ? 600 : 400,
                transition: 'color 0.15s',
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} className="hidden md:flex">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" style={{ position: 'absolute', left: '10px' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && searchQuery) window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`; }}
              placeholder="搜索文章..."
              style={{
                width: '180px', padding: '7px 12px 7px 32px', fontSize: '13px',
                border: '1px solid #e0e0e0',
                background: '#f8f8f8', color: '#333', outline: 'none',
                transition: 'border-color 0.15s, width 0.2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#f53004'; e.currentTarget.style.width = '220px'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e0e0e0'; e.currentTarget.style.width = '180px'; }}
            />
            <kbd style={{
              position: 'absolute', right: '8px',
              padding: '1px 5px', fontSize: '10px', color: '#aaa',
              border: '1px solid #ddd', background: '#fff',
              lineHeight: '16px',
            }}>⌘K</kbd>
          </div>
        </div>

        {/* Mobile toggle */}
        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2">
            {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden" style={{ background: '#fff', borderBottom: '1px solid #e5e5e5', padding: '12px 24px' }}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
              style={{ display: 'block', padding: '10px 0', fontSize: '15px', color: isActive(item.href) ? '#f53004' : '#333', textDecoration: 'none', borderBottom: '1px solid #f0f0f0' }}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
