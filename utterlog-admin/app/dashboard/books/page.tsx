'use client';

import { useEffect, useState } from 'react';
import { booksApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Modal, ConfirmDialog } from '@/components/ui';
import { BookOpen, Plus, Edit2, Trash2, Star } from '@/components/icons';

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {[1,2,3,4,5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
          <Star size={18} style={{ color: n <= value ? '#f59e0b' : 'var(--color-text-dim)', fill: n <= value ? '#f59e0b' : 'none' }} />
        </button>
      ))}
    </div>
  );
}

export default function booksPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try { const r: any = await booksApi.list(); setItems(r.data || []); }
    catch { toast.error('获取失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditingId(null); setForm({ title: '', cover_url: '', rating: 0, comment: '' }); setIsModalOpen(true); };
  const openEdit = (item: any) => { setEditingId(item.id); setForm({ ...item }); setIsModalOpen(true); };

  const onSubmit = async () => {
    if (!form.title?.trim()) { toast.error('标题不能为空'); return; }
    setSubmitting(true);
    try {
      if (editingId) { await booksApi.update(editingId, form); toast.success('更新成功'); }
      else { await booksApi.create(form); toast.success('添加成功'); }
      setIsModalOpen(false); fetchData();
    } catch { toast.error('操作失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await booksApi.delete(deleteId); toast.success('删除成功'); fetchData(); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  return (
    <div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen size={20} className="text-primary-themed" />
          <h1 className="text-main" style={{ fontSize: '18px', fontWeight: 700 }}>图书</h1>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Button onClick={openCreate}><Plus size={16} />添加图书</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-dim" style={{ textAlign: 'center', padding: '48px' }}>加载中...</div>
      ) : items.length === 0 ? (
        <div className="text-dim" style={{ textAlign: 'center', padding: '48px' }}>
          <p style={{ fontSize: '15px', marginBottom: '12px' }}>暂无内容</p>
          <Button onClick={openCreate}><Plus size={16} />添加图书</Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
          {items.map((item) => (
            <div key={item.id} className="card" style={{ overflow: 'hidden' }}>
              {item.cover_url && (
                <div style={{ width: '100%', height: '160px', backgroundColor: 'var(--color-bg-soft)', overflow: 'hidden' }}>
                  <img src={item.cover_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ padding: '14px' }}>
                <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{item.title}</h3>
                <p className="text-sub" style={{ fontSize: '12px', marginBottom: '6px' }}>{item.artist || item.director || item.author_name || item.brand || ''}</p>
                {item.rating > 0 && (
                  <div style={{ display: 'flex', gap: '2px', marginBottom: '6px' }}>
                    {[1,2,3,4,5].map((n) => <Star key={n} size={12} style={{ color: n <= item.rating ? '#f59e0b' : 'var(--color-text-dim)', fill: n <= item.rating ? '#f59e0b' : 'none' }} />)}
                  </div>
                )}
                {item.comment && <p className="text-dim" style={{ fontSize: '12px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.comment}</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', marginTop: '8px' }}>
                  <button onClick={() => openEdit(item)} className="text-primary-themed" style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer' }}><Edit2 size={14} /></button>
                  <button onClick={() => setDeleteId(item.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑' : '添加图书'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="标题" value={form.title || ''} onChange={(e) => setForm({...form, title: e.target.value})} />
          <Input label="作者" value={form.author_name || ""} onChange={(e) => setForm({...form, author_name: e.target.value})} />
          <div style={{ display: "flex", gap: "10px" }}>
            <Input label="出版社" value={form.publisher || ""} onChange={(e) => setForm({...form, publisher: e.target.value})} />
            <Input label="ISBN" value={form.isbn || ""} onChange={(e) => setForm({...form, isbn: e.target.value})} style={{ width: "140px" }} />
          </div>
          <div>
            <label className="text-sub" style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>阅读状态</label>
            <select className="input" value={form.progress || "want"} onChange={(e) => setForm({...form, progress: e.target.value})}>
              <option value="want">想读</option>
              <option value="reading">在读</option>
              <option value="finished">读完</option>
              <option value="abandoned">弃读</option>
            </select>
          </div>
          <Input label="豆瓣/NeoDB 链接" value={form.platform_url || ""} onChange={(e) => setForm({...form, platform_url: e.target.value})} />
          <Input label="封面图片 URL" value={form.cover_url || ''} onChange={(e) => setForm({...form, cover_url: e.target.value})} placeholder="https://..." />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>评分</label>
            <StarRating value={form.rating || 0} onChange={(v) => setForm({...form, rating: v})} />
          </div>
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>评价</label>
            <textarea className="input focus-ring" rows={3} value={form.comment || ''} onChange={(e) => setForm({...form, comment: e.target.value})} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button onClick={onSubmit} loading={submitting}>{editingId ? '保存' : '添加'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除后无法恢复" />
    </div>
  );
}
