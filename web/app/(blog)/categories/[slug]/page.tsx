import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCategories, getPosts } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';
import { getThemeContextData } from '@/lib/theme-data';
import { DefaultCategoryPage } from '@/components/blog/defaults';

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const response = await getCategories();
    const categories = response.data || [];
    const cat = categories.find((c: any) => c.slug === slug);
    if (cat) return { title: `${cat.name} — 分类` };
  } catch {}
  return { title: '分类' };
}

export default async function CategoryPostsPage({ params }: CategoryPageProps) {
  const { slug } = await params;

  const ctx = await getThemeContextData();
  const category = ctx.categories.find((c: any) => c.slug === slug);
  if (!category) notFound();

  let posts: any[] = [];
  try {
    const response = await getPosts({ per_page: 200, category_id: category.id, status: 'publish' });
    posts = response.data || [];
  } catch {}

  const theme = getThemeComponents(ctx.theme.name);
  const CategoryComponent = theme.CategoryPage || DefaultCategoryPage;

  return <CategoryComponent category={category} posts={posts} />;
}
