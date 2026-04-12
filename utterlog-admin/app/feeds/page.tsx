'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Globe, ExternalLink } from '@/components/icons';

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pub_date?: string;
  pubDate?: string;
  site_name?: string;
  site_url?: string;
  sourceName?: string;
  sourceUrl?: string;
}

function timeAgo(val: string | number): string {
  if (!val) return '';
  const ts = typeof val === 'number' ? val * 1000 : (Number(val) > 1e9 ? Number(val) * 1000 : new Date(val).getTime());
  if (isNaN(ts)) return String(val);
  const diff = Date.now() - ts;
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

const rotations = [-2.2, 1.5, -0.8, 2.0, -1.5, 1.2, -1.8, 0.5, -1.0, 2.3, -0.3, 1.8];
const sourceColors = [
  '#4a9e8e', '#c4956a', '#8b7ec8', '#d4837a', '#6b9dbd', '#9aab68',
  '#e8a87c', '#7eb5a6', '#b07ec8', '#c97a7a', '#5d8cae', '#85a65d',
];

function getSourceColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return sourceColors[Math.abs(hash) % sourceColors.length];
}

// Generate scattered positions for cards in a grid-like pattern with overlap
function getCardPositions(count: number) {
  const cols = 4;
  const cardW = 260;
  const cardH = 300;
  const gapX = 40;
  const gapY = 30;
  const positions: { x: number; y: number; rotation: number }[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Base grid position with random offset for overlap effect
    const seed = i * 7 + 13;
    const offsetX = ((seed * 17) % 60) - 30;
    const offsetY = ((seed * 23) % 50) - 25;
    positions.push({
      x: col * (cardW + gapX) + offsetX,
      y: row * (cardH + gapY) + offsetY,
      rotation: rotations[i % rotations.length],
    });
  }
  return positions;
}

