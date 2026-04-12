'use client';

import { useRef, useState } from 'react';
import { importApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui';
import { Upload, Database } from '@/components/icons';

export default function ToolsPage() {
  const [wpImporting, setWpImporting] = useState(false);
  const [wpResult, setWpResult] = useState<any>(null);
  const wpFileRef = useRef<HTMLInputElement>(null);

  const handleWordPressImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.xml')) {
      toast.error('请上传 WordPress 导出的 XML 文件');
      return;
    }
    if (!confirm('导入将清空现有文章、分类、标签、评论数据，确定继续？')) {
      if (wpFileRef.current) wpFileRef.current.value = '';
      return;
    }

    setWpImporting(true);
    setWpResult(null);
    try {
      const res: any = await importApi.wordpress(file);
      const data = res.data || res;
      setWpResult(data);
      toast.success(`导入成功：${data.posts} 篇文章，${data.categories} 个分类，${data.tags} 个标签，${data.comments} 条评论`);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || '导入失败';
      toast.error(msg);
    }
    setWpImporting(false);
    if (wpFileRef.current) wpFileRef.current.value = '';
  };

  return (
    <div>
      <h2 className="text-main" style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>工具</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
        {/* WordPress Import */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M21.469 6.825c.84 1.537 1.318 3.3 1.318 5.175 0 3.979-2.156 7.456-5.363 9.325l3.295-9.527c.615-1.539.82-2.771.82-3.864 0-.397-.026-.765-.07-1.109m-7.981.105c.647-.034 1.23-.1 1.23-.1.579-.068.51-.919-.069-.886 0 0-1.742.137-2.866.137-1.056 0-2.83-.137-2.83-.137-.579-.033-.648.852-.068.886 0 0 .549.063 1.128.1l1.675 4.587-2.353 7.059L5.8 6.93c.647-.034 1.23-.1 1.23-.1.579-.068.51-.919-.069-.886 0 0-1.742.137-2.866.137-.201 0-.438-.006-.688-.015C5.316 3.003 8.421 1.166 12 1.166c2.664 0 5.09 1.017 6.912 2.682-.044-.003-.087-.008-.131-.008-1.056 0-1.805.919-1.805 1.907 0 .886.511 1.636 1.056 2.522.41.72.886 1.643.886 2.977 0 .923-.354 1.995-.821 3.489l-1.076 3.593-3.897-11.59c.647-.034 1.23-.1 1.23-.1.579-.068.51-.919-.069-.886M12 22.834C7.405 22.834 3.382 20.29 1.23 16.5l5.937-16.247C7.672.068 8.295.001 8.929.001c.634 0 1.257.067 1.762.253L6.627 14.5 12 22.834z"/></svg>
            </div>
            <div>
              <h3 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>WordPress 导入</h3>
              <p className="text-dim" style={{ fontSize: '12px' }}>从 WordPress 导出的 XML 文件导入文章、分类、标签和评论</p>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <input
              ref={wpFileRef}
              type="file"
              accept=".xml"
              onChange={handleWordPressImport}
              style={{ display: 'none' }}
              id="wp-import-file"
            />
            <Button
              onClick={() => wpFileRef.current?.click()}
              disabled={wpImporting}
              style={{ width: '100%' }}
            >
              <Upload size={16} />
              {wpImporting ? '导入中...' : '选择 XML 文件并导入'}
            </Button>
          </div>

          {wpResult && (
            <div style={{ padding: '12px', borderRadius: '4px', background: 'var(--color-bg-soft)', fontSize: '13px' }}>
              <p className="text-main" style={{ fontWeight: 600, marginBottom: '8px' }}>导入结果</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <span className="text-sub">文章：<strong className="text-main">{wpResult.posts}</strong> 篇</span>
                <span className="text-sub">分类：<strong className="text-main">{wpResult.categories}</strong> 个</span>
                <span className="text-sub">标签：<strong className="text-main">{wpResult.tags}</strong> 个</span>
                <span className="text-sub">评论：<strong className="text-main">{wpResult.comments}</strong> 条</span>
              </div>
            </div>
          )}

          <p className="text-dim" style={{ fontSize: '11px', marginTop: '12px' }}>
            支持 WordPress WXR 1.2 格式。导入会清空现有数据并重新编号。
          </p>
        </div>

        {/* Typecho Import */}
        <div className="card" style={{ padding: '24px', opacity: 0.6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--color-text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Database size={20} color="#fff" />
            </div>
            <div>
              <h3 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>Typecho 导入</h3>
              <p className="text-dim" style={{ fontSize: '12px' }}>通过数据库连接从 Typecho 导入数据</p>
            </div>
          </div>
          <p className="text-dim" style={{ fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>即将推出</p>
        </div>
      </div>
    </div>
  );
}
