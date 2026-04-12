import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getCategories, getPosts } from '@/lib/blog-api';
import PostCard from '@/components/blog/PostCard';
import Pagination from '@/components/blog/Pagination';
import { ArrowLeft } from '@/components/icons';

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const response = await getCategories();
    const categories = response.data || [];
    const category = categories.find((c: any) => c.slug === slug);
    if (category) {
      return { title: `分类: ${category.name}` };
    }
  } catch {}
  return { title: '分类' };
}

export default async function CategoryPostsPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = Number(sp.page) || 1;

  // 获取分类信息
  let category: any = null;
  try {
    const catResponse = await getCategories();
    const categories = catResponse.data || [];
    category = categories.find((c: any) => c.slug === slug);
  } catch {}

  if (!category) notFound();

  // 获取该分类下的文章
  let posts: any[] = [];
  let totalPages = 1;
  try {
    const response = await getPosts({ page, per_page: 10, category_id: category.id, status: 'publish' });
    posts = response.data || [];
    totalPages = response.meta?.total_pages || 1;
  } catch {}

  return (
    <div>
      <Link
        href="/categories"
        className="inline-flex items-center gap-1 text-sm text-dim hover:text-main transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        所有分类
      </Link>

      <h1 className="font-serif text-3xl font-bold text-main mb-2">
        {category.name}
      </h1>
      {category.description && (
        <p className="text-sub mb-8">{category.description}</p>
      )}

      {posts.length > 0 ? (
        <div className="divide-y divide-line">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <p className="text-center py-16 text-dim">该分类下暂无文章</p>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        basePath={`/categories/${slug}`}
      />
    </div>
  );
}
