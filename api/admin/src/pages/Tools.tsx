
import { useRef, useState, useEffect } from 'react';
import { importApi, optionsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui';
import SyncSitesPanel from '@/components/SyncSitesPanel';

export default function ToolsPage() {
  const [activeTab, setActiveTab] = useState<'import' | 'backup' | 'wp-sync'>('import');

  // WordPress import state
  const [wpImporting, setWpImporting] = useState(false);
  const [wpResult, setWpResult] = useState<any>(null);
  const wpFileRef = useRef<HTMLInputElement>(null);

  // Backup state
  const [stats, setStats] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  // Backup settings
  const [backupDest, setBackupDest] = useState('local');
  const [backupSchedule, setBackupSchedule] = useState('off');
  const [backupKeep, setBackupKeep] = useState('10');
  const [s3Configured, setS3Configured] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => { if (activeTab === 'backup') { fetchBackupData(); fetchBackupSettings(); } }, [activeTab]);

  const handleWordPressImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.xml')) { toast.error('请上传 WordPress 导出的 XML 文件'); return; }
    if (!confirm('导入将清空现有文章、分类、标签、评论数据，确定继续？')) {
      if (wpFileRef.current) wpFileRef.current.value = '';
      return;
    }
    setWpImporting(true);
    setWpResult(null);
    try {
      const res: any = await importApi.wordpress(file);
      const data = res.data || res;
      setWpResult(data);
      toast.success(`导入成功：${data.posts} 篇文章，${data.categories} 个分类，${data.tags} 个标签，${data.comments} 条评论`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || '导入失败');
    }
    setWpImporting(false);
    if (wpFileRef.current) wpFileRef.current.value = '';
  };

  // Backup handlers
  const fetchBackupData = () => {
    api.get('/backup/stats').then((r: any) => setStats(r.data || r)).catch(() => {});
    api.get('/backup/list').then((r: any) => setBackups(r.data || [])).catch(() => {});
  };

  const createBackup = async () => {
    setCreating(true);
    try { await api.post('/backup/create'); toast.success('备份创建成功'); fetchBackupData(); } catch { toast.error('备份失败'); }
    setCreating(false);
  };

  const deleteBackup = async (filename: string) => {
    if (!confirm('确定删除此备份？')) return;
    try { await api.delete(`/backup/${filename}`); toast.success('已删除'); fetchBackupData(); } catch { toast.error('删除失败'); }
  };

  const fetchBackupSettings = async () => {
    try {
      const r: any = await optionsApi.list();
      const opts = r.data || r;
      setBackupDest(opts.backup_destination || 'local');
      setBackupSchedule(opts.backup_schedule || 'off');
      setBackupKeep(opts.backup_keep || '10');
      setS3Configured(!!(opts.s3_endpoint && opts.s3_bucket && opts.s3_access_key));
    } catch {}
  };

  const saveBackupSettings = async () => {
    setSavingSettings(true);
    try {
      await optionsApi.updateMany({
        backup_destination: backupDest,
        backup_schedule: backupSchedule,
        backup_keep: backupKeep,
      });
      toast.success('备份设置已保存');
    } catch { toast.error('保存失败'); }
    setSavingSettings(false);
  };

  const handleBackupImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('导入备份将覆盖当前数据，确定继续？')) return;
    setImporting(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r: any = await api.post('/backup/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`恢复成功！数据库: ${r.data?.db_restored ? '✓' : '✗'}, 文件: ${r.data?.files || 0}`);
      fetchBackupData();
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
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)', marginBottom: '20px' }}>
        {[
          { key: 'import' as const, label: '导入工具' },
          { key: 'wp-sync' as const, label: 'WordPress 同步' },
          { key: 'backup' as const, label: '备份恢复' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '10px 20px', fontSize: '14px', fontWeight: activeTab === tab.key ? 600 : 400,
            color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-sub)',
            borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            borderBottom: activeTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'none', cursor: 'pointer',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ==================== 导入工具 ==================== */}
      {activeTab === 'import' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 1024 1024" fill="#fff"><path d="M512 1024C132.647385 1024 0 891.313231 0 512S132.647385 0 512 0s512 132.686769 512 512-132.647385 512-512 512zM236.307692 354.461538h551.384616V275.692308H236.307692v78.76923z m0 196.923077h393.846154v-78.76923H236.307692v78.76923z m0 196.923077h472.615385v-78.76923H236.307692v78.76923z" /></svg>
              </div>
              <div>
                <h3 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>WordPress 导入</h3>
                <p className="text-dim" style={{ fontSize: '12px' }}>从 WordPress 导出的 XML 文件导入文章、分类、标签和评论</p>
              </div>
            </div>
            <input ref={wpFileRef} type="file" accept=".xml" onChange={handleWordPressImport} style={{ display: 'none' }} />
            <Button onClick={() => wpFileRef.current?.click()} disabled={wpImporting} style={{ width: '100%' }}>
              <i className="fa-regular fa-cloud-arrow-up" style={{ fontSize: '16px' }} /> {wpImporting ? '导入中...' : '选择 XML 文件并导入'}
            </Button>
            {wpResult && (
              <div style={{ padding: '12px', borderRadius: '4px', background: 'var(--color-bg-soft)', fontSize: '13px', marginTop: '12px' }}>
                <p className="text-main" style={{ fontWeight: 600, marginBottom: '8px' }}>导入结果</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <span className="text-sub">文章：<strong>{wpResult.posts}</strong></span>
                  <span className="text-sub">分类：<strong>{wpResult.categories}</strong></span>
                  <span className="text-sub">标签：<strong>{wpResult.tags}</strong></span>
                  <span className="text-sub">评论：<strong>{wpResult.comments}</strong></span>
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: '24px', opacity: 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--color-text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 1024 1024" fill="#fff"><path d="M512 1024C132.647385 1024 0 891.313231 0 512S132.647385 0 512 0s512 132.686769 512 512-132.647385 512-512 512zM236.307692 354.461538h551.384616V275.692308H236.307692v78.76923z m0 196.923077h393.846154v-78.76923H236.307692v78.76923z m0 196.923077h472.615385v-78.76923H236.307692v78.76923z" /></svg>
              </div>
              <div>
                <h3 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>Typecho 导入</h3>
                <p className="text-dim" style={{ fontSize: '12px' }}>通过数据库连接从 Typecho 导入数据</p>
              </div>
            </div>
            <p className="text-dim" style={{ fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>即将推出</p>
          </div>
        </div>
      )}

      {/* ==================== WordPress 同步 ==================== */}
      {activeTab === 'wp-sync' && (
        <SyncSitesPanel />
      )}

      {/* ==================== 备份恢复 ==================== */}
      {activeTab === 'backup' && (
        <>
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

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <Button onClick={createBackup} loading={creating}>
              <i className="fa-regular fa-database" style={{ fontSize: '14px' }} /> 创建备份
            </Button>
            <label style={{ cursor: 'pointer' }}>
              <input type="file" accept=".zip" onChange={handleBackupImport} style={{ display: 'none' }} />
              <span className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-regular fa-cloud-arrow-up" style={{ fontSize: '14px' }} /> {importing ? '导入中...' : '导入备份'}
              </span>
            </label>
          </div>

          {/* Backup Settings */}
          <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <i className="fa-regular fa-gear" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
              <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600 }}>备份设置</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <div>
                <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>自动备份</label>
                <select className="input" value={backupSchedule} onChange={e => setBackupSchedule(e.target.value)} style={{ fontSize: '13px' }}>
                  <option value="off">关闭</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                </select>
              </div>
              <div>
                <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>存储位置</label>
                <select className="input" value={backupDest} onChange={e => setBackupDest(e.target.value)} style={{ fontSize: '13px' }}>
                  <option value="local">本地服务器</option>
                  <option value="s3" disabled={!s3Configured}>S3 {!s3Configured ? '(未配置)' : ''}</option>
                  <option value="r2" disabled={!s3Configured}>Cloudflare R2 {!s3Configured ? '(未配置)' : ''}</option>
                </select>
              </div>
              <div>
                <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>保留数量</label>
                <select className="input" value={backupKeep} onChange={e => setBackupKeep(e.target.value)} style={{ fontSize: '13px' }}>
                  <option value="5">最近 5 份</option>
                  <option value="10">最近 10 份</option>
                  <option value="20">最近 20 份</option>
                  <option value="50">最近 50 份</option>
                  <option value="0">不限制</option>
                </select>
              </div>
            </div>
            {(backupDest === 's3' || backupDest === 'r2') && !s3Configured && (
              <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '10px' }}>
                <i className="fa-light fa-triangle-exclamation" style={{ marginRight: '4px' }} />
                请先在 <a href="/settings" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>系统设置 &gt; 存储</a> 中配置 {backupDest === 'r2' ? 'R2' : 'S3'} 连接信息
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px' }}>
              <p className="text-dim" style={{ fontSize: '11px' }}>
                {backupSchedule !== 'off' ? `自动备份已开启 (${backupSchedule === 'daily' ? '每天' : backupSchedule === 'weekly' ? '每周' : '每月'})，备份到${backupDest === 'local' ? '本地' : backupDest === 'r2' ? 'R2' : 'S3'}` : '自动备份未开启，仅支持手动创建'}
              </p>
              <Button onClick={saveBackupSettings} loading={savingSettings} variant="secondary" style={{ fontSize: '12px', padding: '4px 14px', height: '30px' }}>
                <i className="fa-regular fa-floppy-disk" style={{ fontSize: '12px' }} /> 保存
              </Button>
            </div>
          </div>

          <p className="text-dim" style={{ fontSize: '12px', marginBottom: '16px' }}>
            备份包含：数据库完整导出{backupDest === 'local' ? ' + 本地附件' : ''}。{backupDest !== 'local' ? '附件已存储在云端，无需重复备份。' : ''}导入时自动恢复。
          </p>

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
                        <button onClick={() => deleteBackup(b.filename)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '3px' }}><i className="fa-regular fa-trash" style={{ fontSize: '14px' }} /></button>
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
        </>
      )}

    </div>
  );
}
