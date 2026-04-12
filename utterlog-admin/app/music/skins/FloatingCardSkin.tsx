'use client';

import { useState } from 'react';
import { Search, MusicNote } from '@/components/icons';
import type { SkinProps } from '../hooks/usePlayer';
import { SearchDrawer } from './FullscreenSkin';
import { SkinSwitcher } from './SkinSwitcher';

export default function FloatingCardSkin(p: SkinProps) {
  const [minimized, setMinimized] = useState(false);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0a0a0e', color: '#fff', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column' }}>
      {/* Blurred BG */}
      {p.song?.cover && <div style={{ position: 'absolute', inset: '-50%', width: '200%', height: '200%', backgroundImage: `url(${p.song.cover})`, backgroundSize: '40%', backgroundPosition: 'center', filter: 'blur(150px)', opacity: 0.12 }} />}

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

      {/* Main: playlist on the left */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, overflow: 'auto', padding: '0 24px 24px', maxWidth: '600px', width: '100%' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '12px' }}>
          播放列表
        </h3>
        {p.playlist.map((s, i) => (
          <div key={i} onClick={() => p.play(i)} style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', cursor: 'pointer',
            borderRadius: '6px', marginBottom: '2px',
            background: i === p.idx ? 'rgba(255,255,255,0.07)' : 'transparent',
          }}
            onMouseEnter={e => { if (i !== p.idx) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={e => { if (i !== p.idx) e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', width: '18px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px', fontWeight: i === p.idx ? 600 : 400, color: i === p.idx ? '#fff' : 'rgba(255,255,255,0.55)' }}>{s.title}</span>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', flexShrink: 0 }}>{s.artist}</span>
          </div>
        ))}
      </div>

      {/* Floating card — bottom right */}
      <div style={{
        position: 'fixed', bottom: '24px', right: '24px', zIndex: 60,
        width: minimized ? '60px' : '280px',
        background: 'rgba(18,18,24,0.95)', backdropFilter: 'blur(30px)',
        borderRadius: minimized ? '50%' : '4px',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        transition: 'all 0.3s ease',
        overflow: 'hidden',
      }}>
        {minimized ? (
          /* Minimized: just spinning cover */
          <div
            onClick={() => setMinimized(false)}
            className={`vinyl-spinning ${!p.playing ? 'vinyl-paused' : ''}`}
            style={{ width: '60px', height: '60px', cursor: 'pointer' }}
          >
            {p.song?.cover
              ? <img src={p.song.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MusicNote size={20} style={{ color: 'rgba(255,255,255,0.15)' }} /></div>}
          </div>
        ) : (
          <>
            {/* Minimize button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 10px 0' }}>
              <button onClick={() => setMinimized(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>

            {/* Vinyl cover */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 16px' }}>
              <div style={{ position: 'relative', width: '160px', height: '160px' }}>
                <div
                  className={`vinyl-spinning ${!p.playing ? 'vinyl-paused' : ''}`}
                  style={{
                    width: '160px', height: '160px', borderRadius: '50%',
                    background: `radial-gradient(circle at center,
                      transparent 0%, transparent 18%,
                      #111 18.5%, #1a1a1a 19%, #111 19.5%,
                      #1a1a1a 20%, #111 25%,
                      #1a1a1a 28%, #111 32%,
                      transparent 32.5%)`,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #222' }}>
                    {p.song?.cover
                      ? <img src={p.song.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MusicNote size={20} style={{ color: 'rgba(255,255,255,0.15)' }} /></div>}
                  </div>
                </div>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '6px', height: '6px', borderRadius: '50%', background: '#333', zIndex: 1 }} />
              </div>
            </div>

            {/* Song info */}
            <div style={{ textAlign: 'center', padding: '0 16px 8px' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{p.song?.title || ''}</p>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.song?.artist || ''}</p>
            </div>

            {/* Progress */}
            <div style={{ padding: '8px 16px 4px' }}>
              <div
                onClick={e => { const r = e.currentTarget.getBoundingClientRect(); p.seek((e.clientX - r.left) / r.width); }}
                style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', cursor: 'pointer' }}
              >
                <div style={{ width: `${p.pct * 100}%`, height: '100%', background: 'rgba(255,255,255,0.6)', borderRadius: '2px', pointerEvents: 'none' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '3px' }}>
                <span>{p.fmt(p.time)}</span><span>{p.fmt(p.dur)}</span>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '4px 0 14px' }}>
              <button onClick={p.prev} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
              </button>
              <button onClick={p.toggle} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', padding: '10px', borderRadius: '50%' }}>
                {p.playing
                  ? <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><path d="M8 5v14l11-7z"/></svg>}
              </button>
              <button onClick={p.next} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
