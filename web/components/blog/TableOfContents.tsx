'use client';

import { useEffect, useState } from 'react';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  content: string;
}

export default function TableOfContents({ content }: TableOfContentsProps) {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState('');

  // 从 Markdown 内容中解析标题
  useEffect(() => {
    const matches = content.match(/^#{1,3}\s+.+$/gm);
    if (!matches) return;

    const items = matches.map((match) => {
      const level = match.match(/^#+/)?.[0].length || 2;
      const text = match.replace(/^#+\s+/, '');
      const id = text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff]+/g, '-')
        .replace(/^-|-$/g, '');
      return { id, text, level };
    });

    setHeadings(items);
  }, [content]);

  // 监听滚动高亮当前标题
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '0px 0px -80% 0px' }
    );

    headings.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <nav className="hidden xl:block sticky top-24">
      <h3 className="text-sm font-semibold text-main mb-3">目录</h3>
      <ul className="space-y-1.5 text-sm">
        {headings.map((item) => (
          <li
            key={item.id}
            style={{ paddingLeft: `${(item.level - 2) * 12}px` }}
          >
            <a
              href={`#${item.id}`}
              className={`block py-0.5 transition-colors border-l-2 pl-3 ${
                activeId === item.id
                  ? 'text-primary-themed border-line'
                  : 'text-dim hover:text-main border-transparent'
              }`}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
