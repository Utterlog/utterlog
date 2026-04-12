import { getGoods } from '@/lib/blog-api';
import { Star } from '@/components/icons';

export default async function GoodsPage() {
  let items: any[] = [];
  try { const r = await getGoods({ per_page: 30 }); items = r.data || []; } catch {}

  return (
    <div>
      <h1 className="text-main" style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>好物</h1>
      <p className="text-sub" style={{ fontSize: '15px', marginBottom: '32px' }}>我用过的</p>
      {items.length === 0 ? (
        <p className="text-dim" style={{ textAlign: 'center', padding: '60px 0' }}>暂无内容</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
          {items.map((item: any) => (
            <div key={item.id} className="card" style={{ overflow: 'hidden' }}>
              {item.cover_url && (
                <div style={{ width: '100%', height: '180px', backgroundColor: 'var(--color-bg-soft)', overflow: 'hidden' }}>
                  <img src={item.cover_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600 }}>{item.title}</h3>
                  {item.price && <span className="text-primary-themed" style={{ fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>{item.price}</span>}
                </div>
                {item.brand && <p className="text-sub" style={{ fontSize: '12px', marginBottom: '6px' }}>{item.brand}</p>}
                {item.rating > 0 && (
                  <div style={{ display: 'flex', gap: '2px', marginBottom: '6px' }}>
                    {[1,2,3,4,5].map((n: number) => <Star key={n} size={11} style={{ color: n <= item.rating ? '#f59e0b' : 'var(--color-text-dim)', fill: n <= item.rating ? '#f59e0b' : 'none' }} />)}
                  </div>
                )}
                {item.comment && <p className="text-dim" style={{ fontSize: '12px', marginBottom: '6px' }}>{item.comment}</p>}
                {item.pros && <p style={{ fontSize: '12px', color: '#16a34a', marginBottom: '2px' }}>+ {item.pros}</p>}
                {item.cons && <p style={{ fontSize: '12px', color: '#dc2626' }}>- {item.cons}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
