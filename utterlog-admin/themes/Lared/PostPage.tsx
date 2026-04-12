import Link from 'next/link';
import PostContent from '@/components/blog/PostContent';
import CommentList from '@/components/blog/CommentList';

function formatDate(ts: string | number) {
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function PostPage({ post }: { post: any }) {
  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ fontSize: '13px', color: '#999', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Link href="/" style={{ color: '#999', textDecoration: 'none' }}>首页</Link>
        <span>/</span>
        {post.categories?.[0] && (
          <>
            <Link href={`/categories/${post.categories[0].slug}`} style={{ color: '#999', textDecoration: 'none' }}>{post.categories[0].name}</Link>
            <span>/</span>
          </>
        )}
        <span style={{ color: '#333' }}>{post.title}</span>
      </div>

      {/* Title */}
      <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#000', lineHeight: 1.3, marginBottom: '16px', letterSpacing: '-0.02em' }}>
        {post.title}
      </h1>

      {/* Meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', color: '#999', marginBottom: '32px', paddingBottom: '16px', borderBottom: '1px solid #eee' }}>
        <span>{formatDate(post.created_at)}</span>
        {post.view_count > 0 && <span>{post.view_count} 次阅读</span>}
        {post.comment_count > 0 && <span>{post.comment_count} 条评论</span>}
      </div>

      {/* Content */}
      <article>
        <PostContent content={post.content || ''} />
      </article>

      {/* Tags */}
      {post.tags?.length > 0 && (
        <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #eee', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {post.tags.map((tag: any) => (
            <Link key={tag.id} href={`/tags/${tag.slug}`} style={{
              padding: '4px 12px', fontSize: '12px', color: '#f53004',
              border: '1px solid #f53004', borderRadius: '2px', textDecoration: 'none',
            }}>
              #{tag.name}
            </Link>
          ))}
        </div>
      )}

      {/* Comments */}
      <CommentList postId={post.id} />

      {/* Back */}
      <div style={{ marginTop: '48px', paddingTop: '16px', borderTop: '1px solid #eee' }}>
        <Link href="/" style={{ fontSize: '14px', color: '#f53004', textDecoration: 'none' }}>&larr; 返回文章列表</Link>
      </div>
    </div>
  );
}
