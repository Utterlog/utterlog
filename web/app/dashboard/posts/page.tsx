'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { postsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Table, Pagination, Badge, ConfirmDialog } from '@/components/ui';
import { Plus, Search, Edit2, Trash2, Eye, MessageSquare } from '@/components/icons';
import { formatDate } from '@/lib/utils';

const statusMap: Record<string, { label: string; variant: 'default' | 'success' | 'warning' }> = {
  publish: { label: '已发布', variant: 'success' },
  draft: { label: '草稿', variant: 'default' },
  private: { label: '私密', variant: 'warning' },
  pending: { label: '待审核', variant: 'warning' },
};

export default function PostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [perPage, setPerPage] = useState(20);
  const [orderDir, setOrderDir] = useState<'desc' | 'asc'>('desc');
  const [batchAction, setBatchAction] = useState('');

  useEffect(() => { fetchPosts(); }, [page, status, perPage, orderDir]);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      setSelected(new Set());
      const response: any = await postsApi.list({
        page, limit: perPage,
        status: status || undefined,
        search: search || undefined,
        order_by: 'created_at', order: orderDir,
      } as any);
      setPosts(response.data?.posts || response.data || []);
      setTotal(response.meta?.total || 0);
      setTotalPages(response.meta?.total_pages || 1);
    } catch { toast.error('获取文章列表失败'); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try { await postsApi.delete(deleteId); toast.success('删除成功'); fetchPosts(); }
    catch { toast.error('删除失败'); }
    finally { setDeleting(false); setDeleteId(null); }
  };

  const handleBatchAction = async () => {
    if (!batchAction || selected.size === 0) return;
    const ids = Array.from(selected);

    if (batchAction === 'delete') {
      if (!confirm(`确认删除 ${ids.length} 篇文章？此操作不可恢复。`)) return;
      try {
        for (const id of ids) await postsApi.delete(id);
        toast.success(`已删除 ${ids.length} 篇文章`);
        fetchPosts();
      } catch { toast.error('批量删除失败'); }
    } else if (['draft', 'private', 'publish'].includes(batchAction)) {
      try {
        for (const id of ids) await postsApi.update(id, { status: batchAction });
        toast.success(`已将 ${ids.length} 篇文章移至${batchAction === 'draft' ? '草稿箱' : batchAction === 'private' ? '私密' : '已发布'}`);
        fetchPosts();
      } catch { toast.error('批量操作失败'); }
    }
    setBatchAction('');
  };

  const toggleSelect = (id: number) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const toggleAll = () => {
    if (selected.size === posts.length) setSelected(new Set());
    else setSelected(new Set(posts.map((p: any) => p.id)));
  };

  const columns: any[] = [
    { key: 'select', title: (
      <input type="checkbox" checked={posts.length > 0 && selected.size === posts.length} onChange={toggleAll} />
    ), width: '36px', render: (row: any) => (
      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} />
    )},
    { key: 'title', title: (
      <span onClick={() => setOrderDir(d => d === 'desc' ? 'asc' : 'desc')} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
        标题
        <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1, fontSize: '10px', color: 'var(--color-text-dim)' }}>
          <span style={{ opacity: orderDir === 'asc' ? 1 : 0.3 }}>▲</span>
          <span style={{ marginTop: '-3px', opacity: orderDir === 'desc' ? 1 : 0.3 }}>▼</span>
        </span>
      </span>
    ), render: (row: any) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '400px' }}>
        <span className="text-dim" style={{ fontSize: '11px', flexShrink: 0 }}>#{row.id}</span>
        <p className="text-main" style={{ fontWeight: 500, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{row.title}</p>
      </div>
    )},
    { key: 'category', title: '分类', width: '80px', render: (row: any) => {
      const name = row.categories?.[0]?.name;
      return name ? <span style={{ fontSize: '11px', padding: '1px 8px', borderRadius: '1px', background: 'var(--color-bg-soft)', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)' }}>{name}</span> : <span className="text-dim" style={{ fontSize: '11px' }}>-</span>;
    }},
    { key: 'tags', title: '关键词', width: '130px', render: (row: any) => {
      const tags = row.tags || [];
      const show = tags.slice(0, 2);
      const more = tags.length - 2;
      if (!tags.length) return <span className="text-dim" style={{ fontSize: '11px' }}>-</span>;
      return (
        <div style={{ display: 'flex', gap: '3px', alignItems: 'center', flexWrap: 'nowrap', overflow: 'hidden' }}>
          {show.map((t: any, i: number) => (
            <span key={i} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '1px', background: 'var(--color-primary)', color: '#fff', opacity: 0.8, whiteSpace: 'nowrap', flexShrink: 0 }}>{t.name}</span>
          ))}
          {more > 0 && <span className="text-dim" style={{ fontSize: '10px', flexShrink: 0 }}>+{more}</span>}
        </div>
      );
    }},
    { key: 'created_at', title: '时间', width: '110px', render: (row: any) => <span className="text-dim" style={{ fontSize: '12px' }}>{formatDate(row.created_at)}</span> },
    { key: 'stats', title: '浏览/评论', width: '80px', render: (row: any) => (
      <span className="text-dim" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Eye size={11} />{row.view_count || 0}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}><MessageSquare size={11} />{row.comment_count || 0}</span>
      </span>
    )},
    { key: 'status', title: '状态', width: '60px', render: (row: any) => {
      const s = statusMap[row.status] || { label: row.status, variant: 'default' as const };
      return <Badge variant={s.variant}>{s.label}</Badge>;
    }},
    { key: 'actions', title: '操作', width: '100px', render: (row: any) => (
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={() => router.push(`/dashboard/posts/edit/${row.id}`)} className="action-btn" title="编辑"><Edit2 size={14} /></button>
        <button onClick={() => window.open(`/posts/${row.slug}`, '_blank')} className="action-btn" title="预览"><Eye size={14} /></button>
        <button onClick={() => setDeleteId(row.id)} className="action-btn danger" title="删除"><Trash2 size={14} /></button>
      </div>
    )},
  ];

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Input placeholder="检索标题 / 摘要 / 正文" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (setPage(1), fetchPosts())} style={{ maxWidth: '300px' }} />
          <Button onClick={() => { setPage(1); fetchPosts(); }} style={{ flexShrink: 0 }}><Search size={14} /> 搜索</Button>
          <Button variant="secondary" onClick={() => { setSearch(''); setStatus(''); setPage(1); setTimeout(fetchPosts, 0); }} style={{ flexShrink: 0 }}>重置</Button>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {([
            { key: '', label: '全部' },
            { key: 'publish', label: '已发布' },
            { key: 'draft', label: '草稿' },
            { key: 'private', label: '私密' },
          ]).map(s => (
            <Button key={s.key} variant={status === s.key ? 'primary' : 'secondary'} onClick={() => { setStatus(s.key); setPage(1); }} style={{ flexShrink: 0 }}>
              {s.label}
            </Button>
          ))}
          <Button onClick={() => router.push('/dashboard/posts/create')} style={{ flexShrink: 0 }}><Plus size={16} />新建文章</Button>
        </div>
      </div>

      <div className="card">
        {/* Batch action bar */}
        {selected.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: 'var(--color-bg-soft)', borderBottom: '1px solid var(--color-border)' }}>
            <span className="text-sub" style={{ fontSize: '13px' }}>已选 {selected.size} 项</span>
            <select value={batchAction} onChange={e => setBatchAction(e.target.value)} className="input" style={{ width: '120px', fontSize: '12px', padding: '4px 8px' }}>
              <option value="">批量操作</option>
              <option value="draft">移到草稿箱</option>
              <option value="private">移到私密</option>
              <option value="publish">设为已发布</option>
              <option value="delete">删除</option>
            </select>
            <Button variant="secondary" onClick={handleBatchAction} disabled={!batchAction} style={{ fontSize: '12px', padding: '4px 12px' }}>
              执行
            </Button>
            <button onClick={() => setSelected(new Set())} style={{ fontSize: '12px', color: 'var(--color-text-dim)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>
              取消选择
            </button>
          </div>
        )}

        <Table columns={columns} data={posts} loading={loading} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderTop: '1px solid var(--color-border)' }}>
          <span className="text-dim" style={{ fontSize: '12px' }}>
            共 {total} 篇文章
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select value={perPage} onChange={e => { setPerPage(parseInt(e.target.value)); setPage(1); }} className="input" style={{ width: '80px', fontSize: '12px', padding: '4px 6px' }}>
              <option value={10}>10 条/页</option>
              <option value={20}>20 条/页</option>
              <option value={50}>50 条/页</option>
              <option value={100}>100 条/页</option>
            </select>
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </div>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除后无法恢复，是否确认？" confirmText="删除" loading={deleting} />
    </div>
  );
}
