
import { useEffect, useState } from 'react';
import { linksApi, mediaApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Modal, ConfirmDialog, EmptyState } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

export default function LinksPage() {
  const { t } = useI18n();
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeGroup, setActiveGroup] = useState('all');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState<{ old: string; new: string } | null>(null);
  const [customGroups, setCustomGroups] = useState<string[]>([]);
  const [refreshingFeeds, setRefreshingFeeds] = useState(false);
  const [busy, setBusy] = useState<'icon' | 'cache' | 'rss' | null>(null);
  // Incremented by 一键刷新 ico — appended to favicon URLs to bust
  // the browser's image cache without touching any DB state.
  const [iconBust, setIconBust] = useState(0);

  const refreshFeeds = async () => {
    setRefreshingFeeds(true);
    try {
      const r: any = await api.post('/social/fetch-feeds');
      const d = r?.data || r;
      const fetched = d?.fetched ?? 0;
      const newItems = d?.new_items ?? 0;
      toast.success(t('admin.links.toast.feedsRefreshed', '已刷新 {fetched} 个订阅，新增 {newItems} 条', { fetched, newItems }));
    } catch {
      toast.error(t('admin.common.refreshFailed', '刷新失败'));
    } finally {
      setRefreshingFeeds(false);
    }
  };

  const refreshIcons = () => {
    setBusy('icon');
    setIconBust(Date.now());
    setTimeout(() => setBusy(null), 400);
    toast.success(t('admin.links.toast.iconsRefreshed', '已刷新所有友链图标缓存'));
  };

  const clearCache = async () => {
    if (!confirm(t('admin.links.confirm.clearCache', '确定清空服务端缓存？验证码、在线数等临时缓存会重建。'))) return;
    setBusy('cache');
    try {
      const r: any = await api.post('/admin/system/clear-cache');
      const d = r?.data || r;
      toast.success(t('admin.links.toast.cacheCleared', '已清空 {count} 条缓存', { count: d?.cleared ?? 0 }));
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || t('admin.common.clearFailed', '清空失败'));
    } finally { setBusy(null); }
  };

  const clearRSSCache = async () => {
    if (!confirm(t('admin.links.confirm.clearRssCache', '确定清空 RSS 订阅缓存？所有已抓取的文章会被删除，下次刷新重新拉取。'))) return;
    setBusy('rss');
    try {
      const r: any = await api.post('/admin/system/clear-rss-cache');
      const d = r?.data || r;
      toast.success(t('admin.links.toast.rssCacheCleared', '已清空 {count} 条订阅缓存', { count: d?.cleared_items ?? 0 }));
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || t('admin.common.clearFailed', '清空失败'));
    } finally { setBusy(null); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const r: any = await mediaApi.upload(file, 'avatars');
      const url = r.url || r.data?.url;
      if (url) setForm(prev => ({ ...prev, logo: url }));
    } catch { toast.error(t('admin.media.toast.uploadFailed', '上传失败')); }
    finally { setAvatarUploading(false); e.target.value = ''; }
  };

  const existingGroups = Array.from(new Set([
    ...links.map((l: any) => l.group_name || 'default'),
    ...customGroups,
  ]));

  const addGroup = () => {
    const g = newGroupName.trim();
    if (!g) return;
    if (existingGroups.includes(g)) { toast.error(t('admin.links.toast.groupExists', '分类「{group}」已存在', { group: g })); setNewGroupName(''); return; }
    setCustomGroups(prev => [...prev, g]);
    setNewGroupName('');
    toast.success(t('admin.links.toast.groupAdded', '分类「{group}」已添加', { group: g }));
  };

  const renameGroup = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) { setEditingGroup(null); return; }
    const toUpdate = links.filter((l: any) => (l.group_name || 'default') === oldName);
    try {
      for (const link of toUpdate) {
        await linksApi.update(link.id, { ...link, group_name: newName.trim() });
      }
      toast.success(t('admin.links.toast.groupRenamed', '分类「{oldName}」已重命名为「{newName}」', { oldName, newName }));
      setEditingGroup(null);
      fetchLinks();
    } catch { toast.error(t('admin.links.toast.renameFailed', '重命名失败')); }
  };

  const deleteGroup = async (groupName: string) => {
    const toUpdate = links.filter((l: any) => (l.group_name || 'default') === groupName);
    try {
      for (const link of toUpdate) {
        await linksApi.update(link.id, { ...link, group_name: 'default' });
      }
      toast.success(t('admin.links.toast.groupDeleted', '分类「{group}」已删除，{count} 条友链已移至默认分类', { group: groupName, count: toUpdate.length }));
      if (activeGroup === groupName) setActiveGroup('all');
      fetchLinks();
    } catch { toast.error(t('admin.common.deleteFailed', '删除失败')); }
  };

  const [form, setForm] = useState({
    name: '', url: '', description: '', logo: '', rss_url: '', group_name: 'default', order_num: 0,
  });

  useEffect(() => { fetchLinks(); }, []);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const r: any = await linksApi.list();
      setLinks(r.data || []);
    } catch { toast.error(t('admin.links.toast.fetchFailed', '获取友链失败')); }
    finally { setLoading(false); }
  };

  // Extract unique groups
  const groups = ['all', ...Array.from(new Set(links.map((l: any) => l.group_name || 'default')))];
  const orderedLinks = [...links].sort((a: any, b: any) => {
    const ao = Number(a.order_num) > 0 ? Number(a.order_num) : Number(a.id) || 0;
    const bo = Number(b.order_num) > 0 ? Number(b.order_num) : Number(b.id) || 0;
    if (ao !== bo) return ao - bo;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
  const filteredLinks = activeGroup === 'all' ? orderedLinks : orderedLinks.filter((l: any) => (l.group_name || 'default') === activeGroup);
  const nextOrderNum = () => orderedLinks.reduce((max: number, link: any) => {
    const n = Number(link.order_num) > 0 ? Number(link.order_num) : Number(link.id) || 0;
    return Math.max(max, n);
  }, 0) + 1;

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', url: '', description: '', logo: '', rss_url: '', group_name: 'default', order_num: nextOrderNum() });
    setIsModalOpen(true);
  };

  const openEdit = (link: any) => {
    setEditingId(link.id);
    setForm({
      name: link.name || '',
      url: link.url || '',
      description: link.description || '',
      logo: link.logo || '',
      rss_url: link.rss_url || '',
      group_name: link.group_name || 'default',
      order_num: link.order_num || 0,
    });
    setIsModalOpen(true);
  };

  const onSubmit = async () => {
    if (!form.name.trim() || !form.url.trim()) { toast.error(t('admin.links.toast.nameUrlRequired', '名称和链接不能为空')); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        await linksApi.update(editingId, form);
        toast.success(t('admin.common.updateSuccess', '更新成功'));
      } else {
        await linksApi.create(form);
        toast.success(t('admin.common.createSuccess', '创建成功'));
      }
      setIsModalOpen(false);
      fetchLinks();
    } catch { toast.error(editingId ? t('admin.common.updateFailed', '更新失败') : t('admin.common.createFailed', '创建失败')); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await linksApi.delete(deleteId); toast.success(t('admin.common.deleteSuccess', '删除成功')); fetchLinks(); }
    catch { toast.error(t('admin.common.deleteFailed', '删除失败')); }
    finally { setDeleteId(null); }
  };

  const groupLabel = (g: string) => g === 'all' ? t('admin.common.all', '全部') : g === 'default' ? t('admin.links.defaultGroup', '默认') : g;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <span className="text-dim" style={{ fontSize: '13px' }}>{t('admin.links.total', '共 {count} 条友链', { count: links.length })}</span>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={refreshIcons} loading={busy === 'icon'} disabled={busy !== null} style={{ padding: '0 18px', gap: '8px' }}>
            <i className="fa-regular fa-image" />
            {t('admin.links.refreshIco', '刷新 ico')}
          </Button>
          <Button variant="secondary" onClick={clearCache} loading={busy === 'cache'} disabled={busy !== null} style={{ padding: '0 18px', gap: '8px' }}>
            <i className="fa-regular fa-broom-wide" />
            {t('admin.links.clearCache', '清空缓存')}
          </Button>
          <Button variant="secondary" onClick={clearRSSCache} loading={busy === 'rss'} disabled={busy !== null} style={{ padding: '0 18px', gap: '8px' }}>
            <i className="fa-regular fa-trash-can" />
            {t('admin.links.clearRss', '清空 RSS')}
          </Button>
          <Button variant="secondary" onClick={refreshFeeds} loading={refreshingFeeds} disabled={refreshingFeeds || busy !== null} style={{ padding: '0 18px', gap: '8px' }}>
            <i className="fa-regular fa-arrows-rotate" />
            {t('admin.links.refreshFeeds', '刷新订阅')}
          </Button>
          <Button variant="secondary" onClick={() => setShowGroupModal(true)} style={{ padding: '0 18px' }}>{t('admin.links.groups', '分类')}</Button>
          <Button onClick={openCreate} style={{ padding: '0 20px', gap: '8px' }}>
            <i className="fa-regular fa-plus" style={{ fontSize: '14px' }} />
            {t('admin.common.add', '添加')}
          </Button>
        </div>
      </div>

      {/* Group tabs */}
      {groups.length > 2 && (
        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--color-border)', marginBottom: '16px' }}>
          {groups.map(g => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              style={{
                padding: '8px 16px', fontSize: '13px',
                fontWeight: activeGroup === g ? 600 : 400,
                color: activeGroup === g ? 'var(--color-primary)' : 'var(--color-text-sub)',
                borderBottom: activeGroup === g ? '2px solid var(--color-primary)' : '2px solid transparent',
                background: 'none', border: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {groupLabel(g)} ({g === 'all' ? links.length : links.filter(l => (l.group_name || 'default') === g).length})
            </button>
          ))}
        </div>
      )}

      {links.length === 0 && !loading ? (
        <EmptyState title={t('admin.links.empty', '暂无友链')} description={t('admin.links.emptyDescription', '添加您的第一个友情链接')} actionText={t('admin.links.addLink', '添加友链')} onAction={openCreate} />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th style={{ width: '36px' }}></th>
                <th style={{ width: '120px' }}>{t('admin.links.columns.name', '站点名称')}</th>
                <th>{t('admin.links.columns.description', '描述')}</th>
                <th>{t('admin.links.columns.url', '网址')}</th>
                <th>RSS</th>
                <th style={{ width: '80px' }}>{t('admin.links.columns.group', '分组')}</th>
                <th style={{ width: '72px', textAlign: 'right' }}>{t('admin.common.actions', '操作')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLinks.map((link: any, i: number) => {
                const baseFavicon = link.logo || (() => { try { return `https://favicon.im/${new URL(link.url).hostname}?larger=true`; } catch { return ''; } })();
                const favicon = baseFavicon ? `${baseFavicon}${baseFavicon.includes('?') ? '&' : '?'}v=${iconBust}` : '';
                return (
                  <tr key={link.id} className="hover:bg-soft" style={{ transition: 'background-color 0.1s' }}>
                    <td className="text-dim" style={{ fontSize: '12px' }}>{Number(link.order_num) > 0 ? link.order_num : (link.id || i + 1)}</td>
                    <td>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-bg-soft)', overflow: 'hidden', position: 'relative' }}>
                        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-dim)' }}>{link.name?.[0] || '?'}</span>
                        <img src={favicon} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    </td>
                    <td style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{link.name}</td>
                    <td className="text-dim" style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.description || '—'}</td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-primary-themed" style={{ fontSize: '12px' }}>{link.url}</a>
                    </td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {link.rss_url ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <i className="fa-solid fa-rss" style={{ fontSize: '11px', color: '#f97316', flexShrink: 0 }} />
                          <a href={link.rss_url} target="_blank" rel="noopener noreferrer" className="text-dim" style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.rss_url}</a>
                        </span>
                      ) : <span className="text-dim">—</span>}
                    </td>
                    <td className="text-dim" style={{ fontSize: '12px' }}>{link.group_name === 'default' || !link.group_name ? t('admin.links.defaultGroup', '默认') : link.group_name}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button onClick={() => openEdit(link)} className="text-primary-themed" style={{ padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <i className="fa-regular fa-pen" style={{ fontSize: '13px' }} />
                      </button>
                      <button onClick={() => setDeleteId(link.id)} style={{ padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                        <i className="fa-regular fa-trash" style={{ fontSize: '13px' }} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? t('admin.links.editLink', '编辑友链') : t('admin.links.addLink', '添加友链')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input label={t('admin.links.name', '名称')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t('admin.links.namePlaceholder', '站点名称')} />
            <div>
              <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.links.groups', '分类')}</label>
              <input
                className="input focus-ring"
                value={form.group_name}
                onChange={e => setForm({ ...form, group_name: e.target.value })}
                placeholder="default"
                list="link-groups"
              />
              <datalist id="link-groups">
                {existingGroups.map(g => <option key={g} value={g} />)}
              </datalist>
            </div>
          </div>

          <Input label={t('admin.links.url', '链接')} value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://example.com" />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.links.logo', '头像 / Logo')}</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {/* Preview */}
              {(form.logo || form.url) && (
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', background: 'var(--color-bg-soft)', flexShrink: 0 }}>
                  <img
                    src={form.logo || (form.url ? `https://favicon.im/${(() => { try { return new URL(form.url).hostname; } catch { return ''; } })()}?larger=true` : '')}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
              <input className="input focus-ring" style={{ flex: 1 }} value={form.logo} onChange={e => setForm({ ...form, logo: e.target.value })} placeholder={t('admin.links.logoPlaceholder', '留空自动获取 favicon')} />
              <label
                className="btn btn-secondary btn-toolbar-square"
                title={avatarUploading ? t('admin.media.uploading', '上传中...') : t('admin.links.uploadAvatar', '上传头像')}
                style={{ cursor: avatarUploading ? 'wait' : 'pointer' }}
              >
                <i className="fa-regular fa-cloud-arrow-up" style={{ fontSize: '14px' }} />
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} disabled={avatarUploading} />
              </label>
            </div>
            <p className="text-dim" style={{ fontSize: '11px', marginTop: '4px' }}>{t('admin.links.logoHint', '不填写则自动从 favicon.im 获取站点图标')}</p>
          </div>
          <Input label={t('admin.links.rssUrl', 'RSS 地址')} value={form.rss_url} onChange={e => setForm({ ...form, rss_url: e.target.value })} placeholder={t('admin.links.rssPlaceholder', 'https://example.com/feed（可选）')} />

          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.links.description', '描述')}</label>
            <textarea rows={2} className="input focus-ring" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={t('admin.links.descriptionPlaceholder', '简短介绍（可选）')} style={{ resize: 'vertical' }} />
          </div>

          <Input label={t('admin.common.sortOrder', '排序')} type="number" value={form.order_num} onChange={e => setForm({ ...form, order_num: Number(e.target.value) })} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>{t('admin.common.cancel', '取消')}</Button>
            <Button onClick={onSubmit} loading={submitting}>{editingId ? t('admin.common.save', '保存') : t('admin.common.create', '创建')}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title={t('admin.common.confirmDelete', '确认删除')} message={t('admin.links.confirmDelete', '是否确认删除此友情链接？')} />

      {/* Group Management Modal */}
      <Modal isOpen={showGroupModal} onClose={() => { setShowGroupModal(false); setEditingGroup(null); }} title={t('admin.links.groupManagement', '分类管理')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Existing groups */}
          {existingGroups.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {existingGroups.map(g => {
                const count = links.filter((l: any) => (l.group_name || 'default') === g).length;
                const isEditing = editingGroup?.old === g;
                return (
                  <div key={g} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--color-bg-soft)', borderRadius: '4px' }}>
                    {isEditing ? (
                      <input
                        className="input focus-ring"
                        value={editingGroup?.new ?? ''}
                        onChange={e => setEditingGroup({ old: editingGroup?.old ?? g, new: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') renameGroup(g, editingGroup?.new ?? ''); if (e.key === 'Escape') setEditingGroup(null); }}
                        onBlur={() => renameGroup(g, editingGroup?.new ?? '')}
                        autoFocus
                        style={{ flex: 1, fontSize: '13px', padding: '4px 8px' }}
                      />
                    ) : (
                      <span className="text-main" style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{g === 'default' ? t('admin.links.defaultGroup', '默认') : g}</span>
                    )}
                    <span className="text-dim" style={{ fontSize: '11px', flexShrink: 0 }}>{t('admin.links.countItems', '{count} 条', { count })}</span>
                    {g !== 'default' && !isEditing && (
                      <>
                        <button onClick={() => setEditingGroup({ old: g, new: g })} className="text-primary-themed" style={{ padding: '2px', background: 'none', border: 'none', cursor: 'pointer' }}>
                          <i className="fa-regular fa-pen" style={{ fontSize: '12px' }} />
                        </button>
                        <button onClick={() => deleteGroup(g)} style={{ padding: '2px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                          <i className="fa-regular fa-trash" style={{ fontSize: '12px' }} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-dim" style={{ fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>{t('admin.links.noGroups', '暂无分类')}</p>
          )}

          {/* Add new group */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="input focus-ring"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder={t('admin.links.newGroupPlaceholder', '输入新分类名称')}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGroup(); } }}
                style={{ flex: 1 }}
              />
              <Button variant="secondary" onClick={addGroup}>{t('admin.common.add', '添加')}</Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
