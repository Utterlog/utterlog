'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

const periods = [
  { key: '24h', label: '24小时' },
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' },
  { key: 'all', label: '全部' },
];

function BarChart({ data, labelKey, valueKey, color = 'var(--color-primary)' }: { data: any[]; labelKey: string; valueKey: string; color?: string }) {
  if (!data?.length) return <p className="text-dim" style={{ fontSize: '12px', padding: '16px', textAlign: 'center' }}>暂无数据</p>;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {data.slice(0, 8).map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
          <span className="text-dim" style={{ width: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{d[labelKey] || '-'}</span>
          <div style={{ flex: 1, height: '16px', background: 'var(--color-bg-soft)', borderRadius: '0', overflow: 'hidden' }}>
            <div style={{ width: `${(d[valueKey] / max) * 100}%`, height: '100%', background: color, borderRadius: '0', transition: 'width 0.5s' }} />
          </div>
          <span style={{ fontSize: '10px', fontWeight: 600, width: '30px', textAlign: 'right' }}>{d[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

function CountryRow({ data }: { data: any[] }) {
  if (!data?.length) return <p className="text-dim" style={{ fontSize: '12px', textAlign: 'center', padding: '16px' }}>暂无数据</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {data.slice(0, 10).map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 0' }}>
          {d.code && <img src={`https://flagcdn.io/${d.code.toLowerCase()}.svg`} alt="" style={{ width: '16px', height: '12px' }} />}
          <span style={{ flex: 1 }}>{d.country || d.code || '-'}</span>
          <span className="text-dim">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('24h');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/analytics?period=${period}`).then((r: any) => {
      setData(r.data || r);
    }).finally(() => setLoading(false));
  }, [period]);

  if (loading) return <div className="text-dim" style={{ padding: '48px', textAlign: 'center' }}>加载中...</div>;

  const s = data?.summary || {};

  return (
    <div>
      {/* Period selector */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {periods.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)} className={`btn ${period === p.key ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: '13px', padding: '6px 14px' }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: '访问次数', value: s.total_visits || 0, color: 'var(--color-primary)' },
          { label: '独立访客', value: s.unique_ips || 0, color: '#16a34a' },
          { label: '访问页面', value: s.unique_pages || 0, color: '#f59e0b' },
        ].map((card, i) => (
          <div key={i} className="card" style={{ padding: '20px' }}>
            <p className="text-dim" style={{ fontSize: '12px' }}>{card.label}</p>
            <p style={{ fontSize: '28px', fontWeight: 700, color: card.color, marginTop: '4px' }}>{card.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>热门页面</h3>
          <BarChart data={data?.top_pages || []} labelKey="path" valueKey="count" />
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>来源</h3>
          <BarChart data={data?.top_referers || []} labelKey="host" valueKey="count" color="#8b5cf6" />
        </div>
      </div>

      {/* Browser / OS / Device / Country */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>浏览器</h3>
          <BarChart data={data?.browsers || []} labelKey="name" valueKey="count" color="#2563eb" />
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>操作系统</h3>
          <BarChart data={data?.os || []} labelKey="name" valueKey="count" color="#16a34a" />
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>设备</h3>
          <BarChart data={data?.devices || []} labelKey="type" valueKey="count" color="#f59e0b" />
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>国家/地区</h3>
          <CountryRow data={data?.countries || []} />
        </div>
      </div>

      {/* Recent visitors */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600 }}>最近访客</h3>
        </div>
        <table className="table" style={{ width: '100%', fontSize: '12px' }}>
          <thead>
            <tr>
              <th style={{ padding: '8px 12px' }}>IP</th>
              <th>页面</th>
              <th>浏览器</th>
              <th>系统</th>
              <th>设备</th>
              <th>地区</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {(data?.recent || []).map((v: any, i: number) => (
              <tr key={i}>
                <td style={{ padding: '6px 12px' }} className="text-dim">{v.ip}</td>
                <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.path}</td>
                <td className="text-dim">{v.browser}</td>
                <td className="text-dim">{v.os}</td>
                <td className="text-dim">{v.device}</td>
                <td>
                  {v.country && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <img src={`https://flagcdn.io/${(v.country_code || '').toLowerCase()}.svg`} alt="" style={{ width: '14px', height: '10px' }} />
                      {v.country}
                    </span>
                  )}
                </td>
                <td className="text-dim">{v.created_at ? new Date(v.created_at * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
