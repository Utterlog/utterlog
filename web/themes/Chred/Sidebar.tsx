'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

import { getCategoryIcon } from './constants';

function timeAgo(ts: string | number) {
  const t = typeof ts === 'number' ? ts * 1000 : new Date(ts).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  return Math.floor(diff / 86400) + ' 天前';
}

export default function Sidebar() {
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [activeTab, setActiveTab] = useState<'latest' | 'hot' | 'random'>('latest');
  const [tabPosts, setTabPosts] = useState<any[]>([]);
  const [archiveOpen, setArchiveOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/categories`).then(r => r.json()).then(r => setCategories(r.data || [])).catch(() => {});
    fetch(`${API}/tags`).then(r => r.json()).then(r => {
      const t = (r.data || []).sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
      setTags(t.slice(0, 20));
    }).catch(() => {});
    fetch(`${API}/comments?per_page=5`).then(r => r.json()).then(r => setComments((r.data?.comments || r.data || []).slice(0, 5))).catch(() => {});
    fetch(`${API}/archive/stats`).then(r => r.json()).then(r => setStats(r.data || {})).catch(() => {});
    fetchTabPosts('latest');
  }, []);

  const fetchTabPosts = (tab: string) => {
    let url = `${API}/posts?per_page=5&status=publish`;
    if (tab === 'hot') url += '&order_by=comment_count&order=desc';
    if (tab === 'random') url += '&order_by=random&_t=' + Date.now();
    fetch(url).then(r => r.json()).then(r => setTabPosts((r.data?.posts || r.data || []).slice(0, 5))).catch(() => {});
  };

  const switchTab = (tab: 'latest' | 'hot' | 'random') => {
    setActiveTab(tab);
    fetchTabPosts(tab);
  };

  const sectionTitle = (icon: string, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderBottom: '1px solid #e5e5e5', fontSize: '13px', fontWeight: 600, color: '#333' }}>
      <i className={icon} style={{ color: '#f53004' }} /> {label}
    </div>
  );

  return (
    <aside style={{ width: '280px', flexShrink: 0 }}>

      {/* Heatmap — 3 rows x 15 cols, last 45 days */}
      <div style={{ borderBottom: '1px solid #e5e5e5', padding: '8px 0' }}>
        {(() => {
          const hm: { date: string; count: number }[] = stats.heatmap || [];
          const countMap: Record<string, number> = {};
          hm.forEach((d: any) => { if (d.date) countMap[d.date] = d.count || 0; });
          const ROWS = 3, COLS = 15, total = ROWS * COLS;
          const days: { date: string; count: number }[] = [];
          const now = new Date();
          for (let i = total - 1; i >= 0; i--) {
            const d = new Date(now); d.setDate(d.getDate() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            days.push({ date: key, count: countMap[key] || 0 });
          }
          return (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: '2px', padding: '0 10px' }}>
              {days.map((day, i) => (
                <div key={i} title={`${day.date}: ${day.count} 篇`} style={{
                  aspectRatio: '1',
                  background: day.count > 3 ? '#216e39' : day.count > 1 ? '#30a14e' : day.count > 0 ? '#9be9a8' : '#ebedf0',
                }} />
              ))}
            </div>
          );
        })()}
      </div>

      {/* Post tabs */}
      <div style={{ borderBottom: '1px solid #e5e5e5' }}>
        <div style={{ display: 'flex' }}>
          {[
            { key: 'latest' as const, icon: 'fa-regular fa-clock', label: '最新日志' },
            { key: 'hot' as const, icon: 'fa-solid fa-fire', label: '热评日志' },
            { key: 'random' as const, icon: 'fa-solid fa-shuffle', label: '随机日志' },
          ].map(tab => (
            <button key={tab.key} onClick={() => switchTab(tab.key)} style={{
              flex: 1, padding: '8px 0', fontSize: '11px', fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? '#fff' : '#666',
              background: activeTab === tab.key ? '#f53004' : '#fafafa',
              border: 'none', borderBottom: activeTab === tab.key ? 'none' : '1px solid #e5e5e5',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
            }}>
              <i className={tab.icon} style={{ fontSize: '10px' }} /> {tab.label}
            </button>
          ))}
        </div>
        <div>
          {tabPosts.map((post: any, idx: number) => {
            const numIcons = ['fa-solid fa-1', 'fa-solid fa-2', 'fa-solid fa-3', 'fa-solid fa-4', 'fa-solid fa-5'];
            return (
            <Link key={post.id} href={`/posts/${post.slug}`} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px', fontSize: '13px', color: '#333',
              textDecoration: 'none', borderBottom: '1px solid #f0f0f0',
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <i className={`${numIcons[idx] || 'fa-solid fa-5'} fa-fw`} style={{ color: idx < 3 ? '#f53004' : '#bbb', fontSize: '12px' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</span>
            </Link>
            );
          })}
        </div>
      </div>

      {/* Recent comments */}
      <div style={{ borderBottom: '1px solid #e5e5e5' }}>
        {sectionTitle('fa-regular fa-comments', '最新评论')}
        {comments.map((c: any) => (
          <div key={c.id} style={{ display: 'flex', gap: '10px', padding: '10px 16px', borderBottom: '1px solid #f5f5f5' }}>
            <img
              src={c.avatar_url || `https://gravatar.bluecdn.com/avatar/${c.author_email}?s=40&d=mp`}
              alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>{c.author_name || c.author}</span>
                <span style={{ fontSize: '11px', color: '#bbb' }}>{timeAgo(c.created_at)}</span>
              </div>
              <p style={{ fontSize: '12px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '2px 0 0' }}>
                {c.content}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Tags — colorful cloud */}
      <div style={{ borderBottom: '1px solid #e5e5e5' }}>
        {sectionTitle('fa-solid fa-tags', '关键词')}
        <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {tags.map((tag, i) => {
            const colors = ['#e53935', '#0052D9', '#43a047', '#f57c00', '#8e24aa', '#00838f', '#c62828', '#1565c0', '#2e7d32', '#d84315'];
            const c = colors[i % colors.length];
            const size = tag.count > 5 ? 14 : tag.count > 2 ? 13 : 12;
            return (
              <Link key={tag.id} href={`/tags/${tag.slug}`} style={{
                padding: '4px 10px', fontSize: `${size}px`,
                border: `1px solid ${c}40`, color: c, background: `${c}08`,
                textDecoration: 'none', transition: 'all 0.15s',
                fontWeight: tag.count > 3 ? 600 : 400,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = c; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = c; }}
                onMouseLeave={e => { e.currentTarget.style.background = `${c}08`; e.currentTarget.style.color = c; e.currentTarget.style.borderColor = `${c}40`; }}
              >
                {tag.name} <span style={{ fontSize: '10px', opacity: 0.6 }}>{tag.count}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Categories — full list */}
      <div style={{ borderBottom: '1px solid #e5e5e5' }}>
        {sectionTitle('fa-solid fa-folder-tree', '文章分类')}
        {categories.map(cat => (
          <Link key={cat.id} href={`/categories/${cat.slug}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 16px', fontSize: '13px', color: '#333',
            textDecoration: 'none', borderBottom: '1px solid #f5f5f5',
            transition: 'background 0.1s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className={`${getCategoryIcon(cat)} fa-fw`} style={{ color: '#f53004' }} />
              {cat.name}
            </span>
            <span style={{ fontSize: '12px', color: '#bbb' }}>{cat.count || 0}</span>
          </Link>
        ))}
      </div>

      {/* Stats */}
      <div>
        {sectionTitle('fa-solid fa-chart-simple', '统计信息')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '0' }}>
          {[
            { label: '文章', value: stats.post_count || 0 },
            { label: '评论', value: stats.comment_count || 0 },
            { label: '建站天数', value: stats.days || 0 },
            { label: '全部字数', value: stats.word_count ? (stats.word_count / 1000).toFixed(1) + 'k' : '0' },
          ].map((s, i) => (
            <div key={s.label} style={{
              padding: '12px 16px',
              borderBottom: i < 2 ? '1px solid #f0f0f0' : 'none',
              borderRight: i % 2 === 0 ? '1px solid #f0f0f0' : 'none',
            }}>
              <div style={{ fontSize: '11px', color: '#999' }}>{s.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
