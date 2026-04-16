
import { useEffect, useState } from 'react';
import api from '@/lib/api';

// SVG Ring chart component
function Ring({ percent, size = 48, stroke = 4, color = 'var(--color-primary)', label, sub }: {
  percent: number; size?: number; stroke?: number; color?: string; label: string; sub?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clampedPct = Math.max(0, Math.min(100, percent || 0));
  const offset = circ - (clampedPct / 100) * circ;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${circ}`} strokeDashoffset={`${offset}`} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </svg>
      <span style={{ fontSize: '10px', fontWeight: 600, marginTop: '-32px', position: 'relative' }}>
        {clampedPct % 1 === 0 ? clampedPct : clampedPct.toFixed(1)}%
      </span>
      <span className="text-dim" style={{ fontSize: '9px', marginTop: '14px' }}>{label}</span>
      {sub && <span className="text-dim" style={{ fontSize: '8px' }}>{sub}</span>}
    </div>
  );
}

export default function SystemStatusPanel({ isOpen }: { isOpen: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<any>(null);
  const [ok, setOk] = useState(false);
  const [clock, setClock] = useState('');
  const [tick, setTick] = useState(0);

  const fetchStatus = async () => {
    try {
      const r: any = await api.get('/system/status');
      const d = r.data || r;
      setData({...d}); // spread to force new reference
      setOk(d.status === 'ok' && d.database?.connected);
      setTick(t => t + 1);
    } catch { setOk(false); }
  };

  useEffect(() => {
    fetchStatus();
    // Only poll frequently when expanded
    const statusInterval = setInterval(fetchStatus, expanded ? 3000 : 30000);
    const clockInterval = setInterval(() => {
      setClock(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    // Init clock immediately
    setClock(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    return () => { clearInterval(statusInterval); clearInterval(clockInterval); };
  }, [expanded]);

  const memPct = parseInt(data?.memory?.percent || '0');
  const diskPct = parseInt(data?.disk?.percent || '0');

  return (
    <div className="border-t border-line" style={{ flexShrink: 0 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
          padding: isOpen ? '10px 12px' : '10px 0',
          justifyContent: isOpen ? 'flex-start' : 'center',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '12px', color: 'var(--color-text-dim)', transition: 'all 0.15s',
        }}
      >
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
          background: ok ? '#16a34a' : '#dc2626',
          boxShadow: ok ? '0 0 6px rgba(22,163,106,0.5)' : '0 0 6px rgba(220,38,38,0.5)',
          animation: 'pulse-dot 2s infinite',
        }} />
        {isOpen && <span>系统状态</span>}
        {isOpen && <span style={{ marginLeft: '4px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--color-text-sub)' }}>{clock}</span>}
        {isOpen && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{
            marginLeft: 'auto', transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}><path d="M18 15l-6-6-6 6" /></svg>
        )}
      </button>

      <style>{`@keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.5; } }`}</style>

      {expanded && isOpen && data && (
        <div style={{ padding: '0 12px 12px', animation: 'slideUp 0.2s ease-out' }}>
          <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>

          {/* Ring charts 2x2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            <Ring percent={data.cpu?.percent || 0} color="#16a34a" label="CPU" sub={`${data.cpu?.cores || 0} 核`} />
            <Ring percent={memPct} color="#2563eb" label="内存" sub={`${data.memory?.used_gb || 0} / ${data.memory?.total_gb || 0} GB`} />
            <Ring percent={diskPct} color="#f59e0b" label="磁盘" sub={`${formatDisk(data.disk?.used)} / ${formatDisk(data.disk?.total)}`} />
            <LoadRing loadAvg={data.load?.avg} cores={data.cpu?.cores || 1} />
          </div>

          {/* Info rows */}
          <div style={{ fontSize: '10px' }}>
            {[
              { k: '系统', v: data.server?.os },
              { k: '运行时间', v: formatUptime(data.server?.uptime) },
              { k: '主机 IP', v: data.server?.ip || '-', flag: data.server?.country_code },
              { k: 'Go', v: formatVersion(data.server?.runtime?.replace('Go go', '')) },
              { k: 'Next.js', v: '16.0' },
              { k: 'PgSQL', v: formatVersion(data.database?.version) },
              ...(data.redis?.enabled ? [{ k: 'Redis', v: formatVersion(data.redis?.version) + (data.redis?.memory ? ` (${data.redis.memory})` : '') }] : []),
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid var(--color-divider)' }}>
                <span className="text-dim">{item.k}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {item.flag && <img src={`https://flagcdn.io/${item.flag.toLowerCase()}.svg`} alt="" style={{ width: '14px', height: '10px' }} />}
                  {item.v}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Load ring — single circle with 1m percent, sub shows 1m/5m/15m
function LoadRing({ loadAvg, cores }: { loadAvg?: string; cores: number }) {
  const parts = (loadAvg || '0 0 0').trim().split(/\s+/).map(Number);
  const [l1, l5, l15] = parts;
  const pct1 = Math.min((l1 / cores) * 100, 100);
  const pct5 = Math.min((l5 / cores) * 100, 100);
  const pct15 = Math.min((l15 / cores) * 100, 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
      <Ring percent={parseFloat(pct1.toFixed(1))} color="#8b5cf6" label="负载" sub={`${pct1.toFixed(0)}% / ${pct5.toFixed(0)}% / ${pct15.toFixed(0)}%`} />
    </div>
  );
}

function formatLoad(avg?: string): string {
  if (!avg) return '0 / 0 / 0';
  const parts = avg.trim().split(/\s+/);
  return parts.slice(0, 3).join(' / ');
}

function formatMem(mb?: string): string {
  if (!mb) return '0 MB';
  const v = parseFloat(mb);
  if (v >= 1024) return (v / 1024).toFixed(1) + ' GB';
  return v.toFixed(1) + ' MB';
}

function formatDisk(s?: string): string {
  if (!s) return '-';
  return s.replace(/i/g, '');
}

function formatVersion(v?: string): string {
  if (!v) return '-';
  v = v.trim();
  if (!v.includes('.')) return v + '.0';
  return v;
}

function formatUptime(uptime?: string): string {
  if (!uptime) return '-';
  const h = uptime.match(/(\d+)h/);
  const m = uptime.match(/(\d+)m/);
  const s = uptime.match(/(\d+)\./);
  const parts = [];
  if (h) parts.push(h[1] + '时');
  if (m) parts.push(m[1] + '分');
  if (!h && !m && s) parts.push(s[1] + '秒');
  return parts.join('') || uptime;
}
