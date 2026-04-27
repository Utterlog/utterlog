'use client';

import { useThemeContext } from '@/lib/theme-context';
import SocialLinks from '@/components/blog/SocialLinks';
import PageTitle from '@/components/blog/PageTitle';

const defaultContentHTML = `
<p>欢迎来到 Utterlog —— 一个简洁优雅的博客。</p>
<h2>关于这个博客</h2>
<p>Utterlog 是一个基于现代技术栈构建的博客系统，追求简洁的阅读体验和优雅的视觉设计。</p>
<h2>技术栈</h2>
<ul>
  <li>前端：Next.js + TypeScript + Tailwind CSS</li>
  <li>后端：Go + PostgreSQL + Redis</li>
  <li>部署：Docker</li>
</ul>
<h2>联系方式</h2>
<p>如有任何问题或建议，欢迎联系本站管理员。</p>
`.trim();

export default function AboutContent() {
  const { options } = useThemeContext();
  // Admin-editable markdown/HTML blob stored in options as page_about_content
  const content = (options.page_about_content || '').trim() || defaultContentHTML;

  return (
    <div>
      <PageTitle title="关于" icon="fa-sharp fa-light fa-user" actions={<SocialLinks options={options} />} />

      {/* Content — 与归档页内容块一致 (padding-left 留出 H2 左侧竖线空间) */}
      <div style={{ padding: '0 32px 32px' }}>
        <div style={{ border: '1px solid var(--color-border)', padding: '20px 24px 20px 56px' }}>
          <div className="blog-prose" dangerouslySetInnerHTML={{ __html: content }} />
        </div>
      </div>
    </div>
  );
}
