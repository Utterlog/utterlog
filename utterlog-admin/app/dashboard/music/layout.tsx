'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/dashboard/music', label: '音乐' },
  { href: '/dashboard/music/playlists', label: '歌单' },
];

export default function MusicLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)', marginBottom: '20px' }}>
        {tabs.map(tab => {
          const isActive = tab.href === '/dashboard/music'
            ? pathname === '/dashboard/music'
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
