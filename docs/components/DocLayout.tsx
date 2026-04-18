import Link from 'next/link';

interface NavItem {
  label: string;
  href: string;
}
interface NavSection {
  title: string;
  items: NavItem[];
}

// Single source of truth for the docs sidebar. Add new pages here when
// creating them under app/<slug>/page.tsx.
export const navSections: NavSection[] = [
  {
    title: '入门',
    items: [
      { label: '介绍', href: '/' },
      { label: '安装', href: '/install' },
      { label: '升级', href: '/update' },
    ],
  },
  {
    title: '核心概念',
    items: [
      { label: '联盟 (Federation)', href: '/federation' },
    ],
  },
  {
    title: '定制',
    items: [
      { label: '主题', href: '/themes' },
    ],
  },
];

interface Props {
  children: React.ReactNode;
  currentPath: string;
}

export default function DocLayout({ children, currentPath }: Props) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" className="w-7 h-7" aria-hidden>
              <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="#0052D9" />
              <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
            </svg>
            <span className="font-brand font-semibold text-slate-900">Utterlog</span>
            <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider ml-1 px-1.5 py-0.5 border border-slate-200 bg-slate-50">
              DOCS
            </span>
          </a>
          <nav className="flex items-center gap-1 sm:gap-2 text-[13.5px]">
            <a href="https://utterlog.io" className="hidden sm:inline px-3 py-2 text-slate-600 hover:text-slate-900">首页</a>
            <a href="https://utterlog.io/changelog" className="hidden sm:inline px-3 py-2 text-slate-600 hover:text-slate-900">更新</a>
            <a href="https://github.com/utterlog/utterlog" target="_blank" rel="noopener" className="px-3 py-2 text-slate-600 hover:text-slate-900 flex items-center gap-1.5">
              <i className="fa-brands fa-github" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </nav>
        </div>
      </header>

      <div className="flex-1 max-w-7xl mx-auto w-full px-5 sm:px-8 py-10 flex gap-10">
        {/* Sidebar */}
        <aside className="hidden md:block w-56 flex-shrink-0">
          <nav className="sticky top-24 space-y-7 text-[13.5px]">
            {navSections.map((sec) => (
              <div key={sec.title}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  {sec.title}
                </div>
                <ul className="space-y-0.5">
                  {sec.items.map((it) => {
                    const active = currentPath === it.href || (it.href !== '/' && currentPath.startsWith(it.href));
                    return (
                      <li key={it.href}>
                        <Link
                          href={it.href}
                          className={`block py-1.5 px-3 border-l-2 transition-colors ${
                            active
                              ? 'border-brand text-brand font-medium bg-brand-soft'
                              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                          }`}
                        >
                          {it.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 bg-white border border-slate-200 px-6 sm:px-12 py-10">
          <article className="prose">{children}</article>

          <hr className="mt-16 mb-6 border-slate-200" />
          <div className="flex items-center justify-between text-xs text-slate-500">
            <a
              href={`https://github.com/utterlog/utterlog/edit/main/docs/app${currentPath === '/' ? '' : currentPath}/page.tsx`}
              target="_blank"
              rel="noopener"
              className="hover:text-brand"
            >
              <i className="fa-regular fa-pen-to-square" style={{ marginRight: 6 }} />
              在 GitHub 上编辑此页
            </a>
            <span>© Utterlog Project</span>
          </div>
        </main>
      </div>
    </div>
  );
}
