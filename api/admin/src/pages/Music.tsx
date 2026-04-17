
import { useEffect, useState } from 'react';
import { musicApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Modal, ConfirmDialog, CoverInput } from '@/components/ui';
import api from '@/lib/api';
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

export default function MusicPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);
  const [showImport, setShowImport] = useState(false);

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

  // Search music via meting API
  const [searchPlatform, setSearchPlatform] = useState('netease');
  const doSearch = async () => {
    if (!keyword.trim()) return;
    setSearching(true);
    setSearchResults([]);
    const kw = encodeURIComponent(keyword);
    try {
      const resp = await fetch(`https://meting.yite.net/api/v1/${searchPlatform}/search?q=${kw}&page=1&limit=20`);
      const data = await resp.json();
      const items = data.items || data.songs || [];
      setSearchResults(items.map((d: any) => ({
        ...d,
        _src: { netease: '网易云', kugou: '酷狗', kuwo: '酷我', tencent: 'QQ音乐' }[searchPlatform] || searchPlatform,
        _platform: searchPlatform,
      })));
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  const addFromSearch = async (item: any) => {
    const key = item.id;
    setAdding(key);
    try {
      await musicApi.create({
        title: item.name || item.title,
        artist: item.artist || (item.artists || []).join(', '),
        album: item.album || '',
        platform: item._platform || 'netease',
        platform_id: String(item.id),
        cover_url: item.cover || '',
        play_url: item.url || '',
        status: 'publish',
      });
      toast.success(`已添加: ${item.name || item.title}`);
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
          <i className="fa-regular fa-magnifying-glass" style={{ fontSize: '14px' }} />{showSearch ? '关闭搜索' : '搜索添加'}
        </Button>
        <Button variant="secondary" onClick={() => setShowImport(true)}>
          <i className="fa-light fa-link" style={{ fontSize: '13px' }} /> 链接导入
        </Button>
        <Button onClick={openCreate}><i className="fa-regular fa-plus" style={{ fontSize: '16px' }} />手动添加</Button>
      </div>

      {/* Search panel */}
      {showSearch && (
        <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <select className="input" value={searchPlatform} onChange={e => setSearchPlatform(e.target.value)} style={{ width: '100px', flexShrink: 0, fontSize: '12px' }}>
              <option value="netease">网易云</option>
              <option value="tencent">QQ音乐</option>
            </select>
            <div style={{ flex: 1, position: 'relative' }}>
              <i className="fa-regular fa-magnifying-glass" style={{ fontSize: '14px', position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }} />
              <input
                className="input"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doSearch()}
                placeholder="搜索歌曲名或歌手..."
                style={{ paddingLeft: '32px' }}
              />
            </div>
            <Button className="btn-toolbar-square" title="搜索" onClick={doSearch} loading={searching}>
              <i className="fa-regular fa-magnifying-glass" style={{ fontSize: '14px' }} />
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div style={{ maxHeight: '300px', overflow: 'auto' }}>
              {searchResults.slice(0, 20).map((r: any, i: number) => {
                const key = String(r.id);
                const exists = items.some((it: any) => it.platform_id === key);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px',
                    borderBottom: '1px solid var(--color-divider)',
                  }}>
                    {r.cover && (
                      <img src={r.cover} alt="" style={{ width: '36px', height: '36px', objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{r.name || r.title}</p>
                      <p className="text-dim" style={{ fontSize: '11px', margin: '2px 0 0' }}>
                        {r.artist || (r.artists || []).join(', ')}
                        {r.album && <span> · {r.album}</span>}
                        <span style={{ marginLeft: '6px', padding: '0 4px', fontSize: '10px', background: 'var(--color-bg-soft)', borderRadius: '2px' }}>{r._src}</span>
                      </p>
                    </div>
                    {exists ? (
                      <span className="text-dim" style={{ fontSize: '12px' }}>已添加</span>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => addFromSearch(r)} loading={adding === key}>
                        <i className="fa-regular fa-plus" style={{ fontSize: '12px' }} />添加
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
          <Button onClick={() => setShowSearch(true)}><i className="fa-regular fa-magnifying-glass" style={{ fontSize: '16px' }} />搜索添加</Button>
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
                    <i className="fa-regular fa-music text-dim" style={{ fontSize: '32px' }} />
                  </div>
                )}
              </div>
              {/* Info */}
              <div style={{ padding: '12px', flex: 1 }}>
                <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</h3>
                <p className="text-sub" style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.artist || ''}</p>
                {item.rating > 0 && (
                  <div style={{ display: 'flex', gap: '2px', marginTop: '6px' }}>
                    {[1,2,3,4,5].map((n) => <i key={n} className="fa-regular fa-star" style={{ fontSize: '12px', color: n <= item.rating ? '#f59e0b' : 'var(--color-text-dim)' }} />)}
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
                    {item.status === 'publish' ? <i className="fa-regular fa-eye" style={{ fontSize: '14px' }} /> : <i className="fa-regular fa-eye-slash" style={{ fontSize: '14px' }} />}
                  </button>
                  <button onClick={() => openEdit(item)} className="text-primary-themed" style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer' }}><i className="fa-regular fa-pen" style={{ fontSize: '14px' }} /></button>
                  <button onClick={() => setDeleteId(item.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><i className="fa-regular fa-trash" style={{ fontSize: '14px' }} /></button>
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
          <CoverInput label="封面图片" value={form.cover_url || ''} onChange={(url) => setForm({...form, cover_url: url})} folder="music" />
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

      <ImportUrlModal isOpen={showImport} onClose={() => setShowImport(false)} type="music" onImport={(data) => {
        setForm({
          title: data.title || '', artist: data.artist || '', album: data.album || '',
          cover_url: data.cover_url || '', rating: Math.round(data.rating || 0),
          platform: data.platform || '', platform_id: '', play_url: data.url || '',
          comment: data.summary || '', status: 'publish',
        });
        setEditingId(null);
        setIsModalOpen(true);
      }} />
    </div>
  );
}
