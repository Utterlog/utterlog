'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { useAuthStore } from '@/lib/store';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Wait for Zustand to hydrate from localStorage
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      const { accessToken, checkAuth } = useAuthStore.getState();
      if (!accessToken) {
        router.push('/login');
        return;
      }
      checkAuth().then((valid) => {
        if (!valid) {
          router.push('/login');
        } else {
          setReady(true);
        }
      });
    });

    // If already hydrated (fast path)
    if (useAuthStore.persist.hasHydrated()) {
      const { accessToken, checkAuth } = useAuthStore.getState();
      if (!accessToken) {
        router.push('/login');
        return;
      }
      checkAuth().then((valid) => {
        if (!valid) {
          router.push('/login');
        } else {
          setReady(true);
        }
      });
    }

    return unsub;
  }, [router]);

  const pathname = usePathname();
  // Editor pages need zero padding for full-width layout
  const isEditorPage = pathname.includes('/create') || pathname.includes('/edit/');

  if (!ready) {
    return null;
  }

  return (
    <div className="flex h-screen bg-main text-main font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className={`flex-1 ${isEditorPage ? 'overflow-hidden' : 'overflow-y-auto'}`} style={isEditorPage ? { padding: '16px 24px 0' } : { padding: '24px 32px' }}>
          <div style={isEditorPage ? {} : { maxWidth: '1400px', margin: '0 auto' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
