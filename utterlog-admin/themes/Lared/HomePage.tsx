import PostCard from './PostCard';
import Pagination from '@/components/blog/Pagination';

export default function HomePage({ posts, page, totalPages }: { posts: any[]; page: number; totalPages: number }) {
  return (
    <div>
      {/* Hero — Lared style: large title with accent bar */}
      <div style={{ marginBottom: '48px', paddingBottom: '24px', borderBottom: '3px solid #f53004' }}>
        <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#000', letterSpacing: '-0.03em', marginBottom: '4px' }}>
          Utterlog
        </h1>
        <p style={{ fontSize: '14px', color: '#888', letterSpacing: '0.02em' }}>
          记录思考，分享见解
        </p>
      </div>

      {/* Post list */}
      {posts.length > 0 ? (
        <div>
          {posts.map((post, idx) => (
            <div key={post.id} style={{ borderBottom: idx < posts.length - 1 ? '1px solid #eee' : 'none' }}>
              <PostCard post={post} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#999' }}>
          <p style={{ fontSize: '16px' }}>暂无文章</p>
        </div>
      )}

      <Pagination currentPage={page} totalPages={totalPages} />
    </div>
  );
}
