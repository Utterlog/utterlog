'use client';

import PostCard from './PostCard';
import Sidebar from './Sidebar';
import Pagination from '@/components/blog/Pagination';
import FadeCover from '@/components/blog/FadeCover';
import { randomCoverUrl } from '@/lib/blog-image';
import { useThemeContext } from '@/lib/theme-context';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getCategoryIcon } from './constants';
import PostLink from '@/components/blog/PostLink';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
const ACCENT = '#f53004';

const MODES = [
  { key: 'latest', label: '最新文章', color: '#f53004', param: '&order_by=created_at&order=desc' },
  { key: 'hot', label: '热门文章', color: '#e53935', param: '&order_by=view_count&order=desc' },
  { key: 'comments', label: '热评文章', color: '#f57c00', param: '&order_by=comment_count&order=desc' },
  { key: 'random', label: '随机文章', color: '#43a047', param: '&order_by=random' },
] as const;

export default function HomePage({ posts, page, totalPages }: { posts: any[]; page: number; totalPages: number }) {
  const [categories, setCategories] = useState<any[]>([]);
  const [activeCatIdx, setActiveCatIdx] = useState(0);
  const [modeIdx, setModeIdx] = useState(0);
  const [heroPost, setHeroPost] = useState<any>(null);
  const [paused, setPaused] = useState(false);
  const [latestMoment, setLatestMoment] = useState<any>(null);
  const [totalPostCount, setTotalPostCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const heroCacheRef = useRef<Record<string, Record<string, any>>>({});

  const allTabs = ['', ...categories.map(c => c.slug)];
  const activeCatSlug = allTabs[activeCatIdx] || '';

  const preloadHeroes = useCallback((cats: any[]) => {
    const slugs = ['', ...cats.map((c: any) => c.slug)];
    slugs.forEach(slug => {
      MODES.forEach(mode => {
        let url = `${API}/posts?per_page=1&status=publish${mode.param}`;
        if (slug) url += `&category=${slug}`;
        fetch(url).then(r => r.json()).then(r => {
          const items = r.data?.posts || r.data || [];
          if (items.length > 0) {
            if (!heroCacheRef.current[slug]) heroCacheRef.current[slug] = {};
            heroCacheRef.current[slug][mode.key] = items[0];
          }
        }).catch(() => {});
      });
    });
  }, []);

  useEffect(() => {
    fetch(`${API}/categories`).then(r => r.json()).then(r => {
      const cats = r.data || [];
      setCategories(cats);
      preloadHeroes(cats);
    }).catch(() => {});
    fetch(`${API}/archive/stats`).then(r => r.json()).then(r => setTotalPostCount(r.data?.post_count || 0)).catch(() => {});
    fetch(`${API}/moments?per_page=1`).then(r => r.json()).then(r => {
      const items = r.data?.moments || r.data || [];
      if (items.length > 0) setLatestMoment(items[0]);
    }).catch(() => {});
    fetch(`${API}/posts?per_page=1&status=publish`).then(r => r.json()).then(r => {
      const items = r.data?.posts || r.data || [];
      if (items.length > 0) setHeroPost(items[0]);
    }).catch(() => {});
  }, [preloadHeroes]);

  useEffect(() => {
    const cached = heroCacheRef.current[activeCatSlug]?.[MODES[modeIdx].key];
    if (cached) {
      setHeroPost(cached);
    } else {
      let url = `${API}/posts?per_page=1&status=publish${MODES[modeIdx].param}`;
      if (activeCatSlug) url += `&category=${activeCatSlug}`;
      fetch(url).then(r => r.json()).then(r => {
        const items = r.data?.posts || r.data || [];
        if (items.length > 0) setHeroPost(items[0]);
      }).catch(() => {});
    }
  }, [activeCatIdx, modeIdx, activeCatSlug]);

  const advance = useCallback(() => {
    setActiveCatIdx(prev => (prev + 1) % (categories.length + 1));
    setModeIdx(Math.floor(Math.random() * MODES.length));
  }, [categories.length]);

  useEffect(() => {
    if (paused || page !== 1) return;
    timerRef.current = setInterval(advance, 8000);
    return () => clearInterval(timerRef.current);
  }, [paused, advance, page]);

  const handleTabClick = (idx: number) => {
    if (idx === activeCatIdx) {
      setModeIdx(prev => (prev + 1) % MODES.length);
    } else {
      setActiveCatIdx(idx);
      setModeIdx(Math.floor(Math.random() * MODES.length));
    }
  };

  const goFirst = () => { setActiveCatIdx(0); setModeIdx(Math.floor(Math.random() * MODES.length)); };
  const goPrev = () => {
    setActiveCatIdx(p => (p - 1 + categories.length + 1) % (categories.length + 1));
    setModeIdx(Math.floor(Math.random() * MODES.length));
  };
  const goNext = () => advance();
  const goLast = () => { setActiveCatIdx(categories.length); setModeIdx(Math.floor(Math.random() * MODES.length)); };

  // 文章列表始终显示全部（分类标签只影响 hero 轮播）

  const { options } = useThemeContext();
  const heroSrc = heroPost?.cover_url || (heroPost ? randomCoverUrl(heroPost.id, options) : '');

  const tabCount = 1 + categories.length;
  const heroHeight = Math.max(280, tabCount * 56);

  return (
    <div>
      <div style={{ display: 'flex' }}>
        {/* Left category tabs */}
        <div style={{ width: '280px', flexShrink: 0, borderRight: '1px solid #e5e5e5' }} className="hidden lg:block">
          {/* Tabs — height matching hero */}
          {page === 1 && (
            <div style={{ height: heroHeight, display: 'flex', flexDirection: 'column' }}>
              <button onClick={() => handleTabClick(0)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', flex: 1, padding: '0 16px', fontSize: '14px',
                color: activeCatIdx === 0 ? '#fff' : '#555',
                background: activeCatIdx === 0 ? ACCENT : 'transparent',
                border: 'none', borderBottom: '1px solid #e5e5e5', cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.15s',
              }}>
                <span>全部 ({totalPostCount})</span>
                <i className="fa-sharp fa-light fa-grid-2" style={{ fontSize: '22px', opacity: 0.6 }} />
              </button>
              {categories.map((cat, i) => (
                <button key={cat.id} onClick={() => handleTabClick(i + 1)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', flex: 1, padding: '0 16px', fontSize: '14px',
                  color: activeCatIdx === i + 1 ? '#fff' : '#555',
                  background: activeCatIdx === i + 1 ? ACCENT : 'transparent',
                  border: 'none', borderBottom: '1px solid #e5e5e5', cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.15s',
                }}>
                  <span>{cat.name} ({cat.count || 0})</span>
                  <i className={getCategoryIcon(cat)} style={{ fontSize: '22px', opacity: 0.6 }} />
                </button>
              ))}
            </div>
          )}

          {/* Playback controls — independent */}
          {page === 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '6px 0',
              borderBottom: '1px solid #e5e5e5', background: '#fafafa',
            }}>
              {[
                { icon: 'fa-solid fa-backward-fast', action: goFirst },
                { icon: 'fa-solid fa-backward-step', action: goPrev },
                { icon: paused ? 'fa-solid fa-play' : 'fa-solid fa-pause', action: () => setPaused(!paused) },
                { icon: 'fa-solid fa-forward-step', action: goNext },
                { icon: 'fa-solid fa-forward-fast', action: goLast },
              ].map((btn, i) => (
                <button key={i} onClick={btn.action} style={{
                  padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer',
                  color: '#666', fontSize: '12px', transition: 'color 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.color = ACCENT)}
                  onMouseLeave={e => (e.currentTarget.style.color = '#666')}
                >
                  <i className={btn.icon} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Hero image */}
          {page === 1 && heroPost && (
            <div
              style={{ position: 'relative', borderBottom: '1px solid #e5e5e5', overflow: 'hidden' }}
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              <PostLink post={heroPost} style={{ display: 'block', textDecoration: 'none' }}>
                <FadeCover src={heroSrc} alt={heroPost.title}
                  style={{ width: '100%', height: heroHeight }} />
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                  padding: '60px 24px 20px',
                }}>
                  <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', lineHeight: 1.4 }}>
                    {heroPost.title}
                  </h2>
                </div>
              </PostLink>
              <div style={{
                position: 'absolute', top: 0, right: 0, zIndex: 2,
                background: MODES[modeIdx].color, color: '#fff', fontSize: '12px', fontWeight: 600,
                padding: '8px 6px', writingMode: 'vertical-rl' as const,
                letterSpacing: '0.1em', transition: 'background 0.3s',
              }}>
                {MODES[modeIdx].label}
              </div>
            </div>
          )}

          {/* Moment ticker */}
          {page === 1 && latestMoment && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 20px', borderBottom: '1px solid #e5e5e5',
              fontSize: '13px', background: '#fafafa',
            }}>
              <i className="fa-brands fa-twitter" style={{ color: '#1da1f2' }} />
              <p style={{ flex: 1, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                {latestMoment.content}
              </p>
              <span style={{ fontSize: '11px', color: '#bbb', flexShrink: 0 }}>
                {(() => {
                  const diff = (Date.now() - (typeof latestMoment.created_at === 'number' ? latestMoment.created_at * 1000 : new Date(latestMoment.created_at).getTime())) / 1000;
                  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
                  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
                  return Math.floor(diff / 86400) + ' 天前';
                })()}
              </span>
            </div>
          )}

          {/* Content + sidebar */}
          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {posts.length > 0 ? (
                posts.map((post, idx) => (
                  <div key={post.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <PostCard post={post} priority={page === 1 && idx === 0} />
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '80px 0', color: '#999', fontSize: '14px' }}>暂无文章</div>
              )}
              <div style={{ padding: '16px 20px' }}>
                <Pagination currentPage={page} totalPages={totalPages} />
              </div>
            </div>
            <div style={{ borderLeft: '1px solid #e5e5e5' }} className="hidden lg:block">
              <Sidebar />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
