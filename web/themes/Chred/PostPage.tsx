import Link from 'next/link';
import PostContent from '@/components/blog/PostContent';
import TableOfContents from '@/components/blog/TableOfContents';
import AISummary from '@/components/blog/AISummary';
import PostNavigation from '@/components/blog/PostNavigation';
import CommentList from '@/components/blog/CommentList';
import AIReaderChat from '@/components/blog/AIReaderChat';
import FadeCover from '@/components/blog/FadeCover';
import { randomCoverUrl } from '@/lib/blog-image';
import Sidebar from './Sidebar';
import { getCategoryIcon } from './constants';

function formatDate(ts: string | number) {
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function PostPage({ post, options }: { post: any; options?: Record<string, string> }) {
  const coverUrl = post.cover_url || randomCoverUrl(post.id, options);
  const catName = post.categories?.[0]?.name;
  const cat0 = post.categories?.[0];
  const catIcon = cat0 ? getCategoryIcon(cat0) : 'fa-sharp fa-light fa-folder';

  return (
    <div style={{ padding: '0' }}>
      {/* Featured image */}
      <div style={{ position: 'relative', borderBottom: '1px solid #e5e5e5' }}>
        <FadeCover src={coverUrl} alt={post.title}
          style={{ width: '100%', height: '400px' }} />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.65))',
          padding: '60px 32px 24px',
        }}>
          {/* Breadcrumb */}
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>首页</Link>
            <span>/</span>
            {catName && (
              <>
                <Link href={`/categories/${post.categories[0].slug}`} style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>{catName}</Link>
                <span>/</span>
              </>
            )}
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#fff', lineHeight: 1.3, letterSpacing: '-0.02em' }}>
            {post.title}
          </h1>
        </div>
      </div>

      {/* Meta bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 32px',
        fontSize: '13px', color: '#999', borderBottom: '1px solid #eee',
      }}>
        <span><i className="fa-regular fa-calendar" style={{ marginRight: '4px' }} />{formatDate(post.created_at)}</span>
        <span><i className="fa-solid fa-fire" style={{ marginRight: '4px', color: '#f53004' }} />{post.view_count || 0} 阅读</span>
        <span><i className="fa-regular fa-comment" style={{ marginRight: '4px' }} />{post.comment_count || 0} 评论</span>
        {catName && (
          <Link href={`/categories/${post.categories[0].slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f53004', textDecoration: 'none', marginLeft: 'auto' }}>
            <i className={catIcon} /> {catName}
          </Link>
        )}
      </div>

      {/* Content + Sidebar */}
      <div style={{ display: 'flex' }}>
        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ padding: '32px' }}>
            {/* AI Summary */}
            <AISummary postId={post.id} aiSummary={post.ai_summary} excerpt={post.excerpt} />

            {/* Content + TOC */}
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
              <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #eee', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {post.tags.map((tag: any) => (
                  <Link key={tag.id} href={`/tags/${tag.slug}`} style={{
                    padding: '4px 12px', fontSize: '12px', color: '#f53004',
                    border: '1px solid #f53004', textDecoration: 'none',
                  }}>
                    #{tag.name}
                  </Link>
                ))}
              </div>
            )}

            {/* Post Navigation */}
            <PostNavigation postId={post.id} />
          </div>

          {/* Comments */}
          <div style={{ padding: '0 32px 32px', borderTop: '1px solid #eee' }}>
            <CommentList postId={post.id} />
            <AIReaderChat postId={post.id} title={post.title} excerpt={post.excerpt} />
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ borderLeft: '1px solid #e5e5e5' }} className="hidden lg:block">
          <Sidebar />
        </div>
      </div>
    </div>
  );
}
