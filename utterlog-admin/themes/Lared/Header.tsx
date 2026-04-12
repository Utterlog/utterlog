'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navItems = [
  { href: '/', label: '首页' },
  { href: '/moments', label: '说说' },
  { href: '/feeds', label: '订阅' },
  { href: '/about', label: '关于' },
];

export default function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
      borderBottom: '1px solid #d9d9d9', height: '64px',
    }}>
      <div style={{
        maxWidth: '1400px', margin: '0 auto', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', borderLeft: '1px solid #d9d9d9', borderRight: '1px solid #d9d9d9',
      }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="#f53004" />
            <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
          </svg>
          <span style={{ fontSize: '18px', fontWeight: 700, color: '#000', letterSpacing: '-0.02em' }}>Utterlog</span>
        </Link>

        {/* Desktop Nav */}
        <nav style={{ display: 'flex', gap: '0', alignItems: 'center' }} className="hidden md:flex">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: '8px 16px', fontSize: '14px',
                color: isActive(item.href) ? '#f53004' : '#555',
                textDecoration: 'none', fontWeight: isActive(item.href) ? 600 : 400,
                borderBottom: isActive(item.href) ? '2px solid #f53004' : '2px solid transparent',
                transition: 'color 0.2s',
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile toggle */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2">
            {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden" style={{ background: '#fff', borderBottom: '1px solid #d9d9d9', padding: '12px 24px' }}>
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
