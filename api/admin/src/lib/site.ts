/**
 * Shared site URL helpers for admin pages.
 *
 * Problem: admin SPA is served at :8080 (Go) but the blog frontend runs at :3000
 * (Next.js) in dev, or a different domain in prod. Hard-coding relative paths like
 * `/posts/my-slug` resolves against the admin's own host → wrong port.
 *
 * Solution: read `site_url` from options once at load, expose a helper that
 * prefixes paths with it.
 */

import { optionsApi } from './api';

let cached: { site_url: string; site_title: string } | null = null;
let loadPromise: Promise<void> | null = null;

async function doLoad(): Promise<void> {
  try {
    const r: any = await optionsApi.list();
    const opts = r.data || r || {};
    cached = {
      site_url: (opts.site_url || '').replace(/\/$/, ''),
      site_title: opts.site_title || 'Utterlog',
    };
  } catch {
    cached = { site_url: '', site_title: 'Utterlog' };
  }
}

/** Ensure site options are loaded. Call once at auth/ready. */
export function loadSiteOptions(): Promise<void> {
  if (cached) return Promise.resolve();
  if (!loadPromise) loadPromise = doLoad();
  return loadPromise;
}

/** Reset cache — call after saving options so next read is fresh. */
export function invalidateSiteOptions() {
  cached = null;
  loadPromise = null;
}

/** Raw site URL (no trailing slash). Returns '' if not loaded yet. */
export function getSiteUrl(): string {
  return cached?.site_url || '';
}

export function getSiteTitle(): string {
  return cached?.site_title || 'Utterlog';
}

/**
 * Build a full front-site URL.
 *
 * Priority:
 *   1. If `site_url` is configured → use it (production/prod domain)
 *   2. If running on localhost at :8080 (admin) → default to :3000 (Next.js dev)
 *   3. Otherwise fall back to same origin
 */
export function siteUrlOf(path = '/'): string {
  const site = getSiteUrl();
  const clean = path.startsWith('/') ? path : '/' + path;

  if (site) return site + clean;

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    // Dev heuristic: admin on :8080 → blog on :3000
    if (hostname === 'localhost' && port === '8080') {
      return `${protocol}//${hostname}:3000${clean}`;
    }
    return window.location.origin + clean;
  }
  return clean;
}

/** Convenience builders */
export const postUrlOf = (slug: string) => siteUrlOf(`/posts/${slug}`);
export const pageUrlOf = (slug: string) => siteUrlOf(`/pages/${slug}`);
export const momentsUrl = () => siteUrlOf('/moments');
export const siteHomeUrl = () => siteUrlOf('/');
