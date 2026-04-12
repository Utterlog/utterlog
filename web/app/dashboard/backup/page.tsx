'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui';
import { Upload, Trash2, Database } from '@/components/icons';

export default function BackupPage() {
  const [stats, setStats] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = () => {
    api.get('/backup/stats').then((r: any) => setStats(r.data || r)).catch(() => {});
    api.get('/backup/list').then((r: any) => setBackups(r.data || [])).catch(() => {});
  };

  const createBackup = async () => {
    setCreating(true);
    try {
      const r: any = await api.post('/backup/create');
      toast.success('备份创建成功');
      fetchData();
    } catch { toast.error('备份失败'); }
    setCreating(false);
  };

  const deleteBackup = async (filename: string) => {
    if (!confirm('确定删除此备份？')) return;
    try { await api.delete(`/backup/${filename}`); toast.success('已删除'); fetchData(); } catch { toast.error('删除失败'); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('导入备份将覆盖当前数据，确定继续？')) return;

    setImporting(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r: any = await api.post('/backup/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`恢复成功！数据库: ${r.data?.db_restored ? '✓' : '✗'}, 文件: ${r.data?.files || 0}`);
      fetchData();
    } catch { toast.error('导入失败'); }
    setImporting(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  };

  return (
    <div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
          <div className="card" style={{ padding: '20px' }}>
            <p className="text-dim" style={{ fontSize: '12px' }}>数据库大小</p>
            <p style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>{stats.db_size || '-'}</p>
          </div>
          <div className="card" style={{ padding: '20px' }}>
            <p className="text-dim" style={{ fontSize: '12px' }}>附件大小</p>
            <p style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>{stats.uploads_size || '-'}</p>
          </div>
          <div className="card" style={{ padding: '20px' }}>
            <p className="text-dim" style={{ fontSize: '12px' }}>备份数量</p>
            <p style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>{stats.backup_count || 0}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <Button onClick={createBackup} loading={creating}>
          <Database size={14} /> 创建备份
        </Button>
        <label style={{ cursor: 'pointer' }}>
          <input type="file" accept=".zip" onChange={handleImport} style={{ display: 'none' }} />
          <span className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Upload size={14} /> {importing ? '导入中...' : '导入备份'}
          </span>
        </label>
      </div>

      <p className="text-dim" style={{ fontSize: '12px', marginBottom: '16px' }}>
        备份包含：数据库完整导出 + uploads 目录所有附件。导入时自动恢复数据库和文件。
      </p>

      {/* Backup list */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 12px' }}>文件名</th>
              <th>大小</th>
              <th>创建时间</th>
              <th style={{ width: '120px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b: any, i: number) => (
              <tr key={i}>
                <td style={{ padding: '8px 12px', fontWeight: 500 }}>{b.filename}</td>
                <td className="text-dim">{formatSize(b.size || 0)}</td>
                <td className="text-dim">{b.created}</td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <a href={b.url} download className="btn btn-secondary" style={{ fontSize: '11px', padding: '3px 8px', textDecoration: 'none' }}>下载</a>
                    <button onClick={() => deleteBackup(b.filename)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '3px' }}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {backups.length === 0 && (
              <tr><td colSpan={4} className="text-dim" style={{ textAlign: 'center', padding: '32px' }}>暂无备份，点击"创建备份"开始</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
