import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { themesApi, type ExtensionManifest } from '@/lib/api';
import { siteUrlOf } from '@/lib/site';
import FooterIconsEditor from '@/components/FooterIconsEditor';

export default function Themes() {
  const [themes, setThemes] = useState<ExtensionManifest[]>([]);
  const [active, setActive] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchList = async () => {
    setLoading(true);
    try {
      const r: any = await themesApi.list();
      const d = r.data || r;
      setThemes(d.themes || []);
      setActive(d.active || '');
    } catch {
      toast.error('获取主题列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error('请上传 .zip 格式的主题包');
      return;
    }
    setUploading(true);
    const tid = toast.loading('正在上传...');
    try {
      const r: any = await themesApi.upload(file);
      toast.success(`主题「${r.data?.name || r.name || '未命名'}」已安装`, { id: tid });
      fetchList();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || '上传失败', { id: tid });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleActivate = async (id: string) => {
    if (id === active) return;
    setActivating(id);
    try {
      await themesApi.activate(id);
      setActive(id);
      setThemes((prev) => prev.map((t) => ({ ...t, enabled: t.id === id })));
      toast.success('主题已切换');

      // Fire-and-forget revalidation on blog frontend — forces fresh theme load
      try {
        const revalidateUrl = siteUrlOf('/api/revalidate');
        await fetch(revalidateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: ['/'], tags: ['theme', 'options'] }),
        });
        toast.success('前台缓存已清除，新主题立即生效', { icon: '✨' });
      } catch {
        toast('前台缓存清除失败，访客下次访问后生效', { icon: 'ℹ️' });
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || '切换失败');
    } finally {
      setActivating(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteId(null);
    try {
      await themesApi.remove(id);
      toast.success('主题已删除');
      fetchList();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || '删除失败');
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="text-sub" style={{ fontSize: 13 }}>
          共 {themes.length} 个主题
          {active && (
            <>
              {' · 当前 '}
              <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                {themes.find((t) => t.id === active)?.name || active}
              </span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-icon" onClick={fetchList} disabled={loading} title="刷新列表">
            <i className="fa-regular fa-arrows-rotate" style={{ fontSize: 16 }} />
          </button>
          <button className="btn btn-primary btn-icon" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="上传主题 .zip">
            <i className="fa-regular fa-upload" style={{ fontSize: 16 }} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
        </div>
      </div>

      {/* Upload hint */}
      <div style={{
        padding: '12px 16px', marginBottom: 20,
        background: 'var(--color-bg-soft)',
        border: '1px solid var(--color-border)',
        fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-sub)',
      }}>
        <i className="fa-regular fa-lightbulb" style={{ marginRight: 6, color: 'var(--color-primary)' }} />
        主题包为 <code style={{ background: 'var(--color-bg-card)', padding: '1px 5px', fontSize: 11 }}>.zip</code> 格式，根目录包含 <code style={{ background: 'var(--color-bg-card)', padding: '1px 5px', fontSize: 11 }}>manifest.json</code>（含 <code>id / name / version</code>）。上传后自动解压到 <code style={{ background: 'var(--color-bg-card)', padding: '1px 5px', fontSize: 11 }}>themes/&lt;id&gt;/</code>。
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-dim" style={{ padding: 60, textAlign: 'center', fontSize: 13 }}>加载中...</div>
      ) : themes.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <i className="fa-regular fa-palette" style={{ fontSize: 32, color: 'var(--color-text-dim)', marginBottom: 12 }} />
          <p className="text-sub" style={{ fontSize: 13, margin: 0 }}>暂无主题，点「上传主题」安装第一个</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {themes.map((theme) => {
            const isActive = theme.id === active;
            return (
              <div
                key={theme.id}
                className="card"
                style={{
                  overflow: 'hidden', position: 'relative', padding: 0,
                  borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border)',
                  borderWidth: isActive ? 2 : 1,
                }}
              >
                <div style={{
                  aspectRatio: '16 / 9',
                  background: 'linear-gradient(135deg, var(--color-bg-soft) 0%, var(--color-bg) 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  position: 'relative',
                }}>
                  {/* Fallback layer — theme name + initial, shown before img loads or when img fails */}
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 6,
                    color: 'var(--color-text-dim)', pointerEvents: 'none',
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 4,
                      background: 'var(--color-primary)', opacity: 0.12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 700, color: 'var(--color-primary)',
                    }}>
                      {theme.name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <span style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{theme.name}</span>
                  </div>
                  {theme.preview && (
                    <img src={theme.preview} alt={theme.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'relative', zIndex: 1 }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                </div>

                {isActive && (
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    padding: '3px 8px', fontSize: 11, fontWeight: 600,
                    background: 'var(--color-primary)', color: '#fff',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <i className="fa-solid fa-check" style={{ fontSize: 10 }} /> 使用中
                  </div>
                )}

                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--color-text-main)' }}>
                      {theme.name}
                    </h3>
                    <span className="text-dim" style={{ fontSize: 11 }}>v{theme.version}</span>
                  </div>
                  {theme.author && (
                    <p className="text-dim" style={{ fontSize: 11, margin: '0 0 8px' }}>by {theme.author}</p>
                  )}
                  {theme.description && (
                    <p className="text-sub" style={{
                      fontSize: 12, lineHeight: 1.6, margin: '0 0 12px',
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                    }}>{theme.description}</p>
                  )}

                  <div style={{ display: 'flex', gap: 6 }}>
                    {isActive ? (
                      <button className="btn btn-secondary" disabled style={{ flex: 1, fontSize: 12, padding: '6px 10px' }}>
                        当前主题
                      </button>
                    ) : (
                      <button
                        className="btn"
                        disabled={activating === theme.id}
                        onClick={() => handleActivate(theme.id)}
                        style={{ flex: 1, fontSize: 12, padding: '6px 10px', justifyContent: 'center' }}
                      >
                        {activating === theme.id ? '切换中...' : '启用'}
                      </button>
                    )}
                    {theme.homepage && (
                      <a
                        href={theme.homepage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                        title="主页"
                        style={{ fontSize: 12, padding: '6px 10px' }}
                      >
                        <i className="fa-regular fa-up-right-from-square" style={{ fontSize: 11 }} />
                      </a>
                    )}
                    {!isActive && !theme.builtin && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => setDeleteId(theme.id)}
                        title="删除"
                        style={{ fontSize: 12, padding: '6px 10px', color: '#dc2626' }}
                      >
                        <i className="fa-regular fa-trash" style={{ fontSize: 11 }} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div
          onClick={() => setDeleteId(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ padding: 24, maxWidth: 380, width: '90%' }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>确认删除主题？</h3>
            <p className="text-sub" style={{ fontSize: 13, margin: '0 0 20px', lineHeight: 1.7 }}>
              将永久删除主题 <strong>{themes.find((t) => t.id === deleteId)?.name}</strong>，不可撤销。
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>取消</button>
              <button
                className="btn"
                onClick={() => handleDelete(deleteId)}
                style={{ background: '#dc2626', borderColor: '#dc2626' }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Theme settings: footer icon buttons (applies to all themes that read theme_footer_icons option) */}
      <FooterIconsEditor />
    </div>
  );
}
