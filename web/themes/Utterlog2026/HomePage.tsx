import PostCard from '@/components/blog/PostCard';
import Pagination from '@/components/blog/Pagination';

export default function HomePage({ posts, page, totalPages }: { posts: any[]; page: number; totalPages: number }) {
  return (
    <div>
      {/* Hero */}
      <div style={{ marginBottom: '40px' }}>
        <h1 className="font-logo text-main" style={{ fontSize: '32px', marginBottom: '8px' }}>
          Utterlog
        </h1>
        <p className="text-sub" style={{ fontSize: '16px' }}>
          记录思考，分享见解
        </p>
      </div>

      {/* Posts */}
      {posts.length > 0 ? (
        <div>
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
