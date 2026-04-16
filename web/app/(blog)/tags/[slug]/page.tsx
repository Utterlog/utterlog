import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTags, getPosts } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';
import { getThemeContextData } from '@/lib/theme-data';
import { DefaultTagPage } from '@/components/blog/defaults';

interface TagPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const response = await getTags();
    const tags = response.data || [];
    const tag = tags.find((t: any) => t.slug === slug);
    if (tag) return { title: `${tag.name} — 标签` };
  } catch {}
  return { title: '标签' };
}

export default async function TagPostsPage({ params }: TagPageProps) {
  const { slug } = await params;

  const ctx = await getThemeContextData();
  const tag = ctx.tags.find((t: any) => t.slug === slug);
  if (!tag) notFound();

  let posts: any[] = [];
  try {
    const response = await getPosts({ per_page: 200, tag_id: tag.id, status: 'publish' });
    posts = response.data || [];
  } catch {}

  const theme = getThemeComponents(ctx.theme.name);
  const TagComponent = theme.TagPage || DefaultTagPage;

  return <TagComponent tag={tag} posts={posts} />;
}
