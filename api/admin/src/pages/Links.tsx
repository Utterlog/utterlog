
import { useEffect, useState } from 'react';
import { linksApi, mediaApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Modal, ConfirmDialog, EmptyState } from '@/components/ui';

export default function LinksPage() {
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const r: any = await mediaApi.upload(file, 'avatars');
      const url = r.url || r.data?.url;
      if (url) setForm(prev => ({ ...prev, logo: url }));
    } catch { toast.error('上传失败'); }
    finally { setAvatarUploading(false); e.target.value = ''; }
  };

  const existingGroups = Array.from(new Set([
    ...links.map((l: any) => l.group_name || 'default'),
    ...customGroups,
  ]));

  const addGroup = () => {
    const g = newGroupName.trim();
    if (!g) return;
    if (existingGroups.includes(g)) { toast.error(`分类「${g}」已存在`); setNewGroupName(''); return; }
    setCustomGroups(prev => [...prev, g]);
    setNewGroupName('');
    toast.success(`分类「${g}」已添加`);
  };

  const renameGroup = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) { setEditingGroup(null); return; }
    const toUpdate = links.filter((l: any) => (l.group_name || 'default') === oldName);
    try {
      for (const link of toUpdate) {
        await linksApi.update(link.id, { ...link, group_name: newName.trim() });
      }
      toast.success(`分类「${oldName}」已重命名为「${newName}」`);
      setEditingGroup(null);
      fetchLinks();
    } catch { toast.error('重命名失败'); }
  };

  const deleteGroup = async (groupName: string) => {
    const toUpdate = links.filter((l: any) => (l.group_name || 'default') === groupName);
    try {
      for (const link of toUpdate) {
        await linksApi.update(link.id, { ...link, group_name: 'default' });
      }
      toast.success(`分类「${groupName}」已删除，${toUpdate.length} 条友链已移至默认分类`);
      if (activeGroup === groupName) setActiveGroup('all');
      fetchLinks();
    } catch { toast.error('删除失败'); }
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
    } catch { toast.error('获取友链失败'); }
    finally { setLoading(false); }
  };

  // Extract unique groups
  const groups = ['all', ...Array.from(new Set(links.map((l: any) => l.group_name || 'default')))];
  const filteredLinks = activeGroup === 'all' ? links : links.filter((l: any) => (l.group_name || 'default') === activeGroup);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', url: '', description: '', logo: '', rss_url: '', group_name: 'default', order_num: 0 });
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
    if (!form.name.trim() || !form.url.trim()) { toast.error('名称和链接不能为空'); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        await linksApi.update(editingId, form);
        toast.success('更新成功');
      } else {
        await linksApi.create(form);
        toast.success('创建成功');
      }
      setIsModalOpen(false);
      fetchLinks();
    } catch { toast.error(editingId ? '更新失败' : '创建失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await linksApi.delete(deleteId); toast.success('删除成功'); fetchLinks(); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  const groupLabel = (g: string) => g === 'all' ? '全部' : g === 'default' ? '默认' : g;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <span className="text-dim" style={{ fontSize: '13px' }}>共 {links.length} 条友链</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="secondary" onClick={() => setShowGroupModal(true)}>分类管理</Button>
          <Button onClick={openCreate}><i className="fa-regular fa-plus" style={{ fontSize: '16px' }} /> 添加友链</Button>
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
        <EmptyState title="暂无友链" description="添加您的第一个友情链接" actionText="添加友链" onAction={openCreate} />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th style={{ width: '36px' }}></th>
                <th style={{ width: '120px' }}>站点名称</th>
                <th>描述</th>
                <th>网址</th>
                <th>RSS</th>
                <th style={{ width: '80px' }}>分组</th>
                <th style={{ width: '72px', textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredLinks.map((link: any, i: number) => {
                const favicon = link.logo || (() => { try { return `https://ico.bluecdn.com/${new URL(link.url).hostname}`; } catch { return ''; } })();
                return (
                  <tr key={link.id} className="hover:bg-soft" style={{ transition: 'background-color 0.1s' }}>
                    <td className="text-dim" style={{ fontSize: '12px' }}>{i + 1}</td>
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
                    <td className="text-dim" style={{ fontSize: '12px' }}>{link.group_name === 'default' || !link.group_name ? '默认' : link.group_name}</td>
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
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑友链' : '添加友链'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input label="名称" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="站点名称" />
            <div>
              <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>分类</label>
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

          <Input label="链接" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://example.com" />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>头像 / Logo</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {/* Preview */}
              {(form.logo || form.url) && (
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', background: 'var(--color-bg-soft)', flexShrink: 0 }}>
                  <img
                    src={form.logo || (form.url ? `https://ico.bluecdn.com/${(() => { try { return new URL(form.url).hostname; } catch { return ''; } })()}` : '')}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
              <input className="input focus-ring" style={{ flex: 1 }} value={form.logo} onChange={e => setForm({ ...form, logo: e.target.value })} placeholder="留空自动获取 favicon" />
              <label
                className="btn btn-secondary btn-toolbar-square"
                title={avatarUploading ? '上传中...' : '上传头像'}
                style={{ cursor: avatarUploading ? 'wait' : 'pointer' }}
              >
                <i className="fa-regular fa-cloud-arrow-up" style={{ fontSize: '14px' }} />
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} disabled={avatarUploading} />
              </label>
            </div>
            <p className="text-dim" style={{ fontSize: '11px', marginTop: '4px' }}>不填写则自动从 ico.bluecdn.com 获取站点图标</p>
          </div>
          <Input label="RSS 地址" value={form.rss_url} onChange={e => setForm({ ...form, rss_url: e.target.value })} placeholder="https://example.com/feed（可选）" />

          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>描述</label>
            <textarea rows={2} className="input focus-ring" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="简短介绍（可选）" style={{ resize: 'vertical' }} />
          </div>

          <Input label="排序" type="number" value={form.order_num} onChange={e => setForm({ ...form, order_num: Number(e.target.value) })} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button onClick={onSubmit} loading={submitting}>{editingId ? '保存' : '创建'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="是否确认删除此友情链接？" />

      {/* Group Management Modal */}
      <Modal isOpen={showGroupModal} onClose={() => { setShowGroupModal(false); setEditingGroup(null); }} title="分类管理">
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
                      <span className="text-main" style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{g === 'default' ? '默认' : g}</span>
                    )}
                    <span className="text-dim" style={{ fontSize: '11px', flexShrink: 0 }}>{count} 条</span>
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
            <p className="text-dim" style={{ fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>暂无分类</p>
          )}

          {/* Add new group */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="input focus-ring"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="输入新分类名称"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGroup(); } }}
                style={{ flex: 1 }}
              />
              <Button variant="secondary" onClick={addGroup}>添加</Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
