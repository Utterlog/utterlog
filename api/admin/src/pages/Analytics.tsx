
import { useEffect, useState, useRef } from 'react';
import api from '@/lib/api';
import { BrowserIcon, OSIcon, DeviceIcon } from '@/lib/tech-icons';
import VisitorMap from '@/components/dashboard/VisitorMap';


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
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
          <span className="text-dim" style={{ width: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{d[labelKey] || '-'}</span>
          <div style={{ width: '50%', height: '16px', background: 'var(--color-bg-soft)', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ width: `${(d[valueKey] / max) * 100}%`, height: '100%', background: color, transition: 'width 0.5s' }} />
          </div>
          <span style={{ width: '10%', fontSize: '10px', fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>{d[valueKey]}</span>
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

function IconStatList({ data, nameKey, valueKey, icon }: { data: any[]; nameKey: string; valueKey: string; icon: (d: any) => React.ReactNode }) {
  if (!data?.length) return <p className="text-dim" style={{ fontSize: '12px', textAlign: 'center', padding: '16px' }}>暂无数据</p>;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {data.slice(0, 8).map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
          {icon(d)}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d[nameKey] || '-'}</span>
          <span className="text-dim" style={{ flexShrink: 0 }}>{d[valueKey]}</span>
          <div style={{ width: '60px', height: '4px', background: 'var(--color-bg-soft)', borderRadius: '2px', flexShrink: 0 }}>
            <div style={{ width: `${(d[valueKey] / max) * 100}%`, height: '100%', background: 'var(--color-primary)', borderRadius: '2px' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('24h');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [onlineOpen, setOnlineOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/analytics?period=${period}`).then((r: any) => {
      setData(r.data || r);
    }).finally(() => setLoading(false));
  }, [period]);

  // Fetch online users + poll every 30s
  useEffect(() => {
    const fetch = () => api.get('/analytics/online').then((r: any) => setOnlineUsers(r.data?.online || [])).catch(() => {});
    fetch();
    const timer = setInterval(fetch, 30000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return <div className="text-dim" style={{ padding: '48px', textAlign: 'center' }}>加载中...</div>;

  const s = data?.summary || {};

  return (
    <div>
      {/* Visitor Map — full width with overlay controls */}
      <div style={{ position: 'relative', marginBottom: '20px' }}>
        {/* Map header bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {periods.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)} className={`btn ${period === p.key ? 'btn-primary' : 'btn-secondary'}`} style={{
                fontSize: '12px', padding: '4px 12px',
              }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Online users indicator */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setOnlineOpen(!onlineOpen)} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '4px 12px', fontSize: '12px', fontWeight: 500,
              background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
              cursor: 'pointer',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', flexShrink: 0 }} />
              <span style={{ color: '#c8e6ff' }}>{onlineUsers.length}</span>
              <span>在线</span>
              <i className={`fa-solid fa-chevron-${onlineOpen ? 'up' : 'down'}`} style={{ fontSize: '9px' }} />
            </button>

            {onlineOpen && (
              <>
                <div onClick={() => setOnlineOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: '6px', zIndex: 41,
                  width: '320px', maxHeight: '360px', overflowY: 'auto',
                  background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-sub)' }}>
                    当前在线 {onlineUsers.length} 人
                  </div>
                  {onlineUsers.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-dim)' }}>暂无在线访客</div>
                  ) : (
                    onlineUsers.map((u, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderBottom: '1px solid var(--color-divider)' }}>
                        {u.avatar ? (
                          <img src={u.avatar} alt="" style={{ width: '28px', height: '28px', objectFit: 'cover', clipPath: 'url(#squircle)', flexShrink: 0, background: 'var(--color-bg-soft)' }} />
                        ) : (
                          <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)', clipPath: 'url(#squircle)', flexShrink: 0 }}>
                            <i className="fa-light fa-user" style={{ fontSize: '12px', color: 'var(--color-text-dim)' }} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, color: u.name ? 'var(--color-primary)' : 'var(--color-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.name || u.ip || '匿名'}
                          </div>
                        </div>
                        {u.country_code && (
                          <img src={`https://flagcdn.io/${u.country_code.toLowerCase()}.svg`} alt="" style={{ width: '14px', height: '10px', flexShrink: 0 }} />
                        )}
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Summary stats overlay at bottom */}
        <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 1000, display: 'flex', gap: '16px', padding: '8px 16px', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: '4px' }}>
          {[
            { label: '访问次数', value: s.total_visits || 0, color: 'var(--color-primary)' },
            { label: '独立访客', value: s.unique_ips || 0, color: '#16a34a' },
            { label: '访问页面', value: s.unique_pages || 0, color: '#f59e0b' },
          ].map((card, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: card.color }}>{card.value.toLocaleString()}</span>
              <span style={{ fontSize: '11px', color: '#666' }}>{card.label}</span>
            </div>
          ))}
        </div>

        {/* Visitor Map */}
        <VisitorMap period={period} />
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
          <IconStatList data={data?.browsers || []} nameKey="name" valueKey="count" icon={(d) => <BrowserIcon name={d.name} size={16} />} />
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>操作系统</h3>
          <IconStatList data={data?.os || []} nameKey="name" valueKey="count" icon={(d) => <OSIcon name={d.name} size={16} />} />
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>设备</h3>
          <IconStatList data={data?.devices || []} nameKey="type" valueKey="count" icon={(d) => <DeviceIcon type={d.type} size={16} />} />
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>国家/地区</h3>
          <CountryRow data={data?.countries || []} />
        </div>
      </div>

      {/* Recent visitors — paginated with comment author matching */}
      <div>
        <RecentVisitorsPanel />
      </div>
    </div>
  );
}

