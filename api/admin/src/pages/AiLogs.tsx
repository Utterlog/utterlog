
import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function AiLogsPage() {
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    loadLogs();
  }, [page]);

  const loadStats = async () => {
    try {
      const r: any = await api.get('/ai/stats');
      if (r.success) setStats(r.data);
    } catch {}
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const r: any = await api.get(`/ai/logs?page=${page}&per_page=30`);
      if (r.success) {
        setLogs(r.data || []);
        setTotal(r.meta?.total || 0);
      }
    } catch {}
    setLoading(false);
  };

  const fmtDate = (ts: number) => {
    if (!ts) return '-';
    return new Date(ts * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>
      <h1 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>AI 使用统计</h1>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          <div className="card" style={{ padding: '16px' }}>
            <p className="text-dim" style={{ fontSize: '12px' }}>总调用次数</p>
            <p style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>{stats.totals?.total_calls || 0}</p>
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <p className="text-dim" style={{ fontSize: '12px' }}>总 Token 消耗</p>
            <p style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>{(stats.totals?.total_tokens || 0).toLocaleString()}</p>
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <p className="text-dim" style={{ fontSize: '12px' }}>使用模型数</p>
            <p style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>{stats.by_model?.length || 0}</p>
          </div>
        </div>
      )}

      {/* By action & model */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          <div className="card" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>按功能</h3>
            {stats.by_action?.map((a: any) => (
              <div key={a.action} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                <span>{a.action}</span>
                <span className="text-dim">{a.count} 次 · {parseInt(a.tokens).toLocaleString()} tokens</span>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>按模型</h3>
            {stats.by_model?.map((m: any) => (
              <div key={m.model} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{m.model}</span>
                <span className="text-dim" style={{ flexShrink: 0, marginLeft: '8px' }}>{m.count} 次</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 12px' }}>时间</th>
              <th>功能</th>
              <th>模型</th>
              <th>Tokens</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log: any) => (
              <tr key={log.id}>
                <td style={{ padding: '8px 12px' }}>{fmtDate(log.created_at)}</td>
                <td>{log.action}</td>
                <td className="text-sub">{log.model}</td>
                <td>{log.total_tokens?.toLocaleString()}</td>
                <td>
                  <span style={{ color: log.status === 'success' ? '#4CAF73' : '#DC3545', fontSize: '12px' }}>
                    {log.status === 'success' ? '成功' : '失败'}
                  </span>
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px' }} className="text-dim">暂无记录</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 30 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn btn-ghost" style={{ fontSize: '13px' }}>上一页</button>
          <span className="text-dim" style={{ fontSize: '13px', padding: '6px 12px' }}>第 {page} 页</span>
          <button onClick={() => setPage(p => p + 1)} disabled={logs.length < 30} className="btn btn-ghost" style={{ fontSize: '13px' }}>下一页</button>
        </div>
      )}
    </div>
  );
}
