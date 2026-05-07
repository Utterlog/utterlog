import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPost, getPostBySlug, getPostByDisplayID, getActiveTheme, getOptions } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';
import { parsePermalink, DEFAULT_PERMALINK } from '@/lib/permalink';
import { randomCoverUrl } from '@/lib/blog-image';

// Catch-all for custom permalink structures. Next.js route priority
// means this only fires when no specific route (/posts/:slug, /archives,
// /categories/:slug, …) matched, so it doesn't steal traffic from any
// other blog page.

interface Props {
  params: Promise<{ permalink: string[] }>;
}

async function resolvePost(segments: string[], track: boolean): Promise<any | null> {
  let structure = DEFAULT_PERMALINK;
  try {
    const optsRes: any = await getOptions();
    const s = (optsRes?.data?.permalink_structure || '').trim();
    if (s) structure = s;
  } catch {}

  // If the admin never changed the structure, there's nothing for a
  // catch-all to resolve — only /posts/[slug] publishes links, and the
  // static route handles that already.
  if (structure === DEFAULT_PERMALINK) return null;

  const pathname = '/' + segments.map(s => encodeURIComponent(s)).join('/');
  const hit = parsePermalink(pathname, structure);
  if (!hit) return null;

  // track passes through to the API as ?track=1 → server-side view
  // bump (WordPress-style). generateMetadata calls with track=false
  // because SEO/preview crawlers shouldn't inflate counts; the
  // visitor-facing render calls with track=true.
  const opts = track ? { track: true } : undefined;
  try {
    // display_id 优先 —— /archives/%display_id% 是新推荐的 URL 形态，
    // 序号严格按发布顺序递增，跟 db 主键 id 解耦。
    if (hit.display_id != null) {
      const r: any = await getPostByDisplayID(hit.display_id, opts);
      return r?.data ?? null;
    }
    if (hit.id != null) {
      const r: any = await getPost(hit.id, opts);
      return r?.data ?? null;
    }
    if (hit.slug) {
      const r: any = await getPostBySlug(hit.slug, opts);
      return r?.data ?? null;
    }
  } catch { return null; }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { permalink } = await params;
  const post = await resolvePost(permalink || [], false);
  if (!post) return { title: '页面未找到' };
  const title = post.seo?.title || post.title;
  const description = post.seo?.description || post.excerpt || '';
  // OG / Twitter Card 图片：优先文章 cover_url，否则用 admin 配的
  // 随机封面 API（同 PostCard / HomePage hero 的兜底逻辑），保证每篇
  // 文章被分享时都有特色图，而不是 X / Telegram 那种新闻占位卡片
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
}

export default async function PermalinkPage({ params }: Props) {
  const { permalink } = await params;
  const post = await resolvePost(permalink || [], true);
  if (!post) notFound();

  let themeName = 'Azure';
  try { themeName = await getActiveTheme(); } catch {}

  const theme = getThemeComponents(themeName);
  const ThemePostPage = theme.PostPage;

  // Same pattern as /posts/[slug]/page.tsx: pass options so the
  // theme's PostPage banner falls back through the same admin-
  // configured random_image_api as PostCard / HomePage hero.
  const optionsRes = await getOptions().catch(() => ({ data: {} } as any));
  const options = (optionsRes?.data || {}) as Record<string, string>;

  return <ThemePostPage post={post} options={options} />;
}
