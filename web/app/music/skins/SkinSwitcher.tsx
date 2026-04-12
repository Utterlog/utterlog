'use client';

import React from 'react';
import type { SkinType } from '../hooks/usePlayer';

const skins: { id: SkinType; label: string; icon: React.ReactNode }[] = [
  {
    id: 'fullscreen', label: '全屏',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  },
  {
    id: 'vinyl-card', label: '黑胶',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>,
  },
  {
    id: 'mini-bar', label: '迷你',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="16" width="20" height="5" rx="2"/><line x1="6" y1="18.5" x2="6.01" y2="18.5"/><line x1="10" y1="18.5" x2="18" y2="18.5"/></svg>,
  },
  {
    id: 'floating', label: '浮窗',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="10" y="8" width="12" height="12" rx="2"/><path d="M6 16H4a2 2 0 01-2-2V4a2 2 0 012-2h10a2 2 0 012 2v2"/></svg>,
  },
];

export function SkinSwitcher({ skin, setSkin }: { skin: SkinType; setSkin: (s: SkinType) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', padding: '2px' }}>
      {skins.map(s => (
        <button
          key={s.id}
          onClick={() => setSkin(s.id)}
          title={s.label}
          style={{
            background: skin === s.id ? 'rgba(255,255,255,0.15)' : 'none',
            border: 'none', cursor: 'pointer', padding: '5px 7px',
            color: skin === s.id ? '#fff' : 'rgba(255,255,255,0.4)',
            borderRadius: '4px', display: 'flex', alignItems: 'center',
            transition: 'all 0.2s',
          }}
        >
          {s.icon}
        </button>
      ))}
    </div>
  );
}
