'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { postsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, ConfirmDialog } from '@/components/ui';
import { Plus, Edit2, Trash2, Eye, FileText } from '@/components/icons';
import { formatDate } from '@/lib/utils';


export default function PagesPage() {
  const router = useRouter();
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => { fetchPages(); }, []);

  const fetchPages = async () => {
    setLoading(true);
    try {
      const r: any = await postsApi.list({ limit: 100, type: 'page' } as any);
      setPages(r.data?.posts || r.data || []);
    } catch { toast.error('获取页面失败'); }
    finally { setLoading(false); }
  };

  const toggleStatus = async (page: any) => {
    const newStatus = page.status === 'publish' ? 'draft' : 'publish';
    try {
      await postsApi.update(page.id, { ...page, status: newStatus });
      toast.success(newStatus === 'publish' ? '已开启显示' : '已关闭显示');
      fetchPages();
    } catch { toast.error('操作失败'); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await postsApi.delete(deleteId); toast.success('删除成功'); fetchPages(); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  return (
    <div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <span className="text-dim" style={{ fontSize: '13px' }}>{pages.length} 个页面</span>
        <div style={{ marginLeft: 'auto' }}>
          <Button onClick={() => router.push('/dashboard/pages/create')}>
            <Plus size={16} />新建页面
          </Button>
        </div>
      </div>

      {/* Pages list */}
      {loading ? (
        <div className="text-dim" style={{ textAlign: 'center', padding: '48px' }}>加载中...</div>
      ) : pages.length === 0 ? (
        <div className="text-dim" style={{ textAlign: 'center', padding: '48px' }}>
          <p style={{ fontSize: '15px', marginBottom: '8px' }}>暂无页面</p>
          <p style={{ fontSize: '13px' }}>点击上方模板快速创建，或手动新建</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table" style={{ width: '100%', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 12px' }}>标题</th>
                <th>Slug</th>
                <th style={{ width: '70px' }}>显示</th>
                <th style={{ width: '100px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {pages.map(page => (
                <tr key={page.id}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={14} className="text-dim" />
                      {page.title}
                    </div>
                  </td>
                  <td className="text-dim">/{page.slug}</td>
                  <td>
                    <button
                      onClick={() => toggleStatus(page)}
                      style={{
                        width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                        background: page.status === 'publish' ? 'var(--color-primary)' : 'var(--color-border)',
                        position: 'relative', transition: 'background 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: '2px',
                        left: page.status === 'publish' ? '18px' : '2px',
                        width: '16px', height: '16px', borderRadius: '50%',
                        background: '#fff', transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => router.push(`/dashboard/pages/edit/${page.id}`)} className="text-primary-themed" style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => setDeleteId(page.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除后无法恢复" />
    </div>
  );
}
