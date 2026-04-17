
import { useEffect, useState } from 'react';
import { momentsApi, optionsApi, mediaApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Modal, ConfirmDialog } from '@/components/ui';

export default function MomentsPage() {
  const [moments, setMoments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ content: '', location: '', mood: '', images: '', visibility: 'public' });
  const [formImages, setFormImages] = useState<string[]>([]);
  const [imgUploading, setImgUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Tag management
  const [tags, setTags] = useState<string[]>(['随想', '技术', '生活', '阅读']);
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTag, setNewTag] = useState('');

  useEffect(() => { fetchData(); fetchTags(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try { const r: any = await momentsApi.list(); setMoments(r.data || []); }
    catch { toast.error('获取失败'); }
    finally { setLoading(false); }
  };

  const fetchTags = async () => {
    try {
      const r: any = await optionsApi.get('moment_tags');
      const val = r.data?.value || r.value || '';
      if (val) setTags(val.split(',').map((t: string) => t.trim()).filter(Boolean));
    } catch {
      // 404 = option not created yet, use defaults already set in state
    }
  };

  const saveTags = async (newTags: string[]) => {
    setTags(newTags);
    try {
      await optionsApi.update('moment_tags', newTags.join(','));
    } catch {
      toast.error('保存标签失败');
    }
  };

  const addTag = () => {
    const t = newTag.trim();
    if (!t || tags.includes(t)) { setNewTag(''); return; }
    saveTags([...tags, t]);
    setNewTag('');
    toast.success(`已添加标签「${t}」`);
  };

  const removeTag = (tag: string) => {
    saveTags(tags.filter(t => t !== tag));
  };

  const parseImages = (m: any): string[] => {
    if (!m.images) return [];
    if (Array.isArray(m.images)) return m.images;
    if (typeof m.images === 'string') {
      let str = m.images;
      // Decode base64 (Go backend encodes pg arrays as base64)
      if (/^[A-Za-z0-9+/]+=*$/.test(str) && !str.startsWith('http') && !str.startsWith('{')) {
        try { str = atob(str); } catch {}
      }
      // PostgreSQL array literal: {url1,url2}
      if (str.startsWith('{') && str.endsWith('}')) {
        const inner = str.slice(1, -1);
        if (!inner) return [];
        return inner.split(',').map((s: string) => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
      }
      try { const p = JSON.parse(str); if (Array.isArray(p)) return p; } catch {}
      return str.split(',').map((s: string) => s.trim()).filter((s: string) => s.startsWith('http'));
    }
    return [];
  };

  const openCreate = () => { setEditingId(null); setForm({ content: '', location: '', mood: '', images: '', visibility: 'public' }); setFormImages([]); setIsModalOpen(true); };
  const openEdit = (m: any) => { setEditingId(m.id); const imgs = parseImages(m); setFormImages(imgs); setForm({ content: m.content, location: m.location || '', mood: m.mood || '', images: '', visibility: m.visibility }); setIsModalOpen(true); };

  const handleImgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setImgUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const r: any = await mediaApi.upload(files[i], 'moments');
        const url = r.url || r.data?.url;
        if (url) setFormImages(prev => [...prev, url]);
      }
    } catch { toast.error('上传失败'); }
    finally { setImgUploading(false); e.target.value = ''; }
  };

  const removeFormImage = (idx: number) => setFormImages(prev => prev.filter((_, i) => i !== idx));

  const onSubmit = async () => {
    if (!form.content.trim()) { toast.error('内容不能为空'); return; }
    setSubmitting(true);
    const payload = { ...form, images: formImages.length > 0 ? formImages : [] };
    try {
      if (editingId) { await momentsApi.update(editingId, payload); toast.success('更新成功'); }
      else { await momentsApi.create(payload); toast.success('发布成功'); }
      setIsModalOpen(false); fetchData();
    } catch { toast.error('操作失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await momentsApi.delete(deleteId); toast.success('删除成功'); fetchData(); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  const formatTime = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <span className="text-dim" style={{ fontSize: '13px' }}>共 {moments.length} 条说说</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <Button variant="secondary" onClick={() => setShowTagManager(!showTagManager)}>
            <i className="fa-regular fa-tags" style={{ fontSize: '16px' }} />关键词管理
          </Button>
          <Button onClick={openCreate}><i className="fa-regular fa-plus" style={{ fontSize: '16px' }} />发布说说</Button>
        </div>
      </div>

      {/* Tag Manager */}
      {showTagManager && (
        <div className="card" style={{ padding: '20px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>说说关键词管理</h3>
          <p className="text-dim" style={{ fontSize: '12px', marginBottom: '16px' }}>管理前台说说发布时可选的关键词标签，发布后显示在卡片右上角</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {tags.map(tag => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '5px 12px', borderRadius: '16px', fontSize: '13px',
                  background: 'var(--color-bg-soft)', color: 'var(--color-text-sub)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text-dim)', display: 'flex' }}
                >
                  <i className="fa-solid fa-xmark" style={{ fontSize: '12px' }} />
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              className="input focus-ring"
              placeholder="输入新关键词"
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              style={{ width: '180px' }}
            />
            <Button variant="secondary" onClick={addTag}>添加</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-dim" style={{ textAlign: 'center', padding: '48px' }}>加载中...</div>
      ) : moments.length === 0 ? (
        <div className="text-dim" style={{ textAlign: 'center', padding: '48px' }}>
          <p style={{ fontSize: '15px', marginBottom: '12px' }}>还没有说说</p>
          <Button onClick={openCreate}><i className="fa-regular fa-plus" style={{ fontSize: '16px' }} />发第一条</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {moments.map((m) => (
            <div key={m.id} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <p className="text-main" style={{ fontSize: '14px', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{m.content}</p>
                  {parseImages(m).length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                      {parseImages(m).map((url: string, idx: number) => (
                        <img key={idx} src={url} alt="" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
                      ))}
                    </div>
                  )}
                  <div className="text-dim" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginTop: '10px' }}>
                    <span>{formatTime(m.created_at)}</span>
                    {m.location && <><span>&middot;</span><i className="fa-regular fa-location-dot" style={{ fontSize: '12px' }} /><span>{m.location}</span></>}
                    {m.mood && (
                      <>
                        <span>&middot;</span>
                        <span style={{
                          padding: '1px 8px', borderRadius: '8px', fontSize: '11px',
                          background: 'var(--color-bg-soft)', color: 'var(--color-primary)',
                          fontWeight: 500,
                        }}>{m.mood}</span>
                      </>
                    )}
                    {m.visibility !== 'public' && <><span>&middot;</span><span>{m.visibility === 'private' ? '仅自己' : '不公开'}</span></>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '12px' }}>
                  <button onClick={() => openEdit(m)} className="text-primary-themed" style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer' }}><i className="fa-regular fa-pen" style={{ fontSize: '14px' }} /></button>
                  <button onClick={() => setDeleteId(m.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><i className="fa-regular fa-trash" style={{ fontSize: '14px' }} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑说说' : '发布说说'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <textarea className="input focus-ring" rows={5} placeholder="说点什么..." value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ resize: 'vertical' }} />

          {/* Image upload */}
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>图片附件</label>
            {formImages.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {formImages.map((url, idx) => (
                  <div key={idx} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => removeFormImage(idx)} style={{ position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="fa-solid fa-xmark" style={{ fontSize: '8px' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label
              className="btn btn-secondary btn-toolbar-square"
              title={imgUploading ? '上传中...' : '上传图片'}
              style={{ cursor: imgUploading ? 'wait' : 'pointer', opacity: imgUploading ? 0.6 : 1 }}
            >
              <i className="fa-regular fa-cloud-arrow-up" style={{ fontSize: '14px' }} />
              <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImgUpload} disabled={imgUploading} />
            </label>
          </div>

          {/* Tag selector */}
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>关键词</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {tags.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setForm({ ...form, mood: form.mood === tag ? '' : tag })}
                  style={{
                    padding: '4px 12px', borderRadius: '14px', fontSize: '12px',
                    border: `1px solid ${form.mood === tag ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    color: form.mood === tag ? 'var(--color-primary)' : 'var(--color-text-sub)',
                    background: form.mood === tag ? 'rgba(var(--color-primary-rgb,0,0,0),0.06)' : 'transparent',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  {tag}
                </button>
              ))}
              <input
                className="input focus-ring"
                placeholder="自定义"
                value={tags.includes(form.mood) ? '' : form.mood}
                onChange={e => setForm({ ...form, mood: e.target.value })}
                style={{ width: '80px', fontSize: '12px', padding: '4px 8px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input className="input focus-ring" placeholder="位置（可选）" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={{ flex: 1 }} />
          </div>
          <select className="input" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
            <option value="public">公开</option>
            <option value="unlisted">不公开</option>
            <option value="private">仅自己</option>
          </select>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button onClick={onSubmit} loading={submitting}>{editingId ? '保存' : '发布'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除后无法恢复" />
    </div>
  );
}
