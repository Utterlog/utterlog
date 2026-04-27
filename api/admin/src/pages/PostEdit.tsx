
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { postsApi, categoriesApi, mediaApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui';
import api from '@/lib/api';
import { ImportUrlModal } from '@/components/ui/import-url-modal';

import MarkdownEditor from '@/components/editor/MarkdownEditor';

// Convert a backend date (RFC3339 string, unix int seconds, or ISO-ish)
// into the "YYYY-MM-DDTHH:mm" shape that <input type="datetime-local">
// expects in local time. Returns empty string for null/undefined/invalid
// input so the input sits in its placeholder state.
function toLocalDatetime(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '';
  const n = Number(val);
  const d = !isNaN(n) && n > 1e9 && n < 1e10
    ? new Date(n * 1000)
    : new Date(val as any);
  if (isNaN(d.getTime())) return '';
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditPostPage() {
  const navigate = useNavigate();
  const params = useParams();
  const postId = Number(params.id);
  const mdFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

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
  const [coverUploading, setCoverUploading] = useState(false);
  const [slugLoading, setSlugLoading] = useState(false);
  const [excerptLoading, setExcerptLoading] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [coverAiLoading, setCoverAiLoading] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [insertType, setInsertType] = useState<string | null>(null);
  const [insertItems, setInsertItems] = useState<any[]>([]);
  const [insertLoading, setInsertLoading] = useState(false);
  const [aiFlags, setAiFlags] = useState({ summary: false, image: false, slug: false, keywords: false, polish: false });

  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    fetchPost();
    categoriesApi.list().then((r: any) => setCategories(r.data || [])).catch(() => {});
    api.get('/options').then((r: any) => {
      const o = r.data || r || {};
      setAiFlags({ summary: o.ai_summary_auto === 'true', image: o.ai_image_auto === 'true', slug: o.ai_slug_auto === 'true', keywords: o.ai_keywords_auto === 'true', polish: o.ai_polish_auto === 'true' });
    }).catch(() => {});
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
      // Prefer published_at; drafts fall back to created_at so the
      // sidebar isn't blank. Convert to datetime-local format (no TZ,
      // no seconds) — the backend sends RFC3339 strings or unix ints.
      setPublishAt(toLocalDatetime(post.published_at) || toLocalDatetime(post.created_at));
      if (post.categories?.length) setCategoryId(post.categories[0].id);
      if (post.tags?.length) setTagInput(post.tags.map((t: any) => t.name).join(', '));
    } catch {
      toast.error('获取文章失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (saveStatus?: string) => {
    if (!title.trim()) { toast.error('标题不能为空'); return; }
    setSubmitting(true);
    try {
      const tagNames = tagInput.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      const response: any = await postsApi.update(postId, {
        title, content,
        slug: slug || undefined,
        cover_url: coverUrl || undefined,
        category_ids: categoryId ? [categoryId] : [],
        tag_names: tagNames.length ? tagNames : undefined,
        status: saveStatus || status,
        excerpt: excerpt || undefined,
        password: password || undefined,
        allow_comment: allowComment,
        pinned,
        // Pass empty string to clear, omit to leave untouched — backend
        // only looks at this when the key is present.
        published_at: publishAt,
      });
      toast.success('文章更新成功');
      const nextId = response?.data?.id || response?.id;
      if (nextId && nextId !== postId) {
        navigate(`/posts/edit/${nextId}`, { replace: true });
      }
    } catch {
      toast.error('更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMdUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const titleMatch = text.match(/^#\s+(.+)$/m);
      if (titleMatch && !title) setTitle(titleMatch[1].trim());
      setContent(text.replace(/^#\s+.+\n?/, '').trim());
      toast.success('Markdown 文件已导入');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      const r: any = await mediaApi.upload(file, 'covers');
      const url = r.url || r.data?.url;
      if (url) { setCoverUrl(url); toast.success('封面已上传'); }
    } catch { toast.error('上传失败'); }
    finally { setCoverUploading(false); e.target.value = ''; }
  };

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--color-text-sub)', marginBottom: '6px', fontWeight: 500 };
  const sectionStyle: React.CSSProperties = { padding: '16px', borderBottom: '1px solid var(--color-border)' };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 100px)' }}>
        <i className="fa-light fa-spinner-third fa-spin" style={{ fontSize: '24px', color: 'var(--color-text-dim)' }} />
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '0', height: 'calc(100vh - 80px)' }}>
        {/* Editor area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, border: '1px solid var(--color-border)', borderRight: 'none', overflow: 'hidden' }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="在此输入标题..."
            style={{
              padding: '14px 20px', fontSize: '18px', fontWeight: 600,
              border: 'none', borderBottom: '1px solid var(--color-border)',
              background: 'transparent', color: 'var(--color-text-main)', outline: 'none',
            }}
          />
          <input ref={mdFileRef} type="file" accept=".md,.markdown,.txt" style={{ display: 'none' }} onChange={handleMdUpload} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              className="h-full rounded-none border-0"
              minHeight="100%"
              onImportMd={() => mdFileRef.current?.click()}
              onInsertContent={async (type) => {
                setInsertType(type);
                setInsertLoading(true);
                setInsertItems([]);
                try {
                  const endpoint = type === '音乐' ? '/music' : type === '图书' ? '/books' : type === '电影' ? '/movies' : '/moments';
                  const r: any = await api.get(endpoint, { params: { per_page: 20 } });
                  setInsertItems(r.data || []);
                } catch {}
                setInsertLoading(false);
              }}
            />
          </div>
        </div>

        {/* Right sidebar — same as create page */}
        <div style={{
          width: '280px', flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
          border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
        }}>
          {/* Publish */}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <Button onClick={() => handleSave()} loading={submitting} style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>
                保存
              </Button>
              <Button variant="secondary" onClick={() => navigate('/posts')} style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>
                返回
              </Button>
            </div>
            {aiFlags.polish && <button onClick={() => setShowAiModal(true)} style={{
              width: '100%', padding: '7px', fontSize: '12px', fontWeight: 500,
              background: 'none', border: '1px solid var(--color-primary)', color: 'var(--color-primary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-primary)'; }}
            >
              <i className="fa-regular fa-sparkles" style={{ fontSize: '13px' }} /> AI 处理文章
            </button>}
          </div>

          {/* Settings */}
          <div style={sectionStyle}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px', color: 'var(--color-text-main)' }}>设置</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Cover */}
              <div>
                <label style={labelStyle}>自定义封面图 URL</label>
                {coverUrl && (
                  <div style={{ marginBottom: '6px', position: 'relative' }}>
                    <img src={coverUrl} alt="" style={{ width: '100%', height: '80px', objectFit: 'cover', border: '1px solid var(--color-border)' }} />
                    <button onClick={() => setCoverUrl('')} style={{ position: 'absolute', top: '4px', right: '4px', width: '18px', height: '18px', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
                  <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="留空自动回退为正文首图" className="input" style={{ flex: 1, fontSize: '12px' }} />
                  {aiFlags.image && (
                    <button
                      disabled={coverAiLoading}
                      className="btn btn-secondary btn-toolbar-square"
                      title="AI 生成封面"
                      style={{ opacity: coverAiLoading ? 0.5 : 1 }}
                      onClick={async () => {
                        if (!title) { toast.error('请先填写标题'); return; }
                        setCoverAiLoading(true);
                        // Surface the backend's real error message (NO_PROVIDER,
                        // GENERATION_FAILED + provider response, etc.) instead of
                        // the old blanket 'AI 服务不可用' toast which masked every
                        // failure mode. Common causes shown verbatim:
                        //   - 'NO_PROVIDER'        → user hasn't added a type=图片 provider
                        //   - 'GENERATION_FAILED'  → API key wrong / model not granted / rate limit
                        //   - 'UNSUPPORTED_ENDPOINT' → custom endpoint URL not recognised
                        try {
                          const r: any = await api.post('/ai/cover', { title, content: content.slice(0, 500) });
                          const url = r.data?.url || r.url;
                          if (url) { setCoverUrl(url); toast.success('封面已生成'); }
                          else toast.error('生成失败：响应中没有 url');
                        } catch (err: any) {
                          const detail = err?.response?.data?.error?.message
                                      || err?.response?.data?.message
                                      || err?.message
                                      || '请检查 AI 设置 → 提供商';
                          toast.error('AI 生成封面失败：' + detail);
                        }
                        setCoverAiLoading(false);
                      }}
                    >
                      {coverAiLoading
                        ? <i className="fa-light fa-spinner-third fa-spin" style={{ fontSize: 14 }} />
                        : <i className="fa-regular fa-sparkles" style={{ fontSize: 14 }} />}
                    </button>
                  )}
                  <button
                    onClick={() => coverFileRef.current?.click()}
                    className="btn btn-secondary btn-toolbar-square"
                    title={coverUploading ? '上传中...' : '上传封面'}
                  >
                    {coverUploading
                      ? <i className="fa-light fa-spinner-third fa-spin" style={{ fontSize: 14 }} />
                      : <i className="fa-regular fa-cloud-arrow-up" style={{ fontSize: 14 }} />}
                  </button>
                  <input ref={coverFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverUpload} />
                </div>
              </div>
              {/* Slug */}
              <div>
                <label style={labelStyle}>别名 (Slug)</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="留空自动分配" className="input" style={{ flex: 1, fontSize: '12px', padding: '6px 10px' }} />
                  {aiFlags.slug && (
                  <button disabled={slugLoading} className="btn btn-secondary" style={{ fontSize: '11px', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '3px' }} onClick={async () => {
                    if (!title) return; setSlugLoading(true);
                    try { const r: any = await api.post('/ai/slug', { title, content }); if (r.success && r.data?.slug) { setSlug(r.data.slug); toast.success('Slug 已生成'); } } catch { toast.error('AI 服务不可用'); }
                    setSlugLoading(false);
                  }}>
                    {slugLoading ? <i className="fa-light fa-spinner-third fa-spin" style={{ fontSize: '11px' }} /> : <i className="fa-regular fa-sparkles" style={{ fontSize: '11px' }} />} AI
                  </button>
                  )}
                </div>
              </div>
              {/* Category */}
              <div>
                <label style={labelStyle}>分类</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')} className="input" style={{ fontSize: '12px', padding: '6px 10px' }}>
                  <option value="">未分类</option>
                  {categories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                </select>
              </div>
              {/* Tags */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-sub)', fontWeight: 500 }}>标签</label>
                  {aiFlags.keywords && (
                  <button disabled={tagsLoading} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '11px', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '3px', opacity: tagsLoading ? 0.5 : 1 }} onClick={async () => {
                    if (!title && !content) return; setTagsLoading(true);
                    try { const r: any = await api.post('/ai/tags', { title, content: content.slice(0, 1000) }); if (r.data?.tags) { setTagInput(Array.isArray(r.data.tags) ? r.data.tags.join(', ') : r.data.tags); toast.success('标签已生成'); } } catch { toast.error('AI 服务不可用'); }
                    setTagsLoading(false);
                  }}>
                    {tagsLoading ? <i className="fa-light fa-spinner-third fa-spin" style={{ fontSize: '10px' }} /> : <i className="fa-regular fa-sparkles" style={{ fontSize: '10px' }} />} AI 提取
                  </button>
                  )}
                </div>
                <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Tag1, Tag2" className="input" style={{ fontSize: '12px', padding: '6px 10px' }} />
              </div>
              {/* Publish time */}
              <div>
                <label style={labelStyle}>发布时间</label>
                <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="input" style={{ fontSize: '12px', padding: '6px 10px' }} />
              </div>
            </div>
          </div>

          {/* Advanced */}
          <div style={sectionStyle}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px', color: 'var(--color-text-main)' }}>高级</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-sub)', fontWeight: 500 }}>摘要</label>
                  {aiFlags.summary && (
                  <button disabled={excerptLoading} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '11px', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '3px', opacity: excerptLoading ? 0.5 : 1 }} onClick={async () => {
                    if (!content) { toast.error('请先填写内容'); return; } setExcerptLoading(true);
                    try { const r: any = await api.post('/ai/summary', { title, content }); if (r.success && r.data?.summary) { setExcerpt(r.data.summary); toast.success('摘要已生成'); } } catch { toast.error('AI 服务不可用'); }
                    setExcerptLoading(false);
                  }}>
                    {excerptLoading ? <i className="fa-light fa-spinner-third fa-spin" style={{ fontSize: '10px' }} /> : <i className="fa-regular fa-sparkles" style={{ fontSize: '10px' }} />} AI 生成
                  </button>
                  )}
                </div>
                <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="留空自动截取" rows={3} className="input" style={{ fontSize: '12px', padding: '6px 10px', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--color-text-main)' }}>
                  <input type="checkbox" checked={allowComment} onChange={(e) => setAllowComment(e.target.checked)} /> 允许评论
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--color-text-main)' }}>
                  <input type="checkbox" checked={allowRss} onChange={(e) => setAllowRss(e.target.checked)} /> 允许本文出现在 RSS 聚合
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--color-text-main)' }}>
                  <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> 置顶文章
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--color-text-main)' }}>
                  <input type="checkbox" checked={status === 'private'} onChange={(e) => setStatus(e.target.checked ? 'private' : 'publish')} /> 私密文章
                </label>
                {status === 'private' && (
                  <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="输入访问密码" className="input" style={{ fontSize: '12px', padding: '6px 10px', marginLeft: '24px', width: 'calc(100% - 24px)', boxSizing: 'border-box' }} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Insert Modal */}
      {insertType && (
        <>
          <div onClick={() => setInsertType(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 51, width: '500px', maxWidth: '90vw', maxHeight: '70vh', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 12px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600 }}>插入{insertType}</h3>
              <button onClick={() => setInsertType(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--color-text-dim)' }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
              {insertLoading && <p style={{ textAlign: 'center', color: 'var(--color-text-dim)', padding: '20px 0', fontSize: '13px' }}>加载中...</p>}
              {!insertLoading && insertItems.length === 0 && <p style={{ textAlign: 'center', color: 'var(--color-text-dim)', padding: '20px 0', fontSize: '13px' }}>暂无数据</p>}
              {insertItems.map((item: any) => (
                <div key={item.id} onClick={() => {
                  let md = '';
                  if (insertType === '音乐') {
                    md = '\n[music platform="' + (item.platform || 'netease') + '" id="' + (item.platform_id || item.id || '') + '" title="' + (item.title || '') + '" artist="' + (item.artist || '') + '" cover="' + (item.cover_url || '') + '"][/music]\n';
                  } else if (insertType === '图书') {
                    md = '\n> **' + (item.title || '') + '**' + (item.author ? ' - ' + item.author : '') + '\n';
                  } else if (insertType === '电影') {
                    md = '\n> **' + (item.title || '') + '**' + (item.rating ? ' ' + item.rating + '/5' : '') + '\n';
                  } else if (insertType === '说说') {
                    md = '\n> ' + (item.content || '') + '\n';
                  }
                  if (md) setContent(content + md);
                  setInsertType(null);
                  toast.success('已插入');
                }} style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--color-border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {(item.cover_url || item.image) && <img src={item.cover_url || item.image} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || item.content?.slice(0, 50)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginTop: '2px' }}>{item.artist || item.author || ''}</div>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--color-primary)', flexShrink: 0 }}>插入</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* AI Processing Modal — same as create page */}
      {showAiModal && (
        <>
          <div onClick={() => { if (!aiProcessing) setShowAiModal(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 51, width: '560px', maxWidth: '90vw', maxHeight: '80vh', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 12px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fa-regular fa-sparkles" style={{ fontSize: '16px' }} /> AI 处理文章</h3>
              <button onClick={() => setShowAiModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--color-text-dim)' }}>×</button>
            </div>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-dim)', marginBottom: '12px' }}>选择 AI 处理方式</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[
                  { key: 'polish', label: '润色优化', icon: 'fa-light fa-wand-magic-sparkles', prompt: 'Polish and improve the writing quality. Keep the same language. Output in Markdown:' },
                  { key: 'formal', label: '正式风格', icon: 'fa-light fa-user-tie', prompt: 'Rewrite in a formal tone. Keep the same language. Output in Markdown:' },
                  { key: 'casual', label: '轻松风格', icon: 'fa-light fa-face-smile', prompt: 'Rewrite in a casual tone. Keep the same language. Output in Markdown:' },
                  { key: 'concise', label: '精简压缩', icon: 'fa-light fa-compress', prompt: 'Condense while keeping key info. Keep the same language. Output in Markdown:' },
                  { key: 'expand', label: '扩展丰富', icon: 'fa-light fa-expand', prompt: 'Expand with more details. Keep the same language. Output in Markdown:' },
                  { key: 'format', label: '智能排版', icon: 'fa-light fa-align-left', prompt: 'Intelligently reformat for readability. Keep the same language. Output in Markdown:' },
                ].map(item => (
                  <button key={item.key} disabled={aiProcessing} onClick={async () => {
                    if (!content.trim()) { toast.error('请先填写内容'); return; }
                    setAiProcessing(true); setAiResult('');
                    try {
                      const r: any = await api.post('/ai/format', { content: item.prompt + '\n\n' + content.slice(0, 3000) });
                      if (r.data?.content || r.content) setAiResult(r.data?.content || r.content);
                      else toast.error('处理失败');
                    } catch { toast.error('AI 服务不可用'); }
                    setAiProcessing(false);
                  }} style={{ padding: '10px 8px', fontSize: '12px', fontWeight: 500, background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', cursor: aiProcessing ? 'wait' : 'pointer', color: 'var(--color-text-main)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', opacity: aiProcessing ? 0.5 : 1 }}>
                    <i className={item.icon} style={{ fontSize: '18px' }} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', minHeight: '150px' }}>
              {aiProcessing && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '40px 0', color: 'var(--color-text-dim)', fontSize: '13px' }}><i className="fa-light fa-spinner-third fa-spin" /> AI 处理中...</div>}
              {aiResult && !aiProcessing && <pre style={{ fontSize: '12px', lineHeight: 1.7, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: '300px', overflow: 'auto', padding: '12px', background: 'var(--color-bg-soft)' }}>{aiResult}</pre>}
              {!aiResult && !aiProcessing && <p style={{ textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '13px', padding: '40px 0' }}>选择处理方式</p>}
            </div>
            {aiResult && !aiProcessing && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(aiResult); toast.success('已复制'); }}>复制</Button>
                <Button variant="secondary" onClick={() => { setContent(content + '\n\n' + aiResult); setShowAiModal(false); setAiResult(''); toast.success('已追加'); }}>追加</Button>
                <Button onClick={() => { setContent(aiResult); setShowAiModal(false); setAiResult(''); toast.success('已替换'); }}>替换内容</Button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
