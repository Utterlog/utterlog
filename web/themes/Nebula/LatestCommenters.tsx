'use client';

import { useEffect, useState } from 'react';
import { buildPermalink } from '@/lib/permalink';
import { useThemeContext } from '@/lib/theme-context';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface Comment {
  id: number;
  author?: string;
  author_name?: string;
  author_email?: string;
  avatar_url?: string;
  content?: string;
  created_at: number;
  post_id: number;
  post_slug?: string;
  post_title?: string;
  post_categories?: any[];
}

function relativeTime(ts: number) {
  if (!ts) return '';
  const diff = Date.now() - ts * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

export default function LatestCommenters() {
  const { options } = useThemeContext();
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    fetch(`${API}/comments?per_page=40&status=approved&exclude_admin=0`)
      .then((r) => r.json())
      .then((r) => {
        const list: Comment[] = r?.data?.comments || r?.data || [];
        // 按 author 名去重，保留每位最新的一条；最多 20 个头像
        const seen = new Set<string>();
        const dedup: Comment[] = [];
        for (const c of list) {
          const key = (c.author_name || c.author || c.author_email || `${c.id}`).toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          dedup.push(c);
          if (dedup.length >= 20) break;
        }
        setComments(dedup);
      })
      .catch(() => setComments([]));
  }, []);

  if (comments.length === 0) return null;

  return (
    <section className="nebula-commenters" aria-label="最新评论">
      <ul className="nebula-commenters-row">
        {comments.map((c) => {
          const name = c.author_name || c.author || '匿名';
          const avatar = c.avatar_url || `https://gravatar.bluecdn.com/avatar/${c.author_email || '0'}?s=80&d=mp`;
          const href = buildPermalink(
            { id: c.post_id, slug: c.post_slug || '', categories: c.post_categories || [] },
            options?.permalink_structure,
          ) + `#comment-${c.id}`;
          const time = relativeTime(c.created_at);
          const content = String(c.content || '').replace(/\s+/g, ' ').trim();
          const postTitle = c.post_title || '原文';

          return (
            <li key={c.id} className="nebula-commenters-item">
              <a href={href} className="nebula-commenters-avatar" aria-label={`${name} 评论了《${postTitle}》`}>
                <img src={avatar} alt={name} loading="lazy" />
              </a>
              {/* hover popup */}
              <div className="nebula-commenters-pop" role="tooltip">
                <div className="nebula-commenters-pop-meta">
                  <strong>{name}</strong>
                  <span>·</span>
                  <time>{time}</time>
                </div>
                <p className="nebula-commenters-pop-content">{content}</p>
                <div className="nebula-commenters-pop-post">
                  <i className="fa-regular fa-file-lines" aria-hidden="true" /> {postTitle}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
