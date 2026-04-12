'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import {
  Bell, LogOut, ChevronDown, User,
  LayoutDashboard, FileText, Pen, MusicNote, MessageSquare,
  LinkIcon, ImageIcon, Shield, Settings, Sparkles,
} from '@/components/icons';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';
import NotificationBell from '@/components/layout/NotificationBell';
import { useState, useEffect } from 'react';

const pageTitles: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/dashboard/posts': '文章管理',
  '/dashboard/pages': '页面管理',
  '/dashboard/posts/draft': '文章管理',
  '/dashboard/posts/private': '文章管理',
  '/dashboard/posts/categories': '文章管理',
  '/dashboard/posts/tags': '文章管理',
  '/dashboard/posts/create': '新建文章',
  '/dashboard/moments': '说说',
  '/dashboard/music': '音乐管理',
  '/dashboard/music/playlists': '音乐管理',
  '/dashboard/categories': '分类管理',
  '/dashboard/tags': '标签管理',
  '/dashboard/follows': '关注管理',
  '/dashboard/comments': '评论管理',
  '/dashboard/links': '友链管理',
  '/dashboard/media': '媒体库',
  '/dashboard/analytics': '访问统计',
  '/dashboard/security': '安全',
  '/dashboard/themes': '主题',
  '/dashboard/plugins': '插件',
  '/dashboard/backup': '备份',
  '/dashboard/settings': '系统设置',
  '/dashboard/profile': '个人资料',
  '/dashboard/ai': 'AI 助手',
  '/dashboard/ai-settings': 'AI 设置',
  '/dashboard/ai/logs': 'AI 使用统计',
};

const pageIcons: Record<string, React.ComponentType<any>> = {
  '/dashboard': LayoutDashboard,
  '/dashboard/posts': FileText,
  '/dashboard/posts/categories': FileText,
  '/dashboard/posts/tags': FileText,
  '/dashboard/posts/create': FileText,
  '/dashboard/pages': FileText,
  '/dashboard/moments': Pen,
  '/dashboard/music': MusicNote,
  '/dashboard/music/playlists': MusicNote,
  '/dashboard/comments': MessageSquare,
  '/dashboard/links': LinkIcon,
  '/dashboard/media': ImageIcon,
  '/dashboard/system': Shield,
  '/dashboard/analytics': LinkIcon,
  '/dashboard/security': Shield,
  '/dashboard/themes': ImageIcon,
  '/dashboard/plugins': Settings,
  '/dashboard/settings': Settings,
  '/dashboard/profile': User,
  '/dashboard/ai': Sparkles,
  '/dashboard/ai-settings': Settings,
  '/dashboard/ai/logs': Sparkles,
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith('/dashboard/posts/edit/')) return '编辑文章';
  if (pathname.startsWith('/dashboard/pages/edit/')) return '编辑页面';
  if (pathname === '/dashboard/pages/create') return '新建页面';
  return '';
}

function getPageIcon(pathname: string): React.ComponentType<any> | null {
  if (pageIcons[pathname]) return pageIcons[pathname];
  if (pathname.startsWith('/dashboard/posts/edit/')) return FileText;
  return null;
}

function useGravatarUrl(email?: string, size = 56) {
  const [url, setUrl] = useState(`https://gravatar.bluecdn.com/avatar/?d=mp&s=${size}`);
  useEffect(() => {
    if (!email) return;
    const normalized = email.trim().toLowerCase();
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized)).then((buf) => {
      // Gravatar actually uses MD5, but also supports SHA256 since 2024
      const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      setUrl(`https://gravatar.bluecdn.com/avatar/${hash}?d=mp&s=${size}`);
    }).catch(() => {});
  }, [email, size]);
  return url;
}

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const avatarUrl = useGravatarUrl(user?.email);
  const pageTitle = getPageTitle(pathname);
  const PageIcon = getPageIcon(pathname);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <header className="h-14 bg-card border-b border-line flex items-center justify-between" style={{ paddingLeft: '32px', paddingRight: '24px' }}>
      <div className="flex items-center gap-2">
        {PageIcon && <PageIcon size={18} style={{ color: 'var(--color-primary)' }} />}
        {pageTitle && <h1 style={{ fontSize: '16px', fontWeight: 700 }}>{pageTitle}</h1>}
      </div>

      <div className="flex items-center gap-3">
        {/* Theme switcher */}
        <ThemeSwitcher />

        {/* Notifications */}
        <NotificationBell />

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 p-1.5 rounded-[4px] btn-ghost"
          >
            <img
              src={avatarUrl}
              alt=""
              style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
            />
            <span className="text-sm font-medium text-main hidden sm:inline">
              {user?.nickname || user?.username}
            </span>
            <ChevronDown size={14} className="text-dim" />
          </button>

          {showDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
              <div className="absolute right-0 top-full z-20" style={{
                marginTop: '8px', width: '220px',
                background: 'var(--color-bg-card)', borderRadius: '1px',
                border: '1px solid var(--color-border)',
                boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                overflow: 'hidden',
              }}>
                {/* User info */}
                <div style={{ padding: '16px', borderBottom: '1px solid var(--color-divider)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img src={avatarUrl} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--color-bg-soft)' }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.nickname || user?.username}</p>
                    <p className="text-dim" style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
                  </div>
                </div>
                {/* Menu items */}
                <div style={{ padding: '6px' }}>
                  <button
                    onClick={() => { setShowDropdown(false); router.push('/dashboard/profile'); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', fontSize: '13px', borderRadius: '1px',
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                      color: 'var(--color-text-sub)', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-soft)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <User size={16} />
                    个人资料
                  </button>
                  <button
                    onClick={() => { setShowDropdown(false); router.push('/dashboard/settings'); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', fontSize: '13px', borderRadius: '1px',
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                      color: 'var(--color-text-sub)', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-soft)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <Settings size={16} />
                    系统设置
                  </button>
                </div>
                {/* Logout */}
                <div style={{ padding: '6px', borderTop: '1px solid var(--color-divider)' }}>
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', fontSize: '13px', borderRadius: '1px',
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                      color: '#dc2626', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <LogOut size={16} />
                    退出登录
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
