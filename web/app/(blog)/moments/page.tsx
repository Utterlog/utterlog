'use client';

import { useEffect, useState, useRef } from 'react';
import { momentsApi, optionsApi, mediaApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import toast from 'react-hot-toast';

function formatTime(ts: number) {
  if (!ts) return null;
  const d = new Date(ts * 1000);
  const month = d.toLocaleDateString('zh-CN', { month: 'long' });
  const day = d.getDate();
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return { month, day, time };
}

function relativeTime(ts: number) {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

function parseImages(m: any): string[] {
  if (!m.images) return [];
  if (Array.isArray(m.images)) return m.images;
  if (typeof m.images === 'string') {
    let str = m.images;
    // Decode base64 if it looks like base64 (Go backend encodes pg arrays as base64)
    if (/^[A-Za-z0-9+/]+=*$/.test(str) && !str.startsWith('http') && !str.startsWith('{')) {
      try { str = atob(str); } catch {}
    }
    // Parse PostgreSQL array literal: {url1,url2}
    if (str.startsWith('{') && str.endsWith('}')) {
      const inner = str.slice(1, -1);
      if (!inner || inner === '') return [];
      return inner.split(',').map((s: string) => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
    }
    // Try JSON array
    try { const parsed = JSON.parse(str); if (Array.isArray(parsed)) return parsed; } catch {}
    // Comma-separated fallback
    return str.split(',').map((s: string) => s.trim()).filter((s: string) => s.startsWith('http'));
  }
  return [];
}

const rotations = [-2.5, 1.8, -1.2, 2.4, -0.8, 1.5, -2.0, 0.6, -1.6, 2.1, -0.5, 1.9];
const tagColors = [
  { bg: '#4a9e8e', text: '#fff' },  // 青绿
  { bg: '#c4956a', text: '#fff' },  // 驼色
  { bg: '#8b7ec8', text: '#fff' },  // 紫色
  { bg: '#d4837a', text: '#fff' },  // 珊瑚
  { bg: '#6b9dbd', text: '#fff' },  // 天蓝
  { bg: '#9aab68', text: '#fff' },  // 橄榄
  { bg: '#e07850', text: '#fff' },  // 橙红
  { bg: '#5b8c5a', text: '#fff' },  // 森绿
  { bg: '#b07aaf', text: '#fff' },  // 粉紫
  { bg: '#c9a035', text: '#fff' },  // 金黄
  { bg: '#7286a0', text: '#fff' },  // 灰蓝
  { bg: '#d46b8c', text: '#fff' },  // 玫红
  { bg: '#5c9e9e', text: '#fff' },  // 蓝绿
  { bg: '#a0855b', text: '#fff' },  // 棕色
  { bg: '#6a7fc1', text: '#fff' },  // 靛蓝
  { bg: '#c75c5c', text: '#fff' },  // 赤红
];

// 为每个标签生成稳定且分散的颜色
function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash + tag.charCodeAt(i) * 31) >>> 0;
  return tagColors[hash % tagColors.length];
}

function getMomentPositions(count: number) {
  const cols = 4;
  const cardW = 250;
  const cardH = 280;
  const gapX = 35;
  const gapY = 25;
  const positions: { x: number; y: number; rotation: number }[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const seed = i * 11 + 7;
    const offsetX = ((seed * 13) % 50) - 25;
    const offsetY = ((seed * 19) % 40) - 20;
    positions.push({
      x: col * (cardW + gapX) + offsetX,
      y: row * (cardH + gapY) + offsetY,
      rotation: rotations[i % rotations.length],
    });
  }
  return positions;
}

export default function MomentsPage() {
  const [moments, setMoments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('');
  const [location, setLocation] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const source = '网页'; // Auto-detected: 网页 for web, Telegram for bot
  const [tags, setTags] = useState<string[]>(['随想', '技术', '生活', '阅读']);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lightbox state
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  // Scattered card interaction
  const [activeCard, setActiveCard] = useState<number | null>(null);
  const [topZ, setTopZ] = useState(100);
  const [cardZs, setCardZs] = useState<Record<number, number>>({});
  const [isMobile, setIsMobile] = useState(false);

  // 日历筛选
  const [showCalendar, setShowCalendar] = useState(false);
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  // 标签筛选
  const [showTagPanel, setShowTagPanel] = useState(false);
  const tagPanelRef = useRef<HTMLDivElement>(null);

  const { isAuthenticated, user } = useAuthStore();
  const isAdmin = isAuthenticated && user?.role === 'admin';

  useEffect(() => {
    fetchMoments();
    fetchTags();
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close calendar / tag panel on click outside
  useEffect(() => {
    if (!showCalendar && !showTagPanel) return;
    const handler = (e: MouseEvent) => {
      if (showCalendar && calendarRef.current && !calendarRef.current.contains(e.target as Node)) setShowCalendar(false);
      if (showTagPanel && tagPanelRef.current && !tagPanelRef.current.contains(e.target as Node)) setShowTagPanel(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCalendar, showTagPanel]);

  // Keyboard handler for lightbox & composer
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (lightbox) {
        if (e.key === 'Escape') setLightbox(null);
        if (e.key === 'ArrowLeft') setLightbox(prev => prev ? { ...prev, index: Math.max(0, prev.index - 1) } : null);
        if (e.key === 'ArrowRight') setLightbox(prev => prev ? { ...prev, index: Math.min(prev.images.length - 1, prev.index + 1) } : null);
      } else if (showComposer && e.key === 'Escape') {
        setShowComposer(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightbox, showComposer]);

  const fetchMoments = async () => {
    setLoading(true);
    try {
      const r: any = await momentsApi.list({ per_page: 50 });
      setMoments(r.data || []);
    } catch {} finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const r: any = await optionsApi.get('moment_tags');
      const val = r.data?.value || r.value || '';
      if (val) setTags(val.split(',').map((t: string) => t.trim()).filter(Boolean));
    } catch {}
  };

  const handlePublish = async () => {
    if (!content.trim() && images.length === 0) { toast.error('请输入内容或添加图片'); return; }
    setSubmitting(true);
    try {
      // 从内容中提取 #标签 作为 mood，支持中英文
      let finalContent = content.trim();
      let finalMood = mood;
      const hashMatch = finalContent.match(/#([\u4e00-\u9fffa-zA-Z0-9_]+)/);
      if (hashMatch) {
        finalMood = hashMatch[1];
        finalContent = finalContent.replace(hashMatch[0], '').trim();
      }
      await momentsApi.create({
        content: finalContent,
        mood: finalMood,
        location,
        source,
        images: images.length > 0 ? images : [],
        visibility: 'public',
      });
      toast.success('发布成功');
      setContent(''); setMood(''); setLocation(''); setImages([]);
      setShowComposer(false);
      fetchMoments();
    } catch {
      toast.error('发布失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const r: any = await mediaApi.upload(files[i], 'moments');
        const url = r.url || r.data?.url;
        if (url) setImages(prev => [...prev, url]);
      }
    } catch {
      toast.error('图片上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const openComposer = () => {
    setShowComposer(true);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) { toast.error('浏览器不支持定位'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=zh`);
          const data = await res.json();
          const addr = data.address;
          setLocation(addr?.city || addr?.town || addr?.county || addr?.state || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        } catch {
          setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        }
        setLocating(false);
      },
      () => { toast.error('获取位置失败'); setLocating(false); },
      { timeout: 10000 }
    );
  };

  const openLightbox = (imgs: string[], index: number) => setLightbox({ images: imgs, index });

  return (
    <div
      onClick={() => setActiveCard(null)}
      style={{
        minHeight: 'calc(100vh - 200px)',
        position: 'relative',
      }}
    >

      <div style={{ padding: isMobile ? '24px 16px 120px' : '32px 32px 120px' }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <p style={{ fontSize: '13px', color: '#999' }}>加载中...</p>
        </div>
      ) : moments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <p style={{ fontSize: '15px', color: '#999' }}>暂无说说</p>
        </div>
      ) : (
        <>
          {/* Filter bar */}
          {filterTag && (
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <span style={{ fontSize: '13px', color: 'var(--color-text-dim, #999)' }}>筛选：</span>
              <button
                onClick={() => setFilterTag(null)}
                style={{
                  padding: '4px 14px', borderRadius: '14px', fontSize: '12px', fontWeight: 600,
                  background: getTagColor(filterTag).bg, color: '#fff',
                  border: 'none', cursor: 'pointer', marginLeft: '6px',
                }}
              >
                {filterTag} &times;
              </button>
            </div>
          )}

          {(() => {
            let filtered = filterTag ? moments.filter(m => m.mood === filterTag) : [...moments];
            if (filterYear !== null) {
              filtered = filtered.filter(m => {
                const d = new Date(m.created_at * 1000);
                if (d.getFullYear() !== filterYear) return false;
                if (filterMonth !== null && d.getMonth() !== filterMonth) return false;
                return true;
              });
            }
            const positions = getMomentPositions(filtered.length);
            const totalRows = Math.ceil(filtered.length / 4);
            const containerH = totalRows * 305 + 100;

            const handleCardClick = (e: React.MouseEvent, i: number) => {
              e.stopPropagation();
              if (activeCard === i) return; // already active, do nothing (no navigation for moments)
              const newZ = topZ + 1;
              setTopZ(newZ);
              setCardZs(prev => ({ ...prev, [i]: newZ }));
              setActiveCard(i);
            };

            const renderCard = (m: any, i: number, scattered: boolean) => {
              const tag = m.mood || null;
              const tagColor = tag ? getTagColor(tag) : null;
              const imgs = parseImages(m);
              const isActive = activeCard === i;

              return (
                <div style={{ background: '#fff', borderRadius: '2px', boxShadow: isActive ? '0 12px 40px rgba(0,0,0,0.15)' : '0 2px 12px rgba(0,0,0,0.06)', position: 'relative' }}>
                  {/* Tag badge */}
                  {tag && tagColor && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setFilterTag(filterTag === tag ? null : tag); }}
                      style={{
                        position: 'absolute', top: '-6px', right: '-6px', zIndex: 2,
                        background: tagColor.bg, color: tagColor.text,
                        fontSize: '10px', fontWeight: 600,
                        padding: '3px 10px 3px 8px', borderRadius: '4px',
                        letterSpacing: '0.03em', border: 'none', cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        display: 'flex', alignItems: 'center', gap: '3px',
                      }}
                    >
                      <span style={{ fontSize: '11px' }}>+</span> {tag}
                    </button>
                  )}

                  {/* Text content */}
                  <div style={{ padding: '20px 24px' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ fontSize: '10px', color: '#9e9a93', letterSpacing: '0.08em' }}>{relativeTime(m.created_at)}</span>
                    </div>
                    {m.content && (
                      <p style={{ fontSize: '14px', lineHeight: 1.85, color: '#2b2a28', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                    )}
                    {(m.location || m.source) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', fontSize: '11px', color: '#b8b4ad' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          {m.location && <><i className="fa-regular fa-location-dot" style={{ fontSize: '10px' }} />{m.location}</>}
                        </span>
                        {m.source && <span style={{ fontSize: '10px', color: '#c4c0b8' }}>via {m.source}</span>}
                      </div>
                    )}
                  </div>

                  {/* Images */}
                  {imgs.length === 1 && (
                    <img src={imgs[0]} alt="" onClick={(e) => { e.stopPropagation(); openLightbox(imgs, 0); }}
                      style={{ width: '100%', display: 'block', cursor: 'zoom-in', objectFit: 'cover', maxHeight: '280px' }} />
                  )}
                  {imgs.length >= 2 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
                      {imgs.map((url, idx) => (
                        <img key={idx} src={url} alt="" onClick={(e) => { e.stopPropagation(); openLightbox(imgs, idx); }}
                          style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', cursor: 'zoom-in', display: 'block' }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            };

            if (isMobile) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px', margin: '0 auto' }}>
                  {filtered.map((m: any, i: number) => (
                    <div key={m.id}>{renderCard(m, i, false)}</div>
                  ))}
                </div>
              );
            }

            return (
              <div
                onClick={() => setActiveCard(null)}
                style={{ position: 'relative', maxWidth: '1250px', margin: '0 auto', height: containerH }}
              >
                {filtered.map((m: any, i: number) => {
                  const pos = positions[i];
                  const isActive = activeCard === i;
                  const z = cardZs[i] || (filtered.length - i);
                  return (
                    <div
                      key={m.id}
                      onClick={(e) => handleCardClick(e, i)}
                      style={{
                        position: 'absolute',
                        left: pos.x + 30,
                        top: pos.y + 10,
                        width: '250px',
                        transform: `rotate(${isActive ? 0 : pos.rotation}deg) scale(${isActive ? 1.03 : 1})`,
                        zIndex: z,
                        cursor: 'default',
                        transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                      }}
                    >
                      {renderCard(m, i, true)}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}
      </div>

      {/* ==================== Floating Bottom Toolbar ==================== */}
      <div style={{ position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', height: '54px',
          background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(0,0,0,0.08)', borderRadius: '27px', padding: '0 12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
        }}>
          {/* 标题 — 点击恢复全部 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px' }}>
            <button
              onClick={() => { setFilterTag(null); setFilterYear(null); setFilterMonth(null); setShowCalendar(false); setShowTagPanel(false); }}
              style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a1a1a' }}>碎碎念</span>
              <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: '-8px', width: '4px', height: '4px', borderRadius: '50%', background: '#4a9e8e' }} />
            </button>
          </div>
          <div style={{ width: '1px', height: '24px', background: '#e2dfd8' }} />
          {/* 按钮组 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', gap: '2px', position: 'relative' }}>
            {/* 日历筛选 */}
            <div style={{ position: 'relative' }} ref={calendarRef}>
              <button
                onClick={() => setShowCalendar(!showCalendar)}
                title="按时间筛选"
                style={{
                  width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: (filterYear !== null || showCalendar) ? 'rgba(0,82,217,0.08)' : 'transparent',
                  color: (filterYear !== null || showCalendar) ? 'var(--color-primary, #0052D9)' : '#7a7670', transition: 'background 0.2s',
                }}
                onMouseEnter={e => { if (filterYear === null && !showCalendar) e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                onMouseLeave={e => { if (filterYear === null && !showCalendar) e.currentTarget.style.background = 'transparent'; }}
              >
                <i className="fa-regular fa-calendar" style={{ fontSize: '16px' }} />
              </button>
              {/* 日历面板 */}
              {showCalendar && (() => {
                // 从 moments 数据中提取可用的年月
                const yearMonths = new Map<number, Set<number>>();
                moments.forEach(m => {
                  const d = new Date(m.created_at * 1000);
                  const y = d.getFullYear();
                  if (!yearMonths.has(y)) yearMonths.set(y, new Set());
                  yearMonths.get(y)!.add(d.getMonth());
                });
                const years = Array.from(yearMonths.keys()).sort((a, b) => b - a);
                const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

                return (
                  <div style={{
                    position: 'absolute', bottom: '48px', left: '50%', transform: 'translateX(-50%)',
                    background: '#fff', border: '1px solid #e5e5e5', borderRadius: '8px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12)', padding: '12px', minWidth: '220px',
                  }}>
                    {/* 清除筛选 */}
                    {filterYear !== null && (
                      <button
                        onClick={() => { setFilterYear(null); setFilterMonth(null); setShowCalendar(false); }}
                        style={{
                          width: '100%', padding: '6px 0', marginBottom: '8px', fontSize: '12px',
                          color: 'var(--color-primary, #0052D9)', background: 'none', border: 'none', cursor: 'pointer',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        <i className="fa-regular fa-xmark" style={{ marginRight: '4px' }} />
                        清除筛选
                      </button>
                    )}
                    {years.map(year => (
                      <div key={year} style={{ marginBottom: '8px' }}>
                        <button
                          onClick={() => { setFilterYear(year); setFilterMonth(null); setShowCalendar(false); }}
                          style={{
                            fontSize: '13px', fontWeight: 600, color: filterYear === year ? 'var(--color-primary, #0052D9)' : '#1a1a1a',
                            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', width: '100%', textAlign: 'left',
                          }}
                        >
                          {year} 年
                        </button>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                          {Array.from(yearMonths.get(year)!).sort((a, b) => a - b).map(month => (
                            <button
                              key={month}
                              onClick={() => { setFilterYear(year); setFilterMonth(month); setShowCalendar(false); }}
                              style={{
                                padding: '3px 8px', fontSize: '11px', borderRadius: '4px',
                                border: filterYear === year && filterMonth === month ? '1px solid var(--color-primary, #0052D9)' : '1px solid #e5e5e5',
                                background: filterYear === year && filterMonth === month ? 'var(--color-primary, #0052D9)' : '#fafafa',
                                color: filterYear === year && filterMonth === month ? '#fff' : '#666',
                                cursor: 'pointer', transition: 'all 0.15s',
                              }}
                            >
                              {monthNames[month]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {years.length === 0 && (
                      <p style={{ fontSize: '12px', color: '#999', textAlign: 'center', padding: '8px 0' }}>暂无数据</p>
                    )}
                  </div>
                );
              })()}
            </div>
            {/* 标签筛选 # */}
            <div style={{ position: 'relative' }} ref={tagPanelRef}>
              <button
                onClick={() => { setShowTagPanel(!showTagPanel); setShowCalendar(false); }}
                title="按标签筛选"
                style={{
                  width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: (filterTag || showTagPanel) ? 'rgba(0,82,217,0.08)' : 'transparent',
                  color: (filterTag || showTagPanel) ? 'var(--color-primary, #0052D9)' : '#7a7670', transition: 'background 0.2s',
                  fontSize: '16px', fontWeight: 700,
                }}
                onMouseEnter={e => { if (!filterTag && !showTagPanel) e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                onMouseLeave={e => { if (!filterTag && !showTagPanel) e.currentTarget.style.background = 'transparent'; }}
              >
                #
              </button>
              {showTagPanel && (() => {
                // 从 moments 数据中提取所有标签及数量
                const tagCounts = new Map<string, number>();
                moments.forEach(m => {
                  if (m.mood) tagCounts.set(m.mood, (tagCounts.get(m.mood) || 0) + 1);
                });
                const allTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);

                return (
                  <div style={{
                    position: 'absolute', bottom: '48px', left: '50%', transform: 'translateX(-50%)',
                    background: '#fff', border: '1px solid #e5e5e5', borderRadius: '8px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12)', padding: '12px', minWidth: '180px',
                  }}>
                    {filterTag && (
                      <button
                        onClick={() => { setFilterTag(null); setShowTagPanel(false); }}
                        style={{
                          width: '100%', padding: '6px 0', marginBottom: '8px', fontSize: '12px',
                          color: 'var(--color-primary, #0052D9)', background: 'none', border: 'none', cursor: 'pointer',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        <i className="fa-regular fa-xmark" style={{ marginRight: '4px' }} />
                        清除筛选
                      </button>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {allTags.map(([tag, count]) => {
                        const tc = getTagColor(tag);
                        const isActive = filterTag === tag;
                        return (
                          <button
                            key={tag}
                            onClick={() => { setFilterTag(isActive ? null : tag); setShowTagPanel(false); }}
                            style={{
                              padding: '4px 10px', fontSize: '12px', borderRadius: '4px',
                              border: isActive ? `1px solid ${tc.bg}` : '1px solid #e5e5e5',
                              background: isActive ? tc.bg : '#fafafa',
                              color: isActive ? '#fff' : '#555',
                              cursor: 'pointer', transition: 'all 0.15s',
                              display: 'flex', alignItems: 'center', gap: '4px',
                            }}
                          >
                            #{tag} <span style={{ fontSize: '10px', opacity: 0.7 }}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                    {allTags.length === 0 && (
                      <p style={{ fontSize: '12px', color: '#999', textAlign: 'center', padding: '8px 0' }}>暂无标签</p>
                    )}
                  </div>
                );
              })()}
            </div>
            {/* 发布（仅管理员） */}
            {isAdmin && (
              <button onClick={openComposer} title="发布说说" style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: '#7a7670', transition: 'background 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <i className="fa-regular fa-plus" style={{ fontSize: '18px' }} />
              </button>
            )}
            {/* 管理后台 */}
            {isAdmin && (
              <a href="/admin/moments" title="管理说说" style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: '#7a7670', textDecoration: 'none', transition: 'background 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              ><i className="fa-regular fa-gear" style={{ fontSize: '18px' }} /></a>
            )}
          </div>
          <div style={{ width: '1px', height: '24px', background: '#e2dfd8' }} />
          {/* 数量 */}
          <div style={{ padding: '0 12px', fontSize: '11px', color: '#999' }}>
            {filterYear !== null ? (
              <span style={{ color: 'var(--color-primary, #0052D9)', fontWeight: 500 }}>{filterYear}{filterMonth !== null ? `·${filterMonth + 1}月` : ''}</span>
            ) : (
              <span>{moments.length} 条</span>
            )}
          </div>
        </div>
      </div>

      {/* ==================== Composer Modal ==================== */}
      {showComposer && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowComposer(false); }}
        >
          <div style={{ width: '520px', maxWidth: '90vw', background: '#fff', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)', position: 'relative', overflow: 'hidden' }}>
            {/* Badge */}
            <div style={{
              position: 'absolute', top: '-1px', right: '24px',
              background: mood ? getTagColor(mood).bg : '#4a9e8e', color: '#fff',
              fontSize: '11px', fontWeight: 600, padding: '6px 14px',
              borderRadius: '0 0 8px 8px', letterSpacing: '0.08em',
              boxShadow: '0 2px 6px rgba(0,0,0,0.12)', transition: 'background 0.2s',
            }}>
              {mood || '新故事'}
            </div>

            <div style={{ padding: '28px' }}>
              {/* Header */}
              <div style={{ marginBottom: '20px' }}>
                <span style={{ fontSize: '14px', color: '#9e9a93' }}>写点什么？</span>
              </div>

              {/* Tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                {tags.map(tag => (
                  <button key={tag} onClick={() => setMood(mood === tag ? '' : tag)} style={{
                    padding: '5px 14px', borderRadius: '16px', fontSize: '12px',
                    border: `1px solid ${mood === tag ? getTagColor(tag).bg : '#e2dfd8'}`,
                    color: mood === tag ? getTagColor(tag).bg : '#7a7670',
                    background: mood === tag ? `${getTagColor(tag).bg}0F` : 'transparent',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}>{tag}</button>
                ))}
              </div>

              {/* Textarea */}
              <textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value)} placeholder="请输入你的想法..."
                style={{ width: '100%', minHeight: '140px', border: 'none', outline: 'none', fontSize: '14px', lineHeight: 1.8, color: '#2b2a28', resize: 'vertical', fontFamily: 'inherit', background: 'transparent' }}
              />

              {/* Image previews */}
              {images.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                  {images.map((url, idx) => (
                    <div key={idx} style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '6px', overflow: 'hidden' }}>
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button onClick={() => removeImage(idx)} style={{
                        position: 'absolute', top: '2px', right: '2px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', lineHeight: 1,
                      }}>
                        <i className="fa-solid fa-xmark" style={{ fontSize: '10px' }} />
                      </button>
                    </div>
                  ))}
                  {uploading && (
                    <div style={{ width: '72px', height: '72px', borderRadius: '6px', background: '#f5f4f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#9e9a93' }}>上传中</span>
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f0ede8' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {/* Image upload button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 10px', borderRadius: '12px', fontSize: '12px',
                      background: 'transparent', color: images.length > 0 ? '#4a9e8e' : '#b8b4ad',
                      border: '1px solid #e2dfd8', cursor: uploading ? 'wait' : 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <i className="fa-regular fa-image" style={{ fontSize: '12px' }} />
                    <span>{uploading ? '上传中...' : images.length > 0 ? `${images.length} 张图片` : '添加图片'}</span>
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImageUpload} />

                  {/* Location button */}
                  {location ? (
                    <button onClick={() => setLocation('')} style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 10px', borderRadius: '12px', fontSize: '12px',
                      background: 'rgba(74,158,142,0.08)', color: '#4a9e8e',
                      border: '1px solid rgba(74,158,142,0.2)', cursor: 'pointer',
                    }}>
                      <i className="fa-regular fa-location-dot" style={{ fontSize: '12px' }} /><span>{location}</span><span style={{ marginLeft: '2px', opacity: 0.6 }}>&times;</span>
                    </button>
                  ) : (
                    <button onClick={handleGetLocation} disabled={locating} style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 10px', borderRadius: '12px', fontSize: '12px',
                      background: 'transparent', color: '#b8b4ad', border: '1px solid #e2dfd8',
                      cursor: locating ? 'wait' : 'pointer',
                    }}>
                      <i className="fa-regular fa-location-dot" style={{ fontSize: '12px' }} /><span>{locating ? '定位中...' : '选择位置'}</span>
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button onClick={() => setShowComposer(false)} style={{ fontSize: '12px', color: '#b8b4ad', background: 'none', border: 'none', cursor: 'pointer' }}>
                    取消
                  </button>
                  <button
                    onClick={handlePublish}
                    disabled={submitting}
                    style={{
                      padding: '6px 20px', borderRadius: '16px', fontSize: '12px', fontWeight: 600,
                      background: mood ? getTagColor(mood).bg : '#4a9e8e', color: '#fff',
                      border: 'none', cursor: submitting ? 'wait' : 'pointer',
                      opacity: submitting ? 0.6 : 1, transition: 'all 0.2s',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    {submitting ? '发布中...' : '↵ 发布'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== Lightbox ==================== */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          {/* Close button */}
          <button style={{
            position: 'absolute', top: '20px', right: '20px',
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="fa-solid fa-xmark" style={{ fontSize: '20px' }} />
          </button>

          {/* Image */}
          <img
            src={lightbox.images[lightbox.index]}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '90vw', maxHeight: '90vh',
              objectFit: 'contain', borderRadius: '4px',
              cursor: 'default',
            }}
          />

          {/* Navigation arrows */}
          {lightbox.images.length > 1 && (
            <>
              {lightbox.index > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: prev.index - 1 } : null); }}
                  style={{
                    position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)',
                    width: '44px', height: '44px', borderRadius: '50%',
                    background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer',
                    color: '#fff', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ‹
                </button>
              )}
              {lightbox.index < lightbox.images.length - 1 && (
                <button
                  onClick={e => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: prev.index + 1 } : null); }}
                  style={{
                    position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)',
                    width: '44px', height: '44px', borderRadius: '50%',
                    background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer',
                    color: '#fff', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ›
                </button>
              )}
              {/* Counter */}
              <span style={{
                position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
                color: 'rgba(255,255,255,0.6)', fontSize: '13px',
              }}>
                {lightbox.index + 1} / {lightbox.images.length}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
