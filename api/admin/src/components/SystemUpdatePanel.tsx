import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

interface VersionInfo {
  current: { version: string; built_at: string };
  latest: {
    version: string;
    name: string;
    body: string;
    url: string;
    published_at: string;
    prerelease: boolean;
  } | null;
  update_available: boolean;
  checked_at: string;
  error?: string;
}

interface UpgradeStatus {
  running: boolean;
  finished: boolean;
  success: boolean;
  message: string;
  started_at: string;
  log_tail: string;
}

// Simple markdown-lite renderer for GitHub release body: linebreaks +
// bullets. Good enough for our changelog lines. HTML entities escaped
// before mapping so there's no XSS risk from the release-notes body.
function renderChangelog(md: string): string {
  if (!md) return '';
  const escaped = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .split(/\n/)
    .map((line) => {
      if (/^\s*[-*]\s+/.test(line)) return `<li>${line.replace(/^\s*[-*]\s+/, '')}</li>`;
      if (/^#+\s+/.test(line)) return `<h4>${line.replace(/^#+\s+/, '')}</h4>`;
      if (!line.trim()) return '<br/>';
      return `<p>${line}</p>`;
    })
    .join('');
}

// The full version + upgrade UI. Renders inline — meant to be dropped
// into the Settings page's "系统更新" tab. Handles fetch, refresh,
// one-click upgrade, progress polling, and changelog rendering.
interface ReleaseItem {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
}

export default function SystemUpdatePanel() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgradeStatus, setUpgradeStatus] = useState<UpgradeStatus | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [releases, setReleases] = useState<ReleaseItem[] | null>(null);
  const [releasesErr, setReleasesErr] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load(refresh = false) {
    setLoading(true);
    try {
      const r = await api.get<any>(`/admin/system/version${refresh ? '?refresh=1' : ''}`);
      setInfo(r.data);
    } catch (e: any) {
      toast.error('获取版本信息失败: ' + (e?.message || 'unknown'));
    } finally {
      setLoading(false);
    }
  }

  async function loadReleases(refresh = false) {
    try {
      const r = await api.get<any>(`/admin/system/releases${refresh ? '?refresh=1' : ''}`);
      setReleases((r.data?.releases || []) as ReleaseItem[]);
      setReleasesErr(r.data?.error || '');
    } catch (e: any) {
      setReleasesErr(e?.message || '加载更新历史失败');
    }
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function pollStatus() {
    try {
      const r = await api.get<any>('/admin/system/upgrade/status');
      setUpgradeStatus(r.data);
      if (!r.data.running && r.data.finished) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        if (r.data.success) {
          toast.success('升级完成，正在刷新版本信息...');
          setTimeout(() => {
            load(true);
            setUpgrading(false);
          }, 2000);
        } else {
          toast.error('升级失败: ' + r.data.message);
          setUpgrading(false);
        }
      }
    } catch (_) {
      // api likely restarting — keep polling
    }
  }

  async function doUpgrade() {
    if (!confirm('即将拉取最新镜像并重建容器（约 30-60 秒）。\n期间后台短暂不可访问，但数据、配置、上传文件全部保留。\n\n继续？')) return;
    setUpgrading(true);
    try {
      await api.post('/admin/system/upgrade');
      toast('升级已开始，请勿刷新页面');
      pollRef.current = setInterval(pollStatus, 2000);
    } catch (e: any) {
      setUpgrading(false);
      const msg = e?.response?.data?.error?.message || e?.message;
      toast.error('启动升级失败: ' + msg);
    }
  }

  useEffect(() => {
    load();
    loadReleases();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  const cur = info?.current.version || '—';
  const lat = info?.latest?.version || '—';
  const updateAvailable = info?.update_available ?? false;

  // Status color: blue when an update is available, green when up-to-date.
  const statusColor = updateAvailable ? '#0052D9' : '#16a34a';
  const statusColorDark = updateAvailable ? '#003DA6' : '#15803d';
  const statusColorSoft = updateAvailable ? 'rgba(0,82,217,0.08)' : 'rgba(22,163,74,0.08)';

  // Primary button = main action (upgrade / "up-to-date"). Blue or green.
  const primaryBtnStyle: React.CSSProperties = {
    height: 40, padding: '0 20px',
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: statusColor, color: '#fff',
    border: `1px solid ${statusColor}`,
    fontSize: 14, fontWeight: 600,
    cursor: upgrading || loading ? 'not-allowed' : (updateAvailable ? 'pointer' : 'default'),
    opacity: upgrading || loading ? 0.6 : 1,
    transition: 'background-color 0.15s, border-color 0.15s',
    fontFamily: 'inherit',
  };
  // Secondary button = refresh check. Always outlined gray.
  const secondaryBtnStyle: React.CSSProperties = {
    height: 40, padding: '0 16px',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'var(--color-surface, #fff)', color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    fontSize: 13,
    cursor: loading || upgrading ? 'not-allowed' : 'pointer',
    opacity: loading || upgrading ? 0.5 : 1,
    transition: 'border-color 0.15s, color 0.15s',
    fontFamily: 'inherit',
  };

  return (
    <div>
      {/* Version card */}
      <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 4 }}>当前版本</div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'ui-monospace, monospace', color: updateAvailable ? 'var(--color-text)' : statusColor }}>{cur}</div>
            {info?.current.built_at && (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                构建于 {info.current.built_at}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 4 }}>最新版本</div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'ui-monospace, monospace', color: statusColor }}>
              {lat}
            </div>
            {info?.latest?.published_at && (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                发布于 {new Date(info.latest.published_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {updateAvailable ? (
            <button
              type="button"
              onClick={doUpgrade}
              disabled={upgrading || loading}
              style={primaryBtnStyle}
              onMouseEnter={(e) => { if (!upgrading && !loading) e.currentTarget.style.background = statusColorDark; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = statusColor; }}
            >
              <i className={`fa-solid ${upgrading ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'}`} />
              {upgrading ? '升级中…' : '一键升级到 ' + lat}
            </button>
          ) : (
            <button type="button" disabled style={primaryBtnStyle}>
              <i className="fa-solid fa-circle-check" />
              当前已是最新版本
            </button>
          )}
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || upgrading}
            style={secondaryBtnStyle}
            onMouseEnter={(e) => { if (!loading && !upgrading) { e.currentTarget.style.borderColor = statusColor; e.currentTarget.style.color = statusColor; } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text)'; }}
          >
            <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`} />
            刷新检查
          </button>
          <div style={{ flex: 1 }} />
          {info?.latest?.url && (
            <a href={info.latest.url} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>
              在 GitHub 查看 <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: 10, marginLeft: 2 }} />
            </a>
          )}
        </div>

        {info?.error && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', borderLeft: '3px solid #dc2626', color: '#991b1b', fontSize: 12 }}>
            <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 6 }} />
            {info.error}
          </div>
        )}
      </div>

      {/* Changelog */}
      {info?.latest?.body && (
        <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: '20px 24px', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fa-solid fa-clipboard-list" style={{ color: 'var(--color-primary)' }} />
            更新内容 — {info.latest.name || info.latest.version}
          </h3>
          <div
            style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-text)' }}
            dangerouslySetInnerHTML={{ __html: renderChangelog(info.latest.body) }}
          />
        </div>
      )}

      {/* Live upgrade log */}
      {upgradeStatus && (upgrading || upgradeStatus.log_tail) && (
        <div style={{ border: '1px solid var(--color-border)', background: '#0f172a', color: '#e2e8f0', padding: '16px 20px', fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.6, marginBottom: 16, whiteSpace: 'pre-wrap', maxHeight: 280, overflow: 'auto' }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className={`fa-solid ${upgradeStatus.running ? 'fa-circle-notch fa-spin' : upgradeStatus.success ? 'fa-circle-check' : 'fa-circle-xmark'}`} />
            {upgradeStatus.running ? '升级进行中...' : upgradeStatus.success ? '升级完成' : '升级失败'}
          </div>
          {upgradeStatus.log_tail || '(尚无输出)'}
        </div>
      )}

      {/* Data preservation notice */}
      <div style={{ border: '1px solid var(--color-border)', background: '#fefce8', padding: '14px 18px', fontSize: 12, color: '#713f12', marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-shield-halved" />
          升级安全保证
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>数据库 (<code>pgdata/</code>) — 永不触碰</li>
          <li>配置文件 (<code>.env</code>) — 保持不变</li>
          <li>上传文件和用户自定义主题 (<code>uploads/</code>) — 完整保留</li>
          <li>系统内置主题和代码 — 自动更新到最新版</li>
        </ul>
      </div>

      {/* ================= Release history / changelog ================= */}
      <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fa-solid fa-clock-rotate-left" style={{ color: 'var(--color-primary)' }} />
            更新历史
            {releases && <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 400 }}>最近 {releases.length} 个发布</span>}
          </h3>
          <button
            type="button"
            className="btn"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => loadReleases(true)}
          >
            <i className="fa-solid fa-arrows-rotate" style={{ marginRight: 4 }} />
            刷新
          </button>
        </div>

        {releasesErr && (
          <div style={{ padding: '10px 20px', background: '#fef2f2', borderBottom: '1px solid #fca5a5', color: '#991b1b', fontSize: 12 }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 6 }} />
            {releasesErr}
            {' · '}
            <a href="https://github.com/utterlog/utterlog/releases" target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'underline' }}>
              在 GitHub 查看
            </a>
          </div>
        )}

        {releases === null ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-dim)' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />
            加载更新历史...
          </div>
        ) : releases.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-dim)' }}>
            还没有发布的 tag 版本。开发阶段的改动请看{' '}
            <a
              href="https://github.com/utterlog/utterlog/commits/main"
              target="_blank" rel="noopener"
              style={{ color: 'var(--color-primary)' }}
            >
              GitHub 提交历史 <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: 10 }} />
            </a>
          </div>
        ) : (
          <div>
            {releases.map((rel) => {
              const isOpen = expanded.has(rel.id);
              const isCurrent = info?.current.version === rel.tag_name;
              return (
                <div key={rel.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(rel.id)}
                    style={{
                      width: '100%', padding: '14px 20px',
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', color: 'var(--color-text)',
                    }}
                  >
                    <i className={`fa-solid fa-chevron-${isOpen ? 'down' : 'right'}`} style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 10 }} />
                    <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13, fontWeight: 600, color: 'var(--color-primary)' }}>
                      {rel.tag_name}
                    </span>
                    {isCurrent && (
                      <span style={{ fontSize: 10, padding: '1px 6px', background: '#16a34a', color: '#fff', fontWeight: 700 }}>
                        CURRENT
                      </span>
                    )}
                    {rel.prerelease && (
                      <span style={{ fontSize: 10, padding: '1px 6px', background: '#f59e0b', color: '#fff', fontWeight: 700 }}>
                        PRE-RELEASE
                      </span>
                    )}
                    {rel.name && rel.name !== rel.tag_name && (
                      <span style={{ fontSize: 13, color: 'var(--color-text-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rel.name}
                      </span>
                    )}
                    {!rel.name || rel.name === rel.tag_name ? <span style={{ flex: 1 }} /> : null}
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'ui-monospace,monospace', whiteSpace: 'nowrap' }}>
                      {fmtDate(rel.published_at)}
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '2px 20px 18px 42px', borderTop: '1px dashed var(--color-border)' }}>
                      <div
                        style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-text)' }}
                        dangerouslySetInnerHTML={{ __html: renderChangelog(rel.body) || '<p style="color:var(--color-text-muted);font-size:12px">（无更新说明）</p>' }}
                      />
                      <a
                        href={rel.html_url}
                        target="_blank" rel="noopener"
                        style={{ display: 'inline-block', marginTop: 10, fontSize: 11, color: 'var(--color-text-dim)' }}
                      >
                        在 GitHub 查看完整发布 <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: 9, marginLeft: 2 }} />
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
