'use client';

import { coverProps } from '@/lib/blog-image';
import PostLink from '@/components/blog/PostLink';

function formatDate(ts: string | number) {
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function PostCard({ post, priority }: { post: any; priority?: boolean }) {
  const coverUrl = post.cover_url || `https://img.et/1920/1080?type=landscape&r=${post.id}`;

  return (
    <PostLink post={post} style={{ textDecoration: 'none', display: 'block' }}>
      <article style={{
        background: '#fff', borderRadius: '12px',
        marginBottom: '12px', border: '1px solid #e9e9e9',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        overflow: 'hidden',
      }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = '#3368d9'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e9e9e9'; }}
      >
        {/* Cover image */}
        <div style={{ width: '100%', height: '200px', position: 'relative', overflow: 'hidden' }}>
          <img
            {...coverProps({
              src: coverUrl,
              alt: post.title,
              priority,
            })}
          />
        </div>

        <div style={{ padding: '16px 20px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#202020', lineHeight: 1.5, marginBottom: '8px' }}>
            {post.title}
          </h2>
          {post.excerpt && (
            <p style={{ fontSize: '14px', lineHeight: 1.7, color: '#6b7280', marginBottom: '12px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
              {post.excerpt}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#9ca3af' }}>
            <span>{formatDate(post.created_at)}</span>
            {post.categories?.[0] && <span style={{ color: '#3368d9' }}>{post.categories[0].name}</span>}
            {post.view_count > 0 && <span>{post.view_count} 阅读</span>}
          </div>
        </div>
      </article>
    </PostLink>
  );
}
