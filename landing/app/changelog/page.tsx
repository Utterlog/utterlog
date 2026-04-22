import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Changelog — Utterlog',
  description: 'Utterlog 的版本更新记录。',
};

// Static export: this fetch runs at `next build` time, producing a
// prerendered HTML. Re-runs on every push (landing-deploy workflow).
async function getReleases() {
  try {
    const res = await fetch(
      'https://api.github.com/repos/utterlog/utterlog/releases?per_page=30',
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'utterlog-landing',
        },
        // `output: 'export'` forbids `cache: 'no-store'` (that flips the
        // page into dynamic rendering, which static export rejects).
        // `force-cache` bakes the fetched data into the static HTML at
        // build time — exactly what we want since the landing is
        // rebuilt+redeployed on every release anyway.
        cache: 'force-cache',
      }
    );
    if (!res.ok) {
      console.warn(`[changelog] GitHub releases API returned ${res.status}`);
      return [];
    }
    return (await res.json()) as Array<{
      id: number;
      tag_name: string;
      name: string;
      body: string;
      html_url: string;
      published_at: string;
      prerelease: boolean;
    }>;
  } catch (e) {
    console.warn(`[changelog] GitHub releases fetch failed:`, e);
    return [];
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Simple markdown-ish renderer.
// Handles: fenced code blocks (```lang ... ```), headings, lists,
// paragraphs, inline code, and autolinks. Good enough for GitHub
// release bodies without pulling a full markdown dependency.
function renderMd(md: string): string {
  if (!md) return '';
  const rawLines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  let inCode = false;
  let codeLang = '';
  const codeBuf: string[] = [];

  const flushList = () => {
    if (inList) { out.push('</ul>'); inList = false; }
  };
  const flushCode = () => {
    const langClass = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : '';
    out.push(`<pre><code${langClass}>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
    codeBuf.length = 0;
    codeLang = '';
    inCode = false;
  };

  const inlineFmt = (s: string) =>
    escapeHtml(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');

  for (const rawLine of rawLines) {
    const fence = rawLine.match(/^```\s*([\w-]*)\s*$/);
    if (fence) {
      if (inCode) {
        flushCode();
      } else {
        flushList();
        inCode = true;
        codeLang = fence[1] || '';
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(rawLine);
      continue;
    }

    if (/^\s*[-*]\s+/.test(rawLine)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineFmt(rawLine.replace(/^\s*[-*]\s+/, ''))}</li>`);
      continue;
    }

    flushList();
    if (/^#+\s+/.test(rawLine)) {
      const level = Math.min(rawLine.match(/^#+/)![0].length + 1, 5);
      out.push(`<h${level}>${inlineFmt(rawLine.replace(/^#+\s+/, ''))}</h${level}>`);
    } else if (rawLine.trim()) {
      out.push(`<p>${inlineFmt(rawLine)}</p>`);
    }
  }
  if (inCode) flushCode();
  flushList();
  return out.join('\n');
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default async function ChangelogPage() {
  const releases = await getReleases();

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Nav (mirrors landing header for consistency) */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" className="w-7 h-7" aria-hidden>
              <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="#0052D9" />
              <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
            </svg>
            <span className="font-brand font-semibold text-slate-900">Utterlog</span>
          </a>
          <nav className="flex items-center gap-1 sm:gap-2 text-[13.5px]">
            <a href="/#features" className="hidden sm:inline px-3 py-2 text-slate-600 hover:text-slate-900">特性</a>
            <a href="https://docs.utterlog.io" className="hidden sm:inline px-3 py-2 text-slate-600 hover:text-slate-900">文档</a>
            <a href="/changelog" className="hidden sm:inline px-3 py-2 text-slate-900 font-medium">更新</a>
            <a href="https://github.com/utterlog/utterlog/releases" target="_blank" rel="noopener" className="px-3 py-2 text-slate-600 hover:text-slate-900 flex items-center gap-1.5">
              <i className="fa-brands fa-github" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </nav>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
        <div className="mb-14">
          <div className="text-xs font-mono text-brand uppercase tracking-wider mb-3">CHANGELOG</div>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight mb-4">更新记录</h1>
          <p className="text-slate-600">
            Utterlog 每次推送到 main 的改动都会自动构建镜像并发布版本。下面列出最近的 30 个发布。
          </p>
        </div>

        {releases.length === 0 ? (
          <div className="border border-slate-200 bg-white p-10 text-center">
            <i className="fa-solid fa-clock-rotate-left text-2xl text-slate-400 mb-3" />
            <div className="text-slate-600 text-sm">
              还没有发布的版本。代码仍在快速迭代中，第一个正式 tag 发布后会显示在这里。
            </div>
            <a
              href="https://github.com/utterlog/utterlog/commits/main"
              target="_blank"
              rel="noopener"
              className="inline-block mt-4 text-brand hover:underline text-sm"
            >
              查看 GitHub 提交历史 →
            </a>
          </div>
        ) : (
          <div className="space-y-10">
            {releases.map((rel) => (
              <article key={rel.id} className="border border-slate-200 bg-white p-8">
                <header className="flex items-start justify-between gap-4 mb-5 pb-5 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-lg text-slate-900">{rel.tag_name}</span>
                      {rel.prerelease && (
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200">
                          pre-release
                        </span>
                      )}
                    </div>
                    {rel.name && rel.name !== rel.tag_name && (
                      <div className="text-slate-600 text-sm">{rel.name}</div>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-mono whitespace-nowrap">
                    {formatDate(rel.published_at)}
                  </div>
                </header>
                <div
                  className="changelog-body text-sm leading-relaxed text-slate-700"
                  dangerouslySetInnerHTML={{ __html: renderMd(rel.body) }}
                />
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <a
                    href={rel.html_url}
                    target="_blank"
                    rel="noopener"
                    className="text-[12px] text-slate-500 hover:text-brand"
                  >
                    查看 GitHub 发布页 <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: 9, marginLeft: 2 }} />
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 text-center text-[12px] text-slate-500">
          <a href="/" className="hover:text-slate-900">utterlog.io</a>
          <span className="mx-3 text-slate-300">·</span>
          <a href="https://docs.utterlog.io" className="hover:text-slate-900">docs.utterlog.io</a>
          <span className="mx-3 text-slate-300">·</span>
          <a href="https://github.com/utterlog/utterlog" className="hover:text-slate-900">GitHub</a>
        </div>
      </footer>
    </main>
  );
}
