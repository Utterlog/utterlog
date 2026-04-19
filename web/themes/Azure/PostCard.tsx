'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getCategoryIcon } from './constants';
import LazyImage from '@/components/ui/LazyImage';

const ACCENT = '#0052D9';

function formatDate(ts: string | number) {
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'Asia/Shanghai' });
  const day = Number(d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'Asia/Shanghai' }));
  return { mon, day };
}

export default function PostCard({ post, isNewest }: { post: any; isNewest?: boolean }) {
  const slug = post.slug || post.id;
  const { mon, day } = formatDate(post.created_at);
  const cat0 = post.categories?.[0];
  const catName = cat0?.name;
  const catIcon = cat0 ? getCategoryIcon(cat0) : 'fa-sharp fa-light fa-folder';
  const isNew = isNewest === true;
  const coverUrl = post.cover_url || `https://img.et/1920/1080?type=landscape&r=${post.id}`;
  const [hovered, setHovered] = useState(false);

  return (
    <article
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: '0', height: '50px' }}>
        {/* Date badge — full height, hover shows full date */}
        <div style={{
          width: '56px', flexShrink: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', position: 'relative',
          background: ACCENT, color: '#fff', lineHeight: 1, cursor: 'default',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase' }}>{mon}</div>
          <div style={{ fontSize: '22px', fontWeight: 400 }}>{day}</div>
          {hovered && (
            <div style={{
              position: 'absolute', bottom: '-24px', left: '0', zIndex: 10,
              background: ACCENT, color: '#fff', fontSize: '10px', fontWeight: 500,
              padding: '4px 6px', whiteSpace: 'nowrap',
            }}>
              {(() => {
                const d = typeof post.created_at === 'number' ? new Date(post.created_at * 1000) : new Date(post.created_at);
                return d.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('-', '/').replace('-', '/').slice(0, 16);
              })()}
            </div>
          )}
        </div>

        {/* Title + meta */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px', padding: '0 20px' }}>
        <Link href={`/posts/${slug}`} style={{ textDecoration: 'none', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{
            fontSize: '28px', fontWeight: 400, color: hovered ? ACCENT : '#1a1a1a', lineHeight: 1.22, letterSpacing: '-0.01em',
            transition: 'color 0.15s', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {post.title}
          </h2>
          {isNew && <span className="new-badge-pulse" style={{ padding: '1px 6px', fontSize: '10px', fontWeight: 600, background: '#fff3e0', color: '#f57c00', border: '1px solid #ffe0b2', flexShrink: 0 }}>NEW</span>}
        </Link>

        {/* Stats — only on hover */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: ACCENT, flexShrink: 0,
          opacity: hovered ? 1 : 0, transition: 'opacity 0.2s',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <i className="fa-solid fa-fire" style={{ fontSize: '12px' }} /> {post.view_count || 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <i className="fa-regular fa-comment" style={{ fontSize: '12px' }} /> {post.comment_count || 0}
          </span>
        </div>

        {/* Category */}
        {catName && (
          <Link href={`/categories/${post.categories[0].slug}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: '13px', color: ACCENT, textDecoration: 'none', flexShrink: 0,
          }}>
            <i className={catIcon} /> {catName}
          </Link>
        )}
        </div>
      </div>

      {/* Cover image */}
      <Link href={`/posts/${slug}`} className="azure-img-hover-wrap" style={{ display: 'block', position: 'relative', overflow: 'hidden' }}>
        <LazyImage
          src={coverUrl}
          alt={post.title}
          className="azure-img-hover"
          style={{ width: '100%', height: '320px' }}
        />
      </Link>

      {/* Excerpt — prefer AI summary when present, fall back to manual
          excerpt or a derived slice of content. If the admin clears the
          AI summary the card silently reverts to the excerpt. */}
      {(post.ai_summary || post.excerpt || post.content) && (
        <div style={{ padding: '12px 20px' }}>
          <p style={{
            fontSize: '14px', lineHeight: 1.8, color: '#555', margin: 0,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
          }}>
            {post.ai_summary || post.excerpt || post.content?.replace(/[#*`>\-\[\]()!~|]/g, '').replace(/\n+/g, ' ').trim().slice(0, 300)}
          </p>
        </div>
      )}
    </article>
  );
}
