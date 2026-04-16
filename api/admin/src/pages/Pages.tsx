
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { postsApi, optionsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, ConfirmDialog } from '@/components/ui';
import { formatDate } from '@/lib/utils';

const builtinPages = [
  { key: 'page_about', label: '关于', slug: '/about', icon: 'fa-regular fa-user' },
  { key: 'page_moments', label: '说说', slug: '/moments', icon: 'fa-regular fa-comment-dots' },
  { key: 'page_archives', label: '归档', slug: '/archives', icon: 'fa-regular fa-box-archive' },
  { key: 'page_music', label: '音乐', slug: '/music', icon: 'fa-regular fa-music' },
  { key: 'page_movies', label: '电影', slug: '/movies', icon: 'fa-regular fa-film' },
  { key: 'page_books', label: '图书', slug: '/books', icon: 'fa-regular fa-book' },
  { key: 'page_goods', label: '好物', slug: '/goods', icon: 'fa-regular fa-bag-shopping' },
  { key: 'page_feeds', label: '订阅', slug: '/feeds', icon: 'fa-regular fa-rss' },
  { key: 'page_links', label: '友链', slug: '/links', icon: 'fa-regular fa-link' },
  { key: 'page_albums', label: '相册', slug: '/albums', icon: 'fa-regular fa-images' },
];

export default function PagesPage() {
  const navigate = useNavigate();
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [builtinStatus, setBuiltinStatus] = useState<Record<string, boolean>>({});

  useEffect(() => { fetchPages(); fetchBuiltinStatus(); }, []);

  const fetchBuiltinStatus = async () => {
    try {
      const r: any = await api.get('/options');
      const opts = r.data || r || {};
      const status: Record<string, boolean> = {};
      builtinPages.forEach(p => {
        status[p.key] = opts[p.key] !== 'false';
      });
      setBuiltinStatus(status);
    } catch {}
  };

  const toggleBuiltin = async (key: string) => {
    const next = !builtinStatus[key];
    setBuiltinStatus(prev => ({ ...prev, [key]: next }));
    try {
      await optionsApi.updateMany({ [key]: String(next) });
      toast.success(next ? '已启用' : '已关闭');
    } catch { toast.error('操作失败'); }
  };

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

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <span className="text-dim" style={{ fontSize: '13px' }}>{builtinPages.length + pages.length} 个页面</span>
        <div style={{ marginLeft: 'auto' }}>
          <Button onClick={() => navigate('/pages/create')}>
            <i className="fa-regular fa-plus" style={{ fontSize: '14px' }} />新建页面
          </Button>
        </div>
      </div>

      {/* All pages in one table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 12px' }}>页面</th>
              <th style={{ width: '120px' }}>路径</th>
              <th style={{ width: '60px' }}>类型</th>
              <th style={{ width: '60px' }}>启用</th>
              <th style={{ width: '80px' }}><span style={{ display: 'block', textAlign: 'right' }}>操作</span></th>
            </tr>
          </thead>
          <tbody>
            {/* Built-in pages */}
            {builtinPages.map(p => {
              const enabled = builtinStatus[p.key] !== false;
              return (
                <tr key={p.key} style={{ opacity: enabled ? 1 : 0.5 }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className={p.icon} style={{ fontSize: '14px', color: 'var(--color-primary)', width: '16px', textAlign: 'center' }} />
                      {p.label}
                    </div>
                  </td>
                  <td className="text-dim" style={{ fontSize: '12px' }}>{p.slug}</td>
                  <td><span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--color-bg-soft)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}>系统</span></td>
                  <td>
                    <button
                      onClick={() => toggleBuiltin(p.key)}
                      style={{
                        width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                        background: enabled ? 'var(--color-primary)' : 'var(--color-border)',
                        position: 'relative', transition: 'background 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: '2px',
                        left: enabled ? '18px' : '2px',
                        width: '16px', height: '16px', borderRadius: '50%',
                        background: '#fff', transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </button>
                  </td>
                  <td />
                </tr>
              );
            })}
            {/* Custom pages */}
            {loading ? (
              <tr><td colSpan={5} className="text-dim" style={{ textAlign: 'center', padding: '24px' }}>加载中...</td></tr>
            ) : pages.map(page => (
              <tr key={page.id}>
                <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-regular fa-file-lines" style={{ fontSize: '14px', color: 'var(--color-text-dim)', width: '16px', textAlign: 'center' }} />
                    {page.title}
                  </div>
                </td>
                <td className="text-dim" style={{ fontSize: '12px' }}>/{page.slug}</td>
                <td><span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--color-bg-soft)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}>自定义</span></td>
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
                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                    <button onClick={() => navigate(`/pages/edit/${page.id}`)} className="text-primary-themed" style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <i className="fa-regular fa-pen" style={{ fontSize: '14px' }} />
                    </button>
                    <button onClick={() => setDeleteId(page.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                      <i className="fa-regular fa-trash" style={{ fontSize: '14px' }} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除后无法恢复" />
    </div>
  );
}
