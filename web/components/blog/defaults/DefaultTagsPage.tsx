import Link from 'next/link';

interface DefaultTagsPageProps {
  tags: any[];
}

export default function DefaultTagsPage({ tags }: DefaultTagsPageProps) {
  const sorted = [...tags].sort((a, b) => (b.post_count || b.count || 0) - (a.post_count || a.count || 0));
  const maxCount = Math.max(...sorted.map((t) => t.post_count || t.count || 1), 1);
  const getSize = (count: number) => 0.85 + ((count || 1) / maxCount) * 0.9;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem' }}>
        <i className="fa-solid fa-tags" style={{ fontSize: '22px', color: 'var(--color-primary)' }} />
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-main)' }}>标签</h1>
        <span style={{ fontSize: '14px', color: 'var(--color-text-dim)', marginLeft: '8px' }}>共 {sorted.length} 个标签</span>
      </div>

      {sorted.length > 0 ? (
        <div className="flex flex-wrap gap-3 items-baseline">
          {sorted.map((tag) => (
            <Link
              key={tag.id}
              href={`/tags/${tag.slug}`}
              className="inline-block px-3 py-1.5 bg-soft text-sub hover:text-primary-themed hover:bg-soft transition-colors"
              style={{ fontSize: `${getSize(tag.post_count || tag.count)}rem` }}
            >
              #{tag.name}
              <span className="text-xs text-dim ml-1">({tag.post_count || tag.count || 0})</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-center py-16 text-dim">暂无标签</p>
      )}
    </div>
  );
}
