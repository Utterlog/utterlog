'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function Footer() {
  const [siteOptions, setSiteOptions] = useState<any>({});

  useEffect(() => {
    fetch(`${API}/options`, { cache: 'no-store' }).then(r => r.json()).then(r => setSiteOptions(r.data || {})).catch(() => {});
  }, []);

  const siteName = siteOptions.site_title || 'Utterlog';
  const hasBeian = siteOptions.beian_gongan || siteOptions.beian_icp;

  return (
    <footer style={{ background: '#f4f6f8', borderTop: '1px solid #e9e9e9', padding: '32px 40px', textAlign: 'center' }}>
      <p style={{ fontSize: '13px', color: '#6b7280' }}>
        &copy; {new Date().getFullYear()} {siteName}. Powered by Utterlog.
      </p>
      {hasBeian && (
        <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px', display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
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
        </p>
      )}
    </footer>
  );
}
