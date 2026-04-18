import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import SystemStatusPanel from './SystemStatusPanel';

interface MenuItem {
  to: string;
  icon: string;
  label: string;
  sub?: string;
  children?: { to: string; icon: string; label: string }[];
}

const menuItems: MenuItem[] = [
  { to: '/', icon: 'fa-solid fa-gauge', label: '概览', sub: 'Dashboard' },
  {
    to: '/posts', icon: 'fa-solid fa-pen-to-square', label: '文章', sub: 'Posts',
    children: [
      { to: '/posts', label: '全部文章', icon: 'fa-regular fa-file-lines' },
      { to: '/posts/categories', label: '分类', icon: 'fa-regular fa-folder' },
      { to: '/posts/tags', label: '标签', icon: 'fa-regular fa-tag' },
    ],
  },
  { to: '/pages', icon: 'fa-regular fa-file-lines', label: '页面', sub: 'Pages' },
  { to: '/moments', icon: 'fa-solid fa-comment-dots', label: '说说', sub: 'Moments' },
  {
    to: '/music', icon: 'fa-solid fa-clapperboard', label: '娱乐', sub: 'Entertainment',
    children: [
      { to: '/music', label: '音乐', icon: 'fa-regular fa-music' },
      { to: '/movies', label: '电影', icon: 'fa-regular fa-film' },
      { to: '/videos', label: '视频', icon: 'fa-regular fa-video' },
      { to: '/books', label: '图书', icon: 'fa-regular fa-book' },
      { to: '/games', label: '游戏', icon: 'fa-regular fa-gamepad' },
      { to: '/goods', label: '好物', icon: 'fa-regular fa-bag-shopping' },
    ],
  },
  { to: '/follows', icon: 'fa-solid fa-user-group', label: '关注', sub: 'Follows' },
  { to: '/comments', icon: 'fa-regular fa-comments', label: '评论', sub: 'Comments' },
  { to: '/links', icon: 'fa-solid fa-link', label: '友链', sub: 'Links' },
  {
    to: '/media', icon: 'fa-regular fa-images', label: '媒体', sub: 'Media',
    children: [
      { to: '/media', label: '媒体库', icon: 'fa-regular fa-images' },
      { to: '/albums', label: '相册', icon: 'fa-regular fa-rectangle-history' },
    ],
  },
  { to: '/analytics', icon: 'fa-solid fa-chart-line', label: '统计', sub: 'Analytics' },
  { to: '/security', icon: 'fa-solid fa-shield-halved', label: '安全', sub: 'Security' },
  { to: '/themes', icon: 'fa-solid fa-palette', label: '主题', sub: 'Themes' },
  { to: '/plugins', icon: 'fa-solid fa-plug', label: '插件', sub: 'Plugins' },
  { to: '/tools', icon: 'fa-solid fa-screwdriver-wrench', label: '工具', sub: 'Tools' },
  { to: '/system/update', icon: 'fa-solid fa-cloud-arrow-down', label: '版本', sub: 'Update' },
  { to: '/settings', icon: 'fa-solid fa-gear', label: '设置', sub: 'Settings' },
];

