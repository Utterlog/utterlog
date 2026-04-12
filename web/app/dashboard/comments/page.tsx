'use client';

import { useEffect, useState } from 'react';
import { commentsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Table, Pagination, ConfirmDialog, Modal } from '@/components/ui';
import { Check, X, Trash2, MessageSquare, Eye, Search, Edit2, Star } from '@/components/icons';
import { formatDate } from '@/lib/utils';

const defaultAvatar = 'https://gravatar.bluecdn.com/avatar/0?d=mp&s=64';

function CommentCell({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const lineHeight = 1.6;
  const maxLines = 3;
  const maxHeight = `${maxLines * lineHeight}em`;

  return (
    <div>
      <p
        className="text-main"
        style={{
          fontSize: '13px', lineHeight, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          overflow: expanded ? 'visible' : 'hidden',
          maxHeight: expanded ? 'none' : maxHeight,
        }}
      >
        {content}
      </p>
      {content && content.length > 60 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ fontSize: '11px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0 0' }}
        >
          {expanded ? '收起' : '展开'}
        </button>
      )}
    </div>
  );
}

export default function CommentsPage() {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [replyId, setReplyId] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);
  const [editComment, setEditComment] = useState<any>(null);

  useEffect(() => { fetchComments(); }, [page, status]);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const params: any = { page, per_page: 20 };
      if (status === 'mine') {
        params.user_id = 1;
      } else if (status === '' || status === undefined) {
        params.status = 'approved';
      } else {
        params.status = status;
      }
      if (search.trim()) {
        params.search = search.trim();
      }
      const response: any = await commentsApi.list(params);
      setComments(response.data || []);
      setTotal(response.meta?.total || 0);
      setTotalPages(response.meta?.total_pages || 1);
    } catch {
      toast.error('获取评论失败');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await commentsApi.update(id, { status: newStatus });
      toast.success('状态更新成功');
      fetchComments();
    } catch { toast.error('操作失败'); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await commentsApi.delete(deleteId);
      toast.success('删除成功');
      fetchComments();
    } catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  const handleReply = async () => {
    if (!replyId || !replyContent.trim()) return;
    setReplying(true);
    try {
      await commentsApi.reply(replyId, replyContent);
      toast.success('回复成功');
      setReplyId(null);
      setReplyContent('');
      fetchComments();
    } catch { toast.error('回复失败'); }
    finally { setReplying(false); }
  };

  const toggleFeatured = async (id: number, current: boolean) => {
    try {
      await commentsApi.update(id, { featured: !current });
      toast.success(current ? '已取消精选' : '已设为精选');
      fetchComments();
    } catch { toast.error('操作失败'); }
  };

  const handleEditSave = async () => {
    if (!editComment) return;
    try {
      await commentsApi.update(editComment.id, {
        author: editComment.author,
        email: editComment.email,
        url: editComment.url || '',
        content: editComment.content,
      });
      toast.success('评论已更新');
      setEditComment(null);
      fetchComments();
    } catch { toast.error('更新失败'); }
  };

  const statusTabs = [
    { key: '', label: '全部' },
    { key: 'mine', label: '我的' },
    { key: 'spam', label: '垃圾' },
    { key: 'trash', label: '回收站' },
  ];

  const columns = [
    {
      key: 'author',
      title: '作者',
      width: '200px',
      render: (row: any) => (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <img
            src={row.avatar_url || defaultAvatar}
            alt=""
            style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, marginTop: '2px', background: 'var(--color-bg-soft)' }}
            onError={e => { (e.target as HTMLImageElement).src = defaultAvatar; }}
          />
          <div style={{ fontSize: '12px', lineHeight: 1.6, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: '13px' }} className="text-main">{row.author}</span>
              {row.geo?.country_code && (
                <img src={`https://flagcdn.io/${row.geo.country_code}.svg`} alt="" title={row.geo ? [row.geo.country, row.geo.province, row.geo.city].filter(Boolean).join(' · ') : ''} style={{ width: '14px', height: '10px', objectFit: 'cover', borderRadius: '1px' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
              {row.ip && <span className="text-dim" style={{ fontSize: '11px' }}>{row.ip}</span>}
            </div>
            {row.url && (
              <div>
                <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-primary-themed" style={{ textDecoration: 'none', fontSize: '11px' }}>
                  {row.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              </div>
            )}
            {row.email && (
              <div className="text-dim" style={{ fontSize: '11px' }}>{row.email}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'content',
      title: '评论',
      width: '300px',
      render: (row: any) => <CommentCell content={row.content} />,
    },
    {
      key: 'post',
      title: '回复至',
      width: '180px',
      render: (row: any) => (
        <div style={{ fontSize: '12px', overflow: 'hidden' }}>
          {row.post_slug ? (
            <a href={`/posts/${row.post_slug}`} target="_blank" rel="noopener noreferrer" className="text-primary-themed" style={{ fontWeight: 500, fontSize: '13px', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{row.post_title || '-'}</a>
          ) : (
            <p className="text-main" style={{ fontWeight: 500, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.post_title || '-'}</p>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      title: '提交于',
      width: '120px',
      render: (row: any) => (
        <span className="text-dim" style={{ fontSize: '12px' }}>{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: '140px',
      render: (row: any) => (
        <div style={{ display: 'flex', gap: '4px', fontSize: '12px' }}>
          <button onClick={() => toggleFeatured(row.id, row.featured)} className="action-btn" title={row.featured ? '取消精选' : '设为精选'} style={{ color: row.featured ? '#f59e0b' : undefined }}>
            <Star size={14} style={{ fill: row.featured ? '#f59e0b' : 'none' }} />
          </button>
          <button onClick={() => setEditComment({ ...row })} className="action-btn" title="编辑"><Edit2 size={14} /></button>
          <button onClick={() => { setReplyId(row.id); setReplyContent(''); }} className="action-btn" title="回复"><MessageSquare size={14} /></button>
          <button onClick={() => handleStatusChange(row.id, row.status === 'spam' ? 'approved' : 'spam')} className="action-btn" title={row.status === 'spam' ? '标记正常' : '标记垃圾'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </button>
          <button onClick={() => setDeleteId(row.id)} className="action-btn danger" title="删除"><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Status tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {statusTabs.map(s => (
            <Button
              key={s.key}
              variant={status === s.key ? 'primary' : 'secondary'}
              onClick={() => { setStatus(s.key); setPage(1); }}
              style={{ flexShrink: 0 }}
            >
              {s.label}
            </Button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (setPage(1), fetchComments())}
            placeholder="搜索评论内容 / 昵称 / 邮箱"
            className="input"
            style={{ width: '220px', fontSize: '13px' }}
          />
          <Button onClick={() => { setPage(1); fetchComments(); }} style={{ flexShrink: 0, width: '36px', height: '36px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Search size={14} /></Button>
        </div>
      </div>

      <div className="card">
        <Table columns={columns} data={comments} loading={loading} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderTop: '1px solid var(--color-border)' }}>
          <span className="text-dim" style={{ fontSize: '12px' }}>共 {total} 条评论</span>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="确认删除"
        message="删除后无法恢复，是否确认删除此评论？"
      />

      <Modal isOpen={!!replyId} onClose={() => setReplyId(null)} title="回复评论" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            rows={4}
            placeholder="输入回复内容..."
            className="input"
            style={{ resize: 'vertical' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="secondary" onClick={() => setReplyId(null)}>取消</Button>
            <Button onClick={handleReply} disabled={replying}>{replying ? '回复中...' : '回复'}</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editComment} onClose={() => setEditComment(null)} title="编辑评论" size="sm">
        {editComment && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="text-dim" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>昵称</label>
                <input value={editComment.author || ''} onChange={e => setEditComment({ ...editComment, author: e.target.value })} className="input" style={{ width: '100%' }} />
              </div>
              <div>
                <label className="text-dim" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>邮箱</label>
                <input value={editComment.email || ''} onChange={e => setEditComment({ ...editComment, email: e.target.value })} className="input" style={{ width: '100%' }} />
              </div>
            </div>
            <div>
              <label className="text-dim" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>网址</label>
              <input value={editComment.url || ''} onChange={e => setEditComment({ ...editComment, url: e.target.value })} className="input" style={{ width: '100%' }} />
            </div>
            <div>
              <label className="text-dim" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>评论内容</label>
              <textarea value={editComment.content || ''} onChange={e => setEditComment({ ...editComment, content: e.target.value })} className="input" rows={5} style={{ width: '100%', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="secondary" onClick={() => setEditComment(null)}>取消</Button>
              <Button onClick={handleEditSave}>保存</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
