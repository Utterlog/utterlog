'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getVisitorId, getFingerprint } from '@/lib/fingerprint';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function PageViewTracker() {
  const pathname = usePathname();
  const tracked = useRef('');
  const startTime = useRef(Date.now());
  const vidRef = useRef('');
  const fpRef = useRef('');

  // Initialize visitor ID + fingerprint once
  useEffect(() => {
    vidRef.current = getVisitorId();
    getFingerprint().then(fp => { fpRef.current = fp; });
  }, []);

  // Track page view on route change
  useEffect(() => {
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

    fetch(`${API_URL}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: pathname,
        referer: document.referrer || '',
        visitor_id: vidRef.current,
        fingerprint: fpRef.current,
      }),
    }).catch(() => {});
  }, [pathname]);

  // Report duration on page unload
  useEffect(() => {
    const reportDuration = () => {
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
  }, []);

  return null;
}
