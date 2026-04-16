'use client';

import { useThemeContext } from '@/lib/theme-context';
import SocialLinks from '@/components/blog/SocialLinks';

export default function AboutContent() {
  const { owner, options } = useThemeContext();

  return (
    <div style={{ padding: '32px' }}>
      {/* Header: icon + title + social links — 与归档页结构一致 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <i className="fa-sharp fa-light fa-user" style={{ fontSize: '24px', color: 'var(--color-primary)' }} />
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-main)' }}>关于</h1>
        </div>
        <SocialLinks options={options} />
      </div>

      {/* Content — 与归档页内容块一致 (padding-left 留出 H2 左侧竖线空间) */}
      <div style={{ border: '1px solid var(--color-border)', padding: '20px 24px 20px 56px' }}>
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
            <li>邮箱：{owner.socials?.email || options.social_email || 'your-email@example.com'}</li>
            <li>GitHub：{options.social_github || 'your-github'}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
