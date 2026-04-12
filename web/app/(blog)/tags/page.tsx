import Link from 'next/link';
import type { Metadata } from 'next';
import { getTags } from '@/lib/blog-api';

export const metadata: Metadata = {
  title: '标签',
};

export default async function TagsPage() {
  let tags: any[] = [];
  try {
    const response = await getTags();
    tags = response.data || [];
  } catch {}

  // 按文章数排序
  tags.sort((a, b) => (b.post_count || 0) - (a.post_count || 0));

  // 计算标签云大小
  const maxCount = Math.max(...tags.map((t) => t.post_count || 1), 1);
  const getSize = (count: number) => {
    const ratio = (count || 1) / maxCount;
    // 从 0.85rem 到 1.75rem
    return 0.85 + ratio * 0.9;
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold text-main mb-2">标签</h1>
      <p className="text-sub mb-10">
        共 {tags.length} 个标签
      </p>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-3 items-baseline">
          {tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/tags/${tag.slug}`}
              className="inline-block px-3 py-1.5 bg-soft text-sub rounded-md hover:text-primary-themed hover:bg-soft transition-colors"
              style={{ fontSize: `${getSize(tag.post_count)}rem` }}
            >
              #{tag.name}
              <span className="text-xs text-dim ml-1">
                ({tag.post_count || 0})
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-center py-16 text-dim">暂无标签</p>
      )}
    </div>
  );
}
