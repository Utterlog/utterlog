
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

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
import api, { postsApi, commentsApi, linksApi, networkApi } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';

interface Stats { posts: number; comments: number; links: number; views: number; today: number; words: number; days: number; categories: number; tags: number }
interface RecentPost { id: number; title: string; status: string; created_at: string; view_count?: number; comment_count?: number; categories?: { id: number; name: string; slug: string; icon?: string }[] }
interface NetworkActivity { type: string; site: string; site_name: string; title: string; content_type: string; created_at: string }
interface NetworkSite { name: string; url: string; logo: string; description: string }


export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ posts: 0, comments: 0, links: 0, views: 0, today: 0, words: 0, days: 0, categories: 0, tags: 0 });
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const [recentComments, setRecentComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sparkline, setSparkline] = useState<{ date: string; count: number; weekday: string }[]>([]);
  const [networkConnected, setNetworkConnected] = useState(false);
  const [networkActivity, setNetworkActivity] = useState<NetworkActivity[]>([]);
  const [networkSites, setNetworkSites] = useState<NetworkSite[]>([]);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [dashRes, postsRes, commentsRes]: any = await Promise.all([
        api.get('/dashboard/stats'),
        postsApi.list({ limit: 5 }),
        commentsApi.list({ per_page: 15, status: 'approved' }),
      ]);
      const d = dashRes.data || dashRes;
      setStats({
        posts: d.posts || 0, comments: d.comments || 0, links: d.links || 0,
        views: d.total_views || 0, today: d.today_visits || 0,
        words: d.total_words || 0, days: d.days || 0,
        categories: d.categories || 0, tags: d.tags || 0,
      });
      // Fill all 7 days (today-6 ~ today), missing days = 0
      const trendMap: Record<string, number> = {};
      for (const t of (d.trend || [])) trendMap[t.date] = t.count;
      const days7: { date: string; count: number; weekday: string }[] = [];
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      for (let i = 6; i >= 0; i--) {
        const day = new Date(); day.setDate(day.getDate() - i);
        const key = `${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        days7.push({ date: key, count: trendMap[key] ?? 0, weekday: weekdays[day.getDay()] });
      }
      setSparkline(days7);
      setRecentPosts((postsRes.data?.posts || postsRes.data || []).filter((p: any) => p.id != null).slice(0, 5));
      setRecentComments((commentsRes.data?.comments || commentsRes.data || []).filter((c: any) => c.id != null && !c.user_id).slice(0, 5));
    } finally { setLoading(false); }

    // Fetch Utterlog Network data (non-blocking)
    try {
      const nr: any = await networkApi.status();
      const nd = nr.data || nr;
      setNetworkConnected(nd.connected || false);
      if (nd.connected) {
        const [feedRes, sitesRes]: any = await Promise.all([
          networkApi.feed({ per_page: 5 }).catch(() => ({ data: { items: [] } })),
          networkApi.sites({ page: 1 }).catch(() => ({ data: { sites: [] } })),
        ]);
        setNetworkActivity((feedRes.data?.items || feedRes.items || []).slice(0, 5));
        setNetworkSites((sitesRes.data?.sites || sitesRes.sites || []).slice(0, 4));
      }
    } catch {}
  };

  const statCards = [
    { title: '文章', value: stats.posts, icon: 'fa-sharp fa-light fa-file-lines', color: 'var(--color-primary)' },
    { title: '评论', value: stats.comments, icon: 'fa-sharp fa-light fa-comments', color: '#f59e0b' },
    { title: '浏览量', value: stats.views, icon: 'fa-sharp fa-light fa-eye', color: '#16a34a' },
    { title: '今日访问', value: stats.today, icon: 'fa-sharp fa-light fa-chart-line', color: '#8b5cf6' },
    { title: '分类', value: stats.categories, icon: 'fa-sharp fa-light fa-folder-tree', color: '#0ea5e9' },
    { title: '标签', value: stats.tags, icon: 'fa-sharp fa-light fa-tags', color: '#ec4899' },
    { title: '总字数', value: stats.words >= 10000 ? (stats.words / 10000).toFixed(1) + '万' : stats.words.toLocaleString(), icon: 'fa-sharp fa-light fa-font', color: '#f97316' },
    { title: '建站天数', value: stats.days, icon: 'fa-sharp fa-light fa-calendar-days', color: '#6366f1' },
  ];

  const quickActions = [
    { label: '写文章', icon: 'fa-sharp fa-light fa-pen-to-square', href: '/posts/create' },
    { label: '管分类', icon: 'fa-sharp fa-light fa-folder-open', href: '/posts/categories' },
    { label: '看评论', icon: 'fa-sharp fa-light fa-comments', href: '/comments' },
    { label: '设置', icon: 'fa-sharp fa-light fa-gear', href: '/settings' },
  ];

  const statusMap: Record<string, { text: string; cls: string }> = {
    publish: { text: '已发布', cls: 'bg-emerald-100 text-emerald-700' },
    draft: { text: '草稿', cls: 'bg-soft text-sub' },
    pending: { text: '待审', cls: 'bg-amber-100 text-amber-700' },
  };

  const maxS = Math.max(...sparkline.map(s => s.count), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {statCards.map((c) => (
            <div key={c.title} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${c.color} 10%, transparent)` }}>
                <i className={c.icon} style={{ fontSize: '18px', color: c.color }} />
              </div>
              <div>
                <p className="text-main" style={{ fontSize: '22px', fontWeight: 700 }}>
                  {loading ? '—' : typeof c.value === 'number' ? <AnimatedNumber value={c.value} /> : c.value}
                </p>
                <p className="text-dim" style={{ fontSize: '12px' }}>{c.title}</p>
              </div>
            </div>
          ))}
      </div>

      {/* Trend + Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
          {/* Trend Chart */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-sharp fa-light fa-chart-column" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
                <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>近 7 天访问趋势</h2>
              </div>
              <span className="text-dim" style={{ fontSize: '12px' }}>数据每小时更新</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
              {sparkline.map((s, i) => {
                const barH = Math.max(Math.round((s.count / maxS) * 108), 6);
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                    <span className="text-dim" style={{ fontSize: '11px', fontWeight: 600 }}>{s.count || ''}</span>
                    <div
                      className="hover:bg-primary-active"
                      style={{
                        width: '100%',
                        borderRadius: '1px',
                        backgroundColor: 'color-mix(in srgb, var(--color-primary) 25%, transparent)',
                        height: `${barH}px`,
                        transition: 'background-color 0.15s',
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
              {sparkline.map((s, i) => (
                <span key={i} className="text-dim" style={{ flex: 1, textAlign: 'center', fontSize: '12px' }}>{s.weekday}</span>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <i className="fa-sharp fa-light fa-bolt" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
              <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>快捷操作</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {quickActions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    className="card-hover"
                    onClick={() => navigate(a.href)}
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
                    <i className={a.icon} style={{ fontSize: '22px', color: 'var(--color-primary)' }} />
                    <span className="text-main" style={{ fontSize: '13px', fontWeight: 500 }}>{a.label}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Recent Posts */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="border-b border-line" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-sharp fa-light fa-pen-to-square" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
              <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>最近文章</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/posts')}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              全部 <i className="fa-regular fa-arrow-right" style={{ fontSize: '13px' }} />
            </button>
          </div>
          {loading ? (
            <div className="text-dim" style={{ padding: '48px 20px', textAlign: 'center', fontSize: '14px' }}>加载中...</div>
          ) : recentPosts.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
              <p className="text-dim" style={{ fontSize: '14px', marginBottom: '16px' }}>暂无文章</p>
              <button
                type="button"
                onClick={() => navigate('/posts/create')}
                className="btn btn-primary"
              >
                <i className="fa-regular fa-plus" style={{ fontSize: '15px' }} />
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
                  onClick={() => navigate(`/posts/edit/${post.id}`)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        {post.categories?.[0]?.icon && <i className={post.categories[0].icon} style={{ fontSize: '13px', color: 'var(--color-text-dim)', flexShrink: 0 }} />}
                        <p className="text-main" style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</p>
                      </div>
                      <p className="text-dim" style={{ fontSize: '12px', marginTop: '4px' }}>
                        {formatRelativeTime(post.created_at)}
                        {post.view_count != null && ` · ${post.view_count} 阅读`}
                        {post.comment_count != null && ` · ${post.comment_count} 评论`}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-sharp fa-light fa-comments" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
              <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>最新评论</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/comments')}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              全部 <i className="fa-regular fa-arrow-right" style={{ fontSize: '13px' }} />
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {comment.avatar_url ? (
                    <img src={comment.avatar_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg-soft)', fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {(comment.author?.name || comment.author_name || '?')[0]}
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '4px' }}>
                      <span className="text-sub" style={{ fontSize: '13px', fontWeight: 500, flexShrink: 0 }}>{comment.author?.name || comment.author_name}</span>
                      {comment.post_title && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); navigate(`/posts/edit/${comment.post_id}`); }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '12px', color: 'var(--color-text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 6px', minWidth: 0, overflow: 'hidden' }}
                        >
                          {comment.post_categories?.[0]?.icon
                            ? <i className={comment.post_categories[0].icon} style={{ fontSize: '11px', flexShrink: 0 }} />
                            : <i className="fa-regular fa-file-lines" style={{ fontSize: '11px', flexShrink: 0 }} />
                          }
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comment.post_title}</span>
                        </button>
                      )}
                      <span className="text-dim" style={{ fontSize: '12px', flexShrink: 0, marginLeft: 'auto' }}>{formatRelativeTime(comment.created_at)}</span>
                    </div>
                    <p className="text-main" style={{ fontSize: '13px', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {comment.content}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Utterlog Community Panel */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="border-b border-line" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="var(--color-primary)" />
              <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
            </svg>
            <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>Utterlog 社区</h2>
            <span style={{
              padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
              background: networkConnected ? '#dcfce7' : 'var(--color-bg-soft)',
              color: networkConnected ? '#16a34a' : 'var(--color-text-dim)',
            }}>
              {networkConnected ? '已连接' : '未连接'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/utterlog')}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {networkConnected ? '管理' : '连接'} <i className="fa-regular fa-arrow-right" style={{ fontSize: '13px' }} />
          </button>
        </div>

        {!networkConnected ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <i className="fa-light fa-globe" style={{ fontSize: '40px', color: 'var(--color-text-dim)', margin: '0 auto 16px', display: 'block', textAlign: 'center' }} />
            <p className="text-main" style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>加入 Utterlog 去中心化网络</p>
            <p className="text-dim" style={{ fontSize: '13px', marginBottom: '20px', maxWidth: '400px', margin: '0 auto 20px' }}>
              连接到 Utterlog 社区，与其他独立博客互相订阅、共享内容、交流互动
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/utterlog')}
              style={{ fontSize: '13px' }}
            >
              <i className="fa-regular fa-globe-nodes" style={{ fontSize: '15px' }} />
              前往连接
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '200px' }}>
            {/* Activity Feed */}
            <div style={{ borderRight: '1px solid var(--color-divider)' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-divider)' }}>
                <span className="text-sub" style={{ fontSize: '12px', fontWeight: 600 }}>网络动态</span>
              </div>
              {networkActivity.length === 0 ? (
                <div className="text-dim" style={{ padding: '32px 20px', textAlign: 'center', fontSize: '13px' }}>暂无社区动态</div>
              ) : (
                networkActivity.map((item, idx) => (
                  <div key={idx} style={{
                    padding: '10px 20px',
                    borderBottom: idx < networkActivity.length - 1 ? '1px solid var(--color-divider)' : 'none',
                  }}>
                    <p className="text-main" style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600 }}>{item.site_name}</span>
                      {' '}发布了{item.content_type === 'moment' ? '说说' : '文章'}
                    </p>
                    <p className="text-dim" style={{ fontSize: '12px', marginTop: '2px' }}>{item.title}</p>
                  </div>
                ))
              )}
            </div>

            {/* Network Sites */}
            <div>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-divider)' }}>
                <span className="text-sub" style={{ fontSize: '12px', fontWeight: 600 }}>新加入站点</span>
              </div>
              {networkSites.length === 0 ? (
                <div className="text-dim" style={{ padding: '32px 20px', textAlign: 'center', fontSize: '13px' }}>暂无新站点</div>
              ) : (
                networkSites.map((site, idx) => (
                  <div key={idx} style={{
                    padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '10px',
                    borderBottom: idx < networkSites.length - 1 ? '1px solid var(--color-divider)' : 'none',
                  }}>
                    {site.logo ? (
                      <img src={site.logo} alt="" style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' }} />
                    ) : (
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--color-bg-soft)', fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)',
                      }}>
                        {(site.name || '?')[0]}
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p className="text-main" style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.name}</p>
                      <p className="text-dim" style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.url}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Row: Status + Categories + System */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {/* Article Status */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <i className="fa-sharp fa-light fa-chart-pie" style={{ fontSize: '14px', color: 'var(--color-primary)' }} />
            <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600 }}>文章状态</h3>
          </div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <i className="fa-sharp fa-light fa-folder-open" style={{ fontSize: '14px', color: 'var(--color-primary)' }} />
            <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600 }}>热门分类</h3>
          </div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <i className="fa-sharp fa-light fa-server" style={{ fontSize: '14px', color: 'var(--color-primary)' }} />
            <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600 }}>系统信息</h3>
          </div>
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
