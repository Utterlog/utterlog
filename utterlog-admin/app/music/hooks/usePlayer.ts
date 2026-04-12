'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useMusicStore, type GlobalSong } from '@/lib/store';

export interface Song {
  id: string; title: string; artist: string; cover: string; url: string;
  server: string; pic_id?: string; url_id?: string; lyric_id?: string;
}

export interface LrcLine { time: number; text: string; }

export type PlayMode = 'order' | 'random' | 'single';
export type SkinType = 'fullscreen' | 'vinyl-card' | 'mini-bar' | 'floating';

export interface SkinProps {
  playlist: Song[];
  idx: number;
  song: Song | undefined;
  playing: boolean;
  time: number;
  dur: number;
  lrc: LrcLine[];
  lrcIdx: number;
  volume: number;
  mode: PlayMode;
  playlists: any[];
  activePlaylistId: number | null;
  loading: boolean;
  pct: number;
  // actions
  play: (i?: number) => void;
  pause: () => void;
  toggle: () => void;
  prev: () => void;
  next: () => void;
  seek: (pct: number) => void;
  changeVolume: (v: number) => void;
  cycleMode: () => void;
  switchPlaylist: (id: number) => void;
  loadMusic: () => void;
  // search
  showSearch: boolean;
  setShowSearch: (v: boolean) => void;
  keyword: string;
  setKeyword: (v: string) => void;
  results: any[];
  searching: boolean;
  doSearch: () => void;
  addResult: (item: any) => void;
  // skin
  skin: SkinType;
  setSkin: (s: SkinType) => void;
  // refs
  audioRef: React.RefObject<HTMLAudioElement | null>;
  lrcBoxRef: React.RefObject<HTMLDivElement | null>;
  // audio event handlers (for rendering <audio> in page)
  onTimeUpdate: () => void;
  onLoadedMetadata: () => void;
  onEnded: () => void;
  // utils
  fmt: (s: number) => string;
  modeLabel: Record<PlayMode, string>;
}

function parseLrc(lrc: string): LrcLine[] {
  if (!lrc) return [];
  return lrc.split('\n').map(line => {
    const m = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (!m) return null;
    return { time: parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / (m[3].length === 3 ? 1000 : 100), text: m[4].trim() };
  }).filter(Boolean) as LrcLine[];
}

const API = '/api/v1/music';
const LOCAL_KEY = 'utterlog-user-songs';
const SKIN_KEY = 'utterlog-music-skin';

