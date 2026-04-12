'use client';

import { useState } from 'react';
import { Search, MusicNote } from '@/components/icons';
import type { SkinProps } from '../hooks/usePlayer';
import { SearchDrawer } from './FullscreenSkin';
import { SkinSwitcher } from './SkinSwitcher';

export default function MiniBarSkin(p: SkinProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0a0a0e', color: '#fff', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column' }}>
      {/* Blurred BG */}
      {p.song?.cover && <div style={{ position: 'absolute', inset: '-50%', width: '200%', height: '200%', backgroundImage: `url(${p.song.cover})`, backgroundSize: '40%', backgroundPosition: 'center', filter: 'blur(150px)', opacity: 0.15 }} />}

      {/* Top bar */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', flexShrink: 0 }}>
        <a href="/" title="首页" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', padding: '4px', display: 'flex' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SkinSwitcher skin={p.skin} setSkin={p.setSkin} />
          <button onClick={() => p.setShowSearch(!p.showSearch)} title="搜索" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'rgba(255,255,255,0.5)' }}>
            <Search size={18} />
          </button>
        </div>
      </div>

      <SearchDrawer {...p} />

      {/* Main content: playlist */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, overflow: 'auto', padding: '0 24px 100px', maxWidth: '800px', width: '100%', margin: '0 auto' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '12px' }}>
          播放列表 ({p.playlist.length})
        </h3>
        {p.playlist.map((s, i) => (
          <div key={i} onClick={() => p.play(i)} style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer',
            borderRadius: '8px', marginBottom: '2px',
            background: i === p.idx ? 'rgba(255,255,255,0.07)' : 'transparent',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => { if (i !== p.idx) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={e => { if (i !== p.idx) e.currentTarget.style.background = 'transparent'; }}
          >
            {/* Small cover */}
            <div style={{ width: '40px', height: '40px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.04)' }}>
              {s.cover ? <img src={s.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MusicNote size={16} style={{ color: 'rgba(255,255,255,0.12)' }} /></div>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '14px', fontWeight: i === p.idx ? 600 : 400, color: i === p.idx ? '#fff' : 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{s.title}</p>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.artist}</p>
            </div>
            {i === p.idx && p.playing && (
              <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '16px' }}>
                {[0, 1, 2].map(j => (
                  <div key={j} style={{
                    width: '3px', background: 'rgba(255,255,255,0.6)', borderRadius: '1px',
                    animation: `equalizer 0.8s ease-in-out ${j * 0.15}s infinite alternate`,
                  }} />
                ))}
                <style>{`@keyframes equalizer { 0% { height: 4px; } 100% { height: 14px; } }`}</style>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom mini bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: 'rgba(15,15,20,0.92)', backdropFilter: 'blur(30px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Progress bar (thin, at top of bar) */}
        <div
          onClick={e => { const r = e.currentTarget.getBoundingClientRect(); p.seek((e.clientX - r.left) / r.width); }}
          style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.08)', cursor: 'pointer' }}
        >
          <div style={{ width: `${p.pct * 100}%`, height: '100%', background: 'rgba(255,255,255,0.6)', transition: 'width 0.3s linear', pointerEvents: 'none' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', gap: '12px', maxWidth: '800px', margin: '0 auto' }}>
          {/* Spinning mini cover */}
          <div
            className={`vinyl-spinning ${!p.playing ? 'vinyl-paused' : ''}`}
            style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2px solid rgba(255,255,255,0.1)' }}
          >
            {p.song?.cover
              ? <img src={p.song.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MusicNote size={16} style={{ color: 'rgba(255,255,255,0.15)' }} /></div>}
          </div>

          {/* Song info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{p.song?.title || ''}</p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.song?.artist || ''}</p>
          </div>

          {/* Time */}
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
            {p.fmt(p.time)} / {p.fmt(p.dur)}
          </span>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            <button onClick={p.prev} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.6)"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button onClick={p.toggle} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}>
              {p.playing
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><path d="M8 5v14l11-7z"/></svg>}
            </button>
            <button onClick={p.next} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.6)"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
            <button onClick={p.cycleMode} title={p.modeLabel[p.mode]} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', marginLeft: '4px' }}>
              {p.mode === 'order' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>}
              {p.mode === 'random' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>}
              {p.mode === 'single' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/><text x="10" y="14" fill="rgba(255,255,255,0.6)" fontSize="8" fontWeight="bold" stroke="none">1</text></svg>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
