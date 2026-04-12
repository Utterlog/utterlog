'use client';

import { useEffect, useState } from 'react';
import { tagsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Table, Pagination, Modal, ConfirmDialog } from '@/components/ui';
import { Tags as TagsIcon, Plus, Edit2, Trash2, Search } from '@/components/icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const tagSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  slug: z.string().min(1, 'Slug不能为空'),
  description: z.string().optional(),
});

type TagForm = z.infer<typeof tagSchema>;

export default function TagsPage() {
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<TagForm>({
    resolver: zodResolver(tagSchema),
  });

  useEffect(() => { fetchTags(); }, [page]);

  const fetchTags = async () => {
    setLoading(true);
    try {
      const response: any = await tagsApi.list({ page, limit: 20, search });
      setTags(response.data || []);
      setTotalPages(response.data?.totalPages || 1);
    } catch { toast.error('获取标签失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditingId(null); reset({ name: '', slug: '', description: '' }); setIsModalOpen(true); };
  const openEdit = (tag: any) => { setEditingId(tag.id); reset({ name: tag.name, slug: tag.slug, description: tag.description || '' }); setIsModalOpen(true); };

  const onSubmit = async (data: TagForm) => {
    setSubmitting(true);
    try {
      if (editingId) { await tagsApi.update(editingId, data); toast.success('更新成功'); }
      else { await tagsApi.create(data); toast.success('创建成功'); }
      setIsModalOpen(false); fetchTags();
    } catch { toast.error(editingId ? '更新失败' : '创建失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await tagsApi.delete(deleteId); toast.success('删除成功'); fetchTags(); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  const columns = [
    { key: 'name', title: '名称', render: (row: any) => (
      <div>
        <p className="text-main" style={{ fontWeight: 500, fontSize: '14px' }}>{row.name}</p>
        <p className="text-dim" style={{ fontSize: '12px' }}>/{row.slug}</p>
      </div>
    )},
    { key: 'description', title: '描述', render: (row: any) => <span className="text-sub" style={{ fontSize: '13px' }}>{row.description || '-'}</span> },
    { key: 'count', title: '文章数', width: '80px' },
    { key: 'actions', title: '操作', width: '100px', render: (row: any) => (
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={() => openEdit(row)} className="text-primary-themed" style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '1px' }}>
          <Edit2 size={16} />
        </button>
        <button onClick={() => setDeleteId(row.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '1px', color: '#dc2626' }}>
          <Trash2 size={16} />
        </button>
      </div>
    )},
  ];

  return (
    <div>

      {/* Header: title + search + action — all in one row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <TagsIcon size={20} className="text-primary-themed" />
          <h1 className="text-main" style={{ fontSize: '18px', fontWeight: 700 }}>标签管理</h1>
        </div>
        <div style={{ flex: 1, display: 'flex', gap: '8px', maxWidth: '320px' }}>
          <Input
            placeholder="搜索标签..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (setPage(1), fetchTags())}
          />
          <Button variant="secondary" onClick={() => { setPage(1); fetchTags(); }} style={{ flexShrink: 0 }}>
            <Search size={16} />
          </Button>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Button onClick={openCreate}>
            <Plus size={16} />
            新建标签
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <Table columns={columns} data={tags} loading={loading} />
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {/* Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑标签' : '新建标签'}>
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input label="名称" {...register('name')} error={errors.name?.message} />
          <Input label="Slug" {...register('slug')} error={errors.slug?.message} />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>描述</label>
            <textarea rows={3} className="input focus-ring" {...register('description')} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px' }}>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button type="submit" loading={submitting}>{editingId ? '保存' : '创建'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除后无法恢复，是否确认删除此标签？" />
    </div>
  );
}
