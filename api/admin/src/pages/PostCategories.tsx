
import { useEffect, useState, useRef } from 'react';
import { categoriesApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Table, Modal, ConfirmDialog, EmptyState } from '@/components/ui';
import { useForm } from 'react-hook-form';
import { usePostsToolbar } from '@/layouts/PostsLayout';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [iconValue, setIconValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    defaultValues: { name: '', slug: '', description: '', parent_id: '', seo_keywords: '' },
  });

  const { setToolbar } = usePostsToolbar();

  useEffect(() => {
    setToolbar(
      <Button onClick={openCreate} style={{ height: '32px', fontSize: '12px', padding: '0 10px' }}><i className="fa-regular fa-plus" style={{ fontSize: '14px' }} />新建分类</Button>
    );
    return () => setToolbar(null);
  }, []);

  useEffect(() => { fetchCategories(); }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const response: any = await categoriesApi.list();
      setCategories(response.data || []);
    } catch { toast.error('获取分类失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditingId(null);
    setIconValue('');
    reset({ name: '', slug: '', description: '', parent_id: '', seo_keywords: '' });
    setIsModalOpen(true);
  };

  const openEdit = (cat: any) => {
    setEditingId(cat.id);
    setIconValue(cat.icon || '');
    reset({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      parent_id: cat.parent_id ? String(cat.parent_id) : '',
      seo_keywords: cat.seo_keywords || '',
    });
    setIsModalOpen(true);
  };

  const onSubmit = async (data: any) => {
    setSubmitting(true);
    try {
      const payload = {
        name: data.name,
        slug: data.slug || data.name,
        icon: iconValue || null,
        description: data.description || null,
        parent_id: data.parent_id ? parseInt(data.parent_id) : null,
        seo_keywords: data.seo_keywords || null,
      };
      if (editingId) {
        await categoriesApi.update(editingId, payload);
        toast.success('更新成功');
      } else {
        await categoriesApi.create(payload);
        toast.success('创建成功');
      }
      setIsModalOpen(false);
      fetchCategories();
    } catch { toast.error(editingId ? '更新失败' : '创建失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await categoriesApi.delete(deleteId); toast.success('删除成功'); fetchCategories(); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();

    // SVG: read as text and store inline
    if (ext === 'svg') {
      const text = await file.text();
      // Clean SVG: keep only the SVG content
      const svgMatch = text.match(/<svg[\s\S]*<\/svg>/i);
      if (svgMatch) {
        setIconValue(svgMatch[0]);
        toast.success('SVG 图标已添加');
      } else {
        toast.error('无效的 SVG 文件');
      }
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    // Image: upload to media
    if (!['png', 'gif', 'jpg', 'jpeg', 'webp', 'avif', 'ico'].includes(ext || '')) {
      toast.error('请上传 SVG/PNG/GIF/JPG/WebP/AVIF 格式');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r: any = await api.post('/media/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = r.url || r.data?.url;
      if (url) {
        setIconValue(url);
        toast.success('图标已上传');
      }
    } catch { toast.error('上传失败'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  // Render category icon — supports: FA class, SVG code, image URL
  const renderIcon = (icon: string, size = 18) => {
    if (!icon) return <i className="fa-sharp fa-light fa-folder" style={{ fontSize: size, color: 'var(--color-text-dim)' }} />;
    // FontAwesome class (starts with fa-)
    if (icon.startsWith('fa-') || icon.startsWith('fa ')) {
      return <i className={icon} style={{ fontSize: size, color: 'var(--color-primary)' }} />;
    }
    // SVG code
    if (icon.startsWith('<svg')) {
      return <span style={{ width: size, height: size, display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: icon.replace(/<svg/, `<svg width="${size}" height="${size}"`) }} />;
    }
    // Image URL
    if (icon.startsWith('http') || icon.startsWith('/')) {
      return <img src={icon} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />;
    }
    // Fallback: treat as FA class attempt or text
    return <i className={`fa-sharp fa-light fa-${icon}`} style={{ fontSize: size, color: 'var(--color-primary)' }} />;
  };

  const columns = [
    { key: 'icon', title: '', width: '40px', render: (row: any) => renderIcon(row.icon) },
    { key: 'name', title: '名称', width: '160px', render: (row: any) => (
      <div>
        <p style={{ fontWeight: 500, fontSize: '14px' }}>{row.name}</p>
        <p className="text-dim" style={{ fontSize: '12px' }}>/{row.slug}</p>
      </div>
    )},
    { key: 'description', title: '描述', render: (row: any) => <span className="text-sub" style={{ fontSize: '13px' }}>{row.description || '—'}</span> },
    { key: 'count', title: '文章数', width: '90px' },
    { key: 'actions', title: '操作', width: '100px', render: (row: any) => (
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={() => openEdit(row)} className="action-btn"><i className="fa-regular fa-pen" style={{ fontSize: '14px' }} /></button>
        <button onClick={() => setDeleteId(row.id)} className="action-btn danger"><i className="fa-regular fa-trash" style={{ fontSize: '14px' }} /></button>
      </div>
    )},
  ];

  return (
    <div>
      {categories.length === 0 && !loading ? (
        <EmptyState title="暂无分类" description="创建您的第一个文章分类" actionText="新建分类" onAction={openCreate} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <Table columns={columns} data={categories} loading={loading} />
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑分类' : '新建分类'}>
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Icon */}
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>分类图标</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 6, border: '1px dashed var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-bg-soft)', overflow: 'hidden',
              }}>
                {iconValue ? renderIcon(iconValue) : <i className="fa-regular fa-folder-open" style={{ fontSize: '20px', color: 'var(--color-text-dim)' }} />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <label className="btn btn-secondary text-sm" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 10px' }}>
                    <i className="fa-regular fa-cloud-arrow-up" style={{ fontSize: '12px' }} /> 上传图片
                    <input ref={fileRef} type="file" accept=".svg,.png,.gif,.jpg,.jpeg,.webp,.avif,.ico" style={{ display: 'none' }} onChange={handleIconUpload} />
                  </label>
                  {iconValue && (
                    <button type="button" className="btn btn-ghost text-dim" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => setIconValue('')}>清除</button>
                  )}
                </div>
                <p className="text-dim" style={{ fontSize: '11px' }}>支持 FontAwesome 类名、SVG 代码、PNG/GIF/JPG/WebP/AVIF</p>
              </div>
            </div>
            {/* SVG code input */}
            <div style={{ marginTop: '8px' }}>
              <input
                className="input text-sm font-mono"
                placeholder="fa-sharp fa-light fa-code 或 SVG 代码 / 图片 URL"
                value={iconValue}
                onChange={e => setIconValue(e.target.value)}
                style={{ fontSize: '12px' }}
              />
            </div>
          </div>

          <Input label="名称" {...register('name', { required: '名称不能为空' })} error={errors.name?.message} />
          <Input label="Slug" {...register('slug', { required: 'Slug不能为空' })} error={errors.slug?.message} />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>父分类</label>
            <select className="input" {...register('parent_id')}>
              <option value="">无</option>
              {categories.filter(c => c.id !== editingId).map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>描述</label>
            <textarea rows={2} className="input" {...register('description')} placeholder="可选" />
          </div>
          <Input label="关键词" {...register('seo_keywords')} placeholder="多个关键词用逗号分隔，如: Linux,服务器,运维" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px' }}>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button type="submit" loading={submitting}>{editingId ? '保存' : '创建'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除分类后，相关文章将变为未分类，是否确认？" />
    </div>
  );
}
