'use client';

import PostCard from './PostCard';
import Sidebar from './Sidebar';
import Pagination from './Pagination';
import FadeCover from '@/components/blog/FadeCover';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
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
  const isAllSidebarItem = (item: any) => {
    const label = String(item?.label || '').trim();
    const href = String(item?.href || '').trim();
    return item?.type === 'all' || href === '__all__' || (label === '全部' && (!href || href === '/' || href === '#'));
  };
  const rawSidebarMenu = Array.isArray(ctxMenus?.sidebar) ? ctxMenus.sidebar : [];
  const sidebarMenu = rawSidebarMenu.filter((item: any) => !isAllSidebarItem(item));
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
  const categoryFromMenuItem = (item: any) => {
    if (!item) return null;
    const rawSlug = item.slug || String(item.href || '').match(/^\/categor(?:y|ies)\/([^/?#]+)/)?.[1] || '';
    const slug = rawSlug ? decodeURIComponent(rawSlug) : '';
    const id = Number(item.category_id || 0);
    const found = categories.find((cat: any) => (id > 0 && Number(cat.id) === id) || (slug && cat.slug === slug));
    if (found) return found;
    if (item.type === 'category') {
      return {
        id: item.category_id || item.href || item.label,
        name: item.label,
        slug,
        icon: item.icon,
        count: item.count || 0,
      };
    }
    return null;
  };

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
  // Custom menu still keeps the fixed "全部" tab at the top.
  const tabCount = useCustomSidebar ? 1 + sidebarMenu.length : 1 + categories.length;
  const heroHeight = Math.max(280, tabCount * 56); // min 280px
  // Title bar height = exactly one sidebar tab's height. When the
  // hero is taller than tabCount * 56 (the min-280 floor kicks in
  // for sites with very few categories), we still anchor on 56 so
  // each row stays visually consistent.
  const heroTitleH = tabCount > 0 ? heroHeight / tabCount : 56;
  const heroVars = {
    '--azure-hero-height': `${heroHeight}px`,
    '--azure-hero-title-height': `${heroTitleH}px`,
  } as CSSProperties;
  const heroModeStyle = {
    '--azure-hero-mode-color': MODES[modeIdx].color,
  } as CSSProperties;
  const renderAllHeroTab = () => (
    <button key="__all" type="button" onClick={() => handleTabClick(0)} className={`azure-hero-tab${activeCatIdx === 0 ? ' active' : ''}`}>
      <span className="azure-hero-tab-label">
        全部 <span className="azure-hero-tab-count">({totalPostCount})</span>
      </span>
      <i className="fa-sharp fa-light fa-grid-2 azure-hero-tab-icon" aria-hidden="true" />
    </button>
  );

  return (
    <div className="azure-home">
      {/* ===== Hero area: tabs + image — single unit, scrolls together ===== */}
      {(
        <div className="azure-grid azure-hero-grid" style={heroVars}>
          {/* Left: sidebar — admin-configured menu if set, otherwise
              auto-generated category filter tabs. */}
          <aside className="azure-hero-tabs">
            <div className="azure-hero-tabs-inner">
              {useCustomSidebar ? (
                <>
                  {renderAllHeroTab()}
                  {sidebarMenu.map((item: any, i: number) => {
                    const cat = categoryFromMenuItem(item);
                    if (cat) {
                      const catIdx = categories.findIndex((c: any) => c.slug === cat.slug || Number(c.id) === Number(cat.id));
                      const tabIdx = catIdx >= 0 ? catIdx + 1 : -1;
                      const active = activeCatIdx === tabIdx;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => { if (tabIdx >= 0) handleTabClick(tabIdx); }}
                          className={`azure-hero-tab${active ? ' active' : ''}`}
                          disabled={tabIdx < 0}
                        >
                          <span className="azure-hero-tab-label">
                            {cat.name} <span className="azure-hero-tab-count">({cat.count || 0})</span>
                          </span>
                          <i className={`${getCategoryIcon(cat)} azure-hero-tab-icon`} aria-hidden="true" />
                        </button>
                      );
                    }
                    return (
                      <Link key={i} href={item.href || '#'} className="azure-hero-tab link">
                        <span className="azure-hero-tab-label">{item.label}</span>
                        <i className={`${item.icon || 'fa-sharp fa-light fa-circle-arrow-right'} azure-hero-tab-icon`} aria-hidden="true" />
                      </Link>
                    );
                  })}
                </>
              ) : (
                <>
                  {renderAllHeroTab()}
                  {categories.map((cat, i) => (
                    <button key={cat.id} type="button" onClick={() => handleTabClick(i + 1)} className={`azure-hero-tab${activeCatIdx === i + 1 ? ' active' : ''}`}>
                      <span className="azure-hero-tab-label">
                        {cat.name} <span className="azure-hero-tab-count">({cat.count || 0})</span>
                      </span>
                      <i className={`${getCategoryIcon(cat)} azure-hero-tab-icon`} aria-hidden="true" />
                    </button>
                  ))}
                </>
              )}
            </div>
          </aside>
          {/* Right: Hero image — overlaps border line */}
          <section className="azure-hero-panel">
            {heroPost && (
              <div className="azure-hero"
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
                <PostLink post={heroPost} className="azure-hero-link">
                  <FadeCover key={displaySrc} src={displaySrc} alt={heroPost.title} className="azure-hero-cover" />
                  {/* Loading overlay —— 切分类时盖在旧图上，模糊 + 半透黑底
                      + 中央旋转圆圈。淡出由 transition 0.4s 控制，跟新图
                      淡入并行，整体过渡总长 ≈ 700ms（最短展示）+ 0.4s（淡出）。 */}
                  <div
                    aria-hidden={!heroLoading}
                    className={`azure-hero-loading${heroLoading ? ' active' : ''}`}
                  >
                    <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                  </div>
                  {/* Title strip: same height as one left-sidebar tab
                      so the baseline lines up with the last tab. No
                      background overlay — readability comes entirely
                      from text-shadow, two layers stacked so white
                      text stays legible over both dark and bright
                      covers without dimming the image itself. */}
                  <div className="azure-hero-titlebar">
                    <h2 className="azure-hero-title">{heroPost.title}</h2>
                  </div>
                </PostLink>
                <div className="azure-hero-mode" style={heroModeStyle}>
                  {MODES[modeIdx].label}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===== Social + Moment row — single unit =====
          左格原本是 hero 轮播的播放控制按钮（快退 / 上一篇 / 暂停 / 下一篇 / 快进），
          实际使用率很低，改为博主社交链接，更贴合首页气氛。
          自动轮播的「悬停暂停」逻辑保留在 hero 区块自己的 onMouseEnter 里。 */}
      {(
        <div className="azure-grid azure-strip">
          {/* Left: Social links — admin 配置的项才会显示，全空时整格为空。 */}
          <aside className="azure-social-cell">
            <div className="azure-social-links">
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
                    className="azure-social-link"
                    style={{ '--azure-social-hover': it.hover } as CSSProperties}
                  >
                    <i className={it.icon} aria-hidden="true" />
                  </a>
                ));
              })()}
            </div>
          </aside>
          {/* Right: Moment ticker */}
          <section className="azure-moment-cell">
            {latestMoment && (
              <div className="azure-moment-ticker">
                <i className="fa-brands fa-twitter" aria-hidden="true" />
                <a href="/moments" className="azure-moment-text">{latestMoment.content}</a>
                <span className="azure-moment-time">
                  {(() => { const diff = (Date.now() - (typeof latestMoment.created_at === 'number' ? latestMoment.created_at * 1000 : new Date(latestMoment.created_at).getTime())) / 1000; if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'; if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'; return Math.floor(diff / 86400) + ' 天前'; })()}
                </span>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===== Content area: sidebar sticky + posts list ===== */}
      <div className="azure-grid azure-content-grid">
        <aside className="azure-sidebar-cell">
          <div className="azure-sidebar-sticky">
            <Sidebar />
          </div>
        </aside>
        {/* Right: Post list */}
        <section className="azure-post-list">
          {pageLoading ? (
            <div className="azure-loading">
              <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />加载中...
            </div>
          ) : currentPosts.length > 0 ? (
            currentPosts.map((post, idx) => (
              <div key={post.id} className="azure-post-list-item">
                <PostCard post={post} isNewest={currentPage === 1 && idx === 0} priority={currentPage === 1 && idx === 0} />
              </div>
            ))
          ) : (
            <div className="azure-empty">暂无文章</div>
          )}
          <div className="azure-pagination-wrap">
            <Pagination currentPage={currentPage} totalPages={currentTotalPages} onPageChange={handlePageChange} />
          </div>
        </section>
      </div>
    </div>
  );
}
