'use client';

import Link from 'next/link';
import { useState } from 'react';
import { coverProps, randomCoverUrl } from '@/lib/blog-image';
import { useThemeContext } from '@/lib/theme-context';
import PostLink from '@/components/blog/PostLink';

function formatDate(ts: string | number) {
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  const day = d.getDate();
  return { mon, day };
}

import { getCategoryIcon } from './constants';

export default function PostCard({ post, priority }: { post: any; priority?: boolean }) {
  const { mon, day } = formatDate(post.created_at);
  const cat0 = post.categories?.[0];
  const catName = cat0?.name;
  const catIcon = cat0 ? getCategoryIcon(cat0) : 'fa-sharp fa-light fa-folder';
  const isNew = (Date.now() - (typeof post.created_at === 'number' ? post.created_at * 1000 : new Date(post.created_at).getTime())) < 7 * 86400 * 1000;
  const { options } = useThemeContext();
  const coverUrl = post.cover_url || randomCoverUrl(post.id, options);
  const [hovered, setHovered] = useState(false);

  return (
    <article
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', borderBottom: '1px solid #f0f0f0' }}>
        {/* Date badge */}
        <div style={{
          width: '44px', textAlign: 'center', flexShrink: 0,
          background: '#f53004', color: '#fff', padding: '4px 0', lineHeight: 1,
        }}>
          <div style={{ fontSize: '10px', fontWeight: 500, textTransform: 'uppercase' }}>{mon}</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>{day}</div>
        </div>

        {/* Title */}
        <PostLink post={post} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
          <h2 style={{
            fontSize: '18px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1.4,
            transition: 'color 0.15s', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f53004')}
            onMouseLeave={e => (e.currentTarget.style.color = '#1a1a1a')}
          >
            {post.title}
          </h2>
        </PostLink>

        {isNew && <span style={{ padding: '1px 6px', fontSize: '10px', fontWeight: 600, background: '#fff3e0', color: '#f57c00', border: '1px solid #ffe0b2', flexShrink: 0 }}>NEW</span>}

        {/* Stats — always visible */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#f53004', flexShrink: 0 }}>
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
            fontSize: '13px', color: '#f53004', textDecoration: 'none', flexShrink: 0,
          }}>
            <i className={catIcon} /> {catName}
          </Link>
        )}
      </div>

      {/* Cover image */}
      <PostLink post={post} style={{ display: 'block', position: 'relative', height: '320px', overflow: 'hidden' }}>
        <img
          {...coverProps({
            src: coverUrl,
            alt: post.title,
            priority,
            style: { height: '320px' },
          })}
        />
        {/* Right edge red bar on hover */}
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: '4px',
          background: '#f53004', opacity: hovered ? 1 : 0, transition: 'opacity 0.2s',
        }} />
      </PostLink>

      {/* Excerpt */}
      {post.excerpt && (
        <div style={{ padding: '14px 20px' }}>
          <p style={{
            fontSize: '14px', lineHeight: 1.8, color: '#555', margin: 0,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
          }}>
            {post.excerpt}
          </p>
        </div>
      )}
    </article>
  );
}
