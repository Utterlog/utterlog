import Link from 'next/link';
import PostContent from './PostContent';
import TableOfContents from './TableOfContents';
import AISummary from './AISummary';
import PostNavigation from './PostNavigation';
import FadeCover from '@/components/blog/FadeCover';
import { randomCoverUrl } from '@/lib/blog-image';
import { formatDateInTimeZone, resolveSiteTimeZone } from '@/lib/timezone';
import { getCategoryIcon } from './constants';
import { CommentCount, CommentSection } from './PostInteractive';

function formatDate(ts: string | number, timeZone: string) {
  return formatDateInTimeZone(ts, 'zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }, timeZone);
}

export default function PostPage({ post, options }: { post: any; options?: Record<string, string> }) {
  // Caller (app/(blog)/posts/[slug]/page.tsx and [...permalink]) now
  // server-fetches options and threads them in, so PostPage's banner
  // fallback uses the same admin-configured random_image_api as the
  // home cards / hero — no more "首页有图、内页一张默认 img.et" mismatch.
  const coverUrl = post.cover_url || randomCoverUrl(post.id, options);
  const timeZone = resolveSiteTimeZone(options);
  const cat0 = post.categories?.[0];
  const catName = cat0?.name;
  const catIcon = cat0 ? getCategoryIcon(cat0) : 'fa-sharp fa-light fa-folder';

  return (
    <div className="azure-post-page">
      {/* Featured image */}
      <div className="azure-post-hero">
        <FadeCover src={coverUrl} alt={post.title} className="azure-post-hero-cover" />
        <div className="azure-post-hero-overlay">
          {/* Breadcrumb */}
          <div className="azure-breadcrumb">
            <Link href="/">首页</Link>
            <span>/</span>
            {catName && (
              <>
                <Link href={`/categories/${post.categories[0].slug}`}>{catName}</Link>
                <span>/</span>
              </>
            )}
          </div>
          <h1 className="azure-post-title">
            {post.title}
          </h1>
        </div>
      </div>

      {/* Meta bar */}
      <div className="azure-post-meta">
        <span className="azure-post-meta-item"><i className="fa-regular fa-calendar" aria-hidden="true" />{formatDate(post.created_at, timeZone)}</span>
        {/* view_count 显示 = DB 真实值 + 1（cosmetic）。
            后端 /track 已经移除了 isFirstPostViewToday 守门 ——「访客
            点击就 +1，刷新一次再 +1」是用户明确的预期。所以 cosmetic +1
            跟 DB 增量永远对齐：
              · SSR 时 DB=149 → 页面渲染 150 (149+1)
              · /track async 跑完 → DB=150
              · 用户回到首页刷新 → 首页读 raw DB=150 ✓ 跟文章页对上
              · 再点进同一篇 → SSR 拿到 DB=150 → 页面 151 (150+1)
              · /track 跑完 → DB=151 → 首页刷新看到 151 ✓ */}
        <span className="azure-post-meta-item"><i className="fa-solid fa-fire hot" aria-hidden="true" />{(post.view_count || 0) + 1} 阅读</span>
        <span className="azure-post-meta-item"><i className="fa-regular fa-comment" aria-hidden="true" /><CommentCount initial={post.comment_count || 0} /></span>
        {(post.word_count || 0) > 0 && (
          <span className="azure-post-meta-item"><i className="fa-regular fa-font" aria-hidden="true" />{post.word_count.toLocaleString()} 字</span>
        )}
        <span className="azure-post-meta-item"><i className="fa-regular fa-clock" aria-hidden="true" />{Math.max(1, Math.ceil((post.word_count || 0) / 400))} 分钟</span>
        {catName && (
          <Link href={`/categories/${post.categories[0].slug}`} className="azure-post-meta-category">
            <i className={catIcon} aria-hidden="true" /> {catName}
          </Link>
        )}
      </div>

      {/* Content */}
      <div className="azure-post-content-wrap">
        <AISummary postId={post.id} aiSummary={post.ai_summary} excerpt={post.excerpt} />

        <div className="azure-post-content-shell">
          <article>
            <PostContent content={post.content || ''} postId={post.id} />
          </article>
          <TableOfContents content={post.content || ''} variant="mobile" />
          <div className="blog-toc-outer hidden xl:block">
            <TableOfContents content={post.content || ''} />
          </div>
        </div>
      </div>

      {/* 版权 + 标签 */}
      <div className="azure-post-license">
        <div className="azure-post-license-author">
          <span>作者</span>
          <img
            src={post.author?.avatar || 'https://gravatar.bluecdn.com/avatar/0?s=40&d=mp'}
            alt=""
            referrerPolicy="no-referrer"
            className="azure-post-author-avatar"
          />
          <Link href="/" className="azure-post-author-link">{post.author?.nickname || post.author?.username || '匿名'}</Link>
          <span>本文采用</span>
          <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer" className="azure-post-license-link">
            <i className="fa-brands fa-creative-commons" aria-hidden="true" />
            <span>CC BY-NC-SA 4.0</span>
          </a>
          <span>许可协议，转载请注明来源。</span>
        </div>
        {post.tags?.length > 0 && (
          <div className="azure-post-tags">
            {post.tags.map((tag: any, idx: number) => (
              <span key={tag.id} className="azure-post-tag-wrap">
                <Link href={`/tags/${tag.slug}`} className="azure-post-tag">
                  <span className="azure-post-tag-hash">#</span>
                  <span className="azure-post-tag-name">{tag.name}</span>
                  {tag.count > 0 && (
                    <sup>{tag.count}</sup>
                  )}
                </Link>
                {idx < post.tags.length - 1 && <span className="azure-post-tag-comma">,</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 上一篇 / 下一篇 — 全宽 */}
      <PostNavigation postId={post.id} coverUrl={coverUrl} />

      <CommentSection postId={post.id} title={post.title} excerpt={post.excerpt} authorAvatar={post.author?.avatar} />
    </div>
  );
}
