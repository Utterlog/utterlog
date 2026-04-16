'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

function LazyCardImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { rootMargin: '100px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      {inView && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          className={`azure-img-hover ${loaded ? 'azure-img-lazy loaded' : 'azure-img-lazy'}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
      {(!inView || !loaded) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--color-text-dim)">
            <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
            <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z">
              <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
            </path>
          </svg>
        </div>
      )}
    </div>
  );
}

interface NavPost {
  id: number;
  title: string;
  slug: string;
  cover_url?: string;
  created_at: number;
  view_count: number;
  comment_count: number;
  categories?: { id: number; name: string; slug: string; icon?: string }[];
}

interface FeedItem {
  title: string;
  link: string;
  site_name: string;
  site_url: string;
  pub_date: number;
}

interface NavigationData {
  prev: NavPost | null;
  next: NavPost | null;
  related: NavPost[];
  random: NavPost[];
  popular: NavPost[];
  category: NavPost[];
  feeds: FeedItem[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function PostNavigation({ postId, coverUrl }: { postId: number; coverUrl?: string }) {
  const [data, setData] = useState<NavigationData | null>(null);
  const [activeTab, setActiveTab] = useState('related');
  const [refreshing, setRefreshing] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const PAGE_SIZE = 5;

  const fetchData = () => {
    fetch(`${API_BASE}/posts/${postId}/navigation`)
      .then(r => r.json())
      .then(r => {
        const d = r.data || r;
        setData(d);
        if (d.related?.length > 0) setActiveTab(prev => prev || 'related');
        else if (d.random?.length > 0) setActiveTab('random');
        else if (d.popular?.length > 0) setActiveTab('popular');
        else if (d.category?.length > 0) setActiveTab('category');
      })
      .catch(() => {});
  };

  useEffect(() => { fetchData(); }, [postId]);

  const handleRefresh = () => {
    setRefreshing(true);
    const allItems = activeTab === 'feeds' ? feeds : (tabs.find(t => t.key === activeTab)?.items || []);
    const totalPages = Math.ceil(allItems.length / PAGE_SIZE);
    setPageIndex(prev => (prev + 1) % Math.max(totalPages, 1));
    setTimeout(() => setRefreshing(false), 300);
  };

  if (!data) return null;

  const feeds = data.feeds || [];

  const tabs = [
    { key: 'related', label: '相关文章', items: data.related || [] },
    { key: 'random', label: '随机文章', items: data.random || [] },
    { key: 'popular', label: '热门文章', items: data.popular || [] },
    { key: 'category', label: '分类文章', items: data.category || [] },
    { key: 'feeds', label: '友链更新', items: [] as NavPost[] },
    { key: 'network_latest', label: '最新更新', items: [] as NavPost[] },
    { key: 'network_hot', label: '网络热门', items: [] as NavPost[] },
  ];

  const allActiveItems = tabs.find(t => t.key === activeTab)?.items || [];
  const activeItems = allActiveItems.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE);
  // 如果超出范围回到第一页
  if (activeItems.length === 0 && allActiveItems.length > 0) {
    setPageIndex(0);
  }

  return (
    <div className="post-nav-section">
      {/* Prev / Next — 全宽主题色背景，中间特色图分隔 */}
      {(data.prev || data.next) && (
        <div className="post-prev-next">
          {data.prev ? (
            <Link href={`/posts/${data.prev.slug}`} className="post-prev-next-link prev">
              <div className="post-prev-next-text">
                <span className="post-prev-next-label"><i className="fa-regular fa-arrow-left" style={{ fontSize: '12px' }} /> 上一篇</span>
                <span className="post-prev-next-title">{data.prev.title}</span>
              </div>
              <div className="post-prev-next-cover">
                <img src={data.prev.cover_url || `https://img.et/1920/1080?type=landscape&r=${data.prev.id}`} alt="" />
              </div>
            </Link>
          ) : (
            <div className="post-prev-next-link prev" style={{ cursor: 'default' }}>
              <div className="post-prev-next-cover">
                {coverUrl && <img src={coverUrl} alt="" />}
              </div>
              <div className="post-prev-next-text">
                <span className="post-prev-next-label"><i className="fa-light fa-sparkles" style={{ fontSize: '12px' }} /> 已是最早一篇</span>
              </div>
            </div>
          )}
          {data.next ? (
            <Link href={`/posts/${data.next.slug}`} className="post-prev-next-link next">
              <div className="post-prev-next-cover">
                <img src={data.next.cover_url || `https://img.et/1920/1080?type=landscape&r=${data.next.id}`} alt="" />
              </div>
              <div className="post-prev-next-text">
                <span className="post-prev-next-label">下一篇 <i className="fa-regular fa-arrow-right" style={{ fontSize: '12px' }} /></span>
                <span className="post-prev-next-title">{data.next.title}</span>
              </div>
            </Link>
          ) : (
            <div className="post-prev-next-link next" style={{ cursor: 'default' }}>
              <div className="post-prev-next-cover">
                {coverUrl && <img src={coverUrl} alt="" />}
              </div>
              <div className="post-prev-next-text">
                <span className="post-prev-next-label">这是最新文章 <i className="fa-light fa-sparkles" style={{ fontSize: '12px' }} /></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs + Post List */}
      {tabs.some(t => t.items.length > 0) && (
        <div className="post-related-section">
          <div className="post-related-tabs">
            {tabs.map(tab => (
              <button
                key={tab.key}
                className={`post-related-tab${activeTab === tab.key ? ' active' : ''}`}
                onClick={() => { setActiveTab(tab.key); setPageIndex(0); }}
                disabled={tab.items.length === 0}
              >
                {tab.label}
              </button>
            ))}
            <button
              className="post-related-refresh"
              onClick={handleRefresh}
              title="换一批"
            >
              <i className={`fa-light fa-arrows-rotate${refreshing ? ' fa-spin' : ''}`} />
            </button>
          </div>
          <div className="post-related-grid">
            {/* 友链更新 — 特殊渲染 */}
            {activeTab === 'feeds' && feeds.length > 0 && feeds.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE).map((item, idx) => {
              const date = new Date((item.pub_date || 0) * 1000);
              const mon = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
              return (
                <a key={idx} href={item.link} target="_blank" rel="noopener noreferrer" className="post-related-card">
                  <div className="post-related-card-cover" style={{ background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center', padding: '12px 8px' }}>
                      <i className="fa-light fa-rss" style={{ fontSize: '20px', color: 'var(--color-text-dim)', marginBottom: '4px', display: 'block' }} />
                      <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', fontWeight: 500 }}>{item.site_name}</span>
                    </div>
                    <span className="post-related-card-date">{mon}</span>
                    <div className="post-related-card-overlay">
                      <div className="post-related-card-bottom">
                        <span className="post-related-card-title">{item.title}</span>
                        <span className="post-related-card-stats">
                          <i className="fa-light fa-arrow-up-right-from-square" /> {item.site_name}
                        </span>
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
            {activeTab === 'feeds' && feeds.length === 0 && (
              <div className="post-related-empty">暂无友链订阅数据</div>
            )}
            {/* 普通文章卡片 */}
            {activeTab !== 'feeds' && activeItems.map(post => {
              const cat = post.categories?.[0];
              const coverSrc = post.cover_url || `https://img.et/1920/1080?type=landscape&r=${post.id}`;
              const date = new Date((post.created_at || 0) * 1000);
              const mon = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
              return (
                <Link key={post.id} href={`/posts/${post.slug}`} className="post-related-card azure-img-hover-wrap">
                  <div className="post-related-card-cover">
                    <LazyCardImage src={coverSrc} alt={post.title} />
                    <span className="post-related-card-date">{mon}</span>
                    {cat && (
                      <span className="post-related-card-cat">
                        {cat.icon && <i className={cat.icon} />} {cat.name}
                      </span>
                    )}
                    <div className="post-related-card-overlay">
                      <div className="post-related-card-bottom">
                        <span className="post-related-card-title">{post.title}</span>
                        <span className="post-related-card-stats">
                          <i className="fa-regular fa-eye" /> {post.view_count || 0}
                          <i className="fa-regular fa-comment" style={{ marginLeft: '6px' }} /> {post.comment_count || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
            {activeTab !== 'feeds' && activeItems.length === 0 && (
              <div className="post-related-empty">
                {activeTab.startsWith('network_') ? (
                  <><i className="fa-light fa-globe" style={{ marginRight: '6px' }} />Utterlog Network 数据即将开放</>
                ) : '暂无文章'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
