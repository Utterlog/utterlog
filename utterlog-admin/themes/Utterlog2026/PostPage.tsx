import Link from 'next/link';
import PostContent from '@/components/blog/PostContent';
import TableOfContents from '@/components/blog/TableOfContents';
import CommentList from '@/components/blog/CommentList';
import { ArrowLeft, Calendar, Clock, Folder } from '@/components/icons';

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
        <ArrowLeft className="w-4 h-4" />返回首页
      </Link>

      <header className="mb-10">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-main leading-tight mb-5">{post.title}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-dim">
          <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{formatDate(post.created_at)}</span>
          <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{readTime} 分钟阅读</span>
          {post.categories?.length > 0 && (
            <span className="flex items-center gap-1.5">
              <Folder className="w-4 h-4" />
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

      <div className="flex gap-16">
        <article className="flex-1 min-w-0">
          <PostContent content={post.content || ''} />
        </article>
        <aside className="w-56 shrink-0">
          <TableOfContents content={post.content || ''} />
        </aside>
      </div>

      <CommentList postId={post.id} />

      <div className="mt-16 pt-8 border-t border-line">
        <div className="flex justify-between items-center">
          <Link href="/" className="text-sm text-sub hover:text-primary-themed transition-colors">&larr; 返回文章列表</Link>
          <span className="text-sm text-dim">{post.view_count || 0} 次阅读</span>
        </div>
      </div>
    </div>
  );
}
