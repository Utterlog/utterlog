'use client';

import Link from 'next/link';
import { useState } from 'react';
import PostLink from '@/components/blog/PostLink';
import { getPosts } from '@/lib/blog-api';
import { useThemeContext } from '@/lib/theme-context';
import PostCard from './PostCard';
import MomentBubble from './MomentBubble';
import LatestCommenters from './LatestCommenters';

const PER_PAGE = 10;

function catIconClass(icon?: string) {
  if (icon && (icon.startsWith('fa-') || icon.startsWith('fa '))) return icon;
  return 'fa-sharp fa-light fa-folder';
}

interface HomePageProps {
  posts: any[];
  page: number;
  totalPages: number;
  categories?: any[];
  archiveStats?: any;
  perPage?: number;
}

export default function HomePage({
  posts: initialPosts,
  page: initialPage,
  totalPages: initialTotalPages,
  categories: serverCategories = [],
  archiveStats = {},
}: HomePageProps) {
  const { site, categories: contextCategories, archiveStats: contextStats, menus } = useThemeContext();
  const allCategories = serverCategories.length ? serverCategories : contextCategories;
  // 分类导航（中间筛选条）：优先用 admin 在「主题 → 菜单 → 分类导航」
  // 配的菜单项；admin 不配 → 自动列出所有分类（向后兼容旧站点）。
  // 菜单项的 `slug` / `category_id` 用来匹配 contextCategories 拿到 id。
  const customCatNav = (menus as any)?.category as any[] | undefined;
  const categories = (() => {
    if (!customCatNav || customCatNav.length === 0) return allCategories;
    return customCatNav.map((m) => {
      const matched = allCategories.find((c: any) =>
        (m.category_id && c.id === m.category_id) ||
        (m.slug && c.slug === m.slug) ||
        (m.label && c.name === m.label),
      );
      // 把 admin 菜单项叠加到 category 数据上（保留 admin 改写的 label / icon）
      return {
        id: matched?.id ?? m.category_id ?? 0,
        slug: matched?.slug ?? m.slug ?? '',
        name: m.label || matched?.name || '未命名',
        icon: m.icon || matched?.icon || '',
        count: matched?.count ?? m.count ?? 0,
      };
    });
  })();
  const stats = archiveStats?.post_count ? archiveStats : contextStats;
  const totalPosts = stats?.post_count || initialPosts.length || 0;
  const totalWords = stats?.word_count ? Number(stats.word_count).toLocaleString() : '0';
  const totalComments = stats?.comment_count || 0;

  const heroIntro = site.description
    || site.subtitle
    || '一处持续生长的写作与思考实验场，记录代码、知识与所见所感。';

  // ── AJAX 状态：分类筛选 + 分页 + 当前列表 ──
  const [activeCatId, setActiveCatId] = useState<number | null>(null);
  const [posts, setPosts] = useState<any[]>(initialPosts);
  const [page, setPage] = useState<number>(initialPage);
  const [totalPages, setTotalPages] = useState<number>(initialTotalPages);
  const [loading, setLoading] = useState(false);
  // featured 始终来自 SSR 第一篇（不随筛选变），跟"最新文章"区独立
  const featured = initialPosts[0];

  const fetchPage = async (pageNum: number, categoryId: number | null) => {
    setLoading(true);
    try {
      const r: any = await getPosts({
        page: pageNum,
        per_page: PER_PAGE,
        status: 'publish',
        ...(categoryId ? { category_id: categoryId } : {}),
      });
      setPosts(r?.data || []);
      setPage(pageNum);
      const meta = r?.meta || {};
      setTotalPages(meta.total_pages || 1);
    } catch {
      setPosts([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  const switchCategory = async (catId: number | null) => {
    if (catId === activeCatId) return;
    setActiveCatId(catId);
    await fetchPage(1, catId);
    /* 不再同步 URL；切换分类纯前端筛选，地址栏保持 `/` */
  };

  const goPage = async (n: number) => {
    if (n === page || n < 1 || n > totalPages || loading) return;
    await fetchPage(n, activeCatId);
    /* 不再同步 URL；翻页纯前端，地址栏保持 `/` */
    document.querySelector('.nebula-section-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 生成分页页码（最多 7 个：第一页 + 周边 + 最后一页）
  const buildPageList = (): (number | '…')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const list: (number | '…')[] = [1];
    const left = Math.max(2, page - 1);
    const right = Math.min(totalPages - 1, page + 1);
    if (left > 2) list.push('…');
    for (let i = left; i <= right; i++) list.push(i);
    if (right < totalPages - 1) list.push('…');
    list.push(totalPages);
    return list;
  };

  return (
    <div className="nebula-home">
      <MomentBubble />

      <section className="nebula-hero">
        <div className="nebula-hero-bg" aria-hidden="true">
          <span className="nebula-hero-glow" />
        </div>
        <div className="nebula-hero-inner">
          <p className="nebula-hero-intro">{heroIntro}</p>

          {/* 4 个爱好图块（不是分类，仅展示个人爱好；hover 显示文字 + icon 弹跳） */}
          <div className="nebula-tile-stage">
            <div className="nebula-tile nebula-tile--1" data-label="影音" aria-label="影音">
              <i className="fa-solid fa-tv-music" aria-hidden="true" />
            </div>
            <div className="nebula-tile nebula-tile--2" data-label="代码" aria-label="代码">
              <i className="fa-solid fa-code" aria-hidden="true" />
            </div>
            <div className="nebula-tile nebula-tile--3" data-label="旅行" aria-label="旅行">
              <i className="fa-solid fa-plane" aria-hidden="true" />
            </div>
            <div className="nebula-tile nebula-tile--4" data-label="日常" aria-label="日常">
              <i className="fa-solid fa-citrus" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      <div className="nebula-container nebula-home-body">

        {categories.length > 0 && (
          <nav className="nebula-category-strip" aria-label="分类">
            <button
              type="button"
              className={activeCatId === null ? 'active' : ''}
              onClick={() => switchCategory(null)}
              disabled={loading && activeCatId === null}
            >
              <i className="fa-solid fa-grid-2" aria-hidden="true" />
              全部
            </button>
            {categories.slice(0, 10).map((cat: any) => (
              <button
                type="button"
                key={cat.id || cat.slug}
                className={activeCatId === cat.id ? 'active' : ''}
                onClick={() => switchCategory(cat.id)}
                disabled={loading}
              >
                <i className={catIconClass(cat.icon)} aria-hidden="true" />
                {cat.name}
                <span>{cat.count || 0}</span>
              </button>
            ))}
          </nav>
        )}

        <section className="nebula-section-heading">
          <span className="nebula-section-tag">§ ARTICLES</span>
          <span className="nebula-section-stats" aria-label="站点统计">
            <span><i className="fa-solid fa-file-lines" aria-hidden="true" /> {Number(totalPosts).toLocaleString()} 文章</span>
            <span><i className="fa-solid fa-comment" aria-hidden="true" /> {Number(totalComments).toLocaleString()} 评论</span>
            <span><i className="fa-solid fa-pen-nib" aria-hidden="true" /> {totalWords} 字</span>
          </span>
          <h2>{activeCatId === null ? '最新文章' : categories.find((c: any) => c.id === activeCatId)?.name || '分类文章'}</h2>
        </section>

        <div className={`nebula-post-list${loading ? ' is-loading' : ''}`}>
          {posts.length > 0 ? (
            // 切分类时不再清空 posts，只让列表加 .is-loading 半透明 +
            // 屏蔽点击 —— 旧卡片留在原位避免视觉跳动；新数据一回来，
            // React 用新 post.id 作为 key 自动 re-mount，stagger fade-in
            // 动画会跑一遍（CSS 里 nebulaListItemIn）
            posts.map((post, index) => (
              <PostCard
                key={post.id}
                post={post}
                index={(page - 1) * PER_PAGE + index + 1}
              />
            ))
          ) : loading ? (
            // 仅初始首屏 + 切到完全没数据的分类时才显示 spinner
            <div className="nebula-empty">
              <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> 加载中…
            </div>
          ) : (
            <div className="nebula-empty">该分类暂无文章</div>
          )}
        </div>

        {totalPages > 1 && (
          <nav className="nebula-pagination" aria-label="分页">
            <button
              type="button"
              onClick={() => goPage(page - 1)}
              disabled={page <= 1 || loading}
              className="nebula-pagination-arrow"
              aria-label="上一页"
            >
              <i className="fa-solid fa-chevron-left" aria-hidden="true" />
            </button>
            <span className="nebula-pagination-pages">
              {buildPageList().map((p, i) => p === '…' ? (
                <span key={`gap-${i}`} className="nebula-pagination-gap">…</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => goPage(p)}
                  disabled={loading}
                  className={`nebula-pagination-num${p === page ? ' active' : ''}`}
                >
                  {p}
                </button>
              ))}
            </span>
            <button
              type="button"
              onClick={() => goPage(page + 1)}
              disabled={page >= totalPages || loading}
              className="nebula-pagination-arrow"
              aria-label="下一页"
            >
              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
            </button>
          </nav>
        )}

        <LatestCommenters />
      </div>
    </div>
  );
}
