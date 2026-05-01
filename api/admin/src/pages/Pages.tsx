
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { postsApi, optionsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, ConfirmDialog, Modal } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import AboutPageEditor from '@/components/AboutPageEditor';

// A built-in page with `contentKey` gets an inline HTML/markdown editor
// stored in that option. Pages without contentKey are pure list views
// and only expose the enable/disable toggle.
const builtinPages = [
  { key: 'page_about', label: '关于', slug: '/about', icon: 'fa-regular fa-user', contentKey: 'page_about_content' as const },
  { key: 'page_coding', label: 'Coding', slug: '/coding', icon: 'fa-brands fa-github', settingsKey: 'coding' as const },
  { key: 'page_moments', label: '说说', slug: '/moments', icon: 'fa-regular fa-comment-dots' },
  { key: 'page_archives', label: '归档', slug: '/archives', icon: 'fa-regular fa-box-archive' },
  { key: 'page_music', label: '音乐', slug: '/music', icon: 'fa-regular fa-music' },
  { key: 'page_movies', label: '电影', slug: '/movies', icon: 'fa-regular fa-film' },
  { key: 'page_books', label: '图书', slug: '/books', icon: 'fa-regular fa-book' },
  { key: 'page_goods', label: '好物', slug: '/goods', icon: 'fa-regular fa-bag-shopping' },
  { key: 'page_feeds', label: '订阅', slug: '/feeds', icon: 'fa-regular fa-rss' },
  { key: 'page_links', label: '友链', slug: '/links', icon: 'fa-regular fa-link' },
  { key: 'page_albums', label: '相册', slug: '/albums', icon: 'fa-regular fa-images' },
  { key: 'page_footprints', label: '足迹', slug: '/footprints', icon: 'fa-regular fa-map-location-dot' },
] satisfies { key: string; label: string; slug: string; icon: string; contentKey?: string; settingsKey?: 'coding'; optionKey?: string; strictTrue?: boolean }[];

const builtinPageOptions: Record<string, { optionKey: string; strictTrue?: boolean }> = {
  page_footprints: { optionKey: 'footprint_enabled', strictTrue: true },
};

function isBuiltinEnabled(page: (typeof builtinPages)[number], opts: Record<string, any>) {
  const option = builtinPageOptions[page.key];
  const value = opts[option?.optionKey || page.key];
  if (option?.strictTrue) return value === true || value === 'true';
  return value !== 'false';
}

function detectGitHubFromOptions(opts: Record<string, any>) {
  const legacy = String(opts.social_github || '').trim();
  if (legacy) return legacy;
  try {
    const links = opts.social_links ? JSON.parse(opts.social_links) : [];
    if (!Array.isArray(links)) return '';
    const hits = links.filter((item: any) => {
      const haystack = `${item?.name || ''} ${item?.icon || ''} ${item?.url || ''}`.toLowerCase();
      return haystack.includes('github') && String(item?.url || '').trim();
    });
    return hits.map((item: any) => String(item?.url || '').trim()).filter(Boolean).join('\n');
  } catch {
    return '';
  }
}

type CodingRepoOption = {
  name?: string;
  full_name?: string;
  description?: string;
  language?: string;
  stars?: number;
  forks?: number;
  updated_at?: string;
};

function parseCodingSelectedRepos(value: any): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const raw = String(value || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  return raw.split(',').map(v => v.trim()).filter(Boolean);
}

function extractCodingRepoFromSource(raw: string) {
  let value = String(raw || '').trim().replace(/^@/, '').replace(/\/+$/, '');
  if (!value) return '';
  if (!value.includes('://') && value.toLowerCase().includes('github.com')) {
    value = `https://${value}`;
  }

  let parts: string[] = [];
  if (value.includes('://')) {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (host !== 'github.com') return '';
      parts = parsed.pathname.split('/').map(v => decodeURIComponent(v)).filter(Boolean);
    } catch {
      return '';
    }
  } else {
    parts = value.split('/').filter(Boolean);
  }

  const owner = (parts[0] || '').trim();
  const repo = (parts[1] || '').trim().replace(/\.git$/, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) return '';
  if (!/^[A-Za-z0-9._-]+$/.test(repo)) return '';
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

