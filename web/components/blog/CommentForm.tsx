'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import toast from 'react-hot-toast';

interface CommentFormProps {
  postId: number;
  parentId?: number;
  onSuccess?: () => void;
  onCancel?: () => void;
  compact?: boolean;
}

export default function CommentForm({ postId, parentId, onSuccess, onCancel, compact }: CommentFormProps) {
  const { user, accessToken } = useAuthStore();
  const isAdmin = !!accessToken && !!user;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Restore from localStorage or use admin info
  useEffect(() => {
    if (isAdmin && user) {
      setName(user.nickname || user.username || '');
      setEmail(user.email || '');
      setUrl('');
    } else {
      const saved = localStorage.getItem('comment_user');
      if (saved) {
        try {
          const d = JSON.parse(saved);
          if (d.name) setName(d.name);
          if (d.email) setEmail(d.email);
          if (d.url) setUrl(d.url);
        } catch {}
      }
    }
  }, [isAdmin]);

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('请输入昵称'); return; }
    if (!email.trim()) { toast.error('请输入邮箱'); return; }
    if (!content.trim()) { toast.error('请输入评论内容'); return; }

    setSubmitting(true);
    try {
      await api.post('/comments', {
        post_id: postId,
        parent_id: parentId || 0,
        author: name.trim(),
        email: email.trim(),
        url: url.trim() || undefined,
        content: content.trim(),
      });

      // Save user info
      localStorage.setItem('comment_user', JSON.stringify({ name, email, url }));

      toast.success('评论已提交，等待审核');
      setContent('');
      onSuccess?.();
    } catch {
      toast.error('评论提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const avatarHash = email.trim()
    ? Array.from(email.trim().toLowerCase()).reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0).toString(16).replace('-', '')
    : '';

  return (
    <div style={{ background: compact ? 'var(--color-bg-soft)' : 'transparent', borderRadius: compact ? '8px' : 0, padding: compact ? '16px' : 0 }}>
      {!compact && (
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px', fontFamily: 'var(--font-serif)' }}>
          发表评论
        </h3>
      )}

      {/* User info row */}
      {isAdmin ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
            background: 'var(--color-bg-soft)', overflow: 'hidden',
          }}>
            <img src={`https://gravatar.bluecdn.com/avatar/${avatarHash}?d=mp&s=64`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{name}</span>
          <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '3px', background: 'var(--color-primary)', color: '#fff' }}>管理员</span>
        </div>
      ) : (
      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
        {/* Avatar preview */}
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
          background: 'var(--color-bg-soft)', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {email.trim() ? (
            <img
              src={`https://gravatar.bluecdn.com/avatar/${avatarHash}?d=mp&s=80`}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M5 20c0-4 3-7 7-7s7 3 7 7"/></svg>
          )}
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="昵称 *"
            style={{
              padding: '8px 12px', fontSize: '13px', borderRadius: '6px',
              border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
              outline: 'none', color: 'var(--color-text-main)',
            }}
          />
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="邮箱 *"
            type="email"
            style={{
              padding: '8px 12px', fontSize: '13px', borderRadius: '6px',
              border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
              outline: 'none', color: 'var(--color-text-main)',
            }}
          />
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="网址（可选）"
            style={{
              padding: '8px 12px', fontSize: '13px', borderRadius: '6px',
              border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
              outline: 'none', color: 'var(--color-text-main)',
            }}
          />
        </div>
      </div>
      )}

      {/* Content */}
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder={parentId ? '写下你的回复...' : '写下你的评论...'}
        rows={compact ? 3 : 4}
        style={{
          width: '100%', padding: '12px', fontSize: '14px', lineHeight: 1.7,
          borderRadius: '6px', border: '1px solid var(--color-border)',
          background: 'var(--color-bg-card)', outline: 'none', resize: 'vertical',
          color: 'var(--color-text-main)', fontFamily: 'inherit',
        }}
      />

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
        <p style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>
          支持 Markdown 语法
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          {onCancel && (
            <button onClick={onCancel} style={{
              padding: '6px 16px', fontSize: '13px', borderRadius: '6px',
              border: '1px solid var(--color-border)', background: 'transparent',
              color: 'var(--color-text-sub)', cursor: 'pointer',
            }}>
              取消
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '6px 20px', fontSize: '13px', fontWeight: 600, borderRadius: '6px',
              border: 'none', background: 'var(--color-primary)', color: '#fff',
              cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? '提交中...' : parentId ? '回复' : '发表评论'}
          </button>
        </div>
      </div>
    </div>
  );
}
