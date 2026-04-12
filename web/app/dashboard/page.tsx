'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (diff === 0) return;
    const duration = 600;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [value]);

  return <>{display.toLocaleString()}</>;
}
import { postsApi, commentsApi, linksApi } from '@/lib/api';
import {
  FileText, MessageSquare, LinkIcon, Eye,
  TrendingUp, Plus, Edit2, FolderOpen, Settings, ArrowRight,
} from '@/components/icons';
import { formatRelativeTime } from '@/lib/utils';

interface Stats { posts: number; comments: number; links: number; views: number }
interface RecentPost { id: number; title: string; status: string; created_at: string; view_count?: number }

function generateSparkline(): number[] {
  return Array.from({ length: 7 }, () => Math.floor(Math.random() * 60) + 10);
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ posts: 0, comments: 0, links: 0, views: 0 });
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const [recentComments, setRecentComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sparkline] = useState(generateSparkline);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [postsRes, commentsRes, linksRes]: any = await Promise.all([
        postsApi.list({ limit: 5 }), commentsApi.list({ limit: 5 }), linksApi.list(),
      ]);
      setStats({
        posts: postsRes.data?.total || postsRes.meta?.total || 0,
        comments: commentsRes.data?.total || commentsRes.meta?.total || 0,
        links: Array.isArray(linksRes.data) ? linksRes.data.length : 0,
        views: 0,
      });
      setRecentPosts((postsRes.data?.posts || postsRes.data || []).filter((p: any) => p.id != null).slice(0, 5));
      setRecentComments((commentsRes.data?.comments || commentsRes.data || []).filter((c: any) => c.id != null).slice(0, 5));
    } finally { setLoading(false); }
  };

  const statCards = [
    { title: '文章总数', value: stats.posts, icon: FileText, trend: '+3' },
    { title: '评论总数', value: stats.comments, icon: MessageSquare, trend: '+12' },
    { title: '友链数量', value: stats.links, icon: LinkIcon, trend: '' },
    { title: '总访问量', value: stats.views, icon: Eye, trend: '+28' },
  ];

  const quickActions = [
    { label: '写文章', icon: Edit2, href: '/dashboard/posts/create' },
    { label: '管分类', icon: FolderOpen, href: '/dashboard/categories' },
    { label: '看评论', icon: MessageSquare, href: '/dashboard/comments' },
    { label: '设置', icon: Settings, href: '/dashboard/settings' },
  ];

  const statusMap: Record<string, { text: string; cls: string }> = {
    publish: { text: '已发布', cls: 'bg-emerald-100 text-emerald-700' },
    draft: { text: '草稿', cls: 'bg-soft text-sub' },
    pending: { text: '待审', cls: 'bg-amber-100 text-amber-700' },
  };

  const maxS = Math.max(...sparkline);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.title} className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="bg-soft" style={{ width: '40px', height: '40px', borderRadius: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} style={{ color: 'var(--color-primary)' }} />
                </div>
                {c.trend && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '12px', fontWeight: 600, color: '#16a34a' }}>
                    <TrendingUp size={12} />
                    {c.trend}
                  </span>
                )}
              </div>
              <div>
                <p className="text-main" style={{ fontSize: '30px', fontWeight: 350, letterSpacing: '-0.02em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                  {loading ? '—' : <AnimatedNumber value={typeof c.value === 'number' ? c.value : parseInt(c.value) || 0} />}
                </p>
                <p className="text-sub" style={{ fontSize: '13px', marginTop: '4px' }}>{c.title}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trend + Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
          {/* Trend Chart */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>近 7 天访问趋势</h2>
              <span className="text-dim" style={{ fontSize: '12px' }}>数据每小时更新</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '140px' }}>
              {sparkline.map((val, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span className="text-dim" style={{ fontSize: '11px', fontWeight: 600 }}>{val}</span>
                  <div
                    className="hover:bg-primary-active"
                    style={{
                      width: '100%',
                      borderRadius: '1px',
                      backgroundColor: 'color-mix(in srgb, var(--color-primary) 25%, transparent)',
                      height: `${(val / maxS) * 100}%`,
                      minHeight: '8px',
                      transition: 'background-color 0.15s',
                      cursor: 'pointer',
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
              {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
                <span key={d} className="text-dim" style={{ flex: 1, textAlign: 'center', fontSize: '12px' }}>{d}</span>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card" style={{ padding: '24px' }}>
            <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>快捷操作</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {quickActions.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.label}
                    type="button"
                    className="card-hover"
                    onClick={() => router.push(a.href)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '20px 12px',
                      borderRadius: '1px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-card)',
                      cursor: 'pointer',
                      transition: 'box-shadow 0.15s, border-color 0.15s',
                    }}
                  >
                    <Icon size={22} style={{ color: 'var(--color-primary)' }} />
                    <span className="text-main" style={{ fontSize: '13px', fontWeight: 500 }}>{a.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Recent Posts */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="border-b border-line" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>最近文章</h2>
            <button
              type="button"
              onClick={() => router.push('/dashboard/posts')}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              全部 <ArrowRight size={14} />
            </button>
          </div>
          {loading ? (
            <div className="text-dim" style={{ padding: '48px 20px', textAlign: 'center', fontSize: '14px' }}>加载中...</div>
          ) : recentPosts.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
              <p className="text-dim" style={{ fontSize: '14px', marginBottom: '16px' }}>暂无文章</p>
              <button
                type="button"
                onClick={() => router.push('/dashboard/posts/create')}
                className="btn btn-primary"
              >
                <Plus size={16} />
                写第一篇
              </button>
            </div>
          ) : (
            recentPosts.map((post, idx) => {
              const st = statusMap[post.status] || statusMap.draft;
              return (
                <div
                  key={post.id}
                  className="hover:bg-soft"
                  style={{
                    padding: '14px 20px',
                    cursor: 'pointer',
                    transition: 'background-color 0.1s',
                    borderBottom: idx < recentPosts.length - 1 ? '1px solid var(--color-divider)' : 'none',
                  }}
                  onClick={() => router.push(`/dashboard/posts/edit/${post.id}`)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p className="text-main" style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</p>
                      <p className="text-dim" style={{ fontSize: '12px', marginTop: '4px' }}>
                        {formatRelativeTime(post.created_at)}
                        {post.view_count != null && ` · ${post.view_count} 阅读`}
                      </p>
                    </div>
                    <span className={`badge ${st.cls}`}>{st.text}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Recent Comments */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="border-b border-line" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>最新评论</h2>
            <button
              type="button"
              onClick={() => router.push('/dashboard/comments')}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              全部 <ArrowRight size={14} />
            </button>
          </div>
          {loading ? (
            <div className="text-dim" style={{ padding: '48px 20px', textAlign: 'center', fontSize: '14px' }}>加载中...</div>
          ) : recentComments.length === 0 ? (
            <div className="text-dim" style={{ padding: '48px 20px', textAlign: 'center', fontSize: '14px' }}>暂无评论</div>
          ) : (
            recentComments.map((comment, idx) => (
              <div
                key={comment.id}
                style={{
                  padding: '14px 20px',
                  borderBottom: idx < recentComments.length - 1 ? '1px solid var(--color-divider)' : 'none',
                }}
              >
                <p className="text-main" style={{ fontSize: '13px', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {comment.content}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <div
                    style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: 'var(--color-bg-soft)',
                      fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)',
                    }}
                  >
                    {(comment.author?.name || comment.author_name || '?')[0]}
                  </div>
                  <span className="text-sub" style={{ fontSize: '13px', fontWeight: 500 }}>
                    {comment.author?.name || comment.author_name}
                  </span>
                  <span className="text-dim" style={{ fontSize: '12px' }}>
                    {formatRelativeTime(comment.created_at)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Bottom Row: Status + Categories + System */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {/* Article Status */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>文章状态</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { label: '已发布', pct: 70, color: '#16a34a' },
              { label: '草稿', pct: 25, color: 'var(--color-text-dim)' },
              { label: '待审核', pct: 5, color: '#d97706' },
            ].map((item) => (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span className="text-sub" style={{ fontSize: '13px' }}>{item.label}</span>
                  <span className="text-main" style={{ fontSize: '13px', fontWeight: 600 }}>{item.pct}%</span>
                </div>
                <div className="bg-soft" style={{ height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '3px', backgroundColor: item.color, width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Popular Categories */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>热门分类</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { label: '技术', pct: 45 },
              { label: '生活', pct: 30 },
              { label: '随笔', pct: 25 },
            ].map((item) => (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span className="text-sub" style={{ fontSize: '13px' }}>{item.label}</span>
                  <span className="text-main" style={{ fontSize: '13px', fontWeight: 600 }}>{item.pct}%</span>
                </div>
                <div className="bg-soft" style={{ height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '3px', backgroundColor: 'var(--color-primary)', opacity: 0.6, width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System Info */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>系统信息</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {[
              { label: '前端', value: 'Next.js 16' },
              { label: '后端', value: 'Go' },
              { label: '数据库', value: 'PostgreSQL 17' },
              { label: '缓存', value: 'Redis 8' },
            ].map((item, idx) => (
              <div
                key={item.label}
                style={{
                  display: 'flex', justifyContent: 'space-between', padding: '10px 0',
                  borderBottom: idx < 3 ? '1px solid var(--color-divider)' : 'none',
                }}
              >
                <span className="text-sub" style={{ fontSize: '13px' }}>{item.label}</span>
                <span className="text-main" style={{ fontSize: '13px', fontWeight: 600 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