export default function FeedsPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState<number | null>(null);
  const [topZ, setTopZ] = useState(100);
  const [cardZs, setCardZs] = useState<Record<number, number>>({});
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    loadFeeds();
  }, []);

  const loadFeeds = async () => {
    setLoading(true);
    try {
      // Try Go backend feed-timeline first
      const r: any = await api.get('/social/feed-timeline');
      const data = r.data || [];
      if (data.length > 0) {
        setItems(data.map((item: any) => ({
          title: item.title,
          link: item.link,
          description: item.description,
          pubDate: item.pub_date,
          sourceName: item.site_name,
          sourceUrl: item.site_url,
        })));
        setLoading(false);
        return;
      }
    } catch {}

    // Fallback: fetch from links RSS
    try {
      const linksRes: any = await api.get('/links');
      const links = (linksRes.data || []).filter((l: any) => l.rss_url);

      const allItems: FeedItem[] = [];
      for (const link of links) {
        try {
          const proxyUrl = `/api/v1/rss/parse?url=${encodeURIComponent(link.rss_url)}`;
          const resp: any = await api.get(proxyUrl);
          if (resp.items) {
            resp.items.forEach((item: any) => {
              allItems.push({
                title: item.title,
                link: item.link,
                description: item.description,
                pubDate: item.pubDate || item.pub_date,
                sourceName: link.name,
                sourceUrl: link.url,
              });
            });
          }
        } catch {}
      }

      allItems.sort((a, b) => new Date(b.pubDate || '').getTime() - new Date(a.pubDate || '').getTime());
      setItems(allItems);
    } catch {}

    setLoading(false);
  };

  return (
    <div
      onClick={() => setActiveCard(null)}
      style={{
        minHeight: 'calc(100vh - 57px)',
        backgroundImage: 'radial-gradient(#e2dfd8 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        backgroundPosition: 'center center',
        padding: isMobile ? '40px 16px 80px' : '60px 40px 80px',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '64px' }}>
        <h1
          style={{
            fontFamily: '"Noto Serif SC", "Noto Serif JP", serif',
            fontSize: '22px',
            fontWeight: 300,
            color: '#7a7670',
            lineHeight: 2.2,
            letterSpacing: '0.12em',
          }}
        >
          订阅
        </h1>
        <p style={{ fontSize: '11px', color: '#9e9a93', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          来自友链的最新文章
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <p style={{ fontSize: '13px', color: '#9e9a93' }}>加载中...</p>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <p style={{ fontSize: '15px', color: '#9e9a93', marginBottom: '8px' }}>暂无订阅内容</p>
          <p style={{ fontSize: '13px', color: '#b8b4ad' }}>在后台友链管理中添加 RSS 地址即可</p>
        </div>
      ) : isMobile ? (
        /* Mobile: simple vertical list */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px', margin: '0 auto' }}>
          {items.map((item, i) => {
            const name = item.sourceName || item.site_name || '';
            const siteUrl = item.sourceUrl || item.site_url || '';
            const color = getSourceColor(name);
            const date = item.pubDate || item.pub_date || '';
            const favicon = siteUrl ? `https://ico.bluecdn.com/${new URL(siteUrl).hostname}` : '';
            const initial = name ? name[0].toUpperCase() : '?';
            return (
              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <div style={{ background: '#fff', borderRadius: '2px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, overflow: 'hidden', position: 'relative' }}>
                        <span>{initial}</span>
                        {favicon && <img src={favicon} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                      </div>
                      <span style={{ fontSize: '12px', color: '#7a7670', fontWeight: 500 }}>{name}</span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#b8b4ad' }}>{timeAgo(date)}</span>
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.5, color: '#2b2a28', marginBottom: '8px' }}>{item.title}</h3>
                  {item.description && (
                    <p style={{ fontSize: '13px', lineHeight: 1.7, color: '#7a7670', display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.description}</p>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      ) : (() => {
        const positions = getCardPositions(items.length);
        const totalRows = Math.ceil(items.length / 4);
        const containerH = totalRows * 330 + 100;

        const handleCardClick = (e: React.MouseEvent, i: number, link: string) => {
          e.stopPropagation();
          if (activeCard === i) {
            window.open(link, '_blank', 'noopener,noreferrer');
            return;
          }
          const newZ = topZ + 1;
          setTopZ(newZ);
          setCardZs(prev => ({ ...prev, [i]: newZ }));
          setActiveCard(i);
        };

        return (
          <div
            onClick={(e) => { if (e.target === e.currentTarget) setActiveCard(null); }}
            style={{ position: 'relative', maxWidth: '1300px', margin: '0 auto', height: containerH }}
          >
            {items.map((item, i) => {
              const pos = positions[i];
              const name = item.sourceName || item.site_name || '';
              const siteUrl = item.sourceUrl || item.site_url || '';
              const color = getSourceColor(name);
              const date = item.pubDate || item.pub_date || '';
              const favicon = siteUrl ? `https://ico.bluecdn.com/${new URL(siteUrl).hostname}` : '';
              const initial = name ? name[0].toUpperCase() : '?';
              const isActive = activeCard === i;
              const z = cardZs[i] || (items.length - i);

              return (
                <div
                  key={i}
                  onClick={(e) => handleCardClick(e, i, item.link)}
                  style={{
                    position: 'absolute',
                    left: pos.x + 40,
                    top: pos.y + 20,
                    width: '260px',
                    transform: `rotate(${isActive ? 0 : pos.rotation}deg) scale(${isActive ? 1.02 : 1})`,
                    zIndex: z,
                    cursor: isActive ? 'pointer' : 'default',
                    transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                  }}
                >
                  <div
                    style={{
                      background: '#fff',
                      borderRadius: '2px',
                      padding: '24px',
                      boxShadow: isActive
                        ? '0 12px 40px rgba(0,0,0,0.15)'
                        : '0 2px 12px rgba(0,0,0,0.06)',
                    }}
                  >
                    {/* Top row: avatar + name | time */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          background: color, color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: 700, flexShrink: 0,
                          overflow: 'hidden', position: 'relative',
                        }}>
                          <span>{initial}</span>
                          {favicon && (
                            <img
                              src={favicon}
                              alt=""
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                        </div>
                        <span style={{ fontSize: '12px', color: '#7a7670', fontWeight: 500 }}>{name}</span>
                      </div>
                      <span style={{ fontSize: '10px', color: '#b8b4ad', letterSpacing: '0.05em', flexShrink: 0 }}>
                        {timeAgo(date)}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 style={{
                      fontSize: '15px', fontWeight: 700, lineHeight: 1.5,
                      color: '#2b2a28', marginBottom: '12px',
                    }}>
                      {item.title}
                    </h3>

                    {/* Description */}
                    {item.description && (
                      <p style={{
                        fontSize: '13px', lineHeight: 1.8, color: '#7a7670',
                        ...(isActive ? {} : { display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }),
                      }}>
                        {item.description}
                      </p>
                    )}

                    {/* Read hint when active */}
                    {isActive && (
                      <div style={{ marginTop: '12px', fontSize: '11px', color: '#4a9e8e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ExternalLink size={11} /> 点击阅读全文
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

    </div>
  );
}