function RecentVisitorsPanel() {
  const [visitors, setVisitors] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchVisitors = async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/analytics/visitors', { params: { page, per_page: 10 } });
      setVisitors(r.data || []);
      setTotal(r.meta?.total || 0);
      setTotalPages(r.meta?.total_pages || 1);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchVisitors(); }, [page]);

  const formatTime = (ts: number) => {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatDuration = (s: number) => {
    if (!s || s <= 0) return '-';
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  };

  return (
    <div className="card" style={{ overflow: 'visible' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600 }}>
          <i className="fa-sharp fa-light fa-users" style={{ marginRight: '6px', color: 'var(--color-primary)' }} />
          最近访客
        </h3>
        <span className="text-dim" style={{ fontSize: '12px' }}>共 {total} 条</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="var(--color-primary)">
            <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
            <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z">
              <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
            </path>
          </svg>
        </div>
      ) : (
        <table className="table" style={{ width: '100%', fontSize: '12px' }}>
          <thead>
            <tr>
              <th style={{ padding: '8px 12px' }}>访客</th>
              <th>页面</th>
              <th>位置</th>
              <th>浏览器 / 系统</th>
              <th>时长</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {visitors.map((v: any, i: number) => (
              <tr key={i}>
                <td style={{ padding: '6px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {v.author_avatar ? (
                      <img src={v.author_avatar} alt="" style={{ width: '24px', height: '24px', objectFit: 'cover', clipPath: 'url(#squircle)', flexShrink: 0, background: 'var(--color-bg-soft)' }} />
                    ) : (
                      <div style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)', clipPath: 'url(#squircle)', flexShrink: 0 }}>
                        <i className="fa-light fa-user" style={{ fontSize: '11px', color: 'var(--color-text-dim)' }} />
                      </div>
                    )}
                    <div>
                      {v.author_name ? (
                        <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--color-primary)' }}>{v.author_name}</span>
                      ) : (
                        <span className="text-dim" style={{ fontSize: '11px' }}>{v.ip_masked}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.path}</td>
                <td>
                  {v.country_code && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <img src={`https://flagcdn.io/${v.country_code.toLowerCase()}.svg`} alt="" style={{ width: '14px', height: '10px' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span className="text-dim">{v.city || v.country || '-'}</span>
                    </span>
                  )}
                </td>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--color-text-dim)' }}>
                    <BrowserIcon name={v.browser} size={14} />
                    <span>{v.browser}</span>
                    {v.os && <>
                      <span style={{ opacity: 0.3 }}>/</span>
                      <OSIcon name={v.os} size={14} />
                      <span>{v.os}</span>
                    </>}
                  </span>
                </td>
                <td className="text-dim">{formatDuration(v.duration)}</td>
                <td className="text-dim">{formatTime(v.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', padding: '10px 16px', borderTop: '1px solid var(--color-border)' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>
            <i className="fa-solid fa-chevron-left" style={{ fontSize: '10px' }} />
          </button>
          <span className="text-sub" style={{ fontSize: '12px', padding: '4px 8px' }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>
            <i className="fa-solid fa-chevron-right" style={{ fontSize: '10px' }} />
          </button>
        </div>
      )}
    </div>
  );
}
