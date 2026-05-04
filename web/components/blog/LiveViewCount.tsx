'use client';

// LiveViewCount makes the post view_count display always-fresh on
// mount, regardless of Next.js Router Cache, browser bfcache, or any
// upstream caching layer that might serve a stale page.
//
// Why a client component instead of relying on
// experimental.staleTimes / cache-control headers:
// In practice we observed home cards stuck on the old number after a
// soft navigation (click article → /track increments DB → click home
// → card still shows pre-increment value). Server-side rendering and
// API responses were verified fresh; the staleness lived somewhere in
// the browser layer (Router Cache replay, bfcache, or the browser
// keeping the previous DOM in memory). Setting staleTimes did not
// solve it.
//
// This component sidesteps the whole question: each PostCard mounts
// it, it does its own /api/v1/posts/<id> fetch with cache:'no-store',
// and updates the displayed number once the fresh count arrives.
// Initial render uses `initial` (server-rendered value) so SEO /
// first-paint stays the same — the client just upgrades the number
// in place if it's drifted.

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function LiveViewCount({
  postId,
  initial,
}: {
  postId: number;
  initial: number;
}) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    if (!postId) return;
    let cancelled = false;
    fetch(`${API_URL}/posts/${postId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const v = d?.data?.view_count;
        if (typeof v === 'number') setCount(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [postId]);

  return <>{count}</>;
}
