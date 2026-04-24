import Link from 'next/link';
import PostContent from '@/components/blog/PostContent';
import TableOfContents from '@/components/blog/TableOfContents';
import AISummary from '@/components/blog/AISummary';
import PostNavigation from '@/components/blog/PostNavigation';
import VisitorAvatars from '@/components/blog/VisitorAvatars';
import CommentList from '@/components/blog/CommentList';
import AIReaderChat from '@/components/blog/AIReaderChat';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function estimateReadingTime(content: string): number {
  const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = content.replace(/[\u4e00-\u9fff]/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(chineseChars / 400 + words / 200));
}

export default function PostPage({ post }: { post: any }) {
  const readTime = estimateReadingTime(post.content || '');

  return (
    <div className="relative">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-dim hover:text-main transition-colors mb-8">
        <i className="fa-regular fa-arrow-left" style={{ fontSize: '14px' }} />返回首页
      </Link>

      <header className="mb-10">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-main leading-tight mb-5">{post.title}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-dim">
          <span className="flex items-center gap-1.5"><i className="fa-regular fa-calendar" style={{ fontSize: '14px' }} />{formatDate(post.created_at)}</span>
          <span className="flex items-center gap-1.5"><i className="fa-regular fa-clock" style={{ fontSize: '14px' }} />{readTime} 分钟阅读</span>
          {post.categories?.length > 0 && (
            <span className="flex items-center gap-1.5">
              <i className="fa-regular fa-folder" style={{ fontSize: '14px' }} />
              {post.categories.map((cat: any, i: number) => (
                <span key={cat.id}>
                  <Link href={`/categories/${cat.slug}`} className="text-sub hover:text-primary-themed transition-colors">{cat.name}</Link>
                  {i < post.categories.length - 1 && ', '}
                </span>
              ))}
            </span>
          )}
        </div>
        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {post.tags.map((tag: any) => (
              <Link key={tag.id} href={`/tags/${tag.slug}`} className="inline-block px-2.5 py-0.5 text-xs bg-soft text-sub rounded-sm hover:text-primary-themed transition-colors">
                #{tag.name}
              </Link>
            ))}
          </div>
        )}
      </header>

      <hr className="border-line mb-10" />

      <article>
        <AISummary postId={post.id} aiSummary={post.ai_summary} excerpt={post.excerpt} />
        <PostContent content={post.content || ''} postId={post.id} />
      </article>

      <div className="blog-toc-outer hidden xl:block">
        <TableOfContents content={post.content || ''} />
      </div>

      <PostNavigation postId={post.id} />

      <VisitorAvatars />

      <CommentList postId={post.id} />
      <AIReaderChat postId={post.id} title={post.title} excerpt={post.excerpt} />
    </div>
  );
}
