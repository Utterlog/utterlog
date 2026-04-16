'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function Footer() {
  const pathname = usePathname();
  const [stats, setStats] = useState<any>({});
  const [siteOptions, setSiteOptions] = useState<any>({});

  // Refresh stats on every route change
  useEffect(() => {
    fetch(`${API}/archive/stats`, { cache: 'no-store' }).then(r => r.json()).then(r => setStats(r.data || {})).catch(() => {});
  }, [pathname]);

  // Load once: site options
  useEffect(() => {
    fetch(`${API}/options`, { cache: 'no-store' }).then(r => r.json()).then(r => setSiteOptions(r.data || {})).catch(() => {});
  }, []);

  const siteName = siteOptions.site_title || '西风';
  const tv = stats.total_views || 0;
  const totalViews = tv >= 10000 ? (tv / 10000).toFixed(1) + '万' : tv.toLocaleString();

  return (
    <footer style={{
      maxWidth: '1400px', margin: '0 auto',
      borderTop: '1px solid #e5e5e5',
      padding: '20px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: '12px', color: '#999',
      flexWrap: 'wrap', gap: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <span>&copy; {new Date().getFullYear()} {siteName}. All rights reserved.</span>
        <span><i className="fa-regular fa-eye" style={{ marginRight: '4px' }} />总浏览量 {totalViews}</span>
        {siteOptions.beian_gongan && (
          <a href={`http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=${siteOptions.beian_gongan.replace(/\D/g, '')}`}
            target="_blank" rel="noopener noreferrer"
            style={{ color: '#999', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <img src="https://beian.gov.cn/img/ghs.png" alt="" style={{ width: '14px', height: '14px' }} />
            {siteOptions.beian_gongan}
          </a>
        )}
        {siteOptions.beian_icp && (
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
            style={{ color: '#999', textDecoration: 'none' }}>
            {siteOptions.beian_icp}
          </a>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/archives" style={{ color: '#999', textDecoration: 'none' }}><i className="fa-regular fa-chart-bar" /></Link>
        <Link href="/feed" style={{ color: '#999', textDecoration: 'none' }}><i className="fa-solid fa-rss" /></Link>
        <a href="#top" style={{ color: '#999', textDecoration: 'none' }}><i className="fa-solid fa-arrow-up" /></a>
      </div>
    </footer>
  );
}
