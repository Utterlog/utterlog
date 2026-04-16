'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface OnlineVisitor {
  name?: string;
  avatar?: string;
  ip_masked?: string;
  path?: string;
  country?: string;
  city?: string;
}

export default function VisitorAvatars() {
  const [visitors, setVisitors] = useState<OnlineVisitor[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch(`${API}/online`)
      .then(r => r.json())
      .then(r => {
        const data = r.data || r;
        if (data.enabled === false) return;
        setCount(data.count || 0);
        setVisitors((data.online || []).slice(0, 12));
      })
      .catch(() => {});
  }, []);

  if (count === 0) return null;

  // Deduplicate by name (keep unique avatars)
  const seen = new Set<string>();
  const unique = visitors.filter(v => {
    const key = v.avatar || v.ip_masked || Math.random().toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="visitor-avatars">
      <div className="visitor-avatars-stack">
        {unique.slice(0, 8).map((v, i) => (
          <span
            key={i}
            className="visitor-avatar-item"
            title={[v.name, v.city || v.country].filter(Boolean).join(' · ') || v.ip_masked || '访客'}
            style={{ zIndex: 10 - i }}
          >
            {v.avatar ? (
              <img src={v.avatar} alt={v.name || ''} />
            ) : (
              <span className="visitor-avatar-default">
                {(v.name || '?')[0].toUpperCase()}
              </span>
            )}
          </span>
        ))}
        {count > 8 && (
          <span className="visitor-avatar-more">+{count - 8}</span>
        )}
      </div>
      <span className="visitor-avatars-label">
        {count} 位访客正在浏览
      </span>
    </div>
  );
}
