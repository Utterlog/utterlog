import Link from 'next/link';
import type { Metadata } from 'next';
import { getPosts } from '@/lib/blog-api';

export const metadata: Metadata = {
  title: '归档',
};

interface ArchiveGroup {
  year: number;
  months: {
    month: number;
    label: string;
    posts: any[];
  }[];
}

function groupByYearMonth(posts: any[]): ArchiveGroup[] {
  const map = new Map<string, any[]>();

  for (const post of posts) {
    const date = new Date(post.created_at);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(post);
  }

  // 按年月分组
  const yearMap = new Map<number, ArchiveGroup>();

  for (const [key, groupPosts] of map) {
    const [yearStr, monthStr] = key.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const label = `${month + 1} 月`;

    if (!yearMap.has(year)) {
      yearMap.set(year, { year, months: [] });
    }
    yearMap.get(year)!.months.push({ month, label, posts: groupPosts });
  }

  // 排序：年份倒序，月份倒序
  const result = Array.from(yearMap.values()).sort((a, b) => b.year - a.year);
  for (const group of result) {
    group.months.sort((a, b) => b.month - a.month);
  }

  return result;
}

function formatDay(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export default async function ArchivesPage() {
  // 获取所有已发布文章（不分页，取较大数量）
  let posts: any[] = [];
  try {
    const response = await getPosts({ per_page: 500, status: 'publish' });
    posts = response.data || [];
  } catch {}

  const archives = groupByYearMonth(posts);
  const totalPosts = posts.length;

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold text-main mb-2">归档</h1>
      <p className="text-sub mb-10">
        共 {totalPosts} 篇文章
      </p>

      {archives.length > 0 ? (
        <div className="space-y-12">
          {archives.map((group) => (
            <div key={group.year}>
              <h2 className="font-serif text-2xl font-bold text-main mb-6">
                {group.year}
              </h2>
              <div className="space-y-8">
                {group.months.map((monthGroup) => (
                  <div key={monthGroup.month}>
                    <h3 className="text-sm font-medium text-dim uppercase tracking-wider mb-3">
                      {monthGroup.label} ({monthGroup.posts.length} 篇)
                    </h3>
                    <ul className="space-y-2 border-l-2 border-line pl-4">
                      {monthGroup.posts.map((post) => (
                        <li key={post.id} className="flex items-baseline gap-3">
                          <time className="text-sm text-dim shrink-0 w-16">
                            {formatDay(post.created_at)}
                          </time>
                          <Link
                            href={`/posts/${post.slug}`}
                            className="text-main hover:text-primary-themed transition-colors"
                          >
                            {post.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center py-16 text-dim">暂无文章</p>
      )}
    </div>
  );
}