const aiMenuItems: MenuItem[] = [
  { to: '/ai', icon: 'fa-solid fa-wand-magic-sparkles', label: 'AI 助手', sub: 'Assistant' },
  { to: '/ai-settings', icon: 'fa-solid fa-sliders', label: 'AI 设置', sub: 'AI Settings' },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: Props) {
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  const toggleExpand = (key: string) => {
    setExpandedMenus((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const renderMenuItem = (item: MenuItem) => {
    const hasChildren = !!item.children?.length;
    const expanded = expandedMenus.includes(item.to);

    if (hasChildren && !collapsed) {
      return (
        <div key={item.to}>
          <button
            onClick={() => toggleExpand(item.to)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '15px 14px', fontSize: 13, background: 'none', border: 'none',
              color: 'var(--color-text-sub)', cursor: 'pointer',
            }}
          >
            <i className={item.icon} style={{ fontSize: 14, width: 16, textAlign: 'center', flexShrink: 0 }} />
            <span style={{ flex: 1, textAlign: 'left', display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
              <span>{item.label}</span>
              {item.sub && (
                <span style={{ fontSize: 10, color: 'var(--color-text-dim)', fontWeight: 400, letterSpacing: '0.02em' }}>
                  {item.sub}
                </span>
              )}
            </span>
            <i className={`fa-solid fa-chevron-${expanded ? 'down' : 'right'}`} style={{ fontSize: 10 }} />
          </button>
          {expanded && item.children!.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px 8px 40px', fontSize: 12,
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-sub)',
                background: isActive ? 'var(--color-bg-soft)' : 'transparent',
                textDecoration: 'none',
              })}
            >
              <i className={child.icon} style={{ fontSize: 12, width: 14, textAlign: 'center' }} />
              <span>{child.label}</span>
            </NavLink>
          ))}
        </div>
      );
    }

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/'}
        style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', fontSize: 13,
          color: isActive ? 'var(--color-primary)' : 'var(--color-text-sub)',
          background: isActive ? 'var(--color-bg-soft)' : 'transparent',
          borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
          textDecoration: 'none',
          justifyContent: collapsed ? 'center' : 'flex-start',
        })}
        title={collapsed ? item.label : undefined}
      >
        <i className={item.icon} style={{ fontSize: 14, width: 16, textAlign: 'center', flexShrink: 0 }} />
        {!collapsed && (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span>{item.label}</span>
            {item.sub && (
              <span style={{ fontSize: 10, color: 'var(--color-text-dim)', fontWeight: 400, letterSpacing: '0.02em' }}>
                {item.sub}
              </span>
            )}
          </span>
        )}
      </NavLink>
    );
  };

  return (
    <aside
      className="bg-card"
      style={{
        width: collapsed ? 56 : 224,
        borderRight: '1px solid var(--color-border)',
        transition: 'width 0.2s',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{
        height: 56, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid var(--color-border)', position: 'relative',
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24">
          <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="var(--color-primary)" />
          <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
        </svg>
        {!collapsed && (
          <>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Utterlog!</span>
            <span style={{ fontSize: 9, padding: '1px 5px', background: 'var(--color-primary)', color: '#fff', fontWeight: 600 }}>v1.0</span>
          </>
        )}
        <button
          onClick={onToggle}
          style={{
            position: 'absolute', right: -12, top: '50%', transform: 'translateY(-50%)',
            width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--color-border)',
            background: 'var(--color-bg-card)', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 10, zIndex: 10,
            color: 'var(--color-text-dim)',
          }}
        >
          <i className={collapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-left'} />
        </button>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {menuItems.map(renderMenuItem)}

        {!collapsed && (
          <div style={{
            margin: '12px 12px 6px', fontSize: 10, fontWeight: 600,
            color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            AI
          </div>
        )}
        {aiMenuItems.map(renderMenuItem)}

        {/* Utterlog Network */}
        <div style={{ margin: '6px 0', borderTop: '1px solid var(--color-border)' }} />
        {!collapsed && (
          <p className="text-dim" style={{ fontSize: 11, padding: '4px 12px', fontWeight: 600, letterSpacing: 0.5 }}>
            Utterlog
          </p>
        )}
        <NavLink
          to="/utterlog"
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', fontSize: 13,
            color: isActive ? 'var(--color-primary)' : 'var(--color-text-sub)',
            background: isActive ? 'var(--color-bg-soft)' : 'transparent',
            borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
            textDecoration: 'none',
            justifyContent: collapsed ? 'center' : 'flex-start',
          })}
          title={collapsed ? 'Utterlog 中心' : undefined}
        >
          {({ isActive }) => (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill={isActive ? 'var(--color-primary)' : 'var(--color-text-dim)'} />
                <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
              </svg>
              {!collapsed && (
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  Utterlog 中心
                  <span style={{ fontSize: 10, color: 'var(--color-text-dim)', fontWeight: 400 }}>Network</span>
                </span>
              )}
            </>
          )}
        </NavLink>
      </nav>

      {/* System status panel (CPU / Memory / Disk / Uptime) */}
      <SystemStatusPanel isOpen={!collapsed} />
    </aside>
  );
}
