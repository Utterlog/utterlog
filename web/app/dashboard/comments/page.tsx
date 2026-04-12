'use client';

import { useEffect, useState } from 'react';
import { commentsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Table, Pagination, Badge, ConfirmDialog, Modal } from '@/components/ui';
import { Check, X, Trash2, MessageSquare, Eye } from '@/components/icons';
import { formatRelativeTime } from '@/lib/utils';
import { useForm } from 'react-hook-form';

const statusMap: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' }> = {
  approved: { label: '已通过', variant: 'success' },
  pending: { label: '待审核', variant: 'warning' },
  spam: { label: '垃圾', variant: 'error' },
};

export default function CommentsPage() {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [replyId, setReplyId] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);

  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    fetchComments();
  }, [page, status]);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const response: any = await commentsApi.list({
        page,
        limit: 20,
        status: status || undefined,
      });
      setComments(response.data?.comments || []);
      setTotalPages(response.data?.totalPages || 1);
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
    } catch {
      toast.error('操作失败');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await commentsApi.delete(deleteId);
      toast.success('删除成功');
      fetchComments();
    } catch {
      toast.error('删除失败');
    } finally {
      setDeleteId(null);
    }
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
    } catch {
      toast.error('回复失败');
    } finally {
      setReplying(false);
    }
  };

  const columns = [
    {
      key: 'content',
      title: '评论内容',
      render: (row: any) => (
        <div>
          <p className="text-sm text-main line-clamp-2">{row.content}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-dim">
            <span>{row.author_name}</span>
            <span>·</span>
            <span>{row.author_email}</span>
            {row.post && (
              <>
                <span>·</span>
                <span className="text-primary-themed">《{row.post.title}》</span>
              </>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      title: '状态',
      width: '100px',
      render: (row: any) => {
        const s = statusMap[row.status] || { label: row.status, variant: 'default' };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'created_at',
      title: '时间',
      width: '120px',
      render: (row: any) => formatRelativeTime(row.created_at),
    },
    {
      key: 'actions',
      title: '操作',
      width: '180px',
      render: (row: any) => (
        <div className="flex gap-1">
          {row.status === 'pending' && (
            <button
              onClick={() => handleStatusChange(row.id, 'approved')}
              className="p-1.5 text-emerald-600 hover:bg-soft rounded-[4px]"
              title="通过"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
          {row.status === 'approved' && (
            <button
              onClick={() => setReplyId(row.id)}
              className="p-1.5 text-primary-themed hover:bg-soft rounded-[4px]"
              title="回复"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => handleStatusChange(row.id, row.status === 'spam' ? 'approved' : 'spam')}
            className="p-1.5 text-amber-600 hover:bg-soft rounded-[4px]"
            title={row.status === 'spam' ? '标记为正常' : '标记为垃圾'}
          >
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDeleteId(row.id)}
            className="p-1.5 text-red-600 hover:bg-soft rounded-[4px]"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="">
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input" style={{ width: '120px' }}>
          <option value="">全部状态</option>
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="spam">垃圾评论</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Table columns={columns} data={comments} loading={loading} />
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="确认删除"
        message="删除后无法恢复，是否确认删除此评论？"
      />

      {/* Reply Modal */}
      <Modal isOpen={!!replyId} onClose={() => setReplyId(null)} title="回复评论" size="sm">
        <div className="space-y-4">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            rows={4}
            placeholder="输入回复内容..."
            className="input"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReplyId(null)}>取消</Button>
            <Button onClick={handleReply} loading={replying}>回复</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
