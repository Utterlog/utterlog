'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button, Input } from '@/components/ui';
import toast from 'react-hot-toast';
import { Shield, Trash2 } from '@/components/icons';

const tabs = ['概览', '封禁管理', 'IP 信誉', '安全事件', '防御设置'];

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState('概览');
  const [overview, setOverview] = useState<any>(null);
  const [bans, setBans] = useState<any[]>([]);
  const [reputation, setReputation] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [banIP, setBanIP] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('60');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeTab === '概览') api.get('/security/overview').then((r: any) => setOverview(r.data || r)).catch(() => {});
    if (activeTab === '封禁管理') api.get('/security/bans').then((r: any) => setBans(r.data || [])).catch(() => {});
    if (activeTab === 'IP 信誉') api.get('/security/reputation').then((r: any) => setReputation(r.data || [])).catch(() => {});
    if (activeTab === '安全事件') api.get('/security/timeline').then((r: any) => setTimeline(r.data || [])).catch(() => {});
    if (activeTab === '防御设置') api.get('/security/settings').then((r: any) => setSettings(r.data || r)).catch(() => {});
  }, [activeTab]);

  const handleBan = async () => {
    if (!banIP) return;
    try {
      await api.post('/security/ban', { ip: banIP, reason: banReason, duration: parseInt(banDuration) });
      toast.success('已封禁'); setBanIP(''); setBanReason('');
      api.get('/security/bans').then((r: any) => setBans(r.data || []));
    } catch { toast.error('封禁失败'); }
  };

  const handleUnban = async (ip: string) => {
    try { await api.post('/security/unban', { ip }); toast.success('已解封'); setBans(bans.filter(b => b.ip !== ip)); } catch { toast.error('操作失败'); }
  };

  const handleResetRep = async (ip: string) => {
    try { await api.post('/security/reputation/reset', { ip }); toast.success('已重置'); } catch { toast.error('操作失败'); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try { await api.post('/security/settings', settings); toast.success('设置已保存'); } catch { toast.error('保存失败'); }
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
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)', marginBottom: '20px' }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '10px 20px', fontSize: '14px', fontWeight: activeTab === tab ? 600 : 400,
            color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-sub)',
            borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'none', cursor: 'pointer',
          }}>{tab}</button>
        ))}
      </div>

      {/* 概览 */}
      {activeTab === '概览' && overview && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: '活跃封禁', value: overview.active_bans, color: '#dc2626' },
              { label: '24h 安全事件', value: overview.events_24h, color: '#f59e0b' },
              { label: '高风险 IP', value: overview.risky_ips, color: '#8b5cf6' },
            ].map((s, i) => (
              <div key={i} className="card" style={{ padding: '20px' }}>
                <p className="text-dim" style={{ fontSize: '12px' }}>{s.label}</p>
                <p style={{ fontSize: '28px', fontWeight: 700, color: s.color, marginTop: '4px' }}>{s.value}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>防御状态</h3>
              <div style={{ fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span>CC 防御</span>
                  <span style={{ color: overview.cc_enabled ? '#16a34a' : '#dc2626' }}>{overview.cc_enabled ? '● 开启' : '● 关闭'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span>GeoIP 封锁</span>
                  <span style={{ color: overview.geo_enabled ? '#16a34a' : '#dc2626' }}>{overview.geo_enabled ? '● 开启' : '● 关闭'}</span>
                </div>
              </div>
            </div>
            <div className="card" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>统计</h3>
              <div style={{ fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span>累计封禁</span><span>{overview.total_bans}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span>追踪 IP</span><span>{overview.tracked_ips}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span>安全事件</span><span>{overview.total_events}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 封禁管理 */}
      {activeTab === '封禁管理' && (
        <div>
          <div className="card" style={{ padding: '16px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><label className="text-xs text-sub block mb-1">IP 地址</label><Input value={banIP} onChange={e => setBanIP(e.target.value)} placeholder="192.168.1.1" /></div>
            <div style={{ flex: 1 }}><label className="text-xs text-sub block mb-1">原因</label><Input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="可选" /></div>
            <div style={{ width: '100px' }}><label className="text-xs text-sub block mb-1">时长(分)</label><Input value={banDuration} onChange={e => setBanDuration(e.target.value)} placeholder="60" /></div>
            <Button onClick={handleBan}>封禁</Button>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="table" style={{ width: '100%', fontSize: '12px' }}>
              <thead><tr><th style={{ padding: '8px 12px' }}>IP</th><th>原因</th><th>类型</th><th>时长</th><th>过期</th><th>操作</th></tr></thead>
              <tbody>
                {bans.map((b: any, i: number) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 12px', fontWeight: 500 }}>{typeof b.ip === 'string' ? b.ip : ''}</td>
                    <td className="text-dim">{typeof b.reason === 'string' ? b.reason : ''}</td>
                    <td><span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '2px', background: b.ban_type === 'auto' ? '#fef3c7' : '#fee2e2', color: b.ban_type === 'auto' ? '#92400e' : '#991b1b' }}>{b.ban_type === 'auto' ? '自动' : '手动'}</span></td>
                    <td className="text-dim">{b.duration ? b.duration + '分' : '永久'}</td>
                    <td className="text-dim">{b.expires_at ? fmtTime(b.expires_at) : '永久'}</td>
                    <td><button onClick={() => handleUnban(b.ip)} className="text-primary-themed" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>解封</button></td>
                  </tr>
                ))}
                {bans.length === 0 && <tr><td colSpan={6} className="text-dim" style={{ textAlign: 'center', padding: '24px' }}>暂无封禁</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* IP 信誉 */}
      {activeTab === 'IP 信誉' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table" style={{ width: '100%', fontSize: '12px' }}>
            <thead><tr><th style={{ padding: '8px 12px' }}>IP</th><th>评分</th><th>风险</th><th>请求数</th><th>最后活跃</th><th>操作</th></tr></thead>
            <tbody>
              {reputation.map((r: any, i: number) => (
                <tr key={i}>
                  <td style={{ padding: '6px 12px', fontWeight: 500 }}>{typeof r.ip === 'string' ? r.ip : ''}</td>
                  <td style={{ fontWeight: 600, color: (r.score || 0) >= 35 ? '#dc2626' : (r.score || 0) >= 14 ? '#f59e0b' : '#16a34a' }}>{r.score || 0}</td>
                  <td><span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '2px',
                    background: r.risk_level === 'danger' ? '#fee2e2' : r.risk_level === 'warning' ? '#fef3c7' : '#dcfce7',
                    color: r.risk_level === 'danger' ? '#991b1b' : r.risk_level === 'warning' ? '#92400e' : '#166534',
                  }}>{r.risk_level === 'danger' ? '危险' : r.risk_level === 'warning' ? '警告' : '安全'}</span></td>
                  <td className="text-dim">{r.request_count || 0}</td>
                  <td className="text-dim">{fmtTime(r.last_seen)}</td>
                  <td><button onClick={() => handleResetRep(r.ip)} className="text-dim" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px' }}>重置</button></td>
                </tr>
              ))}
              {reputation.length === 0 && <tr><td colSpan={6} className="text-dim" style={{ textAlign: 'center', padding: '24px' }}>暂无数据</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* 安全事件 */}
      {activeTab === '安全事件' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table" style={{ width: '100%', fontSize: '12px' }}>
            <thead><tr><th style={{ padding: '8px 12px' }}>时间</th><th>IP</th><th>事件</th><th>详情</th><th>评分</th></tr></thead>
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
              {timeline.length === 0 && <tr><td colSpan={5} className="text-dim" style={{ textAlign: 'center', padding: '24px' }}>暂无事件</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* 防御设置 */}
      {activeTab === '防御设置' && (
        <div>
          <div className="card" style={{ padding: '20px', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>CC 防御 (频率限制)</h3>
            <div className="space-y-3">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.cc_enabled ?? true} onChange={e => setSettings({...settings, cc_enabled: e.target.checked})} />
                启用 CC 防御
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}><label className="text-xs text-sub block mb-1">5秒内最大请求</label>
                  <input className="input text-sm" type="number" value={settings.cc_limit_5s || 30} onChange={e => setSettings({...settings, cc_limit_5s: parseInt(e.target.value)})} />
                </div>
                <div style={{ flex: 1 }}><label className="text-xs text-sub block mb-1">60秒内最大请求</label>
                  <input className="input text-sm" type="number" value={settings.cc_limit_60s || 120} onChange={e => setSettings({...settings, cc_limit_60s: parseInt(e.target.value)})} />
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '20px', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>GeoIP 地域封锁</h3>
            <div className="space-y-3">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.geo_enabled ?? false} onChange={e => setSettings({...settings, geo_enabled: e.target.checked})} />
                启用地域封锁
              </label>
              <div><label className="text-xs text-sub block mb-1">模式</label>
                <select className="input text-sm" value={settings.geo_mode || 'whitelist'} onChange={e => setSettings({...settings, geo_mode: e.target.value})}>
                  <option value="whitelist">白名单（只允许列表中的国家）</option>
                  <option value="blacklist">黑名单（封锁列表中的国家）</option>
                </select>
              </div>
              <div><label className="text-xs text-sub block mb-1">国家代码（逗号分隔，如 CN,HK,TW）</label>
                <input className="input text-sm" value={(settings.geo_countries || []).join(',')} onChange={e => setSettings({...settings, geo_countries: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean)})} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={saveSettings} loading={saving}>保存设置</Button>
          </div>
        </div>
      )}
    </div>
  );
}
