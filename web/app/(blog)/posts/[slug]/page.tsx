import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPostBySlug, getActiveTheme } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';

interface PostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const response = await getPostBySlug(slug);
    const post = response.data;
    return {
      title: post.seo?.title || post.title,
      description: post.seo?.description || post.excerpt || '',
      keywords: post.seo?.keywords || '',
    };
  } catch {
    return { title: '文章未找到' };
  }
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;

  let post: any;
  try {
    const response = await getPostBySlug(slug);
    post = response.data;
  } catch {
    notFound();
  }

  if (!post) notFound();

  let themeName = 'Utterlog2026';
  try { themeName = await getActiveTheme(); } catch {}

  const theme = getThemeComponents(themeName);
  const ThemePostPage = theme.PostPage;

  return <ThemePostPage post={post} />;
}
