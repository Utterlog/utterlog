import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '关于',
};

export default function AboutPage() {
  return (
    <div>
      <h1 className="font-serif text-3xl font-bold text-main mb-8">关于</h1>

      <div className="blog-prose">
        <p>
          欢迎来到 Utterlog —— 一个简洁优雅的博客。
        </p>

        <h2>关于这个博客</h2>
        <p>
          Utterlog 是一个基于现代技术栈构建的博客系统，追求简洁的阅读体验和优雅的视觉设计。
        </p>

        <h2>技术栈</h2>
        <ul>
          <li>前端：Next.js + TypeScript + Tailwind CSS</li>
          <li>后端：Go + PostgreSQL + Redis</li>
          <li>部署：Docker</li>
        </ul>

        <h2>联系方式</h2>
        <p>
          如有任何问题或建议，欢迎通过以下方式联系：
        </p>
        <ul>
          <li>邮箱：your-email@example.com</li>
          <li>GitHub：your-github</li>
        </ul>
      </div>
    </div>
  );
}
