'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getVisitorId, getFingerprint } from '@/lib/fingerprint';
import { useAuthStore } from '@/lib/store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

type PersistHydrationApi = {
  hasHydrated?: () => boolean;
  onFinishHydration?: (callback: () => void) => () => void;
};

function getAuthPersist(): PersistHydrationApi | undefined {
  return (useAuthStore as typeof useAuthStore & { persist?: PersistHydrationApi }).persist;
}

function hasAuthHydrated() {
  return getAuthPersist()?.hasHydrated?.() ?? true;
}

export default function PageViewTracker() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const tracked = useRef('');
  const startTime = useRef(Date.now());
  const vidRef = useRef('');
  const fpRef = useRef('');
  const [authHydrated, setAuthHydrated] = useState(hasAuthHydrated);
  const isAdmin = !!accessToken && user?.role === 'admin';

  useEffect(() => {
    if (authHydrated) return;
    const persist = getAuthPersist();
    if (!persist?.onFinishHydration) {
      setAuthHydrated(true);
      return;
    }
    if (persist.hasHydrated?.()) {
      setAuthHydrated(true);
      return;
    }
    return persist.onFinishHydration(() => setAuthHydrated(true));
  }, [authHydrated]);

  // Initialize visitor ID + fingerprint once
  useEffect(() => {
    vidRef.current = getVisitorId();
    getFingerprint().then(fp => { fpRef.current = fp; });
  }, []);

  // Track page view on route change
  useEffect(() => {
    if (!authHydrated) return;
    if (isAdmin) {
      tracked.current = '';
      startTime.current = Date.now();
      return;
    }

    // Report duration of previous page
    if (tracked.current && tracked.current !== pathname) {
      const duration = Math.round((Date.now() - startTime.current) / 1000);
      if (duration > 0 && duration < 3600) {
        const body = JSON.stringify({ path: tracked.current, duration });
        navigator.sendBeacon?.(`${API_URL}/track/duration`, body)
          || fetch(`${API_URL}/track/duration`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body, keepalive: true,
          }).catch(() => {});
      }
    }

    tracked.current = pathname;
    startTime.current = Date.now();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    fetch(`${API_URL}/track`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        path: pathname,
        referer: document.referrer || '',
        visitor_id: vidRef.current,
        fingerprint: fpRef.current,
      }),
    }).catch(() => {});
  }, [pathname, accessToken, authHydrated, isAdmin]);

  // Report duration on page unload
  useEffect(() => {
    const reportDuration = () => {
      if (!authHydrated) return;
      if (isAdmin) return;
      const duration = Math.round((Date.now() - startTime.current) / 1000);
      if (duration > 0 && duration < 3600 && tracked.current) {
        navigator.sendBeacon?.(`${API_URL}/track/duration`, JSON.stringify({
          path: tracked.current, duration,
        }));
      }
    };
    const onVisChange = () => { if (document.visibilityState === 'hidden') reportDuration(); };
    window.addEventListener('beforeunload', reportDuration);
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.removeEventListener('beforeunload', reportDuration);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [authHydrated, isAdmin]);

  return null;
}
