'use client';

import { useState, useEffect } from 'react';
import { Bell } from '@/components/icons';
import api from '@/lib/api';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000); // poll every minute
    return () => clearInterval(interval);
  }, []);

  const fetchUnread = async () => {
    try {
      const r: any = await api.get('/notifications/unread-count');
      setUnread(r.data?.count || 0);
    } catch {}
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/notifications?page=1&per_page=10');
      setNotifications(r.data || []);
    } catch {}
    setLoading(false);
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setUnread(0);
      setNotifications(ns => ns.map(n => ({ ...n, is_read: true })));
    } catch {}
  };

  const handleOpen = () => {
    if (!open) fetchNotifications();
    setOpen(!open);
  };

  const formatTime = (ts: any) => {
    if (!ts) return '';
    const num = typeof ts === 'number' ? ts : parseInt(ts);
    const d = new Date(num * 1000);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={handleOpen} className="relative p-2 text-sub btn-ghost" style={{ borderRadius: '1px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Bell size={18} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: '4px', right: '4px',
            minWidth: '16px', height: '16px', borderRadius: '8px',
            background: '#F53F3F', color: '#fff', fontSize: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', fontWeight: 600,
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', right: 0, top: '100%', marginTop: '8px',
            width: '340px', maxHeight: '400px', zIndex: 41,
            background: 'var(--color-bg-card)', borderRadius: '1px',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '14px', fontWeight: 600 }}>通知</span>
              {unread > 0 && (
                <button onClick={markAllRead} style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  全部已读
                </button>
              )}
            </div>

            {/* List */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {loading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '13px' }}>加载中...</div>
              ) : notifications.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '13px' }}>暂无通知</div>
              ) : (
                notifications.map((n, i) => (
                  <div key={i} style={{
                    padding: '10px 16px', borderBottom: '1px solid var(--color-divider)',
                    background: n.is_read ? 'transparent' : 'var(--color-bg-soft)',
                    cursor: 'pointer',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <p style={{ fontSize: '13px', fontWeight: n.is_read ? 400 : 600, flex: 1 }}>
                        {typeof n.title === 'string' ? n.title : String(n.title || '')}
                      </p>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', flexShrink: 0, marginLeft: '8px' }}>
                        {formatTime(n.created_at)}
                      </span>
                    </div>
                    {n.content && <p style={{ fontSize: '12px', color: 'var(--color-text-dim)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeof n.content === 'string' ? n.content : ''}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
