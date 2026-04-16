'use client';

import PostCard from '@/components/blog/PostCard';
import Pagination from '@/components/blog/Pagination';
import SocialLinks from '@/components/blog/SocialLinks';
import { useThemeContext } from '@/lib/theme-context';

export default function HomePage({ posts, page, totalPages, archiveStats }: { posts: any[]; page: number; totalPages: number; archiveStats?: any }) {
  const { site, options } = useThemeContext();
  const stats = archiveStats || {};

  return (
    <div style={{ padding: '32px' }}>
      {/* Header + Stats — 与归档页结构一致 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <i className="fa-sharp fa-light fa-house" style={{ fontSize: '24px', color: 'var(--color-primary)' }} />
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-main)' }}>{site.title || 'Utterlog'}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {stats.post_count > 0 && [
            { value: stats.post_count || posts.length, label: '篇文章' },
            { value: stats.days || 0, label: '天' },
            { value: stats.word_count ? Math.round(stats.word_count / 1000) * 1000 : 0, label: '字' },
            { value: stats.comment_count || 0, label: '条评论' },
          ].map((s, i) => (
            <div key={i} style={{
              padding: '6px 14px', border: '1px solid var(--color-border)',
              fontSize: '13px', color: 'var(--color-text-sub)',
            }}>
              <strong style={{ color: 'var(--color-text-main)', fontWeight: 600 }}>{s.value.toLocaleString()}</strong> {s.label}
            </div>
          ))}
          <SocialLinks options={options} />
        </div>
      </div>

      {/* Posts */}
      {posts.length > 0 ? (
        <div style={{ border: '1px solid var(--color-border)', padding: '0 24px' }}>
          {posts.map((post, idx) => (
            <div key={post.id} style={{ borderBottom: idx < posts.length - 1 ? '1px solid var(--color-divider)' : 'none' }}>
              <PostCard post={post} />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-dim" style={{ textAlign: 'center', padding: '80px 0' }}>
          <p style={{ fontSize: '16px' }}>暂无文章</p>
        </div>
      )}

      <Pagination currentPage={page} totalPages={totalPages} />
    </div>
  );
}
