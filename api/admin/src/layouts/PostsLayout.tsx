import { createContext, useContext, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

const ToolbarContext = createContext<{ setToolbar: (node: ReactNode) => void }>({ setToolbar: () => {} });

export function usePostsToolbar() {
  return useContext(ToolbarContext);
}

const tabs = [
  { to: '/posts', label: '文章', icon: 'fa-sharp fa-light fa-pen-to-square' },
  { to: '/posts/categories', label: '分类', icon: 'fa-sharp fa-light fa-folder-open' },
  { to: '/posts/tags', label: '标签', icon: 'fa-sharp fa-light fa-tags' },
];

export default function PostsLayout() {
  const { pathname } = useLocation();
  const [toolbar, setToolbar] = useState<ReactNode>(null);

  const isSubPage = pathname.includes('/create') || pathname.includes('/edit/');
  if (isSubPage) return <Outlet />;

  return (
    <ToolbarContext.Provider value={{ setToolbar }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-border)', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
            {tabs.map((tab) => {
              const isActive = tab.to === '/posts' ? pathname === '/posts' : pathname.startsWith(tab.to);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '10px 20px',
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--color-primary)' : 'var(--color-text-sub)',
                    borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                    textDecoration: 'none', transition: 'all 0.15s',
                  }}
                >
                  <i className={tab.icon} style={{ fontSize: 13 }} />
                  {tab.label}
                </Link>
              );
            })}
          </div>
          {toolbar && (
            <div style={{ marginLeft: 'auto', paddingRight: 4, display: 'flex', alignItems: 'center' }}>
              {toolbar}
            </div>
          )}
        </div>
        <Outlet />
      </div>
    </ToolbarContext.Provider>
  );
}
