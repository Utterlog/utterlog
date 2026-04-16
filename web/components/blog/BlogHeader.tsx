'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

const defaultNavItems = [
  { href: '/', label: '首页' },
  { href: '/moments', label: '说说' },
  { href: '/music', label: '音乐' },
  { href: '/movies', label: '电影' },
  { href: '/books', label: '图书' },
  { href: '/goods', label: '好物' },
  { href: '/feeds', label: '订阅' },
  { href: '/about', label: '关于' },
];

export default function BlogHeader() {
  const pathname = usePathname();
  const [navItems, setNavItems] = useState(defaultNavItems);

  useEffect(() => {
    fetch(`${API}/options`).then(r => r.json()).then(r => {
      const data = r.data || r;
      if (data.menu_header || data.menu_items) {
        try {
          const items = typeof data.menu_header || data.menu_items === 'string' ? JSON.parse(data.menu_header || data.menu_items) : data.menu_header || data.menu_items;
          if (Array.isArray(items) && items.length > 0) setNavItems(items);
        } catch {}
      }
    }).catch(() => {});
  }, []);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 bg-main/80 backdrop-blur-md border-b border-line">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 24px' }}>
        <div className="flex items-center justify-between h-16">
          {/* Logo / 站名 */}
          <Link
            href="/"
            className="font-logo text-xl text-main hover:text-primary-themed transition-colors"
          >
            Utterlog
          </Link>

          {/* 桌面导航 */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  isActive(item.href)
                    ? 'text-primary-themed font-medium bg-soft'
                    : 'text-sub hover:text-main hover:bg-soft'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* 移动端菜单按钮 */}
          <button
            type="button"
            className="md:hidden p-2 text-sub hover:text-main"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <i className="fa-solid fa-xmark" style={{ fontSize: '20px' }} /> : <i className="fa-solid fa-bars" style={{ fontSize: '20px' }} />}
          </button>
        </div>

        {/* 移动端导航 */}
        {mobileMenuOpen && (
          <nav className="md:hidden pb-4 border-t border-line pt-3 flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`px-3 py-2 text-sm rounded-md transition-colors ${
                  isActive(item.href)
                    ? 'text-primary-themed font-medium bg-soft'
                    : 'text-sub hover:text-main hover:bg-soft'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