function parseCodingSourceRepos(value: string) {
  const out = new Set<string>();
  String(value || '').split(/[\s,，;；]+/).forEach(item => {
    const repo = extractCodingRepoFromSource(item);
    if (repo) out.add(repo);
  });
  return Array.from(out);
}

export default function PagesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [builtinStatus, setBuiltinStatus] = useState<Record<string, boolean>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [savingContent, setSavingContent] = useState(false);
  const [aboutEditorOpen, setAboutEditorOpen] = useState(false);
  const [codingEditorOpen, setCodingEditorOpen] = useState(false);
  const [codingGitHubURL, setCodingGitHubURL] = useState('');
  const [codingGitHubToken, setCodingGitHubToken] = useState('');
  const [codingDetectedURL, setCodingDetectedURL] = useState('');
  const [codingRepos, setCodingRepos] = useState<CodingRepoOption[]>([]);
  const [codingSelectedRepos, setCodingSelectedRepos] = useState<string[]>([]);
  const [loadingCodingRepos, setLoadingCodingRepos] = useState(false);
  const [codingRepoError, setCodingRepoError] = useState('');
  const [savingCoding, setSavingCoding] = useState(false);

  useEffect(() => { fetchPages(); fetchBuiltinStatus(); }, []);

  const openContentEditor = async (contentKey: string) => {
    if (contentKey === 'page_about_content') {
      setAboutEditorOpen(true);
      return;
    }
    try {
      const r: any = await api.get('/options');
      const opts = r.data || r || {};
      setEditingContent(opts[contentKey] || '');
      setEditingKey(contentKey);
    } catch {
      toast.error(t('admin.pages.toast.contentFetchFailed', '读取内容失败'));
    }
  };

  const saveBuiltinContent = async () => {
    if (!editingKey) return;
    setSavingContent(true);
    try {
      await optionsApi.updateMany({ [editingKey]: editingContent });
      toast.success(t('admin.common.saved', '已保存'));
      setEditingKey(null);
    } catch {
      toast.error(t('admin.settings.toast.saveFailed', '保存失败'));
    } finally {
      setSavingContent(false);
    }
  };

  const loadCodingRepos = async (saveCurrent = false) => {
    setLoadingCodingRepos(true);
    setCodingRepoError('');
    try {
      if (saveCurrent) {
        await optionsApi.updateMany({
          coding_github_url: codingGitHubURL.trim(),
          github_access_token: codingGitHubToken.trim(),
          coding_github_token: codingGitHubToken.trim(),
        });
      }
      const r: any = await api.get('/coding?include_repos=true');
      const data = r.data || r || {};
      const repos = Array.isArray(data.available_repos) ? data.available_repos : [];
      setCodingRepos(repos);
      if (data.error) {
        setCodingRepoError(`GitHub 部分数据读取失败：${data.error}`);
      }
    } catch {
      setCodingRepos([]);
      setCodingRepoError('项目读取失败，请检查 GitHub 地址或稍后重试。');
    } finally {
      setLoadingCodingRepos(false);
    }
  };

  const openCodingSettings = async () => {
    try {
      const r: any = await api.get('/options');
      const opts = r.data || r || {};
      setCodingGitHubURL(String(opts.coding_github_url || '').trim());
      setCodingGitHubToken(String(opts.github_access_token || opts.coding_github_token || '').trim());
      setCodingDetectedURL(detectGitHubFromOptions(opts));
      setCodingSelectedRepos(parseCodingSelectedRepos(opts.coding_selected_repos));
      setCodingRepos([]);
      setCodingRepoError('');
      setCodingEditorOpen(true);
      void loadCodingRepos();
    } catch {
      toast.error(t('admin.pages.toast.contentFetchFailed', '读取内容失败'));
    }
  };

  const saveCodingSettings = async () => {
    setSavingCoding(true);
    try {
      await optionsApi.updateMany({
        coding_github_url: codingGitHubURL.trim(),
        github_access_token: codingGitHubToken.trim(),
        coding_github_token: codingGitHubToken.trim(),
        coding_selected_repos: JSON.stringify(codingSelectedRepos),
      });
      toast.success(t('admin.common.saved', '已保存'));
      setCodingEditorOpen(false);
    } catch {
      toast.error(t('admin.settings.toast.saveFailed', '保存失败'));
    } finally {
      setSavingCoding(false);
    }
  };

  const toggleCodingRepo = (fullName: string) => {
    setCodingSelectedRepos(prev => {
      if (prev.includes(fullName)) return prev.filter(item => item !== fullName);
      return [...prev, fullName];
    });
  };

  const fetchBuiltinStatus = async () => {
    try {
      const r: any = await api.get('/options');
      const opts = r.data || r || {};
      const status: Record<string, boolean> = {};
      builtinPages.forEach(p => {
        status[p.key] = isBuiltinEnabled(p, opts);
      });
      setBuiltinStatus(status);
    } catch {}
  };

  const toggleBuiltin = async (key: string) => {
    const next = !builtinStatus[key];
    const optionKey = builtinPageOptions[key]?.optionKey || key;
    setBuiltinStatus(prev => ({ ...prev, [key]: next }));
    try {
      await optionsApi.updateMany({ [optionKey]: String(next) });
      toast.success(next ? t('admin.pages.toast.enabled', '已启用') : t('admin.pages.toast.disabled', '已关闭'));
    } catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
  };

  const fetchPages = async () => {
    setLoading(true);
    try {
      const r: any = await postsApi.list({ limit: 100, type: 'page' } as any);
      setPages(r.data?.posts || r.data || []);
    } catch { toast.error(t('admin.pages.toast.fetchFailed', '获取页面失败')); }
    finally { setLoading(false); }
  };

  const toggleStatus = async (page: any) => {
    const newStatus = page.status === 'publish' ? 'draft' : 'publish';
    try {
      await postsApi.update(page.id, { ...page, status: newStatus });
      toast.success(newStatus === 'publish' ? t('admin.pages.toast.displayEnabled', '已开启显示') : t('admin.pages.toast.displayDisabled', '已关闭显示'));
      fetchPages();
    } catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await postsApi.delete(deleteId); toast.success(t('admin.posts.toast.deleteSuccess', '删除成功')); fetchPages(); }
    catch { toast.error(t('admin.posts.toast.deleteFailed', '删除失败')); }
    finally { setDeleteId(null); }
  };

  const codingSourceSelectedRepos = parseCodingSourceRepos(codingGitHubURL);
  const codingEffectiveSelectedCount = new Set([
    ...codingSelectedRepos.map(item => item.toLowerCase()),
    ...codingSourceSelectedRepos,
  ]).size;

  return (
    <div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <span className="text-dim" style={{ fontSize: '13px' }}>{t('admin.pages.totalPages', '{count} 个页面', { count: builtinPages.length + pages.length })}</span>
        <div style={{ marginLeft: 'auto' }}>
          <Button onClick={() => navigate('/pages/create')}>
            <i className="fa-regular fa-plus" style={{ fontSize: '14px' }} />{t('admin.pages.newPage', '新建页面')}
          </Button>
        </div>
      </div>

      {/* All pages in one table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 12px' }}>{t('admin.pages.columns.page', '页面')}</th>
              <th style={{ width: '120px' }}>{t('admin.pages.columns.path', '路径')}</th>
              <th style={{ width: '60px' }}>{t('admin.pages.columns.type', '类型')}</th>
              <th style={{ width: '60px' }}>{t('admin.pages.columns.enabled', '启用')}</th>
              <th style={{ width: '80px' }}><span style={{ display: 'block', textAlign: 'right' }}>{t('admin.posts.columns.actions', '操作')}</span></th>
            </tr>
          </thead>
          <tbody>
            {/* Built-in pages */}
            {builtinPages.map(p => {
              const enabled = builtinStatus[p.key] !== false;
              return (
                <tr key={p.key} style={{ opacity: enabled ? 1 : 0.5 }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className={p.icon} style={{ fontSize: '14px', color: 'var(--color-primary)', width: '16px', textAlign: 'center' }} />
                      {t(`admin.pages.builtin.${p.key}`, p.label)}
                    </div>
                  </td>
                  <td className="text-dim" style={{ fontSize: '12px' }}>{p.slug}</td>
                  <td><span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--color-bg-soft)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}>{t('admin.pages.type.system', '系统')}</span></td>
                  <td>
                    <button
                      onClick={() => toggleBuiltin(p.key)}
                      style={{
                        width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                        background: enabled ? 'var(--color-primary)' : 'var(--color-border)',
                        position: 'relative', transition: 'background 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: '2px',
                        left: enabled ? '18px' : '2px',
                        width: '16px', height: '16px', borderRadius: '50%',
                        background: '#fff', transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </button>
                  </td>
                  <td>
                    {p.contentKey || p.settingsKey ? (
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => p.settingsKey === 'coding' ? openCodingSettings() : openContentEditor(p.contentKey!)}
                          className="action-btn primary"
                          title={p.settingsKey === 'coding' ? '配置 Coding' : p.key === 'page_about' ? '编辑关于页' : t('admin.pages.editContent', '编辑内容')}
                        >
                          <i className="fa-regular fa-pen" style={{ fontSize: '14px' }} />
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {/* Custom pages */}
            {loading ? (
              <tr><td colSpan={5} className="text-dim" style={{ textAlign: 'center', padding: '24px' }}>{t('common.loading', '加载中...')}</td></tr>
            ) : pages.map(page => (
              <tr key={page.id}>
                <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-regular fa-file-lines" style={{ fontSize: '14px', color: 'var(--color-text-dim)', width: '16px', textAlign: 'center' }} />
                    {page.title}
                  </div>
                </td>
                <td className="text-dim" style={{ fontSize: '12px' }}>/{page.slug}</td>
                <td><span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--color-bg-soft)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}>{t('admin.pages.type.custom', '自定义')}</span></td>
                <td>
                  <button
                    onClick={() => toggleStatus(page)}
                    style={{
                      width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                      background: page.status === 'publish' ? 'var(--color-primary)' : 'var(--color-border)',
                      position: 'relative', transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: '2px',
                      left: page.status === 'publish' ? '18px' : '2px',
                      width: '16px', height: '16px', borderRadius: '50%',
                      background: '#fff', transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                    <button onClick={() => navigate(`/pages/edit/${page.id}`)} className="action-btn primary" title="编辑">
                      <i className="fa-regular fa-pen" style={{ fontSize: '14px' }} />
                    </button>
                    <button onClick={() => setDeleteId(page.id)} className="action-btn danger" title="删除">
                      <i className="fa-regular fa-trash" style={{ fontSize: '14px' }} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title={t('admin.posts.confirmDeleteTitle', '确认删除')} message={t('admin.common.deleteIrreversible', '删除后无法恢复')} />

      <AboutPageEditor open={aboutEditorOpen} onClose={() => setAboutEditorOpen(false)} />

      <Modal isOpen={codingEditorOpen} onClose={() => setCodingEditorOpen(false)} title="配置 Coding 页面" size="xl">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
              GitHub 用户、组织或仓库地址（可多个）
            </label>
            <div>
              <textarea
                className="input"
                value={codingGitHubURL}
                onChange={e => setCodingGitHubURL(e.target.value)}
                placeholder={'https://github.com/username\nhttps://github.com/org\nhttps://github.com/org/repo'}
                style={{ width: '100%', minHeight: '88px', resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px', alignItems: 'start', marginTop: '10px' }}>
              <input
                className="input"
                type="password"
                value={codingGitHubToken}
                onChange={e => setCodingGitHubToken(e.target.value)}
                placeholder="GitHub Token（可选，用于贡献统计和更高 API 速率）"
              />
              <Button variant="secondary" onClick={() => loadCodingRepos(true)} loading={loadingCodingRepos}>
                <i className="fa-regular fa-rotate" />保存并刷新项目
              </Button>
            </div>
            <p className="text-dim" style={{ marginTop: '8px', fontSize: '12px', lineHeight: 1.7 }}>
              支持一行一个地址，也支持用逗号或分号分隔。填写仓库 URL 时，会自动读取它的 owner/组织并把该仓库加入前台展示筛选。留空时自动读取「个人资料 → 社交链接」里的 GitHub 地址。当前自动识别：
              <code style={{ marginLeft: '6px', color: 'var(--color-text-sub)', whiteSpace: 'pre-wrap' }}>
                {codingDetectedURL || '未识别'}
              </code>
              。点击右侧「保存并刷新项目」会先保存当前地址和 Token，再读取公开仓库。组织项目需要填写组织地址或仓库 URL；只填个人账号不会自动展开所有组织项目，避免混入无关仓库。
            </p>
          </div>

          <div style={{ padding: '12px', border: '1px solid var(--color-border)', background: 'var(--color-bg-soft)' }}>
            <div className="text-main" style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>展示项目</div>
            <div className="text-dim" style={{ fontSize: '12px', lineHeight: 1.7 }}>
              后台只读取这些用户和组织的公开项目。填写用户地址时，会同时读取该用户所属组织的公开项目；Token 只用于识别登录账号的组织列表、贡献统计或提升 GitHub API 速率，不会读取私有仓库。前台只展示勾选项目或上方仓库 URL 指定的项目；未选择时默认显示最近更新的 6 个项目。每个项目最多显示 5 条最近动作。
            </div>
          </div>

          {codingRepoError && (
            <div style={{ padding: '10px 12px', border: '1px solid var(--color-danger)', color: 'var(--color-danger)', fontSize: '12px' }}>
              {codingRepoError}
            </div>
          )}

          <div style={{ border: '1px solid var(--color-border)', maxHeight: '360px', overflow: 'auto' }}>
            {loadingCodingRepos ? (
              <div className="text-dim" style={{ padding: '24px', textAlign: 'center', fontSize: '13px' }}>正在读取项目...</div>
            ) : codingRepos.length === 0 ? (
              <div className="text-dim" style={{ padding: '24px', textAlign: 'center', fontSize: '13px' }}>暂无可用项目。</div>
            ) : codingRepos.map(repo => {
              const fullName = String(repo.full_name || repo.name || '').trim();
              const autoSelected = codingSourceSelectedRepos.includes(fullName.toLowerCase());
              const checked = codingSelectedRepos.includes(fullName) || autoSelected;
              return (
                <label
                  key={fullName}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px minmax(0, 1fr) auto',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--color-border)',
                    cursor: autoSelected ? 'default' : 'pointer',
                  }}
                >
                  <input type="checkbox" checked={checked} disabled={autoSelected} onChange={() => toggleCodingRepo(fullName)} />
                  <span style={{ minWidth: 0 }}>
                    <span className="text-main" style={{ display: 'block', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {repo.name || fullName}
                    </span>
                    <span className="text-dim" style={{ display: 'block', marginTop: '3px', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {repo.description || fullName}
                    </span>
                  </span>
                  <span className="text-dim" style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
                    {autoSelected && <span style={{ color: 'var(--color-primary)' }}>上方地址</span>}
                    {repo.language && <span>{repo.language}</span>}
                    <span>★ {repo.stars || 0}</span>
                    <span>⑂ {repo.forks || 0}</span>
                  </span>
                </label>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
            <span className="text-dim" style={{ fontSize: '12px' }}>已选择 {codingEffectiveSelectedCount} 个项目</span>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="secondary" onClick={() => setCodingEditorOpen(false)} disabled={savingCoding}>{t('admin.common.cancel', '取消')}</Button>
              <Button onClick={saveCodingSettings} loading={savingCoding}>{t('admin.common.save', '保存')}</Button>
            </div>
          </div>
        </div>
      </Modal>

      {editingKey && (
        <div
          onClick={() => setEditingKey(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-bg-card)', width: '720px', maxWidth: '90vw',
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>{t('admin.pages.editingContentTitle', '编辑内容 — {key}', { key: editingKey })}</h3>
              <button onClick={() => setEditingKey(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>
                <i className="fa-regular fa-xmark" />
              </button>
            </div>
            <div style={{ padding: '20px', flex: 1, overflow: 'auto' }}>
              <p className="text-dim" style={{ fontSize: '12px', marginBottom: '8px' }}>
                {t('admin.pages.contentHint', '支持 HTML 片段。留空则恢复默认示例内容。')}
              </p>
              <textarea
                className="input"
                style={{ width: '100%', minHeight: '360px', fontFamily: 'monospace', fontSize: '13px' }}
                value={editingContent}
                onChange={e => setEditingContent(e.target.value)}
                placeholder={t('admin.pages.contentPlaceholder', '<p>欢迎来到我的博客...</p>')}
              />
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="secondary" onClick={() => setEditingKey(null)} disabled={savingContent}>{t('admin.common.cancel', '取消')}</Button>
              <Button onClick={saveBuiltinContent} loading={savingContent}>{t('admin.common.save', '保存')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
