'use client';

import { useState } from 'react';

const INSTALL_CMD = 'curl -fsSL https://utterlog.io/install.sh | bash';
const UPDATE_CMD  = 'curl -fsSL https://utterlog.io/update.sh | bash';

function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="#0052D9" />
      <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
    </svg>
  );
}

function CopyableCommand({ cmd, label }: { cmd: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="group relative">
      {label && (
        <div className="text-xs text-slate-400 font-mono mb-1.5 tracking-wide">{label}</div>
      )}
      <div className="flex items-stretch bg-slate-900 border border-slate-800">
        <div className="flex-1 px-5 py-4 font-mono text-[13px] sm:text-[14px] text-slate-100 overflow-x-auto whitespace-nowrap">
          <span className="text-emerald-400 select-none mr-2">$</span>
          {cmd}
        </div>
        <button
          onClick={copy}
          className="shrink-0 px-4 text-slate-300 hover:text-white hover:bg-slate-800 border-l border-slate-800 transition text-sm flex items-center gap-2"
          aria-label="复制"
        >
          <i className={`fa-solid ${copied ? 'fa-check text-emerald-400' : 'fa-copy'}`} />
          <span className="hidden sm:inline">{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="border border-slate-200 bg-white p-6 hover:border-brand transition-colors group">
      <div className="w-11 h-11 bg-brand-soft text-brand flex items-center justify-center mb-4 group-hover:bg-brand group-hover:text-white transition-colors">
        <i className={`${icon} text-lg`} />
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-1.5">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-600">{desc}</p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      {/* ===== Nav ===== */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2.5">
            <Logo className="w-7 h-7" />
            <span className="font-brand font-semibold text-slate-900">Utterlog</span>
          </a>
          <nav className="flex items-center gap-1 sm:gap-2 text-[13.5px]">
            <a href="#features" className="hidden sm:inline px-3 py-2 text-slate-600 hover:text-slate-900">特性</a>
            <a href="https://docs.utterlog.io" className="hidden sm:inline px-3 py-2 text-slate-600 hover:text-slate-900">文档</a>
            <a href="/changelog" className="hidden sm:inline px-3 py-2 text-slate-600 hover:text-slate-900">更新</a>
            <a href="https://github.com/utterlog/utterlog" target="_blank" rel="noopener" className="px-3 py-2 text-slate-600 hover:text-slate-900 flex items-center gap-1.5">
              <i className="fa-brands fa-github" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <a href="https://id.utterlog.com" target="_blank" rel="noopener" className="ml-1 px-4 py-2 bg-brand text-white hover:bg-brand-hover transition-colors font-medium">
              Utterlog ID
            </a>
          </nav>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section id="top" className="px-5 sm:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 text-xs font-mono bg-brand-soft text-brand px-3 py-1.5 mb-8 border border-brand/20">
            <span className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse" />
            BETA · v1.0
          </div>

          <h1 className="text-[40px] sm:text-[56px] font-bold tracking-tight text-slate-900 leading-[1.1] mb-6">
            去中心化的<br />
            <span className="text-brand">独立博客联盟</span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed mb-10">
            每个站点各自部署，自己掌控全部数据。
            <br className="hidden sm:inline" />
            通过 utterlog.io 联盟互相发现、互关互访 — 没有任何一方能下架你的内容。
          </p>

          <div className="max-w-2xl mx-auto mb-8">
            <CopyableCommand cmd={INSTALL_CMD} label="# 一行命令安装 · Linux / macOS / Docker" />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-slate-500">
            <span className="flex items-center gap-1.5"><i className="fa-solid fa-check text-emerald-500" /> 3 分钟内可用</span>
            <span className="flex items-center gap-1.5"><i className="fa-solid fa-check text-emerald-500" /> 无需注册账号</span>
            <span className="flex items-center gap-1.5"><i className="fa-solid fa-check text-emerald-500" /> 完全开源免费</span>
          </div>
        </div>
      </section>

      {/* ===== Features ===== */}
      <section id="features" className="px-5 sm:px-8 py-24 bg-white border-y border-slate-200">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-14">
            <div className="text-xs font-mono text-brand uppercase tracking-wider mb-3">为什么选择 Utterlog</div>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">
              属于你的博客，<br />属于你的数据
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 -mb-px -mr-px">
            <FeatureCard
              icon="fa-solid fa-server"
              title="完全自托管"
              desc="Go + PostgreSQL 单容器部署。每个 Utterlog 实例独立运行在你的服务器，数据全部本地存储。"
            />
            <FeatureCard
              icon="fa-solid fa-globe"
              title="联盟互通"
              desc="自动发现、互关互评。utterlog.io 中心站提供友链广场、新站推荐与 RSS 订阅聚合。"
            />
            <FeatureCard
              icon="fa-solid fa-id-card"
              title="统一身份"
              desc="id.utterlog.com 一号通行。读者用 Utterlog ID 跨站评论、收藏、关注，OAuth + Passkey 登录。"
            />
            <FeatureCard
              icon="fa-solid fa-code-branch"
              title="100% 开源"
              desc="AGPL-3.0 协议。代码、部署脚本、安装向导全部公开在 GitHub。你 Fork 后就是你自己的。"
            />
          </div>
        </div>
      </section>

      {/* ===== Install ===== */}
      <section id="install" className="px-5 sm:px-8 py-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs font-mono text-brand uppercase tracking-wider mb-3">快速安装</div>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">3 分钟，从零到上线</h2>
            <p className="text-slate-600">Docker 是唯一依赖。不需要 Node、Go、Nginx、数据库。</p>
          </div>

          <div className="space-y-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="w-7 h-7 bg-brand text-white font-semibold text-sm flex items-center justify-center">1</span>
                <h3 className="font-semibold text-slate-900">安装 Utterlog</h3>
              </div>
              <CopyableCommand cmd={INSTALL_CMD} />
              <p className="text-[13px] text-slate-500 mt-2.5 ml-10">
                自动拉取镜像、生成随机数据库密码、启动服务。Docker 未安装时会引导你装。
              </p>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="w-7 h-7 bg-brand text-white font-semibold text-sm flex items-center justify-center">2</span>
                <h3 className="font-semibold text-slate-900">配置反代 + 域名</h3>
              </div>
              <div className="bg-slate-900 border border-slate-800 px-5 py-4 font-mono text-[13px] text-slate-100 overflow-x-auto">
                <div className="text-slate-500 mb-1"># nginx / caddy 反代到 127.0.0.1:9260</div>
                <div><span className="text-slate-500">server_name</span> <span className="text-emerald-400">blog.example.com</span>;</div>
                <div><span className="text-slate-500">proxy_pass</span> <span className="text-emerald-400">http://127.0.0.1:9260</span>;</div>
              </div>
              <p className="text-[13px] text-slate-500 mt-2.5 ml-10">
                任何反向代理都可以。Utterlog 只绑 127.0.0.1，不公网暴露。
              </p>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="w-7 h-7 bg-brand text-white font-semibold text-sm flex items-center justify-center">3</span>
                <h3 className="font-semibold text-slate-900">打开 <code className="font-mono text-brand">你的域名/install</code> 建管理员</h3>
              </div>
              <div className="border border-slate-200 bg-white p-5 text-sm text-slate-600 leading-relaxed">
                安装向导会自动检测 Docker 环境并预填数据库/Redis 配置。
                <br />
                你只需要填管理员邮箱和密码，下一步就跳后台。
                <br />
                <span className="text-xs text-slate-500">
                  完成页会一次性显示所有凭据，支持复制和导出 TXT 备份。
                </span>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-200">
            <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-3"># 已有 Utterlog 实例？</div>
            <CopyableCommand cmd={UPDATE_CMD} label="# 升级到最新版 · 拉镜像 + 滚动重启" />
          </div>
        </div>
      </section>

      {/* ===== Federation ===== */}
      <section id="federation" className="px-5 sm:px-8 py-24 bg-white border-y border-slate-200">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-mono text-brand uppercase tracking-wider mb-3">联盟架构</div>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              没有中心，但可以互相发现
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Utterlog 是联邦式的：你的站和我的站通过 ID 与联盟中心站交换元数据，
              <br className="hidden sm:inline" />
              内容永远存在各自的机器上。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-slate-200">
            <div className="p-8 border-r-0 md:border-r border-b md:border-b-0 border-slate-200">
              <div className="font-mono text-xs text-brand mb-3">utterlog.io</div>
              <h3 className="font-semibold text-slate-900 mb-2">联盟中心站</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                友链广场、新站发现、RSS 聚合、跨站搜索。你作为博主选择是否加入。
              </p>
            </div>
            <div className="p-8 border-r-0 md:border-r border-b md:border-b-0 border-slate-200">
              <div className="font-mono text-xs text-brand mb-3">id.utterlog.com</div>
              <h3 className="font-semibold text-slate-900 mb-2">统一账号中心</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                OAuth 2.0 / Passkey 登录。读者一个账号可在全网 Utterlog 站评论、关注、收藏。
              </p>
            </div>
            <div className="p-8">
              <div className="font-mono text-xs text-brand mb-3">blog.example.com</div>
              <h3 className="font-semibold text-slate-900 mb-2">你的博客</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                你的内容、你的数据库、你的域名。随时可以退出联盟 — 内容不受影响。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Tech stack ===== */}
      <section className="px-5 sm:px-8 py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs font-mono text-brand uppercase tracking-wider mb-3">技术栈</div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              现代的技术选型，朴实的架构
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-0 border border-slate-200 bg-white">
            {[
              { i: 'fa-brands fa-golang',    n: 'Go 1.26' },
              { i: 'fa-solid fa-database',   n: 'PostgreSQL 18' },
              { i: 'fa-solid fa-bolt',       n: 'Redis 7' },
              { i: 'fa-brands fa-react',     n: 'React 19' },
              { i: 'fa-solid fa-code',       n: 'Next.js 16' },
              { i: 'fa-brands fa-docker',    n: 'Docker' },
            ].map(({ i, n }) => (
              <div key={n} className="p-6 flex flex-col items-center gap-2 border-r border-b border-slate-200 last:border-r-0">
                <i className={`${i} text-2xl text-slate-700`} />
                <div className="text-xs text-slate-600 font-medium">{n}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="px-5 sm:px-8 py-24 bg-slate-900">
        <div className="max-w-3xl mx-auto text-center">
          <Logo className="w-14 h-14 mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            现在开始你的独立博客
          </h2>
          <p className="text-slate-400 mb-10 leading-relaxed">
            服务器一台、域名一个、三分钟。<br />
            没有 SaaS 订阅，没有平台规则，没有审查。
          </p>
          <div className="max-w-2xl mx-auto">
            <CopyableCommand cmd={INSTALL_CMD} />
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="bg-slate-900 border-t border-slate-800 px-5 sm:px-8 py-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <Logo className="w-6 h-6" />
            <span className="text-slate-400 text-sm">
              <span className="text-slate-200 font-medium font-brand">Utterlog</span>
              <span className="mx-2 text-slate-600">·</span>
              去中心化独立博客联盟
            </span>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-400">
            <a href="https://docs.utterlog.io" className="hover:text-white">文档</a>
            <a href="/changelog" className="hover:text-white">更新</a>
            <a href="https://github.com/utterlog/utterlog" target="_blank" rel="noopener" className="hover:text-white flex items-center gap-1.5">
              <i className="fa-brands fa-github" /> GitHub
            </a>
            <a href="https://id.utterlog.com" target="_blank" rel="noopener" className="hover:text-white">id.utterlog.com</a>
            <a href="https://utterlog.com" target="_blank" rel="noopener" className="hover:text-white">utterlog.com</a>
            <a href="https://github.com/utterlog/utterlog/blob/main/LICENSE" target="_blank" rel="noopener" className="hover:text-white">AGPL-3.0</a>
          </nav>
        </div>
        <div className="max-w-6xl mx-auto mt-8 pt-6 border-t border-slate-800 text-[11px] text-slate-600 font-mono">
          © {new Date().getFullYear()} Utterlog Project. Built by a federation of independent bloggers.
        </div>
      </footer>
    </main>
  );
}
