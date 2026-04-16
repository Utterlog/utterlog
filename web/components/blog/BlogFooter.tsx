'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function BlogFooter() {
  const [siteOptions, setSiteOptions] = useState<any>({});

  useEffect(() => {
    fetch(`${API}/options`, { cache: 'no-store' }).then(r => r.json()).then(r => setSiteOptions(r.data || {})).catch(() => {});
  }, []);

  const currentYear = new Date().getFullYear();
  const siteName = siteOptions.site_title || 'Utterlog';
  const hasBeian = siteOptions.beian_gongan || siteOptions.beian_icp;

  return (
    <footer className="border-t border-line mt-16">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-dim">
          <p>&copy; {currentYear} {siteName}. All rights reserved.</p>
          <nav className="flex items-center gap-4">
            <Link href="/about" className="hover:text-main transition-colors">关于</Link>
            <Link href="/archives" className="hover:text-main transition-colors">归档</Link>
            <a href="/admin" className="hover:text-main transition-colors">管理</a>
          </nav>
        </div>
        {hasBeian && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '12px', fontSize: '12px', flexWrap: 'wrap' }}>
            {siteOptions.beian_gongan && (
              <a href={`http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=${siteOptions.beian_gongan.replace(/\D/g, '')}`}
                target="_blank" rel="noopener noreferrer"
                style={{ color: '#9ca3af', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <img src="https://beian.gov.cn/img/ghs.png" alt="" style={{ width: '14px', height: '14px' }} />
                {siteOptions.beian_gongan}
              </a>
            )}
            {siteOptions.beian_icp && (
              <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
                style={{ color: '#9ca3af', textDecoration: 'none' }}>
                {siteOptions.beian_icp}
              </a>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
