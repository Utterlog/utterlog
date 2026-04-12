'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { postsApi, categoriesApi, tagsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui';
import { Save, Upload, Sparkles } from '@/components/icons';
import api from '@/lib/api';
import dynamic from 'next/dynamic';

const MarkdownEditor = dynamic(() => import('@/components/editor/MarkdownEditor'), { ssr: false });

export default function EditPostPage() {
  const router = useRouter();
  const params = useParams();
  const postId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [slug, setSlug] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [tagInput, setTagInput] = useState('');
  const [status, setStatus] = useState<'draft' | 'publish' | 'private' | 'pending'>('publish');
  const [publishAt, setPublishAt] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [password, setPassword] = useState('');
  const [allowComment, setAllowComment] = useState(true);
  const [allowRss, setAllowRss] = useState(true);
  const [pinned, setPinned] = useState(false);

  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    fetchPost();
    categoriesApi.list().then((r: any) => setCategories(r.data || [])).catch(() => {});
  }, [postId]);

  const fetchPost = async () => {
    setLoading(true);
    try {
      const response: any = await postsApi.get(postId);
      const post = response.data;
      setTitle(post.title || '');
      setContent(post.content || '');
      setSlug(post.slug || '');
      setCoverUrl(post.cover_url || '');
      setStatus(post.status || 'draft');
      setExcerpt(post.excerpt || '');
      setPassword(post.password || '');
      setAllowComment(post.allow_comment !== false);
      setPinned(post.pinned === true);
      if (post.categories?.length) setCategoryId(post.categories[0].id);
      if (post.tags?.length) setTagInput(post.tags.map((t: any) => t.name).join(', '));
      if (post.published_at) {
        const d = new Date(post.published_at);
        setPublishAt(d.toISOString().slice(0, 16));
      }
    } catch {
      toast.error('获取文章失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('标题不能为空'); return; }
    setSubmitting(true);
    try {
      const tagNames = tagInput.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      await postsApi.update(postId, {
        title, content,
        slug: slug || undefined,
        cover_url: coverUrl || undefined,
        category_ids: categoryId ? [categoryId] : [],
        tag_names: tagNames.length ? tagNames : undefined,
        status,
        excerpt: excerpt || undefined,
        password: password || undefined,
        allow_comment: allowComment,
        pinned,
      });
      toast.success('文章更新成功');
    } catch {
      toast.error('更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 150px)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <>

      <div className="flex items-center gap-2 mb-4 text-sm text-sub">
        <button onClick={() => router.push('/dashboard/posts')} className="hover:text-main transition-colors">首页</button>
        <span>/</span>
        <span className="text-main font-medium">编辑文章</span>
      </div>

      <div className="flex gap-4" style={{ height: 'calc(100vh - 150px)' }}>
        {/* editor area */}
        <div className="flex-1 flex flex-col min-w-0 border border-line rounded-[4px] overflow-hidden bg-card">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="在此输入标题..."
            className="px-5 py-3 text-lg font-semibold text-main bg-transparent border-b border-line focus:outline-none placeholder:text-dim"
          />
          <div className="flex-1 overflow-hidden">
            <MarkdownEditor
              value={content}
              onChange={setContent}
              className="h-full rounded-none border-0"
              minHeight="100%"
            />
          </div>
        </div>

        {/* right sidebar */}
        <div className="w-72 overflow-y-auto flex-shrink-0 space-y-4">
          <div className="bg-card border border-line rounded-[4px] p-4">
            <h3 className="text-sm font-semibold text-main mb-3">发布</h3>
            <div className="flex gap-2">
              <Button onClick={handleSave} loading={submitting} className="flex-1">
                <Save className="w-4 h-4" /> 保存
              </Button>
              <Button variant="secondary" onClick={() => router.back()}>返回</Button>
            </div>
          </div>

          <div className="bg-card border border-line rounded-[4px] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-main">设置</h3>

            <div>
              <label className="block text-xs text-sub mb-1">自定义封面图 URL</label>
              <div className="flex gap-1">
                <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="留空则自动回退为正文首图" className="input flex-1 text-xs py-1.5" />
                <button className="btn btn-secondary text-xs px-2 py-1.5"><Upload size={12} /> 上传</button>
              </div>
              <p className="text-[11px] text-dim mt-1">如果这里有值，文章列表封面优先使用它；为空时自动回退到正文首图。</p>
            </div>

            <div>
              <label className="block text-xs text-sub mb-1">别名 (Slug)</label>
              <div className="flex gap-1">
                <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="留空自动分配唯一数字" className="input flex-1 text-xs py-1.5" />
                <button type="button" className="btn btn-secondary text-xs px-2 py-1.5" title="AI 生成 Slug" onClick={async () => {
                  if (!title) return;
                  try { const r: any = await api.post('/ai/slug', { title, content }); if (r.success && r.data?.slug) { setSlug(r.data.slug); toast.success('Slug 已生成'); } else error(r.error || '生成失败'); } catch { toast.error('AI 服务不可用'); }
                }}><Sparkles size={12} /> AI</button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-sub mb-1">分类</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')} className="input text-xs py-1.5">
                <option value="">未分类</option>
                {categories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-sub mb-1">标签 (逗号分隔)</label>
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Tag1, Tag2" className="input text-xs py-1.5" />
            </div>

            <div>
              <label className="block text-xs text-sub mb-1">状态</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="input text-xs py-1.5">
                <option value="publish">发布</option>
                <option value="draft">草稿</option>
                <option value="private">私密</option>
                <option value="pending">待审核</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-sub mb-1">发布时间</label>
              <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="input text-xs py-1.5" />
            </div>
          </div>

          <div className="bg-card border border-line rounded-[4px] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-main">高级</h3>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-primary-themed">摘要</label>
                <button type="button" className="text-xs text-primary-themed flex items-center gap-1 hover:opacity-80" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={async () => {
                  if (!content) { toast.error('请先填写内容'); return; }
                  try { const r: any = await api.post('/ai/summary', { title, content }); if (r.success && r.data?.summary) { setExcerpt(r.data.summary); toast.success('摘要已生成'); } else error(r.error || '生成失败'); } catch { toast.error('AI 服务不可用'); }
                }}><Sparkles size={10} /> AI 生成</button>
              </div>
              <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="留空自动截取" rows={3} className="input text-xs py-1.5 resize-none" />
            </div>

            <div>
              <label className="block text-xs text-sub mb-1">访问密码</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="留空不加密" className="input text-xs py-1.5" />
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs text-main cursor-pointer">
                <input type="checkbox" checked={allowComment} onChange={(e) => setAllowComment(e.target.checked)} className="accent-[var(--color-primary)]" />
                允许评论
              </label>
              <label className="flex items-center gap-2 text-xs text-main cursor-pointer">
                <input type="checkbox" checked={allowRss} onChange={(e) => setAllowRss(e.target.checked)} className="accent-[var(--color-primary)]" />
                允许本文出现在Rss聚合
              </label>
              <label className="flex items-center gap-2 text-xs text-main cursor-pointer">
                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="accent-[var(--color-primary)]" />
                置顶文章
              </label>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
