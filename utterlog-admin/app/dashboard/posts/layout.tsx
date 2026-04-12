'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/dashboard/posts', label: '文章' },
  { href: '/dashboard/posts/categories', label: '分类' },
  { href: '/dashboard/posts/tags', label: '标签' },
];

export default function PostsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Don't show tabs on create/edit pages
  const isSubPage = pathname.includes('/create') || pathname.includes('/edit/');
  if (isSubPage) return <>{children}</>;

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)', marginBottom: '20px' }}>
        {tabs.map(tab => {
          const isActive = tab.href === '/dashboard/posts'
            ? pathname === '/dashboard/posts'
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-sub)',
                borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                textDecoration: 'none',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
