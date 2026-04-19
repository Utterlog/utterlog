import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';

interface VersionPayload {
  current: { version: string; commit?: string };
  latest: { version: string; name: string } | null;
  update_available: boolean;
  checked_at: string;
}

// In-memory cache so the badge doesn't hit the backend on every route
// change — 10 min matches the server-side cache TTL.
let cached: { at: number; data: VersionPayload | null } = { at: 0, data: null };
const TTL = 10 * 60 * 1000;

async function fetchVersion(): Promise<VersionPayload | null> {
  if (cached.data && Date.now() - cached.at < TTL) return cached.data;
  try {
    const r = await api.get<any>('/admin/system/version');
    cached = { at: Date.now(), data: r.data as VersionPayload };
    return cached.data;
  } catch {
    return null;
  }
}

interface Props {
  /** "compact" = tight badge for sidebar header; "full" = text + caption for settings */
  variant?: 'compact' | 'full';
}

export default function VersionBadge({ variant = 'compact' }: Props) {
  const [info, setInfo] = useState<VersionPayload | null>(cached.data);

  useEffect(() => {
    fetchVersion().then(setInfo);
  }, []);

  const current = info?.current.version || 'v1.0';
  // Prefer the real release label (v1.0.2). Only fall back to commit
  // SHA if the build was truly untagged (VERSION="dev"). The compact
  // pill is narrow so version names over 10 chars get truncated.
  const shortVer = current === 'dev' && info?.current.commit
    ? info.current.commit.slice(0, 7)
    : current.length > 10 ? current.slice(0, 10) : current;
  const hasUpdate = !!info?.update_available;

  if (variant === 'compact') {
    return (
      <Link
        to="/settings#update"
        title={hasUpdate ? `有新版本：${info?.latest?.version}` : `当前版本：${current}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 9, padding: '1px 5px',
          background: hasUpdate ? '#0052D9' : 'var(--color-primary)',
          color: '#fff', fontWeight: 600, textDecoration: 'none',
          fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
          position: 'relative',
        }}
      >
        {shortVer}
        {hasUpdate && (
          <span
            aria-hidden
            style={{
              position: 'absolute', top: -4, right: -4,
              width: 8, height: 8, borderRadius: '50%',
              background: '#ef4444',
              border: '1.5px solid var(--color-surface, #fff)',
              boxShadow: '0 0 0 1px rgba(239,68,68,0.35)',
            }}
          />
        )}
      </Link>
    );
  }

  // full variant for Settings card
  return (
    <Link
      to="/settings#update"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px',
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface, #fff)',
        textDecoration: 'none', color: 'var(--color-text)',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
    >
      <div style={{
        width: 36, height: 36,
        background: hasUpdate ? '#FEE2E2' : 'var(--color-primary-soft, #E6EEFB)',
        color: hasUpdate ? '#B91C1C' : 'var(--color-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, flexShrink: 0,
      }}>
        <i className={`fa-solid ${hasUpdate ? 'fa-circle-arrow-up' : 'fa-circle-check'}`} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          版本与更新
          {hasUpdate && (
            <span style={{
              marginLeft: 8, fontSize: 10, padding: '1px 6px',
              background: '#EF4444', color: '#fff', fontWeight: 700,
            }}>
              有新版本
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 2 }}>
          当前 <code style={{ fontFamily: "ui-monospace,monospace" }}>{current}</code>
          {hasUpdate && info?.latest && (
            <> · 最新 <code style={{ fontFamily: "ui-monospace,monospace", color: '#0052D9' }}>{info.latest.version}</code></>
          )}
        </div>
      </div>
      <i className="fa-solid fa-chevron-right" style={{ fontSize: 11, color: 'var(--color-text-muted)' }} />
    </Link>
  );
}
