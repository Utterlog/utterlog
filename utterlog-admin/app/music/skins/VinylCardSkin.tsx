'use client';

import { useState } from 'react';
import { Search, MusicNote } from '@/components/icons';
import type { SkinProps } from '../hooks/usePlayer';
import { SearchDrawer } from './FullscreenSkin';
import { SkinSwitcher } from './SkinSwitcher';

export default function VinylCardSkin(p: SkinProps) {
  const [dragging, setDragging] = useState(false);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0a0a0e', color: '#fff', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {/* Blurred BG */}
      {p.song?.cover && <div style={{ position: 'absolute', inset: '-50%', width: '200%', height: '200%', backgroundImage: `url(${p.song.cover})`, backgroundSize: '40%', backgroundPosition: 'center', filter: 'blur(120px)', opacity: 0.2 }} />}

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px' }}>
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

      {/* Center card */}
      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', gap: '0',
        background: 'rgba(20,20,28,0.85)', backdropFilter: 'blur(40px)',
        borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        maxWidth: '820px', width: '90vw', height: '480px',
        overflow: 'hidden',
      }}>
        {/* LEFT: Vinyl disc */}
        <div style={{ width: '400px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: 'rgba(0,0,0,0.25)' }}>
          {/* Vinyl grooves CSS */}
          <style>{`
            .vinyl-disc {
              position: relative;
              width: 320px;
              height: 320px;
              border-radius: 50%;
              background: #111;
              box-shadow:
                0 0 0 2px #1a1a1a,
                0 0 0 4px #111,
                0 8px 40px rgba(0,0,0,0.6),
                inset 0 0 30px rgba(0,0,0,0.4);
            }
            .vinyl-disc::before {
              content: '';
              position: absolute;
              inset: 8px;
              border-radius: 50%;
              background: repeating-radial-gradient(
                circle at center,
                transparent 0px,
                transparent 1px,
                rgba(40,40,40,0.6) 1.5px,
                transparent 2px,
                transparent 3px
              );
              opacity: 0.8;
            }
            .vinyl-disc::after {
              content: '';
              position: absolute;
              inset: 0;
              border-radius: 50%;
              background: linear-gradient(
                135deg,
                rgba(255,255,255,0.06) 0%,
                transparent 40%,
                transparent 60%,
                rgba(255,255,255,0.03) 100%
              );
            }
            .vinyl-highlight {
              position: absolute;
              inset: 0;
              border-radius: 50%;
              background: conic-gradient(
                from 0deg,
                transparent 0deg,
                rgba(255,255,255,0.03) 30deg,
                transparent 60deg,
                rgba(255,255,255,0.02) 120deg,
                transparent 150deg,
                rgba(255,255,255,0.04) 210deg,
                transparent 240deg,
                rgba(255,255,255,0.02) 300deg,
                transparent 330deg,
                rgba(255,255,255,0.03) 360deg
              );
              pointer-events: none;
              z-index: 2;
            }
            .tonearm-container {
              position: absolute;
              top: 18px;
              right: 30px;
              z-index: 5;
              transform-origin: 12px 12px;
            }
            .tonearm-pivot {
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background: radial-gradient(circle at 40% 35%, #ddd, #999, #777);
              box-shadow: 0 2px 8px rgba(0,0,0,0.4);
              position: relative;
              z-index: 2;
            }
            .tonearm-pivot::after {
              content: '';
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%,-50%);
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background: #555;
            }
            .tonearm-arm {
              position: absolute;
              top: 10px;
              left: 10px;
              width: 3px;
              height: 130px;
              background: linear-gradient(to right, #ccc, #eee, #bbb);
              border-radius: 2px;
              transform-origin: top center;
              box-shadow: 1px 2px 6px rgba(0,0,0,0.3);
            }
            .tonearm-head {
              position: absolute;
              bottom: -2px;
              left: -4px;
              width: 11px;
              height: 20px;
              background: linear-gradient(to bottom, #bbb, #888);
              border-radius: 2px 2px 1px 1px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
            .tonearm-head::after {
              content: '';
              position: absolute;
              bottom: -3px;
              left: 3px;
              width: 5px;
              height: 4px;
              background: #666;
              border-radius: 0 0 2px 2px;
            }
            .tonearm-counterweight {
              position: absolute;
              top: -8px;
              left: -5px;
              width: 13px;
              height: 13px;
              border-radius: 50%;
              background: radial-gradient(circle at 40% 35%, #ccc, #888);
              box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            }
          `}</style>

          {/* Vinyl record */}
          <div style={{ position: 'relative', width: '320px', height: '320px' }}>
            <div
              className={`vinyl-disc vinyl-spinning ${!p.playing ? 'vinyl-paused' : ''}`}
            >
              {/* Highlight overlay */}
              <div className="vinyl-highlight" />

              {/* Center cover — large, about 45% of disc */}
              <div style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%,-50%)',
                width: '145px', height: '145px',
                borderRadius: '50%', overflow: 'hidden',
                border: '3px solid #1a1a1a',
                boxShadow: 'inset 0 0 15px rgba(0,0,0,0.5), 0 0 10px rgba(0,0,0,0.3)',
                zIndex: 3,
              }}>
                {p.song?.cover
                  ? <img src={p.song.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MusicNote size={32} style={{ color: 'rgba(255,255,255,0.15)' }} /></div>}
              </div>

              {/* Center spindle */}
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%,-50%)',
                width: '12px', height: '12px', borderRadius: '50%',
                background: 'radial-gradient(circle at 40% 35%, #fff, #ccc, #888)',
                boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                zIndex: 4,
              }} />
            </div>

            {/* Tonearm */}
            <div className="tonearm-container" style={{
              transform: p.playing ? 'rotate(22deg)' : 'rotate(-2deg)',
              transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
              <div className="tonearm-pivot" />
              <div className="tonearm-arm">
                <div className="tonearm-head" />
                <div className="tonearm-counterweight" />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Info + lyrics + controls */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 24px 16px', overflow: 'hidden', minWidth: 0 }}>
          {/* Song info */}
          <div style={{ marginBottom: '12px', flexShrink: 0 }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.song?.title || '未选择歌曲'}</h2>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>{p.song?.artist || ''}</p>
          </div>

          {/* Lyrics */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
            <div ref={p.lrcBoxRef} className="lrc-scroll" style={{
              height: '100%', overflowY: 'scroll', paddingTop: '40px', paddingBottom: '60px',
              scrollbarWidth: 'none',
              maskImage: 'linear-gradient(transparent, black 15%, black 85%, transparent)',
              WebkitMaskImage: 'linear-gradient(transparent, black 15%, black 85%, transparent)',
            }}>
              <style>{`.lrc-scroll::-webkit-scrollbar { display: none; }`}</style>
              {p.lrc.length > 0 ? p.lrc.map((line, i) => (
                <p key={i} onClick={() => { if (p.audioRef.current) { p.audioRef.current.currentTime = line.time; if (!p.playing) p.play(); } }} style={{
                  fontSize: i === p.lrcIdx ? '16px' : '13px',
                  fontWeight: i === p.lrcIdx ? 700 : 400,
                  color: '#fff',
                  opacity: i === p.lrcIdx ? 1 : 0.3,
                  padding: '6px 0', margin: 0,
                  transition: 'all 0.4s ease',
                  cursor: 'pointer', lineHeight: 1.5, userSelect: 'none',
                }}>{line.text || '···'}</p>
              )) : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.12)', fontSize: '13px' }}>暂无歌词</div>}
            </div>
          </div>

          {/* Progress */}
          <div style={{ flexShrink: 0, marginTop: '8px' }}>
            <div
              onClick={e => { const r = e.currentTarget.getBoundingClientRect(); p.seek((e.clientX - r.left) / r.width); }}
              onMouseDown={() => setDragging(true)}
              onMouseUp={() => setDragging(false)}
              onMouseMove={e => { if (dragging) { const r = e.currentTarget.getBoundingClientRect(); p.seek((e.clientX - r.left) / r.width); } }}
              onMouseLeave={() => setDragging(false)}
              style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', cursor: 'pointer', position: 'relative' }}
            >
              <div style={{ width: `${p.pct * 100}%`, height: '100%', background: 'rgba(255,255,255,0.7)', borderRadius: '2px', pointerEvents: 'none' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>
              <span>{p.fmt(p.time)}</span><span>{p.fmt(p.dur)}</span>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexShrink: 0, marginTop: '4px' }}>
            <button onClick={p.cycleMode} title={p.modeLabel[p.mode]} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              {p.mode === 'order' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>}
              {p.mode === 'random' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>}
              {p.mode === 'single' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/><text x="10" y="14" fill="rgba(255,255,255,0.7)" fontSize="8" fontWeight="bold" stroke="none">1</text></svg>}
            </button>
            <button onClick={p.prev} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.6)"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button onClick={p.toggle} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', padding: '12px', borderRadius: '50%' }}>
              {p.playing
                ? <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                : <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><path d="M8 5v14l11-7z"/></svg>}
            </button>
            <button onClick={p.next} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.6)"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
            <button onClick={() => p.changeVolume(p.volume > 0 ? 0 : 0.8)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {p.volume > 0 ? <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></> : <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></>}
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
