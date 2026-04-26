import { useEffect, useRef, useState } from 'react';
import { optionsApi, postsApi, categoriesApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui';

interface MenuItem {
  href: string;
  label: string;
  children?: MenuItem[];
}

// Built-in blog pages — slugs must mirror the route table in
// api/internal/handler and the theme's default menu. Kept in sync
// with Pages.tsx's builtinPages list.
const BUILTIN_PAGES: { label: string; href: string }[] = [
  { label: '首页',   href: '/' },
  { label: '关于',   href: '/about' },
  { label: '归档',   href: '/archives' },
  { label: '说说',   href: '/moments' },
  { label: '相册',   href: '/albums' },
  { label: '音乐',   href: '/music' },
  { label: '电影',   href: '/movies' },
  { label: '图书',   href: '/books' },
  { label: '好物',   href: '/goods' },
  { label: '友链',   href: '/links' },
  { label: '订阅',   href: '/feeds' },
];

type Position = { key: string; label: string; hint: string };

// Per-theme menu position map. Mirrors each theme.json's menuPositions
// array so the admin shows ONLY the positions the active theme actually
// renders — users don't get a 'sidebar' tab for a theme that has no
// sidebar, etc. Falls back to FALLBACK_POSITIONS for themes that aren't
// in this map (custom / uploaded themes).
const THEME_POSITIONS: Record<string, Position[]> = {
  Utterlog: [
    { key: 'header', label: '顶部导航', hint: 'Header 主菜单；留空则用主题默认菜单（首页/关于/归档/说说/友链/订阅）' },
  ],
  Azure: [
    { key: 'header', label: '顶部导航', hint: 'Header 主菜单；留空则用主题默认菜单（首页/关于/归档/说说/友链/订阅）' },
    { key: 'sidebar', label: '首页 Hero 侧边栏', hint: '首页左侧大图旁的导航 tab；留空则自动列出全部分类' },
  ],
  Flux: [
    { key: 'header', label: '顶部导航', hint: 'Header 主菜单' },
    { key: 'footer', label: '页脚导航', hint: 'Footer 辅助链接' },
  ],
  Chred: [
    { key: 'header', label: '顶部导航', hint: 'Header 主菜单' },
    { key: 'sidebar', label: '侧栏导航', hint: '首页左侧分类' },
  ],
};

const FALLBACK_POSITIONS: Position[] = [
  { key: 'header', label: '顶部导航', hint: '主题 Header 主菜单' },
  { key: 'sidebar', label: '侧栏导航', hint: '主题侧栏（如适用）' },
  { key: 'footer', label: '页脚导航', hint: '主题页脚（如适用）' },
];

const defaultHeaderMenu: MenuItem[] = [
  { href: '/', label: '首页' },
  { href: '/about', label: '关于' },
  { href: '/archives', label: '归档' },
  { href: '/moments', label: '说说' },
  { href: '/links', label: '友链' },
  { href: '/feeds', label: '订阅' },
];

function parseMenu(raw: string | undefined): MenuItem[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default function MenusPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menus, setMenus] = useState<Record<string, MenuItem[]>>({});
  const [positions, setPositions] = useState<Position[]>(FALLBACK_POSITIONS);
  const [activeTheme, setActiveTheme] = useState('');
  const [activePos, setActivePos] = useState('header');
  const [customPages, setCustomPages] = useState<{ id: number; title: string; slug: string }[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string; slug: string }[]>([]);
  const [pickerOpen, setPickerOpen] = useState<null | { target: 'root' | number }>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { fetchMenus(); fetchSources(); }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pickerOpen]);

  const fetchSources = async () => {
    try {
      const r: any = await postsApi.list({ limit: 200, type: 'page' } as any);
      const list = r.data?.posts || r.data || [];
      setCustomPages(list.map((p: any) => ({ id: p.id, title: p.title, slug: p.slug })));
    } catch { /* silent — picker just shows builtin pages */ }
    try {
      const r: any = await categoriesApi.list();
      const list = r.data?.categories || r.data || [];
      setCategories(list.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })));
    } catch { /* silent */ }
  };

  const fetchMenus = async () => {
    setLoading(true);
    try {
      const r: any = await optionsApi.list();
      const opts = r.data || r || {};
      const theme = (opts.active_theme || 'Utterlog').toString();
      const pos = THEME_POSITIONS[theme] || FALLBACK_POSITIONS;
      setActiveTheme(theme);
      setPositions(pos);
      // Keep the active tab pointing at something valid for this theme
      if (!pos.find(p => p.key === activePos)) setActivePos(pos[0]?.key || 'header');

      const next: Record<string, MenuItem[]> = {};
      pos.forEach(p => {
        next[p.key] = parseMenu(opts[`menu_${p.key}`]);
      });
      setMenus(next);
    } catch {
      toast.error('读取菜单失败');
    } finally {
      setLoading(false);
    }
  };

  const updateItems = (items: MenuItem[]) => {
    setMenus(prev => ({ ...prev, [activePos]: items }));
  };

  const addItem = () => {
    updateItems([...(menus[activePos] || []), { href: '/', label: '新项目' }]);
  };

  const addChild = (parentIdx: number) => {
    const items = [...(menus[activePos] || [])];
    const parent = { ...items[parentIdx] };
    parent.children = [...(parent.children || []), { href: '/', label: '子项目' }];
    items[parentIdx] = parent;
    updateItems(items);
  };

  // Add a picked page/category as either a new top-level item
  // (target === 'root') or as a child of the given parent index.
  const addPick = (label: string, href: string) => {
    if (!pickerOpen) return;
    const items = [...(menus[activePos] || [])];
    if (pickerOpen.target === 'root') {
      items.push({ href, label });
    } else {
      const parent = { ...items[pickerOpen.target] };
      parent.children = [...(parent.children || []), { href, label }];
      items[pickerOpen.target] = parent;
    }
    updateItems(items);
    setPickerOpen(null);
  };

  const updateItem = (idx: number, field: 'href' | 'label', value: string) => {
    const items = [...(menus[activePos] || [])];
    items[idx] = { ...items[idx], [field]: value };
    updateItems(items);
  };

  const updateChild = (parentIdx: number, childIdx: number, field: 'href' | 'label', value: string) => {
    const items = [...(menus[activePos] || [])];
    const parent = { ...items[parentIdx] };
    const children = [...(parent.children || [])];
    children[childIdx] = { ...children[childIdx], [field]: value };
    parent.children = children;
    items[parentIdx] = parent;
    updateItems(items);
  };

  const removeItem = (idx: number) => {
    const items = [...(menus[activePos] || [])];
    items.splice(idx, 1);
    updateItems(items);
  };

  const removeChild = (parentIdx: number, childIdx: number) => {
    const items = [...(menus[activePos] || [])];
    const parent = { ...items[parentIdx] };
    const children = [...(parent.children || [])];
    children.splice(childIdx, 1);
    parent.children = children.length ? children : undefined;
    items[parentIdx] = parent;
    updateItems(items);
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    const items = [...(menus[activePos] || [])];
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    [items[idx], items[target]] = [items[target], items[idx]];
    updateItems(items);
  };

  const resetToDefault = () => {
    if (activePos === 'header') {
      updateItems(defaultHeaderMenu);
    } else {
      updateItems([]);
    }
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      positions.forEach(p => {
        payload[`menu_${p.key}`] = JSON.stringify(menus[p.key] || []);
      });
      await optionsApi.updateMany(payload);
      toast.success('菜单已保存');
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-dim" style={{ padding: '40px', textAlign: 'center' }}>加载中...</div>;
  }

  const items = menus[activePos] || [];
  const posDef = positions.find(p => p.key === activePos);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <span className="text-dim" style={{ fontSize: '13px' }}>
          当前主题 <code style={{ color: 'var(--color-primary)' }}>{activeTheme || '—'}</code> 声明了 {positions.length} 个菜单位置
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <Button variant="secondary" onClick={resetToDefault}>
            <i className="fa-regular fa-rotate-left" style={{ fontSize: '13px' }} /> 重置默认
          </Button>
          <Button onClick={onSave} loading={saving}>
            <i className="fa-regular fa-floppy-disk" style={{ fontSize: '14px' }} /> 保存
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--color-border)', marginBottom: '20px' }}>
        {positions.map(p => (
          <button
            key={p.key}
            onClick={() => setActivePos(p.key)}
            style={{
              padding: '10px 18px', fontSize: '13px',
              fontWeight: activePos === p.key ? 600 : 400,
              color: activePos === p.key ? 'var(--color-primary)' : 'var(--color-text-sub)',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              borderBottom: activePos === p.key ? '2px solid var(--color-primary)' : '2px solid transparent',
              background: 'none', cursor: 'pointer',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="text-dim" style={{ fontSize: '12px', marginBottom: '16px' }}>{posDef?.hint}</p>

      <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.length === 0 ? (
          <div className="text-dim" style={{ padding: '32px', textAlign: 'center', fontSize: '13px' }}>
            暂无菜单项，点击下方"添加菜单项"开始
          </div>
        ) : items.map((item, idx) => (
          <div key={idx} style={{ border: '1px solid var(--color-border)', padding: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button onClick={() => moveItem(idx, -1)} disabled={idx === 0}
                  style={{ padding: '2px 6px', fontSize: '10px', background: 'none', border: '1px solid var(--color-border)', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.3 : 1 }}>
                  <i className="fa-solid fa-chevron-up" />
                </button>
                <button onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1}
                  style={{ padding: '2px 6px', fontSize: '10px', background: 'none', border: '1px solid var(--color-border)', cursor: idx === items.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === items.length - 1 ? 0.3 : 1 }}>
                  <i className="fa-solid fa-chevron-down" />
                </button>
              </div>
              <input
                className="input"
                style={{ flex: '0 0 200px', fontSize: '13px' }}
                value={item.label}
                onChange={e => updateItem(idx, 'label', e.target.value)}
                placeholder="菜单文本"
              />
              <input
                className="input"
                style={{ flex: 1, fontSize: '13px' }}
                value={item.href}
                onChange={e => updateItem(idx, 'href', e.target.value)}
                placeholder="/path 或 https://..."
              />
              <button onClick={() => setPickerOpen({ target: idx })} title="从已有页面添加子菜单"
                style={{ padding: '6px 10px', fontSize: '12px', background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', cursor: 'pointer' }}>
                <i className="fa-regular fa-list-tree" style={{ fontSize: '12px' }} />
              </button>
              <button onClick={() => addChild(idx)} title="添加空白子菜单"
                style={{ padding: '6px 10px', fontSize: '12px', background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', cursor: 'pointer' }}>
                <i className="fa-regular fa-diagram-subtask" style={{ fontSize: '12px' }} />
              </button>
              <button onClick={() => removeItem(idx)} title="删除"
                style={{ padding: '6px 10px', fontSize: '12px', background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer', color: '#dc2626' }}>
                <i className="fa-regular fa-trash" style={{ fontSize: '12px' }} />
              </button>
            </div>

            {!!item.children?.length && (
              <div style={{ marginTop: '10px', marginLeft: '40px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {item.children.map((child, cIdx) => (
                  <div key={cIdx} style={{ display: 'flex', gap: '8px' }}>
                    <input
                      className="input"
                      style={{ flex: '0 0 180px', fontSize: '12px' }}
                      value={child.label}
                      onChange={e => updateChild(idx, cIdx, 'label', e.target.value)}
                      placeholder="子菜单文本"
                    />
                    <input
                      className="input"
                      style={{ flex: 1, fontSize: '12px' }}
                      value={child.href}
                      onChange={e => updateChild(idx, cIdx, 'href', e.target.value)}
                      placeholder="/path"
                    />
                    <button onClick={() => removeChild(idx, cIdx)}
                      style={{ padding: '4px 8px', fontSize: '11px', background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer', color: '#dc2626' }}>
                      <i className="fa-regular fa-trash" style={{ fontSize: '11px' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-start', position: 'relative' }}>
          <Button variant="secondary" onClick={addItem}>
            <i className="fa-regular fa-plus" style={{ fontSize: '13px' }} /> 添加菜单项
          </Button>
          <Button variant="secondary" onClick={() => setPickerOpen({ target: 'root' })}>
            <i className="fa-regular fa-file-lines" style={{ fontSize: '13px' }} /> 从已有页面添加
          </Button>

          {pickerOpen && (
            <div
              ref={pickerRef}
              style={{
                position: 'absolute', top: '100%', left: 0, marginTop: '6px',
                width: '320px', maxHeight: '420px', overflowY: 'auto',
                background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)', zIndex: 10,
              }}
            >
              <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--color-border)' }}>
                内置页面
              </div>
              {BUILTIN_PAGES.map(p => (
                <button
                  key={p.href}
                  onClick={() => addPick(p.label, p.href)}
                  style={{ display: 'flex', width: '100%', padding: '8px 12px', fontSize: '13px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', alignItems: 'center', justifyContent: 'space-between' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span className="text-main">{p.label}</span>
                  <code style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{p.href}</code>
                </button>
              ))}

              {customPages.length > 0 && (
                <>
                  <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
                    自定义页面
                  </div>
                  {customPages.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addPick(p.title, `/${p.slug}`)}
                      style={{ display: 'flex', width: '100%', padding: '8px 12px', fontSize: '13px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', alignItems: 'center', justifyContent: 'space-between' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-soft)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <span className="text-main">{p.title}</span>
                      <code style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>/{p.slug}</code>
                    </button>
                  ))}
                </>
              )}

              {categories.length > 0 && (
                <>
                  <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
                    分类
                  </div>
                  {categories.map(c => (
                    <button
                      key={c.id}
                      onClick={() => addPick(c.name, `/category/${c.slug}`)}
                      style={{ display: 'flex', width: '100%', padding: '8px 12px', fontSize: '13px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', alignItems: 'center', justifyContent: 'space-between' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-soft)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <span className="text-main">{c.name}</span>
                      <code style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>/category/{c.slug}</code>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
