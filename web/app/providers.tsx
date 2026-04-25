'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import GlobalMiniPlayer from '@/components/layout/GlobalMiniPlayer';

// Apply admin color-theme from localStorage before paint.
//
// CRITICAL: this attribute (`data-theme`) is shared with the blog
// theme system. (blog)/layout.tsx server-injects `data-theme="Chred"`
// (or whatever blog theme is active) so that themes/Chred/styles.css
// rules like `[data-theme="Chred"] .post-related-card-cover {
// position: relative; aspect-ratio: 16/10 }` actually match.
//
// If we unconditionally overwrite that with a color-theme value
// here ('steel', 'blue', etc.), every blog theme's structural rules
// silently no-op — which manifested as related-card images escaping
// their `position: absolute; inset: 0` containers and filling the
// entire viewport.
//
// So: only write if the slot is empty or already a color-theme name.
// If it's a blog theme name, leave it alone.
const COLOR_THEMES = ['steel', 'blue', 'green', 'mint', 'claude', 'ocean', 'dark'];
function useThemeInit() {
  useEffect(() => {
    try {
      const current = document.documentElement.dataset.theme;
      // Blog theme already stamped by (blog)/layout — don't clobber.
      if (current && !COLOR_THEMES.includes(current)) return;
      const t = localStorage.getItem('utterlog-theme');
      if (t) {
        const d = JSON.parse(t);
        const v = d?.state?.theme;
        if (v && COLOR_THEMES.includes(v)) {
          document.documentElement.dataset.theme = v;
        }
      }
    } catch {}
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useThemeInit();
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="top-right"
        containerStyle={{ top: '72px', right: '24px' }}
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '1px',
            borderLeft: '4px solid #16a34a',
            background: '#f0fdf4',
            color: '#166534',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            padding: '12px 16px',
            fontSize: '14px',
            maxWidth: '480px',
          },
          success: {
            style: { borderLeft: '4px solid #16a34a', background: '#f0fdf4', color: '#166534' },
            iconTheme: { primary: '#16a34a', secondary: '#fff' },
          },
          error: {
            style: { borderLeft: '4px solid #dc2626', background: '#fef2f2', color: '#991b1b' },
            iconTheme: { primary: '#dc2626', secondary: '#fff' },
          },
        }}
      />
      <GlobalMiniPlayer />
    </QueryClientProvider>
  );
}
