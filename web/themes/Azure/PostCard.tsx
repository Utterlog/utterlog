'use client';

import Link from 'next/link';
import { getCategoryIcon } from './constants';
import { coverProps, randomCoverUrl } from '@/lib/blog-image';
import { useThemeContext } from '@/lib/theme-context';
import PostLink from '@/components/blog/PostLink';

function formatDate(ts: string | number) {
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'Asia/Shanghai' });
  const day = Number(d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'Asia/Shanghai' }));
  return { mon, day };
}

function formatFullDate(ts: string | number) {
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('-', '/').replace('-', '/').slice(0, 16);
}

export default function PostCard({ post, isNewest, priority }: { post: any; isNewest?: boolean; priority?: boolean }) {
  const { mon, day } = formatDate(post.created_at);
  const cat0 = post.categories?.[0];
  const catName = cat0?.name;
  const catIcon = cat0 ? getCategoryIcon(cat0) : 'fa-sharp fa-light fa-folder';
  const isNew = isNewest === true;
  const { options } = useThemeContext();
  const coverUrl = post.cover_url || randomCoverUrl(post.id, options);

  return (
    <article className="azure-post-card">
      {/* Title row */}
      <div className="azure-post-card-title-row">
        {/* Date badge — full height, hover shows full date */}
        <div className="azure-post-date-badge">
          <div className="azure-post-date-month">{mon}</div>
          <div className="azure-post-date-day">{day}</div>
          <div className="azure-post-date-tooltip">{formatFullDate(post.created_at)}</div>
        </div>

        {/* Title + meta */}
        <div className="azure-post-card-main">
          <PostLink post={post} className="azure-post-card-link">
            <h2 className="azure-post-card-title">{post.title}</h2>
            {isNew && <span className="new-badge-pulse azure-new-badge">NEW</span>}
          </PostLink>

          {/* Stats — desktop hover, mobile visible */}
          <div className="azure-post-card-stats">
            <span>
              <i className="fa-solid fa-fire" aria-hidden="true" /> {post.view_count || 0}
            </span>
            <span>
              <i className="fa-regular fa-comment" aria-hidden="true" /> {post.comment_count || 0}
            </span>
          </div>

          {/* Category */}
          {catName && (
            <Link href={`/categories/${post.categories[0].slug}`} className="azure-post-card-category">
              <i className={catIcon} aria-hidden="true" /> {catName}
            </Link>
          )}
        </div>
      </div>

      {/* Cover image */}
      <PostLink post={post} className="cover-zoom azure-post-card-cover">
        {coverUrl && (
          <img
            {...coverProps({
              src: coverUrl,
              alt: post.title,
              priority,
            })}
          />
        )}
      </PostLink>

      {/* Excerpt — prefer AI summary when present, fall back to manual
          excerpt or a derived slice of content. If the admin clears the
          AI summary the card silently reverts to the excerpt. */}
      {(post.ai_summary || post.excerpt || post.content) && (
        <div className="azure-post-card-excerpt">
          <p>
            {post.ai_summary || post.excerpt || post.content?.replace(/[#*`>\-\[\]()!~|]/g, '').replace(/\n+/g, ' ').trim().slice(0, 300)}
          </p>
        </div>
      )}
    </article>
  );
}
