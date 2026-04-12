'use client';

import { useEffect, useState } from 'react';
import { musicApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Modal, ConfirmDialog } from '@/components/ui';
import { MusicNote, Plus, Edit2, Trash2, Star, Search, Eye, EyeOff } from '@/components/icons';
import api from '@/lib/api';

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

export default function MusicPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try { const r: any = await musicApi.list(); setItems(r.data || []); }
    catch { toast.error('获取失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditingId(null); setForm({ title: '', cover_url: '', rating: 0, comment: '', status: 'publish' }); setIsModalOpen(true); };
  const openEdit = (item: any) => { setEditingId(item.id); setForm({ ...item }); setIsModalOpen(true); };

  const onSubmit = async () => {
    if (!form.title?.trim()) { toast.error('标题不能为空'); return; }
    setSubmitting(true);
    try {
      if (editingId) { await musicApi.update(editingId, form); toast.success('更新成功'); }
      else { await musicApi.create(form); toast.success('添加成功'); }
      setIsModalOpen(false); fetchData();
    } catch { toast.error('操作失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await musicApi.delete(deleteId); toast.success('删除成功'); fetchData(); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  const toggleVisibility = async (item: any) => {
    const newStatus = item.status === 'publish' ? 'draft' : 'publish';
    try {
      await musicApi.update(item.id, { ...item, status: newStatus });
      toast.success(newStatus === 'publish' ? '已显示' : '已隐藏');
      fetchData();
    } catch { toast.error('操作失败'); }
  };

  // Search music from platforms
  const doSearch = async () => {
    if (!keyword.trim()) return;
    setSearching(true);
    setSearchResults([]);
    const kw = encodeURIComponent(keyword);
    try {
      const [r1, r2]: any[] = await Promise.allSettled([
        api.get(`/music/search?server=netease&keyword=${kw}`),
        api.get(`/music/search?server=kugou&keyword=${kw}`),
      ]);
      const all: any[] = [];
      if (r1.status === 'fulfilled' && r1.value?.success) all.push(...r1.value.data.map((d: any) => ({ ...d, _src: '网易云', _platform: 'netease' })));
      if (r2.status === 'fulfilled' && r2.value?.success) all.push(...r2.value.data.map((d: any) => ({ ...d, _src: '酷狗', _platform: 'kugou' })));
      setSearchResults(all);
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  const addFromSearch = async (item: any) => {
    const key = item.url_id || item.id;
    setAdding(key);
    try {
      await musicApi.create({
        title: item.title,
        artist: item.artist,
        platform: item._platform || item.platform || 'netease',
        platform_id: item.url_id || item.id,
        cover_url: '',
        status: 'publish',
      });
      toast.success(`已添加: ${item.title}`);
      fetchData();
    } catch { toast.error('添加失败'); }
    setAdding(null);
  };

  return (
    <div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: 'auto' }}>
          <span className="text-dim" style={{ fontSize: '13px' }}>{items.length} 首歌曲</span>
        </div>
        <Button variant="secondary" onClick={() => setShowSearch(!showSearch)}>
          <Search size={14} />{showSearch ? '关闭搜索' : '搜索添加'}
        </Button>
        <Button onClick={openCreate}><Plus size={16} />手动添加</Button>
      </div>

      {/* Search panel */}
      {showSearch && (
        <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }} />
              <input
                className="input"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doSearch()}
                placeholder="搜索歌曲名或歌手..."
                style={{ paddingLeft: '32px' }}
              />
            </div>
            <Button onClick={doSearch} loading={searching}>搜索</Button>
          </div>

          {searchResults.length > 0 && (
            <div style={{ maxHeight: '300px', overflow: 'auto' }}>
              {searchResults.slice(0, 20).map((r, i) => {
                const key = r.url_id || r.id;
                const exists = items.some(it => it.platform_id === key);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px',
                    borderBottom: '1px solid var(--color-divider)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{r.title}</p>
                      <p className="text-dim" style={{ fontSize: '11px', margin: '2px 0 0' }}>
                        {r.artist}
                        <span style={{ marginLeft: '6px', padding: '0 4px', fontSize: '10px', background: 'var(--color-bg-soft)', borderRadius: '2px' }}>{r._src}</span>
                      </p>
                    </div>
                    {exists ? (
                      <span className="text-dim" style={{ fontSize: '12px' }}>已添加</span>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => addFromSearch(r)} loading={adding === key}>
                        <Plus size={12} />添加
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {searchResults.length === 0 && keyword && !searching && (
            <p className="text-dim" style={{ textAlign: 'center', fontSize: '13px', padding: '16px 0' }}>无搜索结果</p>
          )}
        </div>
      )}

      {/* Music list */}
      {loading ? (
        <div className="text-dim" style={{ textAlign: 'center', padding: '48px' }}>加载中...</div>
      ) : items.length === 0 ? (
        <div className="text-dim" style={{ textAlign: 'center', padding: '48px' }}>
          <p style={{ fontSize: '15px', marginBottom: '12px' }}>暂无内容</p>
          <Button onClick={() => setShowSearch(true)}><Search size={16} />搜索添加</Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
          {items.map((item) => (
            <div key={item.id} className="card" style={{
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
              opacity: item.status === 'draft' ? 0.5 : 1,
              transition: 'opacity 0.2s',
            }}>
              {/* Cover */}
              <div style={{ width: '100%', height: '200px', backgroundColor: 'var(--color-bg-soft)', overflow: 'hidden', flexShrink: 0 }}>
                {item.cover_url ? (
                  <img src={item.cover_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MusicNote size={32} className="text-dim" />
                  </div>
                )}
              </div>
              {/* Info */}
              <div style={{ padding: '12px', flex: 1 }}>
                <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</h3>
                <p className="text-sub" style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.artist || ''}</p>
                {item.rating > 0 && (
                  <div style={{ display: 'flex', gap: '2px', marginTop: '6px' }}>
                    {[1,2,3,4,5].map((n) => <Star key={n} size={12} style={{ color: n <= item.rating ? '#f59e0b' : 'var(--color-text-dim)', fill: n <= item.rating ? '#f59e0b' : 'none' }} />)}
                  </div>
                )}
              </div>
              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderTop: '1px solid var(--color-divider)', flexShrink: 0 }}>
                <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '3px', background: 'var(--color-bg-soft)', color: 'var(--color-text-dim)' }}>
                  {{ netease: '网易云', tencent: 'QQ', kugou: '酷狗', kuwo: '酷我', baidu: '百度', local: '本地' }[item.platform as string] || item.platform || '本地'}
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => toggleVisibility(item)} title={item.status === 'publish' ? '隐藏' : '显示'} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)' }}>
                    {item.status === 'publish' ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button onClick={() => openEdit(item)} className="text-primary-themed" style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer' }}><Edit2 size={14} /></button>
                  <button onClick={() => setDeleteId(item.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑' : '添加音乐'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="标题" value={form.title || ''} onChange={(e) => setForm({...form, title: e.target.value})} />
          <Input label="艺术家" value={form.artist || ""} onChange={(e) => setForm({...form, artist: e.target.value})} />
          <Input label="专辑" value={form.album || ""} onChange={(e) => setForm({...form, album: e.target.value})} />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>来源平台</label>
            <select className="input" value={form.platform || 'netease'} onChange={(e) => setForm({...form, platform: e.target.value})}>
              <option value="netease">网易云音乐</option>
              <option value="tencent">QQ音乐</option>
              <option value="kugou">酷狗音乐</option>
              <option value="kuwo">酷我音乐</option>
              <option value="local">本地</option>
            </select>
          </div>
          <Input label="平台歌曲 ID" value={form.platform_id || ""} onChange={(e) => setForm({...form, platform_id: e.target.value})} placeholder="可选，用于获取歌词和封面" />
          <Input label="播放链接" value={form.play_url || ""} onChange={(e) => setForm({...form, play_url: e.target.value})} placeholder="直接音频链接（可选）" />
          <Input label="封面图片 URL" value={form.cover_url || ''} onChange={(e) => setForm({...form, cover_url: e.target.value})} placeholder="https://..." />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>状态</label>
            <select className="input" value={form.status || 'publish'} onChange={(e) => setForm({...form, status: e.target.value})}>
              <option value="publish">显示</option>
              <option value="draft">隐藏</option>
            </select>
          </div>
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
