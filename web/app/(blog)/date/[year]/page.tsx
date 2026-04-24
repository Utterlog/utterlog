import Link from 'next/link';
import type { Metadata } from 'next';
import { getPosts } from '@/lib/blog-api';
import PostLink from '@/components/blog/PostLink';

interface Props { params: Promise<{ year: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  return { title: `${year} 年度归档` };
}

function formatDate(ts: string | number) {
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return {
    month: d.getMonth() + 1,
    day: d.getDate(),
    full: `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`,
  };
}

function postCategoryIcon(post: any): string {
  const cat = post.categories?.[0];
  if (cat?.icon && typeof cat.icon === 'string' && cat.icon.startsWith('fa')) return cat.icon;
  return 'fa-sharp fa-light fa-folder';
}

export default async function YearArchive({ params }: Props) {
  const { year } = await params;
  const y = Number(year);

  const res = await getPosts({ per_page: 500, status: 'publish' }).catch(() => ({ data: [] }));
  const allPosts = (res.data || []).filter((p: any) => {
    const d = typeof p.created_at === 'number' ? new Date(p.created_at * 1000) : new Date(p.created_at);
    return d.getFullYear() === y;
  });

  // Group by month
  const monthMap = new Map<number, any[]>();
  allPosts.forEach((p: any) => {
    const d = typeof p.created_at === 'number' ? new Date(p.created_at * 1000) : new Date(p.created_at);
    const m = d.getMonth() + 1;
    if (!monthMap.has(m)) monthMap.set(m, []);
    monthMap.get(m)!.push(p);
  });
  const months = Array.from(monthMap.entries()).sort((a, b) => b[0] - a[0]);

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
        <i className="fa-regular fa-calendar" style={{ fontSize: '20px', color: 'var(--color-primary)' }} />
        <h1 style={{ fontSize: '22px', fontWeight: 700 }}>{year} 年度归档</h1>
        <span style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>共 {allPosts.length} 篇</span>
      </div>

      {months.map(([month, posts]) => (
        <div key={month} style={{ border: '1px solid var(--color-border)', marginBottom: '16px' }}>
          <Link href={`/date/${year}/${String(month).padStart(2, '0')}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 20px', background: 'var(--color-bg-soft)', borderBottom: '1px solid var(--color-border)',
            textDecoration: 'none', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)',
          }}>
            <span>{month} 月</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-dim)', fontWeight: 400 }}>{posts.length} 篇</span>
          </Link>
          {posts.map((post: any, idx: number) => (
            <PostLink key={post.id} post={post} style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px',
              borderBottom: idx < posts.length - 1 ? '1px solid var(--color-divider)' : 'none',
              textDecoration: 'none', transition: 'background 0.1s',
            }} className="hover:bg-soft">
              <span style={{ fontSize: '13px', color: 'var(--color-text-dim)', width: '44px', flexShrink: 0 }}>{formatDate(post.created_at).full}</span>
              <i className={postCategoryIcon(post)} title={post.categories?.[0]?.name || ''} style={{ fontSize: '13px', color: 'var(--color-primary)', flexShrink: 0, width: '14px', textAlign: 'center' }} />
              <span style={{ flex: 1, fontSize: '14px', color: 'var(--color-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</span>
            </PostLink>
          ))}
        </div>
      ))}

      {allPosts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-dim)' }}>{year} 年暂无文章</div>
      )}
    </div>
  );
}
