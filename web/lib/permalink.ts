/**
 * Permalink — pluggable post URL structure.
 *
 * Templates use WordPress-style tokens:
 *   %postname%   — post slug
 *   %post_id%    — post numeric id
 *   %year%       — 4-digit year of publish date (or created_at fallback)
 *   %month%      — 2-digit month
 *   %day%        — 2-digit day
 *   %category%   — slug of first category, or "uncategorized"
 */

export interface PermalinkPreset {
  key: string;
  label: string;
  template: string;
}

export const PERMALINK_PRESETS: PermalinkPreset[] = [
  { key: 'default',  label: '保留 /posts 前缀',   template: '/posts/%postname%' },
  { key: 'plain',    label: '纯 slug（无前缀）',  template: '/%postname%' },
  { key: 'date',     label: '年/月/slug',          template: '/%year%/%month%/%postname%' },
  { key: 'date_day', label: '年/月/日/slug',       template: '/%year%/%month%/%day%/%postname%' },
  { key: 'category', label: '分类/slug',           template: '/%category%/%postname%' },
  { key: 'id',       label: 'archives/序号',       template: '/archives/%post_id%' },
];

export const DEFAULT_PERMALINK = '/posts/%postname%';

interface PostLike {
  id?: number;
  slug?: string;
  published_at?: string | null;
  created_at?: string | number;
  categories?: { slug?: string }[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function postDate(post: PostLike): Date | null {
  if (post.published_at) {
    const d = new Date(post.published_at);
    if (!isNaN(d.getTime())) return d;
  }
  if (post.created_at != null) {
    const n = Number(post.created_at);
    if (!isNaN(n) && n > 1e9 && n < 1e10) return new Date(n * 1000);
    const d = new Date(post.created_at as any);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/** Render a post → URL path using the given template. */
export function buildPermalink(post: PostLike, template?: string): string {
  const tpl = (template && template.trim()) || DEFAULT_PERMALINK;
  const d = postDate(post);
  const cat = post.categories?.[0]?.slug || 'uncategorized';
  return tpl
    .replace(/%postname%/g, encodeURIComponent(post.slug || ''))
    .replace(/%post_id%/g, String(post.id ?? ''))
    .replace(/%year%/g,  d ? String(d.getFullYear()) : '')
    .replace(/%month%/g, d ? pad2(d.getMonth() + 1) : '')
    .replace(/%day%/g,   d ? pad2(d.getDate()) : '')
    .replace(/%category%/g, encodeURIComponent(cat));
}

/**
 * Parse an incoming URL path against a template. Returns either
 * { slug } or { id } — enough to fetch the post — or null when the
 * template doesn't match this path.
 */
export function parsePermalink(
  pathname: string,
  template: string,
): { slug?: string; id?: number } | null {
  const url = (pathname || '').replace(/\/+$/, '') || '/';
  const tpl = (template || DEFAULT_PERMALINK).replace(/\/+$/, '');

  const tokenRe = /%(postname|post_id|year|month|day|category)%/g;
  const tokens: string[] = [];
  let regexSrc = '^';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(tpl)) !== null) {
    regexSrc += tpl.slice(last, m.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    tokens.push(m[1]);
    switch (m[1]) {
      case 'postname': regexSrc += '([^/]+)'; break;
      case 'post_id':  regexSrc += '(\\d+)';  break;
      case 'year':     regexSrc += '(\\d{4})'; break;
      case 'month':    regexSrc += '(\\d{2})'; break;
      case 'day':      regexSrc += '(\\d{2})'; break;
      case 'category': regexSrc += '([^/]+)'; break;
    }
    last = m.index + m[0].length;
  }
  regexSrc += tpl.slice(last).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  regexSrc += '$';

  const match = url.match(new RegExp(regexSrc));
  if (!match) return null;

  const caps: Record<string, string> = {};
  tokens.forEach((t, i) => { caps[t] = decodeURIComponent(match[i + 1]); });

  if (caps.post_id) return { id: parseInt(caps.post_id, 10) };
  if (caps.postname) return { slug: caps.postname };
  return null;
}
