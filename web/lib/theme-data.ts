import { getOptions, getCategories, getTags, getArchiveStats } from './blog-api';
import type { ThemeContextData, MenuItem } from './theme-context';
import { getThemeManifest } from './theme';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || process.env.INTERNAL_API_URL || '/api/v1';

function parseMenu(raw: unknown): MenuItem[] {
  if (!raw) return [];
  try {
    const items = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export async function getThemeContextData(): Promise<ThemeContextData> {
  const [optRes, catRes, tagRes, statsRes, ownerRes] = await Promise.all([
    getOptions().catch(() => ({ data: {} })),
    getCategories().catch(() => ({ data: [] })),
    getTags().catch(() => ({ data: [] })),
    getArchiveStats().catch(() => ({ data: {} })),
    fetch(`${API_BASE}/owner`).then(r => r.json()).catch(() => ({ data: {} })),
  ]);

  const opts: Record<string, string> = optRes.data || optRes || {};
  const categories = catRes.data || [];
  const tags = tagRes.data || [];
  const stats = statsRes.data || {};

  // Parse all menu_* keys into menus map
  const menus: Record<string, MenuItem[]> = {};
  for (const key of Object.keys(opts)) {
    if (key.startsWith('menu_')) {
      const position = key.replace('menu_', '');
      menus[position] = parseMenu(opts[key]);
    }
  }

  // Extract social links from options
  const socials: Record<string, string> = {};
  for (const key of Object.keys(opts)) {
    if (key.startsWith('social_') && opts[key]) {
      socials[key.replace('social_', '')] = opts[key];
    }
  }

  const themeName = opts.active_theme || 'Azure';
  const manifest = getThemeManifest(themeName);

  // Resolve owner avatar based on avatar_source
  const ownerData = ownerRes.data || ownerRes || {};
  const avatarSource = opts.avatar_source || 'auto';
  let ownerAvatar = '';

  // Priority based on avatar_source setting:
  //   'profile'  → admin-uploaded avatar (ownerData.avatar)
  //   'utterlog' → Utterlog ID avatar
  //   'gravatar' → Gravatar
  //   'auto'     → try in order: profile → utterlog → gravatar → option
  switch (avatarSource) {
    case 'profile':
      ownerAvatar = ownerData.avatar || '';
      break;
    case 'utterlog':
      ownerAvatar = ownerData.utterlog_avatar || '';
      break;
    case 'gravatar':
      ownerAvatar = ownerData.gravatar_url || '';
      break;
    default:
      // Auto: prefer profile-uploaded, fallback chain
      ownerAvatar =
        ownerData.avatar ||
        ownerData.utterlog_avatar ||
        ownerData.gravatar_url ||
        opts.owner_avatar ||
        '';
  }

  return {
    site: {
      title: opts.site_title || 'Utterlog',
      subtitle: opts.site_subtitle || '',
      description: opts.site_description || '',
      url: opts.site_url || '',
      logo: opts.site_logo || '',
      darkLogo: opts.site_dark_logo || '',
      favicon: opts.site_favicon || '',
    },
    owner: {
      nickname: ownerData.nickname || opts.owner_nickname || opts.site_title || 'Utterlog',
      bio: ownerData.bio || opts.owner_bio || opts.site_description || '',
      avatar: ownerAvatar,
      url: ownerData.url || opts.owner_url || '',
      email: ownerData.gravatar_url?.split('/avatar/')[1]?.split('?')[0] || '',
      socials,
    },
    menus,
    categories,
    tags,
    archiveStats: {
      post_count: stats.post_count || 0,
      comment_count: stats.comment_count || 0,
      word_count: stats.word_count || 0,
      days: stats.days || 0,
      total_views: stats.total_views || 0,
      heatmap: stats.heatmap || [],
    },
    theme: {
      name: themeName,
      manifest,
    },
    options: opts,
  };
}
