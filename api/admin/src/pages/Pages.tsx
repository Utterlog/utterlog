
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { postsApi, optionsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, ConfirmDialog } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

// A built-in page with `contentKey` gets an inline HTML/markdown editor
// stored in that option. Pages without contentKey are pure list views
// and only expose the enable/disable toggle.
const builtinPages = [
  { key: 'page_about', label: '关于', slug: '/about', icon: 'fa-regular fa-user', contentKey: 'page_about_content' as const },
  { key: 'page_moments', label: '说说', slug: '/moments', icon: 'fa-regular fa-comment-dots' },
  { key: 'page_archives', label: '归档', slug: '/archives', icon: 'fa-regular fa-box-archive' },
  { key: 'page_music', label: '音乐', slug: '/music', icon: 'fa-regular fa-music' },
  { key: 'page_movies', label: '电影', slug: '/movies', icon: 'fa-regular fa-film' },
  { key: 'page_books', label: '图书', slug: '/books', icon: 'fa-regular fa-book' },
  { key: 'page_goods', label: '好物', slug: '/goods', icon: 'fa-regular fa-bag-shopping' },
  { key: 'page_feeds', label: '订阅', slug: '/feeds', icon: 'fa-regular fa-rss' },
  { key: 'page_links', label: '友链', slug: '/links', icon: 'fa-regular fa-link' },
  { key: 'page_albums', label: '相册', slug: '/albums', icon: 'fa-regular fa-images' },
] satisfies { key: string; label: string; slug: string; icon: string; contentKey?: string }[];

export default function PagesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [builtinStatus, setBuiltinStatus] = useState<Record<string, boolean>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [savingContent, setSavingContent] = useState(false);

  useEffect(() => { fetchPages(); fetchBuiltinStatus(); }, []);

  const openContentEditor = async (contentKey: string) => {
    try {
      const r: any = await api.get('/options');
      const opts = r.data || r || {};
      setEditingContent(opts[contentKey] || '');
      setEditingKey(contentKey);
    } catch {
      toast.error(t('admin.pages.toast.contentFetchFailed', '读取内容失败'));
    }
  };

  const saveBuiltinContent = async () => {
    if (!editingKey) return;
    setSavingContent(true);
    try {
      await optionsApi.updateMany({ [editingKey]: editingContent });
      toast.success(t('admin.common.saved', '已保存'));
      setEditingKey(null);
    } catch {
      toast.error(t('admin.settings.toast.saveFailed', '保存失败'));
    } finally {
      setSavingContent(false);
    }
  };

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
      toast.success(next ? t('admin.pages.toast.enabled', '已启用') : t('admin.pages.toast.disabled', '已关闭'));
    } catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
  };

  const fetchPages = async () => {
    setLoading(true);
    try {
      const r: any = await postsApi.list({ limit: 100, type: 'page' } as any);
      setPages(r.data?.posts || r.data || []);
    } catch { toast.error(t('admin.pages.toast.fetchFailed', '获取页面失败')); }
    finally { setLoading(false); }
  };

  const toggleStatus = async (page: any) => {
    const newStatus = page.status === 'publish' ? 'draft' : 'publish';
    try {
      await postsApi.update(page.id, { ...page, status: newStatus });
      toast.success(newStatus === 'publish' ? t('admin.pages.toast.displayEnabled', '已开启显示') : t('admin.pages.toast.displayDisabled', '已关闭显示'));
      fetchPages();
    } catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await postsApi.delete(deleteId); toast.success(t('admin.posts.toast.deleteSuccess', '删除成功')); fetchPages(); }
    catch { toast.error(t('admin.posts.toast.deleteFailed', '删除失败')); }
    finally { setDeleteId(null); }
  };

  return (
    <div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <span className="text-dim" style={{ fontSize: '13px' }}>{t('admin.pages.totalPages', '{count} 个页面', { count: builtinPages.length + pages.length })}</span>
        <div style={{ marginLeft: 'auto' }}>
          <Button onClick={() => navigate('/pages/create')}>
            <i className="fa-regular fa-plus" style={{ fontSize: '14px' }} />{t('admin.pages.newPage', '新建页面')}
          </Button>
        </div>
      </div>

      {/* All pages in one table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 12px' }}>{t('admin.pages.columns.page', '页面')}</th>
              <th style={{ width: '120px' }}>{t('admin.pages.columns.path', '路径')}</th>
              <th style={{ width: '60px' }}>{t('admin.pages.columns.type', '类型')}</th>
              <th style={{ width: '60px' }}>{t('admin.pages.columns.enabled', '启用')}</th>
              <th style={{ width: '80px' }}><span style={{ display: 'block', textAlign: 'right' }}>{t('admin.posts.columns.actions', '操作')}</span></th>
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
                      {t(`admin.pages.builtin.${p.key}`, p.label)}
                    </div>
                  </td>
                  <td className="text-dim" style={{ fontSize: '12px' }}>{p.slug}</td>
                  <td><span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--color-bg-soft)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}>{t('admin.pages.type.system', '系统')}</span></td>
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
                  <td>
                    {p.contentKey ? (
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                        <button onClick={() => openContentEditor(p.contentKey!)} className="text-primary-themed"
                          title={t('admin.pages.editContent', '编辑内容')}
                          style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer' }}>
                          <i className="fa-regular fa-pen" style={{ fontSize: '14px' }} />
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {/* Custom pages */}
            {loading ? (
              <tr><td colSpan={5} className="text-dim" style={{ textAlign: 'center', padding: '24px' }}>{t('common.loading', '加载中...')}</td></tr>
            ) : pages.map(page => (
              <tr key={page.id}>
                <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-regular fa-file-lines" style={{ fontSize: '14px', color: 'var(--color-text-dim)', width: '16px', textAlign: 'center' }} />
                    {page.title}
                  </div>
                </td>
                <td className="text-dim" style={{ fontSize: '12px' }}>/{page.slug}</td>
                <td><span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--color-bg-soft)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}>{t('admin.pages.type.custom', '自定义')}</span></td>
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

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title={t('admin.posts.confirmDeleteTitle', '确认删除')} message={t('admin.common.deleteIrreversible', '删除后无法恢复')} />

      {editingKey && (
        <div
          onClick={() => setEditingKey(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-bg-card)', width: '720px', maxWidth: '90vw',
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>{t('admin.pages.editingContentTitle', '编辑内容 — {key}', { key: editingKey })}</h3>
              <button onClick={() => setEditingKey(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>
                <i className="fa-regular fa-xmark" />
              </button>
            </div>
            <div style={{ padding: '20px', flex: 1, overflow: 'auto' }}>
              <p className="text-dim" style={{ fontSize: '12px', marginBottom: '8px' }}>
                {t('admin.pages.contentHint', '支持 HTML 片段。留空则恢复默认示例内容。')}
              </p>
              <textarea
                className="input"
                style={{ width: '100%', minHeight: '360px', fontFamily: 'monospace', fontSize: '13px' }}
                value={editingContent}
                onChange={e => setEditingContent(e.target.value)}
                placeholder={t('admin.pages.contentPlaceholder', '<p>欢迎来到我的博客...</p>')}
              />
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="secondary" onClick={() => setEditingKey(null)} disabled={savingContent}>{t('admin.common.cancel', '取消')}</Button>
              <Button onClick={saveBuiltinContent} loading={savingContent}>{t('admin.common.save', '保存')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
