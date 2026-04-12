'use client';

import { useEffect, useState } from 'react';
import { categoriesApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Table, Modal, ConfirmDialog, EmptyState } from '@/components/ui';
import { FolderOpen, Plus, Edit2, Trash2 } from '@/components/icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const categorySchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  slug: z.string().min(1, 'Slug不能为空'),
  description: z.string().optional(),
  parent_id: z.number().optional(),
});

type CategoryForm = z.infer<typeof categorySchema>;

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const response: any = await categoriesApi.list();
      setCategories(response.data || []);
    } catch {
      toast.error('获取分类失败');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    reset({ name: '', slug: '', description: '', parent_id: undefined });
    setIsModalOpen(true);
  };

  const openEdit = (category: any) => {
    setEditingId(category.id);
    reset({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      parent_id: category.parent_id,
    });
    setIsModalOpen(true);
  };

  const onSubmit = async (data: CategoryForm) => {
    setSubmitting(true);
    try {
      if (editingId) {
        await categoriesApi.update(editingId, data);
        toast.success('更新成功');
      } else {
        await categoriesApi.create(data);
        toast.success('创建成功');
      }
      setIsModalOpen(false);
      fetchCategories();
    } catch {
      toast.error(editingId ? '更新失败' : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await categoriesApi.delete(deleteId);
      toast.success('删除成功');
      fetchCategories();
    } catch {
      toast.error('删除失败');
    } finally {
      setDeleteId(null);
    }
  };

  const columns = [
    { key: 'name', title: '名称', render: (row: any) => (
      <div>
        <p className="font-medium">{row.name}</p>
        <p className="text-xs text-dim">/{row.slug}</p>
      </div>
    )},
    { key: 'description', title: '描述', render: (row: any) => row.description || '-' },
    { key: 'count', title: '文章数', width: '100px' },
    { key: 'actions', title: '操作', width: '120px', render: (row: any) => (
      <div className="flex gap-2">
        <button onClick={() => openEdit(row)} className="p-1.5 text-primary-themed hover:bg-soft rounded-[4px]">
          <Edit2 className="w-4 h-4" />
        </button>
        <button onClick={() => setDeleteId(row.id)} className="p-1.5 text-red-600 hover:bg-soft rounded-[4px]">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    )},
  ];

  return (
    <div className="">
      
      <div className="flex items-center justify-between mb-6">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><FolderOpen size={20} className="text-primary-themed" /><h1 className="text-main" style={{ fontSize: "18px", fontWeight: 700 }}>分类管理</h1></div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          新建分类
        </Button>
      </div>

      {categories.length === 0 && !loading ? (
        <EmptyState
          title="暂无分类"
          description="创建您的第一个文章分类"
          actionText="新建分类"
          onAction={openCreate}
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={columns} data={categories} loading={loading} />
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑分类' : '新建分类'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="名称" {...register('name')} error={errors.name?.message} />
          <Input label="Slug" {...register('slug')} error={errors.slug?.message} />
          <div>
            <label className="block text-sm font-medium text-sub mb-1">父分类</label>
            <select className="input" {...register('parent_id')}>
              <option value="">无</option>
              {categories.filter(c => c.id !== editingId).map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-sub mb-1">描述</label>
            <textarea rows={3} className="input" {...register('description')} />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button type="submit" loading={submitting}>{editingId ? '保存' : '创建'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="确认删除"
        message="删除分类后，相关文章将变为未分类，是否确认？"
      />
    </div>
  );
}
