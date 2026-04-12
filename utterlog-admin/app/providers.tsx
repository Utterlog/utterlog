'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import GlobalMiniPlayer from '@/components/layout/GlobalMiniPlayer';

// Apply theme from localStorage before paint
function useThemeInit() {
  useEffect(() => {
    try {
      const t = localStorage.getItem('utterlog-theme');
      if (t) {
        const d = JSON.parse(t);
        const v = d?.state?.theme;
        if (v && ['steel', 'blue', 'green', 'mint', 'claude', 'ocean', 'dark'].includes(v)) {
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
