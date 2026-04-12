import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTags, getPosts } from '@/lib/blog-api';
import PostCard from '@/components/blog/PostCard';
import Pagination from '@/components/blog/Pagination';
import { ArrowLeft } from '@/components/icons';

interface TagPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const response = await getTags();
    const tags = response.data || [];
    const tag = tags.find((t: any) => t.slug === slug);
    if (tag) {
      return { title: `标签: ${tag.name}` };
    }
  } catch {}
  return { title: '标签' };
}

export default async function TagPostsPage({ params, searchParams }: TagPageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = Number(sp.page) || 1;

  // 获取标签信息
  let tag: any = null;
  try {
    const tagResponse = await getTags();
    const tags = tagResponse.data || [];
    tag = tags.find((t: any) => t.slug === slug);
  } catch {}

  if (!tag) notFound();

  // 获取该标签下的文章
  let posts: any[] = [];
  let totalPages = 1;
  try {
    const response = await getPosts({ page, per_page: 10, tag_id: tag.id, status: 'publish' });
    posts = response.data || [];
    totalPages = response.meta?.total_pages || 1;
  } catch {}

  return (
    <div>
      <Link
        href="/tags"
        className="inline-flex items-center gap-1 text-sm text-dim hover:text-main transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        所有标签
      </Link>

      <h1 className="font-serif text-3xl font-bold text-main mb-2">
        #{tag.name}
      </h1>
      <p className="text-sub mb-8">
        {tag.post_count || 0} 篇文章
      </p>

      {posts.length > 0 ? (
        <div className="divide-y divide-line">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <p className="text-center py-16 text-dim">该标签下暂无文章</p>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        basePath={`/tags/${slug}`}
      />
    </div>
  );
}
