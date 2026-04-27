'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useThemeContext } from '@/lib/theme-context';

export default function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [navigating, setNavigating] = useState(false);
  const [tocAvailable, setTocAvailable] = useState(false);
  const { menus, site, options } = useThemeContext();

  useEffect(() => { setNavigating(false); }, [pathname]);
  useEffect(() => {
    setTocAvailable(false);
    const sync = () => setTocAvailable(document.documentElement.dataset.azureTocAvailable === 'true');
    const onAvailability = (e: Event) => {
      setTocAvailable(Boolean((e as CustomEvent<{ available?: boolean }>).detail?.available));
    };
    window.addEventListener('azure:toc-availability', onAvailability);
    const timer = window.setTimeout(sync, 150);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('azure:toc-availability', onAvailability);
    };
  }, [pathname]);
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement;
      if (a && a.href && a.href.startsWith(window.location.origin) && !a.target && a.pathname !== pathname) {
        setNavigating(true);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [pathname]);

  // Header nav is admin-driven only — no hardcoded fallback. Users
  // who haven't configured 主题 → 菜单 → 顶部导航 see a bare header
  // (logo + search), and the '重置默认' button in the Menus admin
  // tab seeds the standard items (首页/关于/归档/说说/友链/订阅).
  const navItems = menus.header ?? [];
  // fallback 用中性的 'Utterlog' 而不是写死任何用户站名 ——
  // admin 没设站名时不应该显示别人的站名。
  const siteName = site.title || 'Utterlog';

  // 标题显示方式（site_brand_mode）解析，跟 Utterlog/Flux 主题一致。
  // 4 个主题共用同一个 admin option，保证切主题不写死。
  const rawMode = options?.site_brand_mode;
  const mode: 'text' | 'text_logo' | 'logo' =
    rawMode === 'text' || rawMode === 'text_logo' || rawMode === 'logo'
      ? rawMode
      : (site.logo ? 'logo' : 'text');
  // showMark — 显示 logo 图片，没上传时退回 Azure 默认蓝色 SVG mark
  const showMark = mode === 'logo' || mode === 'text_logo';
  const showText = mode === 'text' || mode === 'text_logo';

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const submitSearch = () => {
    const q = searchQuery.trim();
    if (q) window.location.href = `/search?q=${encodeURIComponent(q)}`;
  };

  const toggleToc = () => {
    setMenuOpen(false);
    window.dispatchEvent(new Event('azure:toggle-toc'));
  };

  return (
    <header className="azure-header">
      <div className="azure-header-inner">
        {/* Logo / Brand lockup — 由 site_brand_mode 决定显示哪些 */}
        <Link href="/" className="azure-brand" onClick={() => setMenuOpen(false)}>
          {showMark && (
            site.logo ? (
              <img
                src={site.logo}
                // text_logo 模式下 alt='' 避免破图 fallback 双重显示
                alt={showText ? '' : siteName}
                className="azure-brand-img"
              />
            ) : (
              <svg className="azure-brand-mark" width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="#0052D9" />
                <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
              </svg>
            )
          )}
          {showText && (
            <span className="site-title azure-brand-title">{siteName}</span>
          )}
        </Link>

        {/* Center Nav */}
        <nav className="azure-desktop-nav" aria-label="主导航">
          {navItems.map((item: any) => {
            const hasChildren = Array.isArray(item.children) && item.children.length > 0;
            const href = item.href || '#';
            const parentActive = hasChildren ? item.children.some((c: any) => isActive(c.href || '#')) : isActive(href);

            return hasChildren ? (
              <div key={href || item.label} className={`nav-dropdown-wrap azure-nav-parent${parentActive ? ' active' : ''}`}>
                <span className="azure-nav-item azure-nav-trigger">
                  {item.label}
                  <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                </span>
                <div className="nav-dropdown azure-nav-dropdown">
                  {item.children.map((child: any) => {
                    const childHref = child.href || '#';
                    return (
                      <Link key={childHref || child.label} href={childHref} className={`azure-nav-dropdown-link${isActive(childHref) ? ' active' : ''}`}>
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              <Link
                key={href || item.label}
                href={href}
                className={`azure-nav-item${parentActive ? ' active' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Search + Loading */}
        <div className="azure-search-area">
          <div className="azure-search">
            <svg className="azure-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitSearch(); }}
              placeholder="搜索文章..."
              className="azure-search-input"
            />
            <kbd className="azure-search-kbd">⌘K</kbd>
          </div>
        </div>

        {/* Loading — header 最右侧固定占位 */}
        <div className="azure-header-loading">
          {navigating && (
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="#0052D9" aria-label="加载中">
              <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
              <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z">
                <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
              </path>
            </svg>
          )}
        </div>

        <div className="azure-mobile-actions">
          <Link
            href="/categories"
            className={`azure-mobile-bar-button${isActive('/categories') ? ' active' : ''}`}
            aria-label="分类"
            onClick={() => setMenuOpen(false)}
          >
            <i className="fa-sharp fa-light fa-folder-tree" aria-hidden="true" />
            <span>分类</span>
          </Link>

          {tocAvailable && (
            <button
              type="button"
              className="azure-mobile-bar-button azure-mobile-toc-button"
              aria-label="目录"
              onClick={toggleToc}
            >
              <i className="fa-sharp fa-light fa-list-tree" aria-hidden="true" />
              <span>目录</span>
            </button>
          )}

          {/* Mobile toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="azure-menu-toggle"
            aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
            aria-expanded={menuOpen}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true">
              {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="azure-mobile-menu">
          <nav aria-label="移动端导航">
            {navItems.map((item: any) => {
              const hasChildren = Array.isArray(item.children) && item.children.length > 0;
              const href = item.href || '#';

              return hasChildren ? (
                <div key={href || item.label} className="azure-mobile-menu-section">
                  <span className="azure-mobile-menu-heading">{item.label}</span>
                  {item.children.map((child: any) => {
                    const childHref = child.href || '#';
                    return (
                      <Link
                        key={childHref || child.label}
                        href={childHref}
                        onClick={() => setMenuOpen(false)}
                        className={`azure-mobile-menu-link child${isActive(childHref) ? ' active' : ''}`}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Link
                  key={href || item.label}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={`azure-mobile-menu-link${isActive(href) ? ' active' : ''}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
