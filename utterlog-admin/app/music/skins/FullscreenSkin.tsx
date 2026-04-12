'use client';

import { useState } from 'react';
import { Play, MusicNote, Search } from '@/components/icons';
import type { SkinProps } from '../hooks/usePlayer';
import { SkinSwitcher } from './SkinSwitcher';

export default function FullscreenSkin(p: SkinProps) {
  const [dragging, setDragging] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0d0d0d', color: '#fff', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Blurred BG */}
      {p.song?.cover && <div style={{ position: 'absolute', inset: '-50%', width: '200%', height: '200%', backgroundImage: `url(${p.song.cover})`, backgroundSize: '40%', backgroundPosition: 'center', filter: 'blur(120px)', opacity: 0.3 }} />}

      {/* Top bar */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', flexShrink: 0, maxWidth: '1100px', width: '100%', margin: '0 auto' }}>
        <a href="/" title="首页" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', padding: '4px', display: 'flex' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SkinSwitcher skin={p.skin} setSkin={p.setSkin} />
          {/* Playlist selector */}
          {p.playlists.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowPlaylists(!showPlaylists)} title="歌单" style={{ background: showPlaylists ? 'rgba(255,255,255,0.1)' : 'none', border: 'none', cursor: 'pointer', padding: '5px 10px', color: 'rgba(255,255,255,0.5)', fontSize: '12px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                歌单
              </button>
              {showPlaylists && (
                <>
                  <div onClick={() => setShowPlaylists(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                  <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: '6px', zIndex: 11, background: 'rgba(15,15,20,0.95)', backdropFilter: 'blur(20px)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', padding: '6px', minWidth: '200px', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
                    <button onClick={() => { setShowPlaylists(false); p.loadMusic(); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: '13px', background: !p.activePlaylistId ? 'rgba(255,255,255,0.08)' : 'none', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', marginBottom: '2px' }}>全部音乐</button>
                    {p.playlists.map((pl: any) => (
                      <button key={pl.id} onClick={() => { p.switchPlaylist(pl.id); setShowPlaylists(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: '13px', background: p.activePlaylistId === pl.id ? 'rgba(255,255,255,0.08)' : 'none', border: 'none', borderRadius: '4px', color: p.activePlaylistId === pl.id ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer', marginBottom: '2px' }}>
                        {pl.title} <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>({pl.song_count})</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button onClick={() => p.setShowSearch(!p.showSearch)} title="搜索" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'rgba(255,255,255,0.5)' }}>
            <Search size={18} />
          </button>
        </div>
      </div>

      {/* Search drawer */}
      <SearchDrawer {...p} />

      {/* Main: LEFT(cover+playlist) + RIGHT(lyrics) */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '0 24px', gap: '40px', overflow: 'hidden', minHeight: 0 }}>
        {/* LEFT */}
        <div style={{ width: '340px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            width: '300px', height: '300px', margin: '0 auto 14px', borderRadius: '12px', overflow: 'hidden',
            transform: p.playing ? 'scale(1)' : 'scale(0.92)', transition: 'transform 0.5s ease',
            boxShadow: p.playing ? '0 16px 50px rgba(0,0,0,0.5)' : 'none', background: 'rgba(255,255,255,0.04)',
          }}>
            {p.song?.cover ? <img src={p.song.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MusicNote size={48} style={{ color: 'rgba(255,255,255,0.12)' }} /></div>}
          </div>
          <div style={{ textAlign: 'center', marginBottom: '10px' }}>
            <p style={{ fontSize: '15px', fontWeight: 700 }}>{p.song?.title || ''}</p>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{p.song?.artist || ''}</p>
          </div>
          <div style={{ flex: 1, overflow: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
            {p.playlist.map((s, i) => (
              <div key={i} onClick={() => p.play(i)} style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '13px',
                background: i === p.idx ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: i === p.idx ? '#fff' : 'rgba(255,255,255,0.45)',
              }}>
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', width: '18px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: i === p.idx ? 600 : 400 }}>{s.title}</span>
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', flexShrink: 0 }}>{s.artist}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: lyrics */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', flexShrink: 0, color: 'rgba(255,255,255,0.85)' }}>
            {p.song?.title || ''}{p.song?.artist ? <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.35)' }}> - {p.song.artist}</span> : ''}
          </h2>
          <LyricsPanel {...p} />
        </div>
      </div>

      {/* Bottom bar */}
      <BottomControls {...p} dragging={dragging} setDragging={setDragging} />
    </div>
  );
}

// --- Shared sub-components used by multiple skins ---

export function SearchDrawer(p: SkinProps) {
  return (
    <>
      {p.showSearch && <div onClick={() => p.setShowSearch(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.3)' }} />}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 51,
        width: '380px', maxWidth: '90vw',
        background: 'rgba(15,15,20,0.95)', backdropFilter: 'blur(30px)',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        transform: p.showSearch ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease',
        display: 'flex', flexDirection: 'column',
        boxShadow: p.showSearch ? '-10px 0 40px rgba(0,0,0,0.4)' : 'none',
      }}>
        <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#fff' }}>搜索音乐</h3>
            <button onClick={() => p.setShowSearch(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '4px', fontSize: '18px' }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.25)' }} />
              <input value={p.keyword} onChange={e => p.setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && p.doSearch()} placeholder="歌曲名 / 歌手" autoFocus style={{ width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '9px 10px 9px 32px', color: '#fff', fontSize: '13px', outline: 'none' }} />
            </div>
            <button onClick={p.doSearch} disabled={p.searching} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '4px', padding: '0 16px', color: '#fff', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px' }}>
              {p.searching ? <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> : '搜索'}
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px', scrollbarWidth: 'none' }}>
          {p.results.length > 0 ? p.results.slice(0, 20).map((r, i) => (
            <div key={i} onClick={() => p.addResult(r)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', borderRadius: '4px', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{r.title}</p>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.artist}{r._src ? <span style={{ marginLeft: '6px', padding: '0 4px', fontSize: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px' }}>{r._src}</span> : ''}
                </p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            </div>
          )) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.15)', fontSize: '13px' }}>
              {p.keyword ? '无结果' : '输入关键词搜索'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function LyricsPanel(p: SkinProps) {
  return (
    <div ref={p.lrcBoxRef} className="lrc-scroll" style={{
      flex: 1, overflowY: 'scroll', paddingRight: '8px', paddingTop: '120px', paddingBottom: '300px',
      scrollbarWidth: 'none', msOverflowStyle: 'none',
      maskImage: 'linear-gradient(transparent, black 10%, black 90%, transparent)',
      WebkitMaskImage: 'linear-gradient(transparent, black 10%, black 90%, transparent)',
    }}>
      <style>{`.lrc-scroll::-webkit-scrollbar { display: none; } .lrc-line:hover { background: rgba(255,255,255,0.06); }`}</style>
      {p.lrc.length > 0 ? p.lrc.map((line, i) => (
        <p key={i} className="lrc-line" onClick={() => { if (p.audioRef.current) { p.audioRef.current.currentTime = line.time; if (!p.playing) p.play(); } }} style={{
          fontSize: i === p.lrcIdx ? '28px' : '18px',
          fontWeight: 700, color: '#fff',
          filter: i === p.lrcIdx ? 'blur(0px)' : 'blur(1.5px)',
          opacity: i === p.lrcIdx ? 1 : 0.25,
          textShadow: i === p.lrcIdx ? '0 2px 16px rgba(255,255,255,0.5)' : 'none',
          padding: '10px 8px', borderRadius: '6px', margin: '4px 0',
          transition: 'all 0.5s cubic-bezier(0.56, 0.17, 0.22, 0.76)',
          cursor: 'pointer', lineHeight: 1.4, userSelect: 'none', wordBreak: 'break-word',
        }}>{line.text || '···'}</p>
      )) : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.12)' }}>暂无歌词</div>}
    </div>
  );
}

export function BottomControls(p: SkinProps & { dragging: boolean; setDragging: (v: boolean) => void }) {
  return (
    <div style={{
      position: 'relative', zIndex: 2, flexShrink: 0,
      maxWidth: '1100px', width: '100%', margin: '0 auto',
      padding: '12px 24px 24px', display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        <button onClick={p.prev} title="上一首" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button onClick={p.toggle} title={p.playing ? '暂停' : '播放'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}>
          {p.playing
            ? <svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            : <svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><path d="M8 5v14l11-7z"/></svg>}
        </button>
        <button onClick={p.next} title="下一首" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>
      </div>

      <div
        onClick={e => { const r = e.currentTarget.getBoundingClientRect(); p.seek((e.clientX - r.left) / r.width); }}
        onMouseDown={() => p.setDragging(true)}
        onMouseUp={() => p.setDragging(false)}
        onMouseMove={e => { if (p.dragging) { const r = e.currentTarget.getBoundingClientRect(); p.seek((e.clientX - r.left) / r.width); } }}
        onMouseLeave={() => p.setDragging(false)}
        style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.12)', borderRadius: '4px', cursor: 'pointer', position: 'relative' }}
      >
        <div style={{ width: `${p.pct * 100}%`, height: '100%', background: '#fff', borderRadius: '4px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: `${p.pct * 100}%`, top: '50%', transform: 'translate(-50%,-50%)', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', boxShadow: '0 0 4px rgba(0,0,0,0.3)', pointerEvents: 'none' }} />
      </div>

      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', flexShrink: 0, minWidth: '75px', textAlign: 'center' }}>
        {p.fmt(p.time)} / {p.fmt(p.dur)}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        <button onClick={() => p.changeVolume(p.volume > 0 ? 0 : 0.8)} title="静音" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {p.volume > 0 ? <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/>{p.volume > 0.5 && <path d="M15.54 8.46a5 5 0 010 7.07"/>}</> : <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></>}
          </svg>
        </button>
        <div onClick={e => { const r = e.currentTarget.getBoundingClientRect(); p.changeVolume((e.clientX - r.left) / r.width); }} style={{ width: '60px', height: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px', cursor: 'pointer', position: 'relative' }}>
          <div style={{ width: `${p.volume * 100}%`, height: '100%', background: 'rgba(255,255,255,0.5)', borderRadius: '2px' }} />
        </div>
      </div>

      <button onClick={p.cycleMode} title={p.modeLabel[p.mode]} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
        {p.mode === 'order' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>}
        {p.mode === 'random' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>}
        {p.mode === 'single' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/><text x="10" y="14" fill="rgba(255,255,255,0.8)" fontSize="8" fontWeight="bold" stroke="none">1</text></svg>}
      </button>
    </div>
  );
}
