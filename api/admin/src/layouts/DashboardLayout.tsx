import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import NotificationBell from '@/components/layout/NotificationBell';
import { useAuthStore } from '@/lib/store';
import { optionsApi } from '@/lib/api';

// Route-to-title map — displayed in header + document.title
const pageTitleMap: Record<string, string> = {
  '/': '仪表盘',
  '/posts': '文章管理',
  '/posts/create': '新建文章',
  '/posts/categories': '文章分类',
  '/posts/tags': '文章标签',
  '/pages': '页面管理',
  '/pages/create': '新建页面',
  '/moments': '说说管理',
  '/comments': '评论管理',
  '/follows': '关注管理',
  '/links': '友链管理',
  '/media': '媒体库',
  '/albums': '相册管理',
  '/music': '音乐管理',
  '/music/playlists': '歌单管理',
  '/playlists': '歌单管理',
  '/movies': '电影管理',
  '/videos': '视频管理',
  '/books': '图书管理',
  '/games': '游戏管理',
  '/goods': '好物管理',
  '/analytics': '数据统计',
  '/security': '安全设置',
  '/themes': '主题管理',
  '/plugins': '插件管理',
  '/tools': '工具',
  '/backup': '备份恢复',
  '/settings': '系统设置',
  '/profile': '个人资料',
  '/utterlog': 'Utterlog 网络',
  '/ai': 'AI 助手',
  '/ai/logs': 'AI 调用日志',
  '/ai-settings': 'AI 设置',
};

function resolveTitle(pathname: string): string {
  // Exact match first
  if (pageTitleMap[pathname]) return pageTitleMap[pathname];
  // Dynamic segments
  if (pathname.startsWith('/posts/edit/')) return '编辑文章';
  if (pathname.startsWith('/pages/edit/')) return '编辑页面';
  if (pathname.startsWith('/comments/')) {
    const s = pathname.split('/')[2];
    const map: Record<string, string> = { pending: '待审核评论', spam: '垃圾评论', trash: '回收站', mine: '我的评论' };
    return map[s] || '评论管理';
  }
  // Longest-prefix fallback
  const sorted = Object.keys(pageTitleMap).sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    if (p !== '/' && pathname.startsWith(p)) return pageTitleMap[p];
  }
  return '';
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [siteUrl, setSiteUrl] = useState('/');
  const [siteTitle, setSiteTitle] = useState('Utterlog');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const pageTitle = resolveTitle(pathname);

  useEffect(() => {
    optionsApi.list().then((r: any) => {
      const opts = r.data || r || {};
      if (opts.site_url) setSiteUrl(opts.site_url);
      if (opts.site_title) setSiteTitle(opts.site_title);
    }).catch(() => {});
  }, []);

  // Sync browser tab title: "页面标题 - 站点名称 | Utterlog"
  useEffect(() => {
    if (pageTitle) {
      document.title = `${pageTitle} - ${siteTitle} | Utterlog`;
    } else {
      document.title = `${siteTitle} | Utterlog`;
    }
  }, [pageTitle, siteTitle]);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    window.location.href = '/admin/login';
  };

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  // Full-width pages (editors / chat / any UI that benefits from full horizontal space)
  const fullWidth =
    pathname === '/posts/create' ||
    pathname.startsWith('/posts/edit/') ||
    pathname === '/pages/create' ||
    pathname.startsWith('/pages/edit/') ||
    pathname === '/ai' ||
    pathname.startsWith('/ai/');

  return (
    <div className="dashboard-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          className="bg-card"
          style={{
            height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0,
          }}
        >
          {/* Left: current page title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <h1 style={{
              fontSize: 15, fontWeight: 600, margin: 0,
              color: 'var(--color-text-main)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {pageTitle || '管理后台'}
            </h1>
          </div>

          {/* Right: actions + user */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="访问首页"
              className="text-sub"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, textDecoration: 'none',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-soft)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-sub)'; }}
            >
              <i className="fa-regular fa-house" style={{ fontSize: 14 }} />
            </a>

            <NotificationBell />

            <div style={{ width: 1, height: 20, background: 'var(--color-border)', margin: '0 6px' }} />

            {/* User menu (dropdown) */}
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px 5px 6px',
                  fontSize: 13, background: menuOpen ? 'var(--color-bg-soft)' : 'transparent',
                  border: 'none', cursor: 'pointer', color: 'var(--color-text-main)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (!menuOpen) e.currentTarget.style.background = 'var(--color-bg-soft)'; }}
                onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.background = 'transparent'; }}
              >
                {user?.avatar ? (
                  <img src={user.avatar} alt="" style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: '50%' }} />
                ) : (
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', background: 'var(--color-bg-card)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--color-border)',
                  }}>
                    <i className="fa-regular fa-user" style={{ fontSize: 11, color: 'var(--color-text-dim)' }} />
                  </div>
                )}
                <span style={{ fontWeight: 500 }}>{user?.nickname || user?.username || '管理员'}</span>
                <i className={`fa-solid fa-chevron-${menuOpen ? 'up' : 'down'}`} style={{ fontSize: 9, color: 'var(--color-text-dim)', marginLeft: 2 }} />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 6px)',
                    minWidth: 180,
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    zIndex: 50,
                    padding: '4px 0',
                  }}
                >
                  <div style={{ padding: '8px 14px 10px', borderBottom: '1px solid var(--color-divider)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-main)' }}>
                      {user?.nickname || user?.username}
                    </div>
                    {user?.email && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 2 }}>
                        {user.email}
                      </div>
                    )}
                  </div>

                  <MenuItem icon="fa-regular fa-user" label="个人资料" onClick={() => go('/profile')} />
                  <MenuItem icon="fa-regular fa-gear" label="系统设置" onClick={() => go('/settings')} />

                  <div style={{ height: 1, background: 'var(--color-divider)', margin: '4px 0' }} />

                  <MenuItem icon="fa-solid fa-right-from-bracket" label="退出登录" onClick={handleLogout} danger />
                </div>
              )}
            </div>
          </div>
        </header>

        <main
          className="bg-main"
          style={{
            flex: 1,
            minHeight: 0,
            overflowX: 'hidden',
            // Regular pages: always reserve scrollbar gutter (overflowY: scroll)
            // so page content doesn't shift when it grows past viewport height.
            // Full-width pages (editor/chat) manage their own scroll.
            overflowY: fullWidth ? 'hidden' : 'scroll',
          }}
        >
          {fullWidth ? (
            // Editor / chat / logs: fill the full viewport height, children handle internal scroll
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {children}
            </div>
          ) : (
            // Regular pages: centered with max-width
            <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 32px' }}>
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function MenuItem({
  icon, label, onClick, danger,
}: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '9px 14px', fontSize: 13, border: 'none', background: 'none',
        color: danger ? '#dc2626' : 'var(--color-text-main)',
        cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-soft)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <i className={icon} style={{ fontSize: 12, width: 14, textAlign: 'center', color: danger ? '#dc2626' : 'var(--color-text-sub)' }} />
      <span>{label}</span>
    </button>
  );
}
