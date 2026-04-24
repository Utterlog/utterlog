import Link from 'next/link';
import type { Post } from '@/types';
import PostLink from './PostLink';

function formatDate(dateInput: string | number): string {
  const ts = typeof dateInput === 'number' ? dateInput : Number(dateInput);
  const date = !isNaN(ts) && ts > 1e9 && ts < 1e10
    ? new Date(ts * 1000)
    : !isNaN(ts) && ts > 1e12
    ? new Date(ts)
    : new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function estimateReadingTime(content: string): number {
  if (!content) return 1;
  const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = content.replace(/[\u4e00-\u9fff]/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(chineseChars / 400 + words / 200));
}

interface PostCardProps {
  post: Post;
}

export default function PostCard({ post }: PostCardProps) {
  const readTime = estimateReadingTime(post.content || post.excerpt || '');
  if (!post.title) return null;

  return (
    <article style={{ padding: '24px 0' }}>
      {/* Title */}
      <h2 style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.4, margin: '0 0 8px 0' }}>
        <PostLink
          post={post}
          className="text-main hover:text-primary-themed"
          style={{ textDecoration: 'none', transition: 'color 0.15s', fontFamily: 'var(--font-serif)' }}
        >
          {post.title}
        </PostLink>
      </h2>

      {/* Excerpt */}
      {post.excerpt && (
        <p className="text-sub" style={{ fontSize: '14px', lineHeight: 1.7, margin: '0 0 10px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {post.excerpt}
        </p>
      )}

      {/* Meta */}
      <div className="text-dim" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
        <time dateTime={String(post.created_at)}>{formatDate(post.created_at)}</time>
        <span>&middot;</span>
        <span>{readTime} 分钟阅读</span>
        {post.view_count > 0 && (
          <>
            <span>&middot;</span>
            <span>{post.view_count} 阅读</span>
          </>
        )}
        {post.categories && post.categories.length > 0 && (
          <>
            <span>&middot;</span>
            {post.categories.map((cat, i) => (
              <Link key={cat.id} href={`/categories/${cat.slug}`} className="text-dim hover:text-primary-themed" style={{ textDecoration: 'none', transition: 'color 0.15s' }}>
                {cat.name}
              </Link>
            ))}
          </>
        )}
      </div>

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
          {post.tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/tags/${tag.slug}`}
              className="bg-soft text-dim hover:text-primary-themed"
              style={{ display: 'inline-block', padding: '2px 8px', fontSize: '12px', borderRadius: '3px', textDecoration: 'none', transition: 'color 0.15s' }}
            >
              #{tag.name}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
