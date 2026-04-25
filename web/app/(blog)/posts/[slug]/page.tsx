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
    const title = post.seo?.title || post.title;
    const description = post.seo?.description || post.excerpt || '';
    const image = post.cover_url || undefined;
    return {
      title,
      description,
      keywords: post.seo?.keywords || '',
      // Per-post overrides for OG / Twitter cards. The root layout
      // already set sensible site-wide defaults (description /
      // og:image / twitter card style); here we override with the
      // article-specific values when present, falling back to the
      // root metadata otherwise.
      openGraph: {
        title,
        description,
        type: 'article',
        ...(image ? { images: [{ url: image }] } : {}),
      },
      twitter: {
        title,
        description,
        ...(image ? { images: [image] } : {}),
      },
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

  // /posts/[slug] is kept as a stable fallback for old bookmarks and
  // feed readers — it renders the post at this URL regardless of the
  // admin's chosen permalink structure. Internal navigation uses the
  // custom format directly via PostLink, so users only land here when
  // something external (external link, stored bookmark) points here.

  let themeName = 'Azure';
  try { themeName = await getActiveTheme(); } catch {}

  const theme = getThemeComponents(themeName);
  const ThemePostPage = theme.PostPage;

  return <ThemePostPage post={post} />;
}
