
import { useEffect, useState } from 'react';
import { gamesApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Modal, ConfirmDialog } from '@/components/ui';
import { ImportUrlModal } from '@/components/ui/import-url-modal';

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {[1,2,3,4,5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
          <i className="fa-regular fa-star" style={{ fontSize: '18px', color: n <= value ? '#f59e0b' : 'var(--color-text-dim)' }} />
        </button>
      ))}
    </div>
  );
}

export default function GamesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try { const r: any = await gamesApi.list(); setItems(r.data || []); }
    catch { toast.error('加载失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditingId(null); setForm({ title: '', cover_url: '', rating: 0, comment: '', platform: '', status: 'publish' }); setIsModalOpen(true); };
  const openEdit = (item: any) => { setEditingId(item.id); setForm({ ...item }); setIsModalOpen(true); };

  const onSubmit = async () => {
    if (!form.title?.trim()) { toast.error('标题不能为空'); return; }
    setSubmitting(true);
    try {
      if (editingId) { await gamesApi.update(editingId, form); toast.success('更新成功'); }
      else { await gamesApi.create(form); toast.success('添加成功'); }
      setIsModalOpen(false); fetchData();
    } catch { toast.error('操作失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await gamesApi.delete(deleteId); toast.success('已删除'); fetchData(); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: 'auto' }}>
          <span className="text-dim" style={{ fontSize: '13px' }}>{items.length} 款游戏</span>
        </div>
        <Button variant="secondary" onClick={() => setShowImport(true)}>
          <i className="fa-light fa-link" style={{ fontSize: '13px' }} /> 链接导入
        </Button>
        <Button onClick={openCreate}><i className="fa-regular fa-plus" style={{ fontSize: '16px' }} />添加游戏</Button>
      </div>

      {loading ? (
        <div className="text-dim" style={{ textAlign: 'center', padding: '48px' }}>加载中...</div>
      ) : items.length === 0 ? (
        <div className="text-dim" style={{ textAlign: 'center', padding: '48px' }}>
          <p style={{ fontSize: '15px', marginBottom: '12px' }}>暂无内容</p>
          <Button onClick={openCreate}><i className="fa-regular fa-plus" style={{ fontSize: '16px' }} />添加游戏</Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
          {items.map((item: any) => (
            <div key={item.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {item.cover_url && (
                <img src={item.cover_url} alt={item.title} style={{ width: '100%', height: '160px', objectFit: 'cover' }} />
              )}
              <div style={{ padding: '12px' }}>
                <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600 }}>{item.title}</h3>
                {item.platform && <p className="text-dim" style={{ fontSize: '11px', marginTop: '2px' }}>{item.platform}</p>}
                {item.rating > 0 && (
                  <div style={{ display: 'flex', gap: '2px', marginTop: '6px' }}>
                    {[1,2,3,4,5].map(n => (
                      <i key={n} className="fa-regular fa-star" style={{ fontSize: '12px', color: n <= item.rating ? '#f59e0b' : '#ddd' }} />
                    ))}
                  </div>
                )}
                {item.comment && <p className="text-dim" style={{ fontSize: '12px', marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{item.comment}</p>}
                <div style={{ display: 'flex', gap: '4px', marginTop: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => openEdit(item)} className="text-primary-themed" style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer' }}><i className="fa-regular fa-pen" style={{ fontSize: '13px' }} /></button>
                  <button onClick={() => setDeleteId(item.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><i className="fa-regular fa-trash" style={{ fontSize: '13px' }} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑' : '添加游戏'} size="md">
        <div className="space-y-4">
          <Input label="标题" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} />
          <Input label="平台" value={form.platform || ''} onChange={e => setForm({ ...form, platform: e.target.value })} placeholder="Steam / PS5 / Switch / Xbox" />
          <Input label="封面图 URL" value={form.cover_url || ''} onChange={e => setForm({ ...form, cover_url: e.target.value })} />
          <Input label="链接" value={form.url || ''} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="Steam/NeoDB 链接" />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>评分</label>
            <StarRating value={form.rating || 0} onChange={v => setForm({ ...form, rating: v })} />
          </div>
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>评价</label>
            <textarea className="input" rows={3} value={form.comment || ''} onChange={e => setForm({ ...form, comment: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button onClick={onSubmit} loading={submitting}>{editingId ? '保存' : '添加'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除后无法恢复" />

      <ImportUrlModal isOpen={showImport} onClose={() => setShowImport(false)} type="game"
        platforms="NeoDB、Steam"
        onImport={(data) => {
          setForm({
            title: data.title || '', cover_url: data.cover_url || '',
            rating: Math.round(data.rating || 0), comment: data.summary || '',
            platform: data.extra?.genre || data.platform || '', url: data.url || '',
            status: 'publish',
          });
          setEditingId(null);
          setIsModalOpen(true);
        }}
      />
    </div>
  );
}
