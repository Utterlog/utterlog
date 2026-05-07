import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPostBySlug, getActiveTheme, getOptions } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';
import { randomCoverUrl } from '@/lib/blog-image';

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
    // OG / Twitter Card 图片：优先文章 cover_url，否则用 admin 配的
    // 随机封面 API（同 PostCard / HomePage hero 的兜底逻辑），保证每篇
    // 文章被分享时都有特色图，而不是社交平台的默认占位卡片
    let image: string | undefined = post.cover_url || undefined;
    if (!image) {
      try {
        const optsRes: any = await getOptions();
        const opts = (optsRes?.data || {}) as Record<string, string>;
        const fallback = randomCoverUrl(post.id, {
          random_image_enabled: opts.random_image_enabled,
          random_image_api: opts.random_image_api,
        });
        if (fallback) image = fallback;
      } catch {}
    }
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
    // track:true tells the API to bump view_count server-side as
    // part of this read (WordPress-style). The next renderer (and
    // every visit thereafter) sees the already-incremented value.
    // generateMetadata above intentionally passes no track flag —
    // SEO/preview crawlers shouldn't inflate counts.
    const response = await getPostBySlug(slug, { track: true });
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

  // Pass admin options into the theme so a missing post.cover_url
  // falls back through randomCoverUrl(post.id, options) — which
  // honours `random_image_api` and `random_image_enabled`. Without
  // this PostPage was using the helper's hardcoded default, making
  // the article banner inconsistent with the home cover.
  const optionsRes = await getOptions().catch(() => ({ data: {} } as any));
  const options = (optionsRes?.data || {}) as Record<string, string>;

  return <ThemePostPage post={post} options={options} />;
}
