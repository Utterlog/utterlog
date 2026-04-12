'use client';

import { useEffect, useState, useCallback } from 'react';
import { mediaApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Modal, ConfirmDialog, EmptyState } from '@/components/ui';
import { ImageIcon, Upload, Trash2, Copy, X } from '@/components/icons';

const categories = [
  { key: '', label: '全部' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'audio', label: '音乐' },
  { key: 'document', label: '文档' },
  { key: 'archive', label: '附件' },
  { key: 'other', label: '其他' },
];

export default function MediaPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [storageDriver, setStorageDriver] = useState('local');

  useEffect(() => {
    fetchFiles();
  }, [category]);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const response: any = await api.get(`/media${category ? `?category=${category}` : ''}`);
      setFiles(response.data?.files || response.data || []);
    } catch {
      toast.error('获取文件失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      await mediaApi.upload(file);
      toast.success('上传成功');
      fetchFiles();
    } catch {
      toast.error('上传失败');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await mediaApi.delete(deleteId);
      toast.success('删除成功');
      fetchFiles();
    } catch {
      toast.error('删除失败');
    } finally {
      setDeleteId(null);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('链接已复制');
  };

  return (
    <div className="">
      
      {/* Category tabs + upload */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
          {categories.map(c => (
            <Button key={c.key} variant={category === c.key ? 'primary' : 'secondary'} onClick={() => setCategory(c.key)} style={{ flexShrink: 0, fontSize: '13px', padding: '6px 14px' }}>
              {c.label}
            </Button>
          ))}
        </div>
        {/* Only show storage selector if multiple drivers configured */}
        <label className="cursor-pointer flex-shrink-0">
          <input type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.zip,.rar,.7z" onChange={handleUpload} className="hidden" />
          <span className="btn-primary btn inline-flex items-center">
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? '上传中...' : '上传文件'}
          </span>
        </label>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: '12px' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="var(--color-primary)">
            <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
            <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z">
              <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
            </path>
          </svg>
          <p className="text-dim" style={{ fontSize: '13px' }}>加载中...</p>
        </div>
      ) : files.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: '12px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
          <p className="text-dim" style={{ fontSize: '14px', fontWeight: 500 }}>暂无文件</p>
          <p className="text-dim" style={{ fontSize: '12px' }}>上传您的第一个媒体文件</p>
          <Button style={{ marginTop: '4px' }} onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}>
            <Upload size={14} /> 上传文件
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {files.map((file) => (
            <div
              key={file.id}
              className="group relative aspect-square bg-soft rounded-[4px] overflow-hidden border border-line hover:border-blue-500 transition-colors"
            >
              <div className="w-full h-full flex items-center justify-center">
                {file.mime_type?.startsWith('image/') ? (
                  <img src={file.url} alt={file.name} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewUrl(file.url)} />
                ) : (
                  <ImageIcon className="w-8 h-8 text-dim" />
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-black/60 text-white">
                <p style={{ fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                <p style={{ fontSize: '9px', opacity: 0.7 }}>{file.size ? (file.size / 1024).toFixed(1) + ' KB' : ''}</p>
              </div>

              {/* Hover Actions */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  onClick={() => copyUrl(file.url)}
                  className="p-2 bg-card rounded-[4px] text-sub hover:bg-soft"
                  title="复制链接"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteId(file.id)}
                  className="p-2 bg-card rounded-[4px] text-red-600 hover:bg-soft"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* File Info */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <p className="text-xs text-white truncate">{file.name}</p>
                <p className="text-xs text-dim">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      <Modal isOpen={!!previewUrl} onClose={() => setPreviewUrl(null)} size="lg">
        <div className="relative">
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute -top-2 -right-2 p-1 bg-soft rounded-full hover:bg-soft"
          >
            <X className="w-4 h-4" />
          </button>
          {previewUrl && (
            <img src={previewUrl} alt="Preview" className="w-full rounded-[4px]" />
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="确认删除"
        message="删除后无法恢复，是否确认删除此文件？"
      />
    </div>
  );
}
