'use client';

import { useEffect, useRef, useState } from 'react';
import { useMusicStore } from '@/lib/store';
import { MusicNote } from '@/components/icons';

const API = '/api/v1/music';

export default function GlobalMiniPlayer() {
  const { playlist, idx, playing, visible, setIdx, setPlaying, hide } = useMusicStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);

  const song = playlist[idx];
  const pct = dur > 0 ? time / dur : 0;

  // Sync play/pause with store
  useEffect(() => {
    if (!audioRef.current || !song) return;
    if (playing) {
      audioRef.current.play().catch(() => setPlaying(false));
    } else {
      audioRef.current.pause();
    }
  }, [playing, song]);

  // Auto-play on song change
  useEffect(() => {
    if (!audioRef.current || !song) return;
    audioRef.current.load();
    if (playing) {
      setTimeout(() => audioRef.current?.play().catch(() => {}), 100);
    }
  }, [idx, song?.url]);

  const toggle = () => setPlaying(!playing);
  const prev = () => {
    const i = (idx - 1 + playlist.length) % playlist.length;
    setIdx(i);
    setPlaying(true);
  };
  const next = () => {
    const i = (idx + 1) % playlist.length;
    setIdx(i);
    setPlaying(true);
  };
  const seek = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p = (e.clientX - r.left) / r.width;
    if (audioRef.current) audioRef.current.currentTime = p * dur;
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  if (!visible || !song) return null;

  return (
    <>
      <audio
        ref={audioRef}
        src={song.url}
        onTimeUpdate={() => setTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDur(audioRef.current?.duration || 0)}
        onEnded={next}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
        background: 'rgba(15,15,20,0.95)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.08)', color: '#fff',
      }}>
        {/* Progress bar — thin top */}
        <div onClick={seek} style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.1)', cursor: 'pointer' }}>
          <div style={{ width: `${pct * 100}%`, height: '100%', background: 'rgba(255,255,255,0.6)', transition: 'width 0.3s linear', pointerEvents: 'none' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 16px', gap: '12px', maxWidth: '1200px', margin: '0 auto' }}>
          {/* Spinning cover */}
          <div
            className={`vinyl-spinning ${!playing ? 'vinyl-paused' : ''}`}
            style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2px solid rgba(255,255,255,0.1)' }}
          >
            {song.cover
              ? <img src={song.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MusicNote size={14} style={{ color: 'rgba(255,255,255,0.15)' }} /></div>}
          </div>

          {/* Song info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{song.title}</p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.artist}</p>
          </div>

          {/* Time */}
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
            {fmt(time)} / {fmt(dur)}
          </span>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            <button onClick={prev} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.6)"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button onClick={toggle} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}>
              {playing
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><path d="M8 5v14l11-7z"/></svg>}
            </button>
            <button onClick={next} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.6)"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
          </div>

          {/* Close */}
          <button onClick={hide} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'rgba(255,255,255,0.3)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    </>
  );
}
