import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Modal } from '@/components/ui/modal';

interface SyncSite {
  site_uuid: string;
  label: string;
  source_url: string;
  disabled: boolean;
  last_seen_at: number;
  created_at: number;
  recent_jobs: number;
}

interface SyncJob {
  job_id: string;
  site_uuid: string;
  status: string;
  stage: string;
  media_total: number;
  media_done: number;
  posts_rewritten: number;
  started_at: number;
  finished_at: number | null;
}

interface CreatedToken {
  site_uuid: string;
  token: string;
  label: string;
}

function fmtTime(ts: number) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return d.toLocaleString('zh-CN');
}

function stageLabel(stage: string) {
  const map: Record<string, string> = {
    import: '导入数据中',
    media_scan: '扫描媒体文件',
    media_pull: '下载媒体',
    rewrite: '改写文章链接',
    geoip: '填充 IP 地理',
    done: '完成',
  };
  return map[stage] || stage;
}

export default function SyncSitesPanel() {
  const [sites, setSites] = useState<SyncSite[]>([]);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ label: '', source_url: '' });
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [copiedField, setCopiedField] = useState('');

  async function loadSites() {
    try {
      const r = await api.get<any>('/admin/sync/wordpress/sites');
      setSites(r.data?.sites || []);
    } catch (e: any) {
      toast.error('加载站点失败: ' + (e?.message || 'unknown'));
    }
  }

  async function loadJobs() {
    try {
      const r = await api.get<any>('/admin/sync/wordpress/jobs?limit=10');
      setJobs(r.data?.jobs || []);
    } catch (e: any) {
      // quietly ignore — jobs empty initially
    }
  }

  async function refreshAll() {
    setLoading(true);
    await Promise.all([loadSites(), loadJobs()]);
    setLoading(false);
  }

  useEffect(() => {
    refreshAll();
  }, []);

  async function submitCreate() {
    if (!createForm.label.trim()) {
      toast.error('请填写站点名称');
      return;
    }
    try {
      const r = await api.post<any>('/admin/sync/wordpress/sites', createForm);
      setCreated(r.data);
      setCreateOpen(false);
      setCreateForm({ label: '', source_url: '' });
      await loadSites();
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || e?.message;
      toast.error('创建失败: ' + msg);
    }
  }

  async function deleteSite(site: SyncSite) {
    if (!confirm(`确定删除站点「${site.label || site.site_uuid}」?\n\n只删除授权，不影响已导入的内容。\n要删除内容请另外用 rollback 接口。`)) return;
    try {
      await api.delete(`/admin/sync/wordpress/sites/${encodeURIComponent(site.site_uuid)}`);
      toast.success('已删除');
      await loadSites();
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || e?.message;
      toast.error('删除失败: ' + msg);
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(key);
      setTimeout(() => setCopiedField(''), 1800);
    } catch {
      toast.error('复制失败，请手动选择');
    }
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className="fa-brands fa-wordpress" style={{ color: 'var(--color-primary)' }} />
        WordPress 同步
      </div>
      <p style={{ fontSize: 13, color: 'var(--color-text-dim)', lineHeight: 1.7, marginBottom: 20 }}>
        授权一个 WordPress 站点推送内容到 Utterlog。每个站点生成独立的 Site UUID + Token，
        装 <code>utterlog-sync</code> 插件后填入对应字段即可。Token <b>只显示一次</b>。
      </p>

      {/* Sites list */}
      <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', marginBottom: 20 }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            已授权站点 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, marginLeft: 6 }}>({sites.length})</span>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            style={{
              height: 32, padding: '0 14px', fontSize: 13, fontWeight: 500,
              background: 'var(--color-primary)', color: '#fff', border: 'none',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit',
            }}
          >
            <i className="fa-solid fa-plus" /> 新建授权
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 13 }}>
            <i className="fa-solid fa-spinner fa-spin" /> 加载中...
          </div>
        ) : sites.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 13 }}>
            <div style={{ fontSize: 32, color: 'var(--color-text-muted)', marginBottom: 10 }}>
              <i className="fa-brands fa-wordpress" />
            </div>
            还没有授权任何 WordPress 站点。
            <br />
            点上方「新建授权」生成第一个。
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-soft, #fafafa)', color: 'var(--color-text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500 }}>站点名称</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500 }}>Site UUID</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500 }}>源站地址</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500 }}>最后使用</th>
                <th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 500, width: 80 }}>任务</th>
                <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500 }}></th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s, idx) => {
                const uuid = s.site_uuid || '';
                return (
                <tr key={uuid || 'row-' + idx} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{s.label || '(未命名)'}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace,monospace', fontSize: 11 }}>
                    {uuid ? uuid.slice(0, 16) + '…' : <span style={{ color: 'var(--color-text-muted)' }}>(无 UUID)</span>}
                    {uuid && (
                      <button
                        type="button"
                        onClick={() => copy(uuid, 's-' + uuid)}
                        title="复制完整 UUID"
                        style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                      >
                        <i className={`fa-solid ${copiedField === 's-' + uuid ? 'fa-check' : 'fa-copy'}`} style={{ fontSize: 11 }} />
                      </button>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--color-text-dim)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.source_url || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--color-text-dim)', fontSize: 11 }}>
                    {s.last_seen_at ? fmtTime(s.last_seen_at) : <span style={{ color: 'var(--color-text-muted)' }}>从未</span>}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>{s.recent_jobs || 0}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => deleteSite(s)}
                      style={{ background: 'none', border: '1px solid var(--color-border)', padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--color-danger, #dc2626)', fontFamily: 'inherit' }}
                    >
                      <i className="fa-solid fa-trash" /> 删除
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Job history */}
      {jobs.length > 0 && (
        <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', fontSize: 13, fontWeight: 600 }}>
            <i className="fa-solid fa-clock-rotate-left" style={{ marginRight: 6, color: 'var(--color-primary)' }} />
            最近同步任务
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-soft, #fafafa)', color: 'var(--color-text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500 }}>Job ID</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500 }}>状态</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500 }}>阶段</th>
                <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500 }}>媒体</th>
                <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500 }}>改写</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500 }}>开始时间</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j, idx) => {
                const jid = j.job_id || '';
                return (
                <tr key={jid || 'job-' + idx} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '8px 14px', fontFamily: 'ui-monospace,monospace', fontSize: 10 }}>
                    {jid ? jid.slice(0, 16) + '…' : '—'}
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <span style={{
                      display: 'inline-block', padding: '1px 6px', fontSize: 10, fontWeight: 600,
                      background: j.status === 'finished' ? '#16a34a' : j.status === 'failed' ? '#dc2626' : '#0052D9',
                      color: '#fff',
                    }}>
                      {j.status}
                    </span>
                  </td>
                  <td style={{ padding: '8px 14px', color: 'var(--color-text-dim)' }}>{stageLabel(j.stage)}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'ui-monospace,monospace' }}>
                    {j.media_done}/{j.media_total}
                  </td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'ui-monospace,monospace' }}>{j.posts_rewritten}</td>
                  <td style={{ padding: '8px 14px', color: 'var(--color-text-dim)', fontSize: 11 }}>{fmtTime(j.started_at)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '8px 14px', textAlign: 'right', background: 'var(--color-bg-soft, #fafafa)' }}>
            <button type="button" onClick={refreshAll} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              <i className="fa-solid fa-arrows-rotate" style={{ marginRight: 4 }} /> 刷新
            </button>
          </div>
        </div>
      )}

      {/* Create site modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="新建 WordPress 同步授权" size="sm">
        <div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 6 }}>站点名称（自己记）</div>
            <input
              type="text"
              value={createForm.label}
              onChange={(e) => setCreateForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="例如：我的旧博客"
              style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--color-border)', fontFamily: 'inherit', fontSize: 13 }}
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 6 }}>源站地址（旧 WordPress 博客 URL）</div>
            <input
              type="text"
              value={createForm.source_url}
              onChange={(e) => setCreateForm((f) => ({ ...f, source_url: e.target.value }))}
              placeholder="https://your-old-wp-site.com"
              style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--color-border)', fontFamily: 'inherit', fontSize: 13 }}
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
              server 扫文章内容里的图片 URL 时会匹配这个域名下的 <code>/wp-content/uploads/</code> 路径。
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setCreateOpen(false)} style={{ height: 38, padding: '0 18px', background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              取消
            </button>
            <button type="button" onClick={submitCreate} style={{ height: 38, padding: '0 18px', background: 'var(--color-primary)', color: '#fff', border: '1px solid var(--color-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              <i className="fa-solid fa-key" style={{ marginRight: 6 }} /> 生成 UUID + Token
            </button>
          </div>
        </div>
      </Modal>

      {/* Created token — shown ONCE */}
      {created && (
        <Modal isOpen={!!created} onClose={() => setCreated(null)} title="授权已生成 · 请立即保存" size="md">
          <div>
            <div style={{ padding: '10px 14px', background: '#fefce8', border: '1px solid #fde68a', fontSize: 12, color: '#713f12', marginBottom: 18, lineHeight: 1.6 }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 6 }} />
              <b>Token 只显示这一次</b>。关闭后无法再次查看，丢失需要重新生成。
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 6 }}>站点名称</div>
              <div style={{ padding: '8px 12px', background: 'var(--color-bg-soft, #fafafa)', border: '1px solid var(--color-border)', fontFamily: 'inherit', fontSize: 13 }}>
                {created.label || '(未命名)'}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>Site UUID</span>
                <button type="button" onClick={() => copy(created.site_uuid, 'uuid')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontSize: 11, fontFamily: 'inherit' }}>
                  <i className={`fa-solid ${copiedField === 'uuid' ? 'fa-check' : 'fa-copy'}`} style={{ marginRight: 3 }} />
                  {copiedField === 'uuid' ? '已复制' : '复制'}
                </button>
              </div>
              <div style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid var(--color-border)', fontFamily: 'ui-monospace,monospace', fontSize: 12, wordBreak: 'break-all' }}>
                {created.site_uuid}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>Sync Token</span>
                <button type="button" onClick={() => copy(created.token, 'tok')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontSize: 11, fontFamily: 'inherit' }}>
                  <i className={`fa-solid ${copiedField === 'tok' ? 'fa-check' : 'fa-copy'}`} style={{ marginRight: 3 }} />
                  {copiedField === 'tok' ? '已复制' : '复制'}
                </button>
              </div>
              <div style={{ padding: '8px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', fontFamily: 'ui-monospace,monospace', fontSize: 12, wordBreak: 'break-all', color: '#0c4a6e' }}>
                {created.token}
              </div>
            </div>

            <div style={{ padding: '10px 14px', background: '#f0fdf4', borderLeft: '3px solid #16a34a', fontSize: 12, color: '#166534', marginBottom: 16, lineHeight: 1.6 }}>
              <b>下一步</b>：在你的 WordPress 后台装 <code>utterlog-sync</code> 插件，设置页填：
              <br />
              URL: <code>{window.location.origin}</code>
              <br />
              Site UUID: <code>{created.site_uuid}</code>
              <br />
              Sync Token: <code>{created.token.slice(0, 8)}…{created.token.slice(-4)}</code>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  copy(
                    `Utterlog URL: ${window.location.origin}\nSite UUID: ${created.site_uuid}\nSync Token: ${created.token}`,
                    'all'
                  );
                }}
                style={{ height: 38, padding: '0 18px', background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <i className={`fa-solid ${copiedField === 'all' ? 'fa-check' : 'fa-copy'}`} style={{ marginRight: 6 }} />
                {copiedField === 'all' ? '已复制全部' : '复制三行配置'}
              </button>
              <button type="button" onClick={() => setCreated(null)} style={{ height: 38, padding: '0 18px', background: 'var(--color-primary)', color: '#fff', border: '1px solid var(--color-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                我已保存，关闭
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
