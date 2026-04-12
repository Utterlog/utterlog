'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import CommentForm from './CommentForm';
import { MessageSquare } from '@/components/icons';

interface Comment {
  id: number;
  post_id: number;
  parent_id: number;
  author_name: string;
  author_email: string;
  author_url?: string;
  author_ip?: string;
  author_agent?: string;
  content: string;
  status: string;
  country?: string;
  created_at: number;
  children?: Comment[];
}

// Simple MD5 hash for gravatar (DJB2 hash as hex, not real MD5 but works for avatar differentiation)
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash).toString(16);
}

function relativeTime(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

// Parse user agent into OS + Browser
function parseUA(ua?: string): { os: string; browser: string } {
  if (!ua) return { os: '', browser: '' };
  let os = '';
  let browser = '';

  // OS
  if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Linux/.test(ua)) os = 'Linux';

  // Browser
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua) && !/Edg/.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';

  return { os, browser };
}

// Country code to name (common ones)
const countryNames: Record<string, string> = {
  CN: '中国', US: '美国', JP: '日本', KR: '韩国', GB: '英国', DE: '德国',
  FR: '法国', CA: '加拿大', AU: '澳大利亚', SG: '新加坡', HK: '香港',
  TW: '台湾', RU: '俄罗斯', IN: '印度', BR: '巴西', NL: '荷兰',
  UZ: '乌兹别克斯坦', KZ: '哈萨克斯坦', TH: '泰国', VN: '越南',
};

function buildCommentTree(comments: Comment[]): Comment[] {
  const map = new Map<number, Comment>();
  const roots: Comment[] = [];

  comments.forEach(c => {
    map.set(c.id, { ...c, children: [] });
  });

  comments.forEach(c => {
    const node = map.get(c.id)!;
    if (c.parent_id && c.parent_id > 0 && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function CommentItem({ comment, postId, depth, onReplySuccess }: {
  comment: Comment;
  postId: number;
  depth: number;
  onReplySuccess: () => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const { os, browser } = parseUA(comment.author_agent);
  const hash = simpleHash(comment.author_email || '');
  const country = comment.country?.toLowerCase();

  return (
    <div style={{ marginLeft: depth > 0 ? '32px' : 0, marginTop: depth > 0 ? '16px' : 0 }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        {/* Avatar */}
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
          background: 'var(--color-bg-soft)', overflow: 'hidden',
        }}>
          <img
            src={`https://gravatar.bluecdn.com/avatar/${hash}?d=mp&s=80`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { (e.target as HTMLImageElement).src = `https://gravatar.bluecdn.com/avatar/0?d=mp&s=80`; }}
          />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header: name + meta */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
            {/* Name */}
            {comment.author_url ? (
              <a href={comment.author_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}>
                {comment.author_name}
              </a>
            ) : (
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>{comment.author_name}</span>
            )}

            {/* Country flag */}
            {country && (
              <img
                src={`https://flagcdn.io/${country}.svg`}
                alt={countryNames[country.toUpperCase()] || country}
                title={countryNames[country.toUpperCase()] || country}
                style={{ width: '16px', height: '12px', objectFit: 'cover', borderRadius: '1px' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}

            {/* Meta badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--color-text-dim)' }}>
              {os && (
                <span style={{ padding: '1px 6px', background: 'var(--color-bg-soft)', borderRadius: '3px' }}>{os}</span>
              )}
              {browser && (
                <span style={{ padding: '1px 6px', background: 'var(--color-bg-soft)', borderRadius: '3px' }}>{browser}</span>
              )}
            </div>

            {/* Time */}
            <span style={{ fontSize: '12px', color: 'var(--color-text-dim)', marginLeft: 'auto' }}>
              {relativeTime(comment.created_at)}
            </span>
          </div>

          {/* Comment body */}
          <p style={{ fontSize: '14px', lineHeight: 1.75, color: 'var(--color-text-main)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {comment.content}
          </p>

          {/* Reply button */}
          <button
            onClick={() => setShowReply(!showReply)}
            style={{
              marginTop: '8px', padding: '2px 8px', fontSize: '12px',
              color: 'var(--color-text-dim)', background: 'none', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <MessageSquare size={12} />
            {showReply ? '取消回复' : '回复'}
          </button>

          {/* Reply form */}
          {showReply && (
            <div style={{ marginTop: '12px' }}>
              <CommentForm
                postId={postId}
                parentId={comment.id}
                compact
                onCancel={() => setShowReply(false)}
                onSuccess={() => { setShowReply(false); onReplySuccess(); }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {comment.children && comment.children.length > 0 && (
        <div style={{ borderLeft: '2px solid var(--color-divider)', paddingLeft: '0', marginTop: '4px' }}>
          {comment.children.map(child => (
            <CommentItem key={child.id} comment={child} postId={postId} depth={depth + 1} onReplySuccess={onReplySuccess} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentList({ postId }: { postId: number }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/comments', { params: { post_id: postId, status: 'approved', per_page: 100 } });
      const data = r.data || r.comments || [];
      setComments(Array.isArray(data) ? data : []);
      setTotal(Array.isArray(data) ? data.length : 0);
    } catch {
      // API might not return comments
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchComments(); }, [postId]);

  const tree = buildCommentTree(comments);

  return (
    <div style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid var(--color-divider)' }}>
      {/* Comment count */}
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', fontFamily: 'var(--font-serif)' }}>
        {loading ? '加载评论中...' : total > 0 ? `${total} 条评论` : '评论'}
      </h3>

      {/* Comment list */}
      {!loading && tree.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '32px' }}>
          {tree.map(comment => (
            <CommentItem key={comment.id} comment={comment} postId={postId} depth={0} onReplySuccess={fetchComments} />
          ))}
        </div>
      )}

      {!loading && tree.length === 0 && (
        <p style={{ fontSize: '14px', color: 'var(--color-text-dim)', textAlign: 'center', padding: '24px 0', marginBottom: '24px' }}>
          暂无评论，来发表第一条评论吧
        </p>
      )}

      {/* Comment form */}
      <CommentForm postId={postId} onSuccess={fetchComments} />
    </div>
  );
}