export function usePlayer(): SkinProps {
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [lrc, setLrc] = useState<LrcLine[]>([]);
  const [lrcIdx, setLrcIdx] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [mode, setMode] = useState<PlayMode>('order');
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<number | null>(null);
  const [skin, setSkinState] = useState<SkinType>('fullscreen');

  const audioRef = useRef<HTMLAudioElement>(null);
  const lrcBoxRef = useRef<HTMLDivElement>(null);
  const dbSongIds = useRef<Set<string>>(new Set());
  const [pendingPlay, setPendingPlay] = useState<number | null>(null);

  const song = playlist[idx];
  const pct = dur > 0 ? time / dur : 0;

  // Load skin preference
  useEffect(() => {
    const saved = localStorage.getItem(SKIN_KEY);
    if (saved && ['fullscreen', 'vinyl-card', 'mini-bar', 'floating'].includes(saved)) {
      setSkinState(saved as SkinType);
    }
  }, []);

  const setSkin = useCallback((s: SkinType) => {
    setSkinState(s);
    localStorage.setItem(SKIN_KEY, s);
  }, []);

  // Load playlists + music on mount
  useEffect(() => { loadPlaylists(); loadMusic(); }, []);

  const loadPlaylists = async () => {
    try {
      const r = await fetch('/api/v1/playlists').then(r => r.json());
      if (r.success) setPlaylists(r.data || []);
    } catch {}
  };

  const switchPlaylist = useCallback(async (playlistId: number) => {
    setActivePlaylistId(playlistId);
    setLoading(true);
    try {
      const r = await fetch(`/api/v1/playlists/${playlistId}`).then(r => r.json());
      if (r.success && r.data?.songs?.length) {
        setPlaylist(r.data.songs.map((s: any) => ({
          id: s.platform_id || String(s.id), title: s.title, artist: s.artist || '',
          cover: s.cover_url || `${API}/pic?server=${s.platform || 'netease'}&id=${s.platform_id}`,
          url: s.play_url || `${API}/url?server=${s.platform || 'netease'}&id=${s.platform_id || s.id}`,
          server: s.platform || 'netease', pic_id: s.platform_id, url_id: s.platform_id, lyric_id: s.platform_id,
        })));
        setIdx(0);
      }
    } catch {}
    setLoading(false);
  }, []);

  const loadMusic = useCallback(async () => {
    setLoading(true);
    const allSongs: Song[] = [];
    try {
      const r = await fetch(API).then(r => r.json());
      if (r.success && r.data?.length) {
        allSongs.push(...r.data.map((s: any) => ({
          id: s.platform_id || String(s.id), title: s.title, artist: s.artist || '',
          cover: s.cover_url || `${API}/pic?server=${s.platform || 'netease'}&id=${s.platform_id}`,
          url: s.play_url || `${API}/url?server=${s.platform || 'netease'}&id=${s.platform_id || s.id}`,
          server: s.platform || 'netease', pic_id: s.platform_id, url_id: s.platform_id, lyric_id: s.platform_id,
        })));
      }
    } catch {}
    try {
      const saved = localStorage.getItem(LOCAL_KEY);
      if (saved) {
        const userSongs: Song[] = JSON.parse(saved);
        const existIds = new Set(allSongs.map(s => s.id));
        for (const s of userSongs) {
          if (!existIds.has(s.id)) { allSongs.push(s); existIds.add(s.id); }
        }
      }
    } catch {}
    setPlaylist(allSongs);
    setLoading(false);
  }, []);

  // Save user songs to localStorage
  useEffect(() => {
    if (loading || playlist.length === 0) return;
    if (dbSongIds.current.size === 0) {
      fetch(API).then(r => r.json()).then(r => {
        if (r.success && r.data) {
          r.data.forEach((s: any) => dbSongIds.current.add(s.platform_id || String(s.id)));
        }
        const userSongs = playlist.filter(s => !dbSongIds.current.has(s.id));
        if (userSongs.length > 0) localStorage.setItem(LOCAL_KEY, JSON.stringify(userSongs));
        else localStorage.removeItem(LOCAL_KEY);
      }).catch(() => {});
      return;
    }
    const userSongs = playlist.filter(s => !dbSongIds.current.has(s.id));
    if (userSongs.length > 0) localStorage.setItem(LOCAL_KEY, JSON.stringify(userSongs));
    else localStorage.removeItem(LOCAL_KEY);
  }, [playlist, loading]);

  // Load lyrics
  useEffect(() => {
    if (!song) return;
    fetch(`${API}/lyric?server=${song.server || 'netease'}&id=${song.lyric_id || song.id}`)
      .then(r => r.text()).then(t => { setLrc(parseLrc(t)); setLrcIdx(-1); }).catch(() => setLrc([]));
  }, [idx, song?.id]);

  // Sync lyrics index
  useEffect(() => {
    if (!lrc.length) return;
    let i = -1;
    for (let j = lrc.length - 1; j >= 0; j--) { if (time >= lrc[j].time) { i = j; break; } }
    if (i !== lrcIdx) {
      setLrcIdx(i);
      if (lrcBoxRef.current && i >= 0) {
        const el = lrcBoxRef.current.children[i] as HTMLElement;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [time, lrc]);

  // Play pending song
  useEffect(() => {
    if (pendingPlay !== null && pendingPlay < playlist.length) {
      setIdx(pendingPlay);
      setPendingPlay(null);
      setTimeout(() => { audioRef.current?.play().then(() => setPlaying(true)).catch(() => {}); }, 200);
    }
  }, [playlist.length, pendingPlay]);

  const play = useCallback((i?: number) => {
    if (i !== undefined) setIdx(i);
    setTimeout(() => { audioRef.current?.play().then(() => setPlaying(true)).catch(() => {}); }, 100);
  }, []);

  const pause = useCallback(() => { audioRef.current?.pause(); setPlaying(false); }, []);
  const toggle = useCallback(() => { playing ? pause() : play(); }, [playing, pause, play]);

  const prev = useCallback(() => {
    const i = (idx - 1 + playlist.length) % playlist.length;
    setIdx(i); play(i);
  }, [idx, playlist.length, play]);

  const next = useCallback(() => {
    if (mode === 'single') { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play(); } return; }
    if (mode === 'random') { const i = Math.floor(Math.random() * playlist.length); setIdx(i); play(i); return; }
    const i = (idx + 1) % playlist.length; setIdx(i); play(i);
  }, [mode, idx, playlist.length, play]);

  const seek = useCallback((p: number) => {
    if (audioRef.current) audioRef.current.currentTime = Math.max(0, Math.min(1, p)) * dur;
  }, [dur]);

  const changeVolume = useCallback((v: number) => {
    const nv = Math.max(0, Math.min(1, v)); setVolume(nv);
    if (audioRef.current) audioRef.current.volume = nv;
  }, []);

  const cycleMode = useCallback(() => setMode(m => m === 'order' ? 'random' : m === 'random' ? 'single' : 'order'), []);

  const doSearch = useCallback(async () => {
    if (!keyword.trim()) return;
    setSearching(true); setResults([]);
    const kw = encodeURIComponent(keyword);
    try {
      const [r1, r2] = await Promise.allSettled([
        fetch(`${API}/search?server=netease&keyword=${kw}`).then(r => r.json()),
        fetch(`${API}/search?server=kugou&keyword=${kw}`).then(r => r.json()),
      ]);
      const all: any[] = [];
      if (r1.status === 'fulfilled' && r1.value.success) all.push(...r1.value.data.map((d: any) => ({ ...d, _src: '网易云' })));
      if (r2.status === 'fulfilled' && r2.value.success) all.push(...r2.value.data.map((d: any) => ({ ...d, _src: '酷狗' })));
      setResults(all);
    } catch { setResults([]); }
    setSearching(false);
  }, [keyword]);

  const addResult = useCallback((item: any) => {
    const sv = item.platform || 'netease';
    const s: Song = {
      id: item.url_id || item.id, title: item.title, artist: item.artist,
      cover: `${API}/pic?server=${sv}&id=${item.pic_id}`,
      url: `${API}/url?server=${sv}&id=${item.url_id || item.id}`,
      server: sv, pic_id: item.pic_id, url_id: item.url_id, lyric_id: item.lyric_id,
    };
    setPlaylist(p => [...p, s]);
    setPendingPlay(playlist.length);
    setShowSearch(false);
  }, [playlist.length]);

  const fmt = useCallback((s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`, []);
  const modeLabel: Record<PlayMode, string> = { order: '顺序', random: '随机', single: '单曲' };

  const onTimeUpdate = useCallback(() => setTime(audioRef.current?.currentTime || 0), []);
  const onLoadedMetadata = useCallback(() => setDur(audioRef.current?.duration || 0), []);

  // Sync to global store for cross-page playback
  const globalStore = useMusicStore();
  useEffect(() => {
    if (playlist.length > 0) {
      const globalSongs: GlobalSong[] = playlist.map(s => ({
        id: s.id, title: s.title, artist: s.artist,
        cover: s.cover, url: s.url, server: s.server,
        pic_id: s.pic_id, url_id: s.url_id, lyric_id: s.lyric_id,
      }));
      globalStore.setPlaylist(globalSongs, idx);
    }
  }, [playlist.length]);

  useEffect(() => { globalStore.setIdx(idx); }, [idx]);
  useEffect(() => { globalStore.setPlaying(playing); }, [playing]);

  return {
    playlist, idx, song, playing, time, dur, lrc, lrcIdx, loading, pct,
    volume, mode, playlists, activePlaylistId,
    play, pause, toggle, prev, next, seek, changeVolume, cycleMode,
    switchPlaylist, loadMusic,
    showSearch, setShowSearch, keyword, setKeyword, results, searching, doSearch, addResult,
    skin, setSkin,
    audioRef, lrcBoxRef,
    onTimeUpdate, onLoadedMetadata, onEnded: next,
    fmt, modeLabel,
  };
}
