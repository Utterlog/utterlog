'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, FileText, FolderOpen, Tags,
  MessageSquare, LinkIcon, Settings, ImageIcon,
  ChevronLeft, ChevronRight, Shield, Sparkles,
  Pen, MusicNote, Film, BookOpen, ShoppingBag, Globe,
  Eye, TrendingUp, Package, Copy, Database, Search,
} from '@/components/icons';
import { useSidebarStore } from '@/lib/store';
import SystemStatusPanel from './SystemStatusPanel';

const menuItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: '仪表盘' },
  { href: '/dashboard/posts', icon: FileText, label: '文章管理' },
  { href: '/dashboard/pages', icon: Copy, label: '页面管理' },
  { href: '/dashboard/moments', icon: Pen, label: '说说' },
  { href: '/dashboard/music', icon: MusicNote, label: '音乐管理' },
  // 电影、图书、好物属于页面管理
  // 分类和标签已移到文章管理子 tab
  { href: '/dashboard/follows', icon: Globe, label: '关注管理' },
  { href: '/dashboard/comments', icon: MessageSquare, label: '评论管理' },
  { href: '/dashboard/links', icon: LinkIcon, label: '友链管理' },
  { href: '/dashboard/media', icon: ImageIcon, label: '媒体库' },
  { href: '/dashboard/analytics', icon: TrendingUp, label: '统计' },
  { href: '/dashboard/security', icon: Shield, label: '安全' },
  { href: '/dashboard/themes', icon: Eye, label: '主题' },
  { href: '/dashboard/plugins', icon: Package, label: '插件' },
  { href: '/dashboard/backup', icon: Database, label: '备份' },
  { href: '/dashboard/settings', icon: Settings, label: '系统设置' },
];

const aiMenuItems = [
  { href: '/dashboard/ai', icon: Sparkles, label: 'AI 助手' },
  { href: '/dashboard/ai-settings', icon: Settings, label: 'AI 设置' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { isOpen, toggle } = useSidebarStore();

  return (
    <aside
      className={cn(
        'bg-card border-r border-line transition-all duration-300 flex flex-col flex-shrink-0',
        isOpen ? 'w-56' : 'w-14'
      )}
    >
      {/* Logo + Toggle */}
      <div
        className="flex items-center border-b border-line"
        style={{ height: '56px', padding: '0 12px', gap: '8px', position: 'relative', justifyContent: isOpen ? 'center' : 'center' }}
      >
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="var(--color-primary)" />
            <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
          </svg>
          {isOpen && (
            <>
              <span className="text-main font-logo" style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em' }}>Utterlog!</span>
              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '1px', background: 'var(--color-primary)', color: '#fff', fontWeight: 600, lineHeight: 1.4 }}>v1.0</span>
            </>
          )}
        </Link>
        <button
          onClick={toggle}
          className="text-dim"
          style={{
            position: 'absolute', right: '-12px', top: '50%', transform: 'translateY(-50%)',
            width: '24px', height: '24px', borderRadius: '50%',
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', zIndex: 10,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          {isOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
        </button>
      </div>

      {/* Search */}
      {isOpen && (
        <SidebarSearch menuItems={menuItems} aiMenuItems={aiMenuItems} />
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: '1px', overflow: 'auto' }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href
            || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center transition-colors',
                isActive ? 'text-main' : 'text-sub',
                !isOpen && 'justify-center'
              )}
              style={{
                gap: '10px',
                padding: isOpen ? '9px 12px' : '9px 0',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                borderRadius: '0',
                backgroundColor: isActive ? 'var(--color-bg-soft)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
              }}
              title={!isOpen ? item.label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" style={isActive ? { color: 'var(--color-primary)' } : undefined} />
              {isOpen && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* AI 分隔线 */}
        <div className="border-t border-line" style={{ margin: '6px 0' }} />
        {isOpen && <p className="text-dim" style={{ fontSize: '11px', padding: '4px 12px', fontWeight: 600, letterSpacing: '0.05em' }}>AI 助手</p>}

        {aiMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href
            || (item.href !== '/dashboard/ai' && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center transition-colors',
                isActive ? 'text-main' : 'text-sub',
                !isOpen && 'justify-center'
              )}
              style={{
                gap: '10px',
                padding: isOpen ? '9px 12px' : '9px 0',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                borderRadius: '0',
                backgroundColor: isActive ? 'var(--color-bg-soft)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
              }}
              title={!isOpen ? item.label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" style={isActive ? { color: 'var(--color-primary)' } : undefined} />
              {isOpen && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* System Status Footer */}
      <SystemStatusPanel isOpen={isOpen} />
    </aside>
  );
}

// Sidebar search component
function SidebarSearch({ menuItems, aiMenuItems }: { menuItems: any[]; aiMenuItems: any[] }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const router = useRouter();

  const allItems = [...menuItems, ...aiMenuItems];
  const filtered = query ? allItems.filter(item => item.label.toLowerCase().includes(query.toLowerCase())) : [];

  const handleSelect = (href: string) => {
    router.push(href);
    setQuery('');
    setFocused(false);
  };

  return (
    <div style={{ padding: '8px 8px 0', position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="搜索..."
          style={{
            width: '100%', padding: '6px 8px 6px 28px', fontSize: '12px',
            border: '1px solid var(--color-border)', borderRadius: '1px',
            background: 'var(--color-bg-soft)', color: 'var(--color-text-main)',
            outline: 'none',
          }}
        />
      </div>
      {focused && filtered.length > 0 && (
        <div style={{
          position: 'absolute', left: '8px', right: '8px', top: '100%', zIndex: 20,
          background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
          borderRadius: '1px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          maxHeight: '200px', overflow: 'auto',
        }}>
          {filtered.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                onMouseDown={() => handleSelect(item.href)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 10px', fontSize: '12px', cursor: 'pointer',
                  background: 'none', border: 'none', textAlign: 'left',
                  color: 'var(--color-text-sub)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-soft)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <Icon size={14} />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
