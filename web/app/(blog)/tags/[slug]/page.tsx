import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTags, getPosts } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';
import { getThemeContextData } from '@/lib/theme-data';
import { DefaultTagPage } from '@/components/blog/defaults';

interface TagPageProps {
  params: Promise<{ slug: string }>;
}

// Chinese tags often arrive as percent-encoded (browsers encode the path
// on navigation; copy-pasting from an external link keeps the %XX form).
// Next.js decodes dynamic segments for us, but we still normalize +
// match by both slug and name so a raw Chinese name with no custom slug
// like /tags/编程 works whether it was clicked from within the site or
// pasted in from an external referrer.
function normalize(s: string): string {
  let t = s;
  try { t = decodeURIComponent(t); } catch {}
  return t.normalize('NFC').trim();
}
function matchTag(tags: any[], slug: string) {
  const needle = normalize(slug);
  return tags.find((t: any) => normalize(t.slug || '') === needle || normalize(t.name || '') === needle);
}

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const response = await getTags();
    const tag = matchTag(response.data || [], slug);
    if (tag) return { title: `${tag.name} — 标签` };
  } catch {}
  return { title: '标签' };
}

export default async function TagPostsPage({ params }: TagPageProps) {
  const { slug } = await params;

  const ctx = await getThemeContextData();
  const tag = matchTag(ctx.tags, slug);
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
