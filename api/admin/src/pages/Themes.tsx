import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { themesApi, type ExtensionManifest } from '@/lib/api';
import { siteUrlOf } from '@/lib/site';
import FooterIconsEditor from '@/components/FooterIconsEditor';
import MenusPage from './Menus';

export default function Themes() {
  const [tab, setTab] = useState<'themes' | 'menus' | 'footer'>('themes');
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

  // Tab bar — themes / menus / footer icons — so menu management
  // lives inside the same 主题 surface instead of a top-level sidebar
  // entry. Keeps related theme-customization controls together.
  const tabs: { key: typeof tab; label: string; icon: string }[] = [
    { key: 'themes', label: '主题', icon: 'fa-regular fa-palette' },
    { key: 'menus', label: '菜单', icon: 'fa-regular fa-list' },
    { key: 'footer', label: '页脚图标', icon: 'fa-regular fa-share-nodes' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border)', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 18px', fontSize: 13,
            fontWeight: tab === t.key ? 600 : 400,
            color: tab === t.key ? 'var(--color-primary)' : 'var(--color-text-sub)',
            border: 'none',
            borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'none', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <i className={t.icon} style={{ fontSize: 13 }} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'menus' && <MenusPage />}
      {tab === 'footer' && <FooterIconsEditor />}
      {tab === 'themes' && <>
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
          <button className="btn btn-secondary btn-square" onClick={fetchList} disabled={loading} title="刷新列表">
            <i className="fa-regular fa-arrows-rotate" style={{ fontSize: 14 }} />
          </button>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="上传主题 .zip">
            <i className="fa-regular fa-upload" style={{ fontSize: 14 }} />
            {uploading ? '上传中...' : '上传主题'}
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
                  borderRadius: 0,
                  borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border)',
                  borderWidth: 1,
                  display: 'flex', flexDirection: 'column',
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

                <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
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

                  {/* marginTop:auto pushes the action row to the bottom of
                      the card so every theme's button lines up regardless
                      of how long the description is. */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                    {isActive ? (
                      <button
                        className="btn btn-sm"
                        disabled
                        style={{
                          flex: 1,
                          background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                          color: 'var(--color-primary)',
                          borderColor: 'var(--color-primary)',
                          opacity: 1,
                        }}
                      >
                        <i className="fa-solid fa-check" style={{ fontSize: 12 }} /> 当前主题
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={activating === theme.id}
                        onClick={() => handleActivate(theme.id)}
                        style={{ flex: 1 }}
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

      </>}
    </div>
  );
}
