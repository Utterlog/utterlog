import { getBooks } from '@/lib/blog-api';
import { Star } from '@/components/icons';

const progressLabel: Record<string, string> = { want: '想读', reading: '在读', finished: '读完', abandoned: '弃读' };

export default async function BooksPage() {
  let items: any[] = [];
  try { const r = await getBooks({ per_page: 30 }); items = r.data || []; } catch {}

  return (
    <div>
      <h1 className="text-main" style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>图书</h1>
      <p className="text-sub" style={{ fontSize: '15px', marginBottom: '32px' }}>我读过的</p>
      {items.length === 0 ? (
        <p className="text-dim" style={{ textAlign: 'center', padding: '60px 0' }}>暂无内容</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
          {items.map((item: any) => (
            <div key={item.id} className="card" style={{ overflow: 'hidden', position: 'relative' }}>
              {item.progress && (
                <span className="bg-soft text-primary-themed" style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '11px', fontWeight: 500, padding: '2px 6px', borderRadius: '3px' }}>
                  {progressLabel[item.progress] || item.progress}
                </span>
              )}
              {item.cover_url && (
                <div style={{ width: '100%', aspectRatio: '2/3', backgroundColor: 'var(--color-bg-soft)', overflow: 'hidden' }}>
                  <img src={item.cover_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ padding: '12px' }}>
                <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>{item.title}</h3>
                <p className="text-sub" style={{ fontSize: '12px', marginBottom: '4px' }}>{item.author_name || ''}</p>
                {item.rating > 0 && (
                  <div style={{ display: 'flex', gap: '2px' }}>
                    {[1,2,3,4,5].map((n: number) => <Star key={n} size={11} style={{ color: n <= item.rating ? '#f59e0b' : 'var(--color-text-dim)', fill: n <= item.rating ? '#f59e0b' : 'none' }} />)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
