'use client';

import Link from 'next/link';

function formatDate(ts: string | number) {
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function PostCard({ post }: { post: any }) {
  const slug = post.slug || post.id;

  return (
    <article style={{ padding: '24px 0' }}>
      <Link href={`/posts/${slug}`} style={{ textDecoration: 'none', display: 'block' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#000', lineHeight: 1.4, marginBottom: '8px', transition: 'color 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#f53004')}
          onMouseLeave={e => (e.currentTarget.style.color = '#000')}
        >
          {post.title}
        </h2>
      </Link>
      {post.excerpt && (
        <p style={{ fontSize: '14px', lineHeight: 1.7, color: '#666', marginBottom: '8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
          {post.excerpt}
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#999' }}>
        <span>{formatDate(post.created_at)}</span>
        {post.categories?.[0] && (
          <span style={{ padding: '2px 8px', background: '#f53004', color: '#fff', borderRadius: '2px', fontSize: '11px' }}>
            {post.categories[0].name}
          </span>
        )}
        {post.view_count > 0 && <span>{post.view_count} 阅读</span>}
      </div>
    </article>
  );
}
