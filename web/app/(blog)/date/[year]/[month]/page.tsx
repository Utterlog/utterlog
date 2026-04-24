import Link from 'next/link';
import type { Metadata } from 'next';
import { getPosts } from '@/lib/blog-api';
import PostLink from '@/components/blog/PostLink';

interface Props { params: Promise<{ year: string; month: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year, month } = await params;
  return { title: `${year} 年 ${parseInt(month)} 月归档` };
}

function postCategoryIcon(post: any): string {
  const cat = post.categories?.[0];
  if (cat?.icon && typeof cat.icon === 'string' && cat.icon.startsWith('fa')) return cat.icon;
  return 'fa-sharp fa-light fa-folder';
}

export default async function MonthArchive({ params }: Props) {
  const { year, month } = await params;
  const y = Number(year), m = Number(month);

  const res = await getPosts({ per_page: 500, status: 'publish' }).catch(() => ({ data: [] }));
  const posts = (res.data || []).filter((p: any) => {
    const d = typeof p.created_at === 'number' ? new Date(p.created_at * 1000) : new Date(p.created_at);
    return d.getFullYear() === y && d.getMonth() + 1 === m;
  });

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
        <i className="fa-regular fa-calendar" style={{ fontSize: '20px', color: 'var(--color-primary)' }} />
        <h1 style={{ fontSize: '22px', fontWeight: 700 }}>{year} 年 {parseInt(month)} 月归档</h1>
        <span style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>共 {posts.length} 篇</span>
        <Link href={`/date/${year}`} style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--color-primary)', textDecoration: 'none' }}>
          <i className="fa-solid fa-arrow-left fa-fw" /> 返回 {year} 年
        </Link>
      </div>

      <div style={{ border: '1px solid var(--color-border)' }}>
        {posts.map((post: any, idx: number) => {
          const d = typeof post.created_at === 'number' ? new Date(post.created_at * 1000) : new Date(post.created_at);
          const day = String(d.getDate()).padStart(2, '0');
          return (
            <PostLink key={post.id} post={post} style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px',
              borderBottom: idx < posts.length - 1 ? '1px solid var(--color-divider)' : 'none',
              textDecoration: 'none', transition: 'background 0.1s',
            }} className="hover:bg-soft">
              <span style={{
                width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-primary)', color: '#fff', fontSize: '14px', fontWeight: 700, flexShrink: 0,
              }}>{day}</span>
              <i className={postCategoryIcon(post)} title={post.categories?.[0]?.name || ''} style={{ fontSize: '13px', color: 'var(--color-primary)', flexShrink: 0, width: '14px', textAlign: 'center' }} />
              <span style={{ flex: 1, fontSize: '15px', color: 'var(--color-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--color-text-dim)', flexShrink: 0 }}>
                <span><i className="fa-regular fa-comment fa-fw" /> {post.comment_count || 0}</span>
                <span><i className="fa-regular fa-eye fa-fw" /> {post.view_count || 0}</span>
              </span>
            </PostLink>
          );
        })}
        {posts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-dim)' }}>该月暂无文章</div>
        )}
      </div>
    </div>
  );
}
