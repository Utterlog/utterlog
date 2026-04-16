import Link from 'next/link';
import PostContent from '@/components/blog/PostContent';
import TableOfContents from '@/components/blog/TableOfContents';
import AISummary from '@/components/blog/AISummary';
import PostNavigation from '@/components/blog/PostNavigation';
import CommentList from '@/components/blog/CommentList';
import AIReaderChat from '@/components/blog/AIReaderChat';

function formatDate(ts: string | number) {
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function PostPage({ post }: { post: any }) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e9e9e9', overflow: 'hidden' }}>
      {/* Article card */}
      <div style={{ padding: '32px' }}>
        {/* Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', fontSize: '13px', color: '#9ca3af' }}>
          <span>{formatDate(post.created_at)}</span>
          {post.categories?.[0] && <span style={{ color: '#3368d9' }}>{post.categories[0].name}</span>}
          {post.view_count > 0 && <span>{post.view_count} 阅读</span>}
        </div>

        {/* Title */}
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#202020', lineHeight: 1.4, marginBottom: '24px' }}>
          {post.title}
        </h1>

        {/* AI Summary */}
        <AISummary postId={post.id} excerpt={post.excerpt} />

        {/* Content + TOC (outside) */}
        <div style={{ position: 'relative' }}>
          <article>
            <PostContent content={post.content || ''} postId={post.id} />
          </article>
          <div className="blog-toc-outer hidden xl:block">
            <TableOfContents content={post.content || ''} />
          </div>
        </div>

        {/* Tags */}
        {post.tags?.length > 0 && (
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {post.tags.map((tag: any) => (
              <Link key={tag.id} href={`/tags/${tag.slug}`} style={{
                padding: '4px 10px', fontSize: '12px', color: '#3368d9',
                background: 'rgba(51,104,217,0.06)', borderRadius: '6px', textDecoration: 'none',
              }}>
                #{tag.name}
              </Link>
            ))}
          </div>
        )}

        {/* Post Navigation: prev/next + related tabs */}
        <PostNavigation postId={post.id} />
      </div>

      {/* Comments */}
      <div style={{ padding: '0 32px 32px' }}>
        <CommentList postId={post.id} />
        <AIReaderChat postId={post.id} title={post.title} excerpt={post.excerpt} />
      </div>
    </div>
  );
}
