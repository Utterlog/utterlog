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

// Simple markdown-lite renderer for GitHub release body: just linebreaks +
// - bullets. Good enough for our changelog lines, no XSS risk since we
// escape HTML entities first.
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

export default function SystemUpdate() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgradeStatus, setUpgradeStatus] = useState<UpgradeStatus | null>(null);
  const [upgrading, setUpgrading] = useState(false);
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
    } catch (e: any) {
      // API might be restarting — that's expected. Keep polling.
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
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const cur = info?.current.version || '—';
  const lat = info?.latest?.version || '—';
  const updateAvailable = info?.update_available ?? false;

  return (
    <div style={{ maxWidth: 820, padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>版本与更新</h2>
        <p style={{ color: 'var(--color-text-dim)', fontSize: 13, margin: '6px 0 0' }}>
          检测 Utterlog 的最新发布版本，一键升级到最新版。数据、配置、上传文件和用户自定义主题不会被清空。
        </p>
      </div>

      {/* Version card */}
      <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 4 }}>当前版本</div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>{cur}</div>
            {info?.current.built_at && (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                构建于 {info.current.built_at}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 4 }}>最新版本</div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'ui-monospace, monospace', color: updateAvailable ? 'var(--color-primary)' : 'var(--color-text)' }}>
              {lat}
            </div>
            {info?.latest?.published_at && (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                发布于 {new Date(info.latest.published_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
          {updateAvailable ? (
            <button
              className="btn btn-primary btn-lg"
              disabled={upgrading || loading}
              onClick={doUpgrade}
            >
              <i className={`fa-solid ${upgrading ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'}`} style={{ marginRight: 8 }} />
              {upgrading ? '升级中…' : '一键升级到 ' + lat}
            </button>
          ) : (
            <span style={{ padding: '8px 14px', background: 'var(--color-success-soft, #f0fdf4)', color: '#166534', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <i className="fa-solid fa-circle-check" /> 当前已是最新版本
            </span>
          )}
          <button className="btn" onClick={() => load(true)} disabled={loading || upgrading}>
            <i className="fa-solid fa-arrows-rotate" style={{ marginRight: 6 }} />
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
      <div style={{ border: '1px solid var(--color-border)', background: '#fefce8', padding: '14px 18px', fontSize: 12, color: '#713f12' }}>
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
    </div>
  );
}
