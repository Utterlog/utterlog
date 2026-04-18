import { createContext, useContext, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

const ToolbarContext = createContext<{ setToolbar: (node: ReactNode) => void }>({ setToolbar: () => {} });

export function usePostsToolbar() {
  return useContext(ToolbarContext);
}

// 文章 / 分类 / 标签 三个 tab 现在挂在 Sidebar 的 "文章" 菜单下
// (见 components/layout/Sidebar.tsx 的 children)，这里不再重复渲染。
// 只保留 toolbar 插槽，让 Posts / PostCategories / PostTags 在自己的
// 页面顶部右侧渲染 filter / search / new button 等。
export default function PostsLayout() {
  const { pathname } = useLocation();
  const [toolbar, setToolbar] = useState<ReactNode>(null);

  const isSubPage = pathname.includes('/create') || pathname.includes('/edit/');
  if (isSubPage) return <Outlet />;

  return (
    <ToolbarContext.Provider value={{ setToolbar }}>
      <div>
        {toolbar && (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            {toolbar}
          </div>
        )}
        <Outlet />
      </div>
    </ToolbarContext.Provider>
  );
}
