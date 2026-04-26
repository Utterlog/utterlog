'use client';

import PostCard from './PostCard';
import Sidebar from './Sidebar';
import Pagination from './Pagination';
import FadeCover from '@/components/blog/FadeCover';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getCategoryIcon } from './constants';
import { useThemeContext } from '@/lib/theme-context';
import { randomCoverUrl } from '@/lib/blog-image';
import PostLink from '@/components/blog/PostLink';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
const ACCENT = '#0052D9';

const MODES = [
  { key: 'latest', label: '最新文章', color: '#0052D9', param: '&order_by=created_at&order=desc' },
  { key: 'hot', label: '热门文章', color: '#e53935', param: '&order_by=view_count&order=desc' },
  { key: 'comments', label: '热评文章', color: '#f57c00', param: '&order_by=comment_count&order=desc' },
  { key: 'random', label: '随机文章', color: '#43a047', param: '&order_by=random' },
] as const;

export default function HomePage({ posts, page, totalPages, categories: serverCategories = [], archiveStats: serverStats = {}, perPage = 8 }: { posts: any[]; page: number; totalPages: number; categories?: any[]; archiveStats?: any; perPage?: number }) {
  const [categories, setCategories] = useState<any[]>(serverCategories);
  const [activeCatIdx, setActiveCatIdx] = useState(0);
  // Admin-configured sidebar menu items. When non-empty, each row
  // becomes a static navigation link in the hero sidebar instead of
  // the auto-generated category filter tabs. Empty ⇒ fall back to
  // the category auto-list behavior.
  const { menus: ctxMenus, options } = useThemeContext();
  const sidebarMenu = Array.isArray(ctxMenus?.sidebar) ? ctxMenus.sidebar : [];
  const useCustomSidebar = sidebarMenu.length > 0;
  const [modeIdx, setModeIdx] = useState(0);
  const [heroPost, setHeroPost] = useState<any>(posts[0] || null);
  const [paused, setPaused] = useState(false);
  const [latestMoment, setLatestMoment] = useState<any>(null);
  const [totalPostCount, setTotalPostCount] = useState(serverStats.post_count || 0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // PJAX 分页状态
  const [currentPosts, setCurrentPosts] = useState(posts);
  const [currentPage, setCurrentPage] = useState(page);
  const [currentTotalPages, setCurrentTotalPages] = useState(totalPages);
  const [pageLoading, setPageLoading] = useState(false);
  // Preloaded cache: heroCache[catSlug][modeKey] = post
  const heroCacheRef = useRef<Record<string, Record<string, any>>>({});

  const allTabs = ['', ...categories.map(c => c.slug)];
  const activeCatSlug = allTabs[activeCatIdx] || '';

  // Preload all hero posts on mount + when categories load
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
    // Always fetch fresh categories and stats from client
    fetch(`${API}/categories`).then(r => r.json()).then(r => {
      const cats = r.data || [];
      setCategories(cats);
      preloadHeroes(cats);
    }).catch(() => {
      if (serverCategories.length > 0) preloadHeroes(serverCategories);
    });
    fetch(`${API}/archive/stats`).then(r => r.json()).then(r => setTotalPostCount(r.data?.post_count || 0)).catch(() => {});
    fetch(`${API}/moments?per_page=1`).then(r => r.json()).then(r => {
      const items = r.data?.moments || r.data || [];
      if (items.length > 0) setLatestMoment(items[0]);
    }).catch(() => {});
  }, [preloadHeroes, serverCategories, serverStats.post_count]);


  // Switch hero from cache instantly
  useEffect(() => {
    const cached = heroCacheRef.current[activeCatSlug]?.[MODES[modeIdx].key];
    if (cached) {
      setHeroPost(cached);
    } else {
      // Fallback: fetch if not cached yet
      let url = `${API}/posts?per_page=1&status=publish${MODES[modeIdx].param}`;
      if (activeCatSlug) url += `&category=${activeCatSlug}`;
      fetch(url).then(r => r.json()).then(r => {
        const items = r.data?.posts || r.data || [];
        if (items.length > 0) setHeroPost(items[0]);
      }).catch(() => {});
    }
  }, [activeCatIdx, modeIdx, activeCatSlug]);

  // Auto-rotate: next category + random mode, every 5s.
  const advance = useCallback(() => {
    setActiveCatIdx(prev => (prev + 1) % (categories.length + 1));
    setModeIdx(Math.floor(Math.random() * MODES.length));
  }, [categories.length]);

  // Restart the timer whenever activeCatIdx / modeIdx changes — that
  // way clicking a tab (handleTabClick mutates these) wipes the
  // existing countdown so the next auto-advance is a full 5s away,
  // instead of firing in whatever fragment of the old 5s remained
  // and snapping the user off the tab they just selected.
  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(advance, 5000);
    return () => clearInterval(timerRef.current);
  }, [paused, advance, page, activeCatIdx, modeIdx]);

  // Click same tab = cycle to next mode; click different tab = switch + random mode
  const handleTabClick = (idx: number) => {
    if (idx === activeCatIdx) {
      setModeIdx(prev => (prev + 1) % MODES.length);
    } else {
      setActiveCatIdx(idx);
      setModeIdx(Math.floor(Math.random() * MODES.length));
    }
  };

  // 原本这里有播放控制按钮（goFirst/goPrev/goNext/goLast 切换 hero 分类轮播），
  // 但用户反馈这一行没人用，已改为渲染博主社交链接图标。
  // 自动轮播的开关仍然由 hero 区块本身的 hover 控制（onMouseEnter/Leave 改 paused 即可）。

  // PJAX 分页切换
  const handlePageChange = useCallback(async (newPage: number) => {
    setPageLoading(true);
    try {
      const r = await fetch(`${API}/posts?page=${newPage}&per_page=${perPage}&status=publish&order_by=created_at&order=desc`).then(r => r.json());
      const items = r.data?.posts || r.data || [];
      const total = r.meta?.total_pages || r.data?.total_pages || 1;
      setCurrentPosts(items);
      setCurrentPage(newPage);
      setCurrentTotalPages(total);
      // 更新 URL
      const url = newPage === 1 ? '/' : `/page/${newPage}`;
      window.history.pushState({ page: newPage }, '', url);
      // 滚动到文章列表顶部
      document.querySelector('.blog-main')?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {}
    setPageLoading(false);
  }, []);

  // 浏览器前进后退
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const p = e.state?.page || 1;
      handlePageChange(p);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [handlePageChange]);

  // 文章列表始终显示全部（分类标签只影响 hero 轮播）

  const heroSrc = heroPost?.cover_url || (heroPost ? randomCoverUrl(heroPost.id, options) : '');

  // ── Hero 切换过渡 ──
  // 之前点分类 tab → heroSrc 直接换 → <img src> 立刻替换，浏览器加载完
  // 才显示新图，看起来像「啪一下硬切」。
  // 现在加一层「先预加载新图 + 显示 loading 蒙层 + 至少展示 700ms」的
  // 过场，新图加载完成且最短时间到了再切 displaySrc，配合 key 触发
  // 现有的 [data-blog-image][data-loaded] 淡入动画。
  const [displaySrc, setDisplaySrc] = useState(heroSrc);
  const [heroLoading, setHeroLoading] = useState(false);
  useEffect(() => {
    if (!heroSrc || heroSrc === displaySrc) return;
    setHeroLoading(true);
    const start = Date.now();
    const img = new window.Image();
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      const elapsed = Date.now() - start;
      const minHold = 700; // 至少展示 700ms 的 loading 圆圈
      setTimeout(() => {
        if (cancelled) return;
        setDisplaySrc(heroSrc);
        // 给浏览器一帧切 src + key，再淡出 spinner，否则 spinner 消失
        // 时新 img 还没贴上 dom 会闪一下旧图
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setHeroLoading(false));
        });
      }, Math.max(0, minHold - elapsed));
    };
    img.onload = finish;
    img.onerror = finish; // 加载失败也退出 loading 态，避免卡死
    img.src = heroSrc;
    return () => { cancelled = true; };
  }, [heroSrc, displaySrc]);

  // Hero height — tab row count depends on which sidebar mode we're in.
  // Custom menu uses its own length; default uses 1 全部 + N categories.
  const tabCount = useCustomSidebar ? sidebarMenu.length : 1 + categories.length;
  const heroHeight = Math.max(280, tabCount * 56); // min 280px
  // Title bar height = exactly one sidebar tab's height. When the
  // hero is taller than tabCount * 56 (the min-280 floor kicks in
  // for sites with very few categories), we still anchor on 56 so
  // each row stays visually consistent.
  const heroTitleH = tabCount > 0 ? heroHeight / tabCount : 56;

  return (
    <div>
      {/* ===== Hero area: tabs + image — single unit, scrolls together ===== */}
      {(
        <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)' }} className="lg:grid">
          {/* Left: sidebar — admin-configured menu if set, otherwise
              auto-generated category filter tabs. */}
          <div style={{ borderRight: '1px solid #e5e5e5' }} className="hidden lg:block">
            <div style={{ height: heroHeight, display: 'flex', flexDirection: 'column' }}>
              {useCustomSidebar ? (
                sidebarMenu.map((item: any, i: number) => (
                  <Link key={i} href={item.href || '#'} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', flex: 1, padding: '0 16px', fontSize: '14px',
                    color: '#555', textDecoration: 'none',
                    borderBottom: i < sidebarMenu.length - 1 ? '1px solid #e5e5e5' : 'none',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#555'; }}
                  >
                    <span>{item.label}</span>
                    <i className={item.icon || 'fa-sharp fa-light fa-circle-arrow-right'} style={{ fontSize: '22px', opacity: 0.6, transition: 'all 0.15s' }} />
                  </Link>
                ))
              ) : (
                <>
                  <button onClick={() => handleTabClick(0)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', flex: 1, padding: '0 16px', fontSize: '14px',
                    color: activeCatIdx === 0 ? '#fff' : '#555',
                    background: activeCatIdx === 0 ? ACCENT : 'transparent',
                    border: 'none', borderBottom: '1px solid #e5e5e5', cursor: 'pointer',
                    textAlign: 'left', transition: 'all 0.15s',
                  }}>
                    <span>全部 ({totalPostCount})</span>
                    <i className="fa-sharp fa-light fa-grid-2" style={{ fontSize: activeCatIdx === 0 ? '26px' : '22px', opacity: activeCatIdx === 0 ? 1 : 0.6, color: activeCatIdx === 0 ? '#fff' : undefined, transition: 'all 0.15s' }} />
                  </button>
                  {categories.map((cat, i) => (
                    <button key={cat.id} onClick={() => handleTabClick(i + 1)} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', flex: 1, padding: '0 16px', fontSize: '14px',
                      color: activeCatIdx === i + 1 ? '#fff' : '#555',
                      background: activeCatIdx === i + 1 ? ACCENT : 'transparent',
                      border: 'none', borderBottom: i < categories.length - 1 ? '1px solid #e5e5e5' : 'none', cursor: 'pointer',
                      textAlign: 'left', transition: 'all 0.15s',
                    }}>
                      <span>{cat.name} ({cat.count || 0})</span>
                      <i className={getCategoryIcon(cat)} style={{ fontSize: activeCatIdx === i + 1 ? '26px' : '22px', opacity: activeCatIdx === i + 1 ? 1 : 0.6, color: activeCatIdx === i + 1 ? '#fff' : undefined, transition: 'all 0.15s' }} />
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
          {/* Right: Hero image — overlaps border line */}
          <div style={{ minWidth: 0, position: 'relative', zIndex: 1, marginLeft: '-1px' }}>
            {heroPost && (
              <div style={{ position: 'relative', overflow: 'hidden' }}
                onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
                {/* Hero deliberately drops .cover-zoom — the giant
                    banner doesn't need the scale(1.04) hover; loading
                    placeholder + admin's image_display_effect (fade /
                    scale / pixel / none) already drive the visual
                    feedback through globals.css.

                    key={displaySrc} 强制 FadeCover 重新挂载 ——
                    [data-blog-image] 元素重新进入 data-loaded="0" → "1"
                    的状态机，触发现有的淡入动画。配合上面的 displaySrc
                    延迟切换，得到「loading 圈展示一会儿 → 新图淡入」效果。 */}
                <PostLink post={heroPost} style={{ display: 'block', textDecoration: 'none' }}>
                  <FadeCover key={displaySrc} src={displaySrc} alt={heroPost.title} style={{ width: '100%', height: heroHeight }} />
                  {/* Loading overlay —— 切分类时盖在旧图上，模糊 + 半透黑底
                      + 中央旋转圆圈。淡出由 transition 0.4s 控制，跟新图
                      淡入并行，整体过渡总长 ≈ 700ms（最短展示）+ 0.4s（淡出）。 */}
                  <div
                    aria-hidden={!heroLoading}
                    style={{
                      position: 'absolute', inset: 0, zIndex: 3,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(0, 0, 0, 0.32)',
                      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                      opacity: heroLoading ? 1 : 0,
                      pointerEvents: heroLoading ? 'auto' : 'none',
                      transition: 'opacity 0.4s ease',
                    }}
                  >
                    <i className="fa-solid fa-spinner fa-spin" style={{ color: '#fff', fontSize: 28, opacity: 0.92 }} />
                  </div>
                  {/* Title strip: same height as one left-sidebar tab
                      so the baseline lines up with the last tab. No
                      background overlay — readability comes entirely
                      from text-shadow, two layers stacked so white
                      text stays legible over both dark and bright
                      covers without dimming the image itself. */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0, left: 0, right: 0,
                    height: heroTitleH,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 24px',
                    pointerEvents: 'none',
                  }}>
                    <h2 style={{
                      margin: 0,
                      fontSize: '20px',
                      fontWeight: 700,
                      color: '#fff',
                      lineHeight: 1.3,
                      letterSpacing: '0.01em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textShadow: '0 2px 6px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.8)',
                    }}>{heroPost.title}</h2>
                  </div>
                </PostLink>
                <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 2, background: MODES[modeIdx].color, color: '#fff', fontSize: '12px', fontWeight: 600, padding: '8px 6px', writingMode: 'vertical-rl' as const, letterSpacing: '0.1em', transition: 'background 0.3s' }}>
                  {MODES[modeIdx].label}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Social + Moment row — single unit =====
          左格原本是 hero 轮播的播放控制按钮（快退 / 上一篇 / 暂停 / 下一篇 / 快进），
          实际使用率很低，改为博主社交链接，更贴合首页气氛。
          自动轮播的「悬停暂停」逻辑保留在 hero 区块自己的 onMouseEnter 里。 */}
      {(
        <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)' }} className="lg:grid">
          {/* Left: Social links — admin 配置的项才会显示，全空时整格为空。 */}
          <div style={{ borderRight: '1px solid #e5e5e5' }} className="hidden lg:block">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', height: '38px', borderTop: '1px solid #e5e5e5', borderBottom: '1px solid #e5e5e5', background: '#fafafa' }}>
              {(() => {
                const items: Array<{ key: string; href: string; icon: string; hover: string; title: string; mail?: boolean }> = [];
                if (options.social_github) items.push({ key: 'github', href: options.social_github, icon: 'fa-brands fa-github', hover: '#333', title: 'GitHub' });
                if (options.social_twitter) items.push({ key: 'twitter', href: options.social_twitter, icon: 'fa-brands fa-x-twitter', hover: '#1da1f2', title: 'Twitter / X' });
                if (options.social_weibo) items.push({ key: 'weibo', href: options.social_weibo, icon: 'fa-brands fa-weibo', hover: '#e6162d', title: '微博' });
                if (options.social_telegram) items.push({ key: 'telegram', href: options.social_telegram, icon: 'fa-brands fa-telegram', hover: '#0088cc', title: 'Telegram' });
                if (options.social_youtube) items.push({ key: 'youtube', href: options.social_youtube, icon: 'fa-brands fa-youtube', hover: '#ff0000', title: 'YouTube' });
                if (options.social_instagram) items.push({ key: 'instagram', href: options.social_instagram, icon: 'fa-brands fa-instagram', hover: '#e4405f', title: 'Instagram' });
                if (options.social_bilibili) items.push({ key: 'bilibili', href: options.social_bilibili, icon: 'fa-brands fa-bilibili', hover: '#00a1d6', title: 'Bilibili' });
                if (options.social_email) items.push({ key: 'email', href: `mailto:${options.social_email}`, icon: 'fa-regular fa-envelope', hover: '#333', title: '邮箱', mail: true });
                if (options.site_url) items.push({ key: 'site', href: options.site_url, icon: 'fa-solid fa-globe', hover: ACCENT, title: '网站' });
                return items.map(it => (
                  <a
                    key={it.key}
                    href={it.href}
                    target={it.mail ? undefined : '_blank'}
                    rel={it.mail ? undefined : 'noopener noreferrer'}
                    title={it.title}
                    style={{ color: '#666', textDecoration: 'none', fontSize: '14px', transition: 'color 0.15s', display: 'inline-flex', alignItems: 'center' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = it.hover; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#666'; }}
                  >
                    <i className={it.icon} />
                  </a>
                ));
              })()}
            </div>
          </div>
          {/* Right: Moment ticker */}
          <div style={{ minWidth: 0 }}>
            {latestMoment && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '38px', padding: '0 20px', borderTop: '1px solid #e5e5e5', borderBottom: '1px solid #e5e5e5', fontSize: '13px', background: '#fafafa' }}>
                <i className="fa-brands fa-twitter" style={{ color: '#1da1f2', flexShrink: 0 }} />
                <a href="/moments" style={{ flex: 1, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0, textDecoration: 'none' }}>{latestMoment.content}</a>
                <span style={{ fontSize: '11px', color: '#bbb', flexShrink: 0 }}>
                  {(() => { const diff = (Date.now() - (typeof latestMoment.created_at === 'number' ? latestMoment.created_at * 1000 : new Date(latestMoment.created_at).getTime())) / 1000; if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'; if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'; return Math.floor(diff / 86400) + ' 天前'; })()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Content area: sidebar sticky + posts list ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)' }} className="lg:grid">
        <div style={{ borderRight: '1px solid #e5e5e5' }} className="hidden lg:block">
          <div style={{ position: 'sticky', top: 0 }}>
            <Sidebar />
          </div>
        </div>
        {/* Right: Post list */}
        <div style={{ minWidth: 0 }}>
          {pageLoading ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#999', fontSize: '14px' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />加载中...
            </div>
          ) : currentPosts.length > 0 ? (
            currentPosts.map((post, idx) => (
              <div key={post.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                <PostCard post={post} isNewest={currentPage === 1 && idx === 0} priority={currentPage === 1 && idx === 0} />
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#999', fontSize: '14px' }}>暂无文章</div>
          )}
          <div style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
            <Pagination currentPage={currentPage} totalPages={currentTotalPages} onPageChange={handlePageChange} />
          </div>
        </div>
      </div>
    </div>
  );
}
