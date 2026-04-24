'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Link {
  id: number;
  name: string;
  url: string;
  description?: string;
  logo?: string;
  group_name?: string;
  rss_url?: string;
}

function getFavicon(url: string) {
  try {
    const u = new URL(url);
    return `https://favicon.im/${u.hostname}?larger=true`;
  } catch { return ''; }
}

export default function LinksPage() {
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState('all');
  const [showApply, setShowApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', description: '', logo: '', avatar: '', rss_url: '', email: '' });

  useEffect(() => {
    fetchLinks();
  }, []);

  useEffect(() => {
    if (!showApply) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !applying) setShowApply(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [showApply, applying]);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/links', { params: { per_page: 200 } });
      const data = r.data || [];
      setLinks(data.filter((l: any) => l.status === 'publish' || l.status === 1));
    } catch {} finally {
      setLoading(false);
    }
  };

  const groups = ['all', ...Array.from(new Set(links.map(l => l.group_name || '默认')))];
  const filteredLinks = activeGroup === 'all' ? links : links.filter(l => (l.group_name || '默认') === activeGroup);

  // Group links by group_name for display
  const groupedLinks = new Map<string, Link[]>();
  filteredLinks.forEach(l => {
    const g = l.group_name || '默认';
    if (!groupedLinks.has(g)) groupedLinks.set(g, []);
    groupedLinks.get(g)!.push(l);
  });

  const handleApply = async () => {
    if (!form.name.trim()) { toast.error('请输入站点名称'); return; }
    if (!form.url.trim()) { toast.error('请输入站点地址'); return; }
    setApplying(true);
    try {
      await api.post('/links/apply', {
        name: form.name.trim(),
        url: form.url.trim(),
        description: form.description.trim(),
        logo: form.logo.trim() || getFavicon(form.url.trim()),
        avatar: form.avatar.trim(),
        rss_url: form.rss_url.trim(),
        email: form.email.trim(),
      });
      toast.success('申请已提交，审核通过后将显示');
      setForm({ name: '', url: '', description: '', logo: '', avatar: '', rss_url: '', email: '' });
      setShowApply(false);
    } catch {
      toast.error('提交失败，请稍后重试');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 200px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 32px', borderBottom: '1px solid #e5e5e5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <i className="fa-sharp fa-light fa-link" style={{ fontSize: '24px', color: '#0052D9' }} />
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>友情链接</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setShowApply(true)}
            style={{
              padding: '6px 16px', fontSize: '13px', fontWeight: 600,
              border: '1px solid #0052D9', color: '#0052D9',
              background: '#fff', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0052D9'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#0052D9'; }}
          >
            <i className="fa-regular fa-handshake" style={{ fontSize: '12px' }} />
            我要申请
          </button>
          <div style={{ padding: '6px 14px', border: '1px solid #d9d9d9', fontSize: '13px', color: '#666' }}>
            <strong style={{ color: '#1a1a1a', fontWeight: 600 }}>{links.length}</strong> 个友链
          </div>
        </div>
      </div>

      <div style={{ padding: '32px' }}>
        {/* Group tabs */}
        {groups.length > 2 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {groups.map(g => (
              <button key={g} onClick={() => setActiveGroup(g)} style={{
                padding: '6px 16px', fontSize: '13px', fontWeight: activeGroup === g ? 600 : 400,
                border: '1px solid',
                borderColor: activeGroup === g ? '#0052D9' : '#d9d9d9',
                background: activeGroup === g ? '#0052D9' : '#fff',
                color: activeGroup === g ? '#fff' : '#555',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {g === 'all' ? '全部' : g}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#999' }}>加载中...</div>
        ) : links.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#999' }}>暂无友链</div>
        ) : (
          /* Grouped display */
          Array.from(groupedLinks.entries()).map(([groupName, groupLinks]) => (
            <div key={groupName} style={{ marginBottom: '32px' }}>
              {/* Group title — only show when viewing all */}
              {activeGroup === 'all' && groups.length > 2 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <i className="fa-regular fa-folder" style={{ color: '#0052D9', fontSize: '14px' }} />
                  <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>{groupName}</h2>
                  <span style={{ fontSize: '12px', color: '#999' }}>{groupLinks.length} 个</span>
                </div>
              )}

              {/* Cards grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {groupLinks.map(link => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px',
                      padding: '16px 20px', border: '1px solid #e5e5e5',
                      textDecoration: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
                      background: '#fff',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#0052D9'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,82,217,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <img
                      src={link.logo || getFavicon(link.url)}
                      alt=""
                      style={{ width: '44px', height: '44px', objectFit: 'cover', flexShrink: 0, background: '#f5f5f5' }}
                      onError={e => { (e.target as HTMLImageElement).src = getFavicon(link.url); }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {link.name}
                      </div>
                      {link.description && (
                        <div style={{ fontSize: '12px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {link.description}
                        </div>
                      )}
                    </div>
                    <i className="fa-regular fa-arrow-up-right-from-square" style={{ fontSize: '12px', color: '#ccc', flexShrink: 0 }} />
                  </a>
                ))}
              </div>
            </div>
          ))
        )}

      </div>

      {/* Apply Modal */}
      {showApply && (
        <div
          onClick={() => !applying && setShowApply(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '640px', maxHeight: 'calc(100vh - 48px)',
              background: '#fff', border: '1px solid #e5e5e5',
              boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e5e5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-regular fa-handshake" style={{ color: '#0052D9', fontSize: '16px' }} />
                <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>申请友链</h2>
              </div>
              <button
                onClick={() => !applying && setShowApply(false)}
                disabled={applying}
                aria-label="关闭"
                style={{
                  width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: 'none', cursor: applying ? 'not-allowed' : 'pointer',
                  color: '#999', fontSize: '16px', transition: 'color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.color = '#333'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999'; }}
              >
                <i className="fa-regular fa-xmark" />
              </button>
            </div>

            {/* Modal body — scrollable */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <p style={{ fontSize: '13px', color: '#888', marginBottom: '16px', lineHeight: 1.6 }}>
                欢迎互换友链！请填写以下信息，审核通过后将自动显示在本页。
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>站点名称 *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="我的博客"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #d9d9d9', outline: 'none', background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#0052D9')} onBlur={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>站点地址 *</label>
                  <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://example.com"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #d9d9d9', outline: 'none', background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#0052D9')} onBlur={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>站点描述</label>
                  <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="一句话介绍你的站点"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #d9d9d9', outline: 'none', background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#0052D9')} onBlur={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>站点图标</label>
                  <input value={form.logo} onChange={e => setForm({ ...form, logo: e.target.value })} placeholder="留空自动获取"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #d9d9d9', outline: 'none', background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#0052D9')} onBlur={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>头像地址</label>
                  <input value={form.avatar} onChange={e => setForm({ ...form, avatar: e.target.value })} placeholder="https://example.com/avatar.png"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #d9d9d9', outline: 'none', background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#0052D9')} onBlur={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>RSS / Feed 地址</label>
                  <input value={form.rss_url} onChange={e => setForm({ ...form, rss_url: e.target.value })} placeholder="https://example.com/feed.xml"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #d9d9d9', outline: 'none', background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#0052D9')} onBlur={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>联系邮箱</label>
                  <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="方便通知审核结果（选填）" type="email"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #d9d9d9', outline: 'none', background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#0052D9')} onBlur={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
                  />
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 20px', borderTop: '1px solid #e5e5e5', background: '#fafafa' }}>
              <button
                onClick={() => !applying && setShowApply(false)}
                disabled={applying}
                style={{
                  padding: '7px 18px', fontSize: '13px', fontWeight: 500,
                  border: '1px solid #d9d9d9', background: '#fff', color: '#555',
                  cursor: applying ? 'not-allowed' : 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={handleApply}
                disabled={applying}
                style={{
                  padding: '8px 24px', fontSize: '13px', fontWeight: 600,
                  border: 'none', background: '#0052D9', color: '#fff',
                  cursor: applying ? 'wait' : 'pointer', opacity: applying ? 0.6 : 1,
                }}
              >
                {applying ? '提交中...' : '提交申请'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
