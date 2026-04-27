
import { useEffect, useState } from 'react';
import api, { optionsApi } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import toast from 'react-hot-toast';
import { useI18n } from '@/lib/i18n';

const tabs = [
  { id: '概览',     label: '概览',     key: 'admin.security.tabs.overview', icon: 'fa-regular fa-chart-pie' },
  { id: '封禁管理', label: '封禁管理', key: 'admin.security.tabs.bans', icon: 'fa-regular fa-ban' },
  { id: 'IP 信誉',  label: 'IP 信誉',  key: 'admin.security.tabs.reputation', icon: 'fa-regular fa-shield-halved' },
  { id: '安全事件', label: '安全事件', key: 'admin.security.tabs.events', icon: 'fa-regular fa-clock-rotate-left' },
  { id: '防御设置', label: '防御设置', key: 'admin.security.tabs.settings', icon: 'fa-regular fa-sliders' },
];

// Match Settings page styling
const cardStyle = { padding: '28px', marginBottom: '20px' } as const;
const sectionTitleStyle = { fontSize: '15px', fontWeight: 600, marginBottom: '24px' } as const;
const subTitleRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as const;

export default function SecurityPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('概览');
  const [overview, setOverview] = useState<any>(null);
  const [bans, setBans] = useState<any[]>([]);
  const [reputation, setReputation] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  // Access control (merged from old /settings?tab=security)
  const [accessOpts, setAccessOpts] = useState<{ require_login: boolean; rate_limit: number }>({
    require_login: false, rate_limit: 60,
  });
  const [banIP, setBanIP] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('60');
  const [saving, setSaving] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);

  useEffect(() => {
    if (activeTab === '概览') api.get('/security/overview').then((r: any) => setOverview(r.data || r)).catch(() => {});
    if (activeTab === '封禁管理') api.get('/security/bans').then((r: any) => setBans(r.data || [])).catch(() => {});
    if (activeTab === 'IP 信誉') api.get('/security/reputation').then((r: any) => setReputation(r.data || [])).catch(() => {});
    if (activeTab === '安全事件') api.get('/security/timeline').then((r: any) => setTimeline(r.data || [])).catch(() => {});
    if (activeTab === '防御设置') {
      api.get('/security/settings').then((r: any) => setSettings(r.data || r)).catch(() => {});
      // Also load access-control options
      optionsApi.list().then((r: any) => {
        const opts = r.data || r || {};
        setAccessOpts({
          require_login: opts.require_login === true || opts.require_login === 'true',
          rate_limit: Number(opts.rate_limit) || 60,
        });
      }).catch(() => {});
    }
  }, [activeTab]);

  const saveAccessOpts = async () => {
    setSavingAccess(true);
    try {
      await api.put('/options', {
        require_login: accessOpts.require_login,
        rate_limit: accessOpts.rate_limit,
      });
      toast.success(t('admin.security.toast.accessSaved', '访问控制已保存'));
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || t('admin.settings.toast.saveFailed', '保存失败'));
    } finally {
      setSavingAccess(false);
    }
  };

  const handleBan = async () => {
    if (!banIP) return;
    try {
      await api.post('/security/ban', { ip: banIP, reason: banReason, duration: parseInt(banDuration) });
      toast.success(t('admin.security.toast.banned', '已封禁')); setBanIP(''); setBanReason('');
      api.get('/security/bans').then((r: any) => setBans(r.data || []));
    } catch { toast.error(t('admin.security.toast.banFailed', '封禁失败')); }
  };

  const handleUnban = async (ip: string) => {
    try { await api.post('/security/unban', { ip }); toast.success(t('admin.security.toast.unbanned', '已解封')); setBans(bans.filter(b => b.ip !== ip)); } catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
  };

  const handleResetRep = async (ip: string) => {
    try { await api.post('/security/reputation/reset', { ip }); toast.success(t('admin.security.toast.reset', '已重置')); } catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try { await api.post('/security/settings', settings); toast.success(t('admin.settings.toast.saved', '设置已保存')); } catch { toast.error(t('admin.settings.toast.saveFailed', '保存失败')); }
    setSaving(false);
  };

  const fmtTime = (ts: any) => {
    if (!ts) return '-';
    const n = typeof ts === 'number' ? ts : parseInt(ts);
    return new Date(n * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--color-border)', marginBottom: '28px' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 18px', fontSize: '13px', fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text-sub)',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              background: 'none', cursor: 'pointer', transition: 'all 0.15s',
              whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}
          >
            <i className={tab.icon} style={{ fontSize: '13px' }} />
            {t(tab.key, tab.label)}
          </button>
        ))}
      </div>

      {/* 概览 */}
      {activeTab === '概览' && overview && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: t('admin.security.overview.activeBans', '活跃封禁'), value: overview.active_bans, color: '#dc2626' },
              { label: t('admin.security.overview.events24h', '24h 安全事件'), value: overview.events_24h, color: '#f59e0b' },
              { label: t('admin.security.overview.riskyIps', '高风险 IP'), value: overview.risky_ips, color: '#8b5cf6' },
            ].map((s, i) => (
              <div key={i} className="card" style={{ padding: '20px' }}>
                <p className="text-dim" style={{ fontSize: '12px' }}>{s.label}</p>
                <p style={{ fontSize: '28px', fontWeight: 700, color: s.color, marginTop: '4px' }}>{s.value}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>{t('admin.security.overview.defenseStatus', '防御状态')}</h3>
              <div style={{ fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span>{t('admin.security.settings.ccDefense', 'CC 防御')}</span>
                  <span style={{ color: overview.cc_enabled ? '#16a34a' : '#dc2626' }}>{overview.cc_enabled ? t('admin.common.onDot', '● 开启') : t('admin.common.offDot', '● 关闭')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span>{t('admin.security.settings.geoBlock', 'GeoIP 封锁')}</span>
                  <span style={{ color: overview.geo_enabled ? '#16a34a' : '#dc2626' }}>{overview.geo_enabled ? t('admin.common.onDot', '● 开启') : t('admin.common.offDot', '● 关闭')}</span>
                </div>
              </div>
            </div>
            <div className="card" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>{t('admin.security.overview.stats', '统计')}</h3>
              <div style={{ fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span>{t('admin.security.overview.totalBans', '累计封禁')}</span><span>{overview.total_bans}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span>{t('admin.security.overview.trackedIps', '追踪 IP')}</span><span>{overview.tracked_ips}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span>{t('admin.security.overview.totalEvents', '安全事件')}</span><span>{overview.total_events}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 封禁管理 */}
      {activeTab === '封禁管理' && (
        <div>
          <div className="card" style={{ padding: '16px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><label className="text-xs text-sub block mb-1">{t('admin.security.bans.ipAddress', 'IP 地址')}</label><Input value={banIP} onChange={e => setBanIP(e.target.value)} placeholder="192.168.1.1" /></div>
            <div style={{ flex: 1 }}><label className="text-xs text-sub block mb-1">{t('admin.security.bans.reason', '原因')}</label><Input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder={t('admin.common.optional', '可选')} /></div>
            <div style={{ width: '100px' }}><label className="text-xs text-sub block mb-1">{t('admin.security.bans.durationMinutes', '时长(分)')}</label><Input value={banDuration} onChange={e => setBanDuration(e.target.value)} placeholder="60" /></div>
            <Button onClick={handleBan}>{t('admin.security.bans.ban', '封禁')}</Button>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="table" style={{ width: '100%', fontSize: '12px' }}>
              <thead><tr><th style={{ padding: '8px 12px' }}>IP</th><th>{t('admin.security.bans.reason', '原因')}</th><th>{t('admin.security.bans.type', '类型')}</th><th>{t('admin.security.bans.duration', '时长')}</th><th>{t('admin.security.bans.expires', '过期')}</th><th>{t('admin.common.actions', '操作')}</th></tr></thead>
              <tbody>
                {bans.map((b: any, i: number) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 12px', fontWeight: 500 }}>{typeof b.ip === 'string' ? b.ip : ''}</td>
                    <td className="text-dim">{typeof b.reason === 'string' ? b.reason : ''}</td>
                    <td><span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '2px', background: b.ban_type === 'auto' ? '#fef3c7' : '#fee2e2', color: b.ban_type === 'auto' ? '#92400e' : '#991b1b' }}>{b.ban_type === 'auto' ? t('admin.security.bans.auto', '自动') : t('admin.security.bans.manual', '手动')}</span></td>
                    <td className="text-dim">{b.duration ? t('admin.security.bans.minutes', '{count}分', { count: b.duration }) : t('admin.security.bans.permanent', '永久')}</td>
                    <td className="text-dim">{b.expires_at ? fmtTime(b.expires_at) : t('admin.security.bans.permanent', '永久')}</td>
                    <td><button onClick={() => handleUnban(b.ip)} className="text-primary-themed" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>{t('admin.security.bans.unban', '解封')}</button></td>
                  </tr>
                ))}
                {bans.length === 0 && <tr><td colSpan={6} className="text-dim" style={{ textAlign: 'center', padding: '24px' }}>{t('admin.security.bans.empty', '暂无封禁')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* IP 信誉 */}
      {activeTab === 'IP 信誉' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table" style={{ width: '100%', fontSize: '12px' }}>
            <thead><tr><th style={{ padding: '8px 12px' }}>IP</th><th>{t('admin.security.reputation.score', '评分')}</th><th>{t('admin.security.reputation.risk', '风险')}</th><th>{t('admin.security.reputation.requests', '请求数')}</th><th>{t('admin.security.reputation.lastSeen', '最后活跃')}</th><th>{t('admin.common.actions', '操作')}</th></tr></thead>
            <tbody>
              {reputation.map((r: any, i: number) => (
                <tr key={i}>
                  <td style={{ padding: '6px 12px', fontWeight: 500 }}>{typeof r.ip === 'string' ? r.ip : ''}</td>
                  <td style={{ fontWeight: 600, color: (r.score || 0) >= 35 ? '#dc2626' : (r.score || 0) >= 14 ? '#f59e0b' : '#16a34a' }}>{r.score || 0}</td>
                  <td><span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '2px',
                    background: r.risk_level === 'danger' ? '#fee2e2' : r.risk_level === 'warning' ? '#fef3c7' : '#dcfce7',
                    color: r.risk_level === 'danger' ? '#991b1b' : r.risk_level === 'warning' ? '#92400e' : '#166534',
                  }}>{r.risk_level === 'danger' ? t('admin.security.reputation.danger', '危险') : r.risk_level === 'warning' ? t('admin.security.reputation.warning', '警告') : t('admin.security.reputation.safe', '安全')}</span></td>
                  <td className="text-dim">{r.request_count || 0}</td>
                  <td className="text-dim">{fmtTime(r.last_seen)}</td>
                  <td><button onClick={() => handleResetRep(r.ip)} className="text-dim" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px' }}>{t('admin.common.reset', '重置')}</button></td>
                </tr>
              ))}
              {reputation.length === 0 && <tr><td colSpan={6} className="text-dim" style={{ textAlign: 'center', padding: '24px' }}>{t('admin.common.noData', '暂无数据')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* 安全事件 */}
      {activeTab === '安全事件' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table" style={{ width: '100%', fontSize: '12px' }}>
            <thead><tr><th style={{ padding: '8px 12px' }}>{t('admin.common.time', '时间')}</th><th>IP</th><th>{t('admin.security.events.event', '事件')}</th><th>{t('admin.security.events.detail', '详情')}</th><th>{t('admin.security.reputation.score', '评分')}</th></tr></thead>
            <tbody>
              {timeline.map((e: any, i: number) => (
                <tr key={i}>
                  <td style={{ padding: '6px 12px' }} className="text-dim">{fmtTime(e.created_at)}</td>
                  <td style={{ fontWeight: 500 }}>{typeof e.ip === 'string' ? e.ip : ''}</td>
                  <td><span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '2px', background: 'var(--color-bg-soft)' }}>{typeof e.event_type === 'string' ? e.event_type : ''}</span></td>
                  <td className="text-dim" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeof e.detail === 'string' ? e.detail : ''}</td>
                  <td style={{ color: (e.score_delta || 0) > 0 ? '#dc2626' : 'var(--color-text-dim)' }}>{e.score_delta > 0 ? '+' + e.score_delta : e.score_delta || 0}</td>
                </tr>
              ))}
              {timeline.length === 0 && <tr><td colSpan={5} className="text-dim" style={{ textAlign: 'center', padding: '24px' }}>{t('admin.security.events.empty', '暂无事件')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* 防御设置 */}
      {activeTab === '防御设置' && (
        <div>
          {/* 访问控制（来自原「系统设置 → 安全设置」）*/}
          <div className="card" style={cardStyle}>
            <div style={{ ...subTitleRow, marginBottom: '20px' }}>
              <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>{t('admin.security.access.section', '访问控制')}</h3>
              <Button onClick={saveAccessOpts} loading={savingAccess} size="sm">{t('admin.common.save', '保存')}</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={accessOpts.require_login}
                  onChange={(e) => setAccessOpts({ ...accessOpts, require_login: e.target.checked })}
                />
                {t('admin.security.access.requireLogin', '需要登录才能访问前台')}
              </label>
              <div>
                <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                  {t('admin.security.access.apiRateLimit', 'API 限流')} <span className="text-dim" style={{ fontWeight: 400 }}>{t('admin.security.access.apiRateLimitHint', '（次/分钟，超出返回 429）')}</span>
                </label>
                <input
                  className="input text-sm"
                  type="number"
                  value={accessOpts.rate_limit}
                  onChange={(e) => setAccessOpts({ ...accessOpts, rate_limit: parseInt(e.target.value) || 60 })}
                  style={{ maxWidth: 200 }}
                />
              </div>
            </div>
          </div>

          <div className="card" style={cardStyle}>
            <h3 style={sectionTitleStyle}>{t('admin.security.settings.ccTitle', 'CC 防御（频率限制）')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.cc_enabled ?? false} onChange={(e) => setSettings({ ...settings, cc_enabled: e.target.checked })} />
                {t('admin.security.settings.enableCc', '启用 CC 防御')}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.security.settings.ccLimit5s', '5 秒内最大请求')}</label>
                  <input className="input text-sm" type="number" value={settings.cc_limit_5s || 30} onChange={(e) => setSettings({ ...settings, cc_limit_5s: parseInt(e.target.value) })} />
                </div>
                <div>
                  <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.security.settings.ccLimit60s', '60 秒内最大请求')}</label>
                  <input className="input text-sm" type="number" value={settings.cc_limit_60s || 120} onChange={(e) => setSettings({ ...settings, cc_limit_60s: parseInt(e.target.value) })} />
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={cardStyle}>
            <h3 style={sectionTitleStyle}>{t('admin.security.settings.geoTitle', 'GeoIP 地域封锁')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.geo_enabled ?? false} onChange={(e) => setSettings({ ...settings, geo_enabled: e.target.checked })} />
                {t('admin.security.settings.enableGeo', '启用地域封锁')}
              </label>
              <div>
                <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.security.settings.geoMode', '模式')}</label>
                <select className="input text-sm" value={settings.geo_mode || 'whitelist'} onChange={(e) => setSettings({ ...settings, geo_mode: e.target.value })}>
                  <option value="whitelist">{t('admin.security.settings.geoWhitelist', '白名单（只允许列表中的国家）')}</option>
                  <option value="blacklist">{t('admin.security.settings.geoBlacklist', '黑名单（封锁列表中的国家）')}</option>
                </select>
              </div>
              <div>
                <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                  {t('admin.security.settings.countryCodes', '国家代码')} <span className="text-dim" style={{ fontWeight: 400 }}>{t('admin.security.settings.countryCodesHint', '（逗号分隔，如 CN,HK,TW）')}</span>
                </label>
                <input className="input text-sm" value={(settings.geo_countries || []).join(',')} onChange={(e) => setSettings({ ...settings, geo_countries: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} />
              </div>
            </div>
          </div>

          <div style={{ paddingTop: '24px', borderTop: '1px solid var(--color-border)', marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={saveSettings} loading={saving}>
              {t('admin.security.settings.saveCcGeo', '保存 CC / GeoIP 设置')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
