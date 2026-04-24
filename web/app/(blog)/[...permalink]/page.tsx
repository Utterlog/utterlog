import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPost, getPostBySlug, getActiveTheme, getOptions } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';
import { parsePermalink, DEFAULT_PERMALINK } from '@/lib/permalink';

// Catch-all for custom permalink structures. Next.js route priority
// means this only fires when no specific route (/posts/:slug, /archives,
// /categories/:slug, …) matched, so it doesn't steal traffic from any
// other blog page.

interface Props {
  params: Promise<{ permalink: string[] }>;
}

async function resolvePost(segments: string[]): Promise<any | null> {
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

  try {
    if (hit.id != null) {
      const r: any = await getPost(hit.id);
      return r?.data ?? null;
    }
    if (hit.slug) {
      const r: any = await getPostBySlug(hit.slug);
      return r?.data ?? null;
    }
  } catch { return null; }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { permalink } = await params;
  const post = await resolvePost(permalink || []);
  if (!post) return { title: '页面未找到' };
  return {
    title: post.seo?.title || post.title,
    description: post.seo?.description || post.excerpt || '',
    keywords: post.seo?.keywords || '',
  };
}

export default async function PermalinkPage({ params }: Props) {
  const { permalink } = await params;
  const post = await resolvePost(permalink || []);
  if (!post) notFound();

  let themeName = 'Azure';
  try { themeName = await getActiveTheme(); } catch {}

  const theme = getThemeComponents(themeName);
  const ThemePostPage = theme.PostPage;
  return <ThemePostPage post={post} />;
}
