
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Textarea, Select, Modal, Toggle } from '@/components/ui';
import { FormSectionC, FormRowInputC, FormRowTextareaC, FormRowSelectC, FormRowToggleC, FormRowRangeC } from '@/components/form/FormC';
import { useAuthStore } from '@/lib/store';

interface Provider {
  id?: number;
  name: string;
  slug: string;
  type: string;
  endpoint: string;
  model: string;
  api_key: string;
  temperature: number;
  max_tokens: number;
  timeout: number;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
}

const defaultProvider: Provider = {
  name: '', slug: '', type: 'text', endpoint: '', model: '', api_key: '',
  temperature: 0.7, max_tokens: 4096, timeout: 30, is_active: true, is_default: false, sort_order: 0,
};

const settingsTabs = [
  { id: '提供商',     label: '提供商',     icon: 'fa-regular fa-server' },
  { id: '聊天配置',   label: '聊天配置',   icon: 'fa-regular fa-message' },
  { id: '文章设置',   label: '文章设置',   icon: 'fa-regular fa-pen-to-square' },
  { id: '博主资料',   label: '博主资料',   icon: 'fa-regular fa-user-pen' },
  { id: '系统提示词', label: '系统提示词', icon: 'fa-regular fa-terminal' },
  { id: '数据权限',   label: '数据权限',   icon: 'fa-regular fa-shield-halved' },
  { id: '批量任务',   label: '批量任务',   icon: 'fa-regular fa-list-check' },
];

// Align with Settings.tsx: 28px padding, 24px bottom margin between cards
const cardStyle: React.CSSProperties = { padding: '28px', marginBottom: '24px' };
const sectionTitleStyle: React.CSSProperties = {
  fontSize: '15px', fontWeight: 600, marginBottom: '20px',
  display: 'flex', alignItems: 'center', gap: '8px',
};

// Lightweight icon-prefixed section title — matches Settings.tsx visual style
function SectionTitle({ icon, children, as = 'h3' }: { icon: string; children: React.ReactNode; as?: 'h2' | 'h3' }) {
  const Tag = as as any;
  return (
    <Tag style={sectionTitleStyle}>
      <i className={icon} style={{ fontSize: '14px', color: 'var(--color-primary)' }} />
      {children}
    </Tag>
  );
}

// AI option keys prefix
const AI_PREFIX = 'ai_';

export default function AiSettingsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('提供商');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [presets, setPresets] = useState<Record<string, any>>({});
  const [editing, setEditing] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  // Batch tasks
  const [batchJobs, setBatchJobs] = useState<{ questions?: any; summary?: any; all?: any }>({});
  const [batchLoading, setBatchLoading] = useState<{ [k: string]: boolean }>({});

  // All AI config stored in options
  const [config, setConfig] = useState<Record<string, string>>({
    ai_system_prompt: 'You are a helpful AI assistant for a blog system called Utterlog. Respond in the same language the user uses. Be concise and helpful.',
    ai_chat_temp: '0.7',
    ai_chat_guest: 'false',
    ai_chat_position: 'right',
    ai_summary_auto: 'false',
    ai_summary_max_length: '200',
    ai_summary_prompt: '',
    ai_image_auto: 'false',
    ai_slug_auto: 'false',
    ai_keywords_auto: 'false',
    ai_polish_auto: 'false',
    ai_slug_prompt: 'Generate a concise, SEO-friendly URL slug in English for this article. Output only the slug, lowercase, hyphens instead of spaces, no special characters.',
    ai_keywords_prompt: 'Extract 3-5 keywords/tags from this article. Output as comma-separated list. Use the same language as the article.',
    ai_polish_prompt: 'Polish and improve the writing quality: fix grammar, improve flow, make it more engaging. Keep the same language and meaning. Output in Markdown.',
    ai_image_model: '',
    ai_image_ratio: '16:9',
    ai_image_style: 'editorial',
    ai_image_format: 'webp',
    ai_image_quality: '82',
    ai_image_text: 'no_text',
    ai_blogger_name: '',
    ai_blogger_bio: '',
    ai_blogger_style: '',
    ai_blogger_memory: '',
    ai_memory_storage: 'local',
    ai_data_permissions: '{}',
  });

  const updateConfig = (key: string, value: string) => setConfig(prev => ({ ...prev, [key]: value }));

  const load = async () => {
    setLoading(true);
    try {
      const [provR, optR]: any[] = await Promise.all([
        api.get('/ai/providers'),
        api.get('/options'),
      ]);

      const p = provR.data?.providers || provR.providers || [];
      const pr = provR.data?.presets || provR.presets || {};
      setProviders(p);
      setPresets(pr);

      // Load AI options
      const opts = optR.data || optR || {};
      const newConfig = { ...config };
      Object.keys(newConfig).forEach(key => {
        if (opts[key] !== undefined && opts[key] !== '') newConfig[key] = opts[key];
      });

      // Auto-fill blogger profile from user if empty
      if (!newConfig.ai_blogger_name && user) {
        newConfig.ai_blogger_name = user.nickname || user.username || '';
      }
      if (!newConfig.ai_blogger_bio && opts.site_description) {
        newConfig.ai_blogger_bio = opts.site_description;
      }

      setConfig(newConfig);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Batch jobs helpers
  const fetchBatchStatus = async (type: 'questions' | 'summary' | 'all') => {
    try {
      const r: any = await api.get(`/ai/batch-status?type=${type}`);
      setBatchJobs((prev) => ({ ...prev, [type]: r.data || r }));
    } catch {}
  };

  useEffect(() => {
    if (activeTab !== '批量任务') return;
    fetchBatchStatus('questions');
    fetchBatchStatus('summary');
    fetchBatchStatus('all');
  }, [activeTab]);

  // Poll any running job
  useEffect(() => {
    const running = Object.entries(batchJobs).filter(([, j]) => j?.running);
    if (running.length === 0) return;
    const iv = setInterval(async () => {
      for (const [t] of running) {
        await fetchBatchStatus(t as any);
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [batchJobs]);

  const startBatch = async (type: 'questions' | 'summary' | 'all', endpoint: string, label: string) => {
    setBatchLoading((prev) => ({ ...prev, [type]: true }));
    try {
      const r: any = await api.post(endpoint);
      const d = r.data || r;
      setBatchJobs((prev) => ({ ...prev, [type]: d }));
      if (d.total === 0) {
        toast.success(`所有文章的${label}已齐全`);
      } else {
        toast.success(`开始生成 ${d.total} 项${label}（后台运行）`);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || '启动失败');
    } finally {
      setBatchLoading((prev) => ({ ...prev, [type]: false }));
    }
  };

  const stopBatch = async (type: 'questions' | 'summary' | 'all') => {
    try {
      await api.post(`/ai/batch-stop?type=${type}`);
      toast.success('已请求停止，等当前请求完成后退出');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || '停止失败');
    }
  };

  // Save all AI config options
  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const aiOpts: Record<string, string> = {};
      Object.entries(config).forEach(([k, v]) => { if (k.startsWith('ai_')) aiOpts[k] = v; });
      await api.put('/options', aiOpts);
      toast.success('设置已保存');
    } catch {
      toast.error('保存失败');
    }
    setSavingConfig(false);
  };

  // Provider CRUD
  const saveProvider = async () => {
    if (!editing) return;
    if (!editing.name || !editing.endpoint || !editing.model) {
      toast.error('名称、端点和模型为必填项'); return;
    }
    setSaving(true);
    try {
      const r: any = await api.post('/ai/providers', editing);
      if (r.success || r.data) {
        toast.success('保存成功');
        setEditing(null);
        load();
      } else {
        toast.error('保存失败: ' + (r.error?.message || '未知错误'));
      }
    } catch (e: any) {
      toast.error('保存错误: ' + (e?.response?.data?.error?.message || e?.message || '未知错误'));
    }
    setSaving(false);
  };

  const removeProvider = async (id: number) => {
    if (!confirm('确定删除此提供商？')) return;
    try { await api.delete(`/ai/providers/${id}`); toast.success('已删除'); load(); }
    catch { toast.error('删除失败'); }
  };

  const testConnection = async () => {
    if (!editing) return;
    setTesting(true); setTestResult(null);
    try {
      const r: any = await api.post('/ai/test', { endpoint: editing.endpoint, model: editing.model, api_key: editing.api_key });
      setTestResult({ ok: r.success, msg: r.success ? `连接成功: ${r.data?.content || 'OK'}` : (r.error?.message || '失败') });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.response?.data?.error?.message || e.message || '网络错误' });
    }
    setTesting(false);
  };

  const applyPreset = (key: string) => {
    const p = presets[key];
    if (!p || !editing) return;
    setEditing({ ...editing, name: p.name, slug: key, endpoint: p.endpoint, model: p.models[0] || '' });
  };

  // Data permissions
  const dataPerms = (() => { try { return JSON.parse(config.ai_data_permissions); } catch { return {}; } })();
  const togglePerm = (key: string) => {
    const next = { ...dataPerms, [key]: !dataPerms[key] };
    updateConfig('ai_data_permissions', JSON.stringify(next));
  };

  if (loading) return <div className="p-6 text-dim">加载中...</div>;

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--color-border)', marginBottom: '28px', overflowX: 'auto' }}>
        {settingsTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 18px', fontSize: '13px', fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text-sub)',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              background: 'none', cursor: 'pointer', transition: 'all 0.15s',
              whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}
          >
            <i className={tab.icon} style={{ fontSize: '13px' }} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 提供商 ── */}
      {activeTab === '提供商' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <SectionTitle icon="fa-regular fa-server" as="h2">AI 提供商</SectionTitle>
            <Button onClick={() => setEditing({ ...defaultProvider })}><i className="fa-regular fa-plus" style={{ fontSize: '14px' }} /> 添加</Button>
          </div>
          {/* Explicit flex gap — `space-y-2` (Tailwind 0.5rem) was the
              previous spacer but it leaves the cards reading as a single
              stuck-together strip. 10px gap matches the visual rhythm of
              other admin list pages. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {providers.map((p: any) => (
              <div key={p.id} className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="text-main" style={{ fontSize: '14px', fontWeight: 600 }}>{p.name}</span>
                    {p.is_default && <span style={{ fontSize: '10px', padding: '1px 6px', background: 'var(--color-primary)', color: '#fff' }}>默认</span>}
                    {p.type === 'image' && <span style={{ fontSize: '10px', padding: '1px 6px', background: 'var(--color-bg-soft)' }}>图片</span>}
                    {!p.is_active && <span className="text-dim" style={{ fontSize: '10px' }}>已禁用</span>}
                  </div>
                  <p className="text-dim" style={{ fontSize: '12px', marginTop: '2px' }}>{p.model} · {p.endpoint}</p>
                </div>
                {/* Match the action-bar style used in Comments / Movies /
                    Books / Plugins etc — bordered 30×30 buttons sitting
                    in a flex container with a 4px gap, .action-btn class
                    handles hover tint + variant colors (primary blue for
                    edit, danger red for delete). */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => setEditing(p)} className="action-btn primary" title="编辑">
                    <i className="fa-regular fa-pen" style={{ fontSize: '13px' }} />
                  </button>
                  <button onClick={() => removeProvider(p.id)} className="action-btn danger" title="删除">
                    <i className="fa-regular fa-trash" style={{ fontSize: '13px' }} />
                  </button>
                </div>
              </div>
            ))}
            {providers.length === 0 && (
              <div className="card text-dim" style={{ padding: '40px', textAlign: 'center', fontSize: '14px' }}>暂无提供商，点击上方按钮添加</div>
            )}
          </div>
          <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing?.id ? '编辑提供商' : '添加提供商'}>
            {editing && (
              <div className="space-y-4">
                {!editing.id && Object.keys(presets).length > 0 && (
                  <div>
                    <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>快速预设</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {Object.entries(presets).map(([key, p]: [string, any]) => (
                        <Button key={key} variant="secondary" size="sm" onClick={() => applyPreset(key)}>{p.name}</Button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <Input label="名称" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="如: OpenAI" />
                  <Select label="类型" value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value })}>
                    <option value="text">文本</option>
                    <option value="image">图片</option>
                  </Select>
                </div>
                <Input label="API 端点" value={editing.endpoint} onChange={e => setEditing({ ...editing, endpoint: e.target.value })} placeholder="https://api.openai.com/v1/chat/completions" />
                {editing.slug && presets[editing.slug] ? (
                  <Select label="模型" value={editing.model} onChange={e => setEditing({ ...editing, model: e.target.value })}>
                    {presets[editing.slug].models.map((m: string) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                ) : (
                  <Input label="模型" value={editing.model} onChange={e => setEditing({ ...editing, model: e.target.value })} placeholder="gpt-4.1-mini" />
                )}
                <Input label="API Key" type="password" value={editing.api_key} onChange={e => setEditing({ ...editing, api_key: e.target.value })} placeholder="sk-..." />
                <div className="grid grid-cols-2 gap-x-4">
                  <div>
                    <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>温度 ({editing.temperature})</label>
                    <input type="range" min="0" max="2" step="0.1" value={editing.temperature} onChange={e => setEditing({ ...editing, temperature: parseFloat(e.target.value) })} style={{ width: '100%' }} />
                  </div>
                  <Input label="超时(秒)" type="number" value={editing.timeout} onChange={e => setEditing({ ...editing, timeout: parseInt(e.target.value) })} />
                </div>
                <div className="space-y-3" style={{ paddingTop: '4px' }}>
                  <Toggle label="启用" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                  <Toggle label="设为默认" checked={editing.is_default} onChange={e => setEditing({ ...editing, is_default: e.target.checked })} />
                </div>
                {testResult && (
                  <div style={{ padding: '10px 14px', fontSize: '13px', background: testResult.ok ? 'rgba(76,175,115,0.1)' : 'rgba(220,53,69,0.1)', color: testResult.ok ? '#16a34a' : '#dc2626', border: `1px solid ${testResult.ok ? 'rgba(76,175,115,0.2)' : 'rgba(220,53,69,0.2)'}` }}>
                    {testResult.msg}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px' }}>
                  <Button className="btn-dialog" variant="secondary" onClick={testConnection} loading={testing}>测试连接</Button>
                  <Button className="btn-dialog" variant="secondary" onClick={() => setEditing(null)}>取消</Button>
                  <Button className="btn-dialog" onClick={saveProvider} loading={saving}>保存</Button>
                </div>
              </div>
            )}
          </Modal>
        </>
      )}

      {/* ── 聊天配置 ── */}
      {activeTab === '聊天配置' && (
        <>
          <FormSectionC title="前端聊天气泡" icon="fa-regular fa-comment-dots">
            <FormRowToggleC
              label="允许访客（未登录）使用 AI 聊天"
              checked={config.ai_chat_guest === 'true'}
              onChange={v => updateConfig('ai_chat_guest', String(v))}
            />
            <FormRowSelectC
              label="气泡位置"
              value={config.ai_chat_position}
              onChange={v => updateConfig('ai_chat_position', v)}
              options={[
                { value: 'right', label: '右下角' },
                { value: 'left', label: '左下角' },
              ]}
            />
            <FormRowRangeC
              label="对话温度"
              hint="越低越精确，越高越有创意"
              value={config.ai_chat_temp}
              onChange={v => updateConfig('ai_chat_temp', v)}
              min={0} max={2} step={0.1}
              last
            />
          </FormSectionC>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={saveConfig} loading={savingConfig}><i className="fa-regular fa-floppy-disk" style={{ fontSize: '14px' }} /> 保存</Button>
          </div>
        </>
      )}

      {/* ── 文章设置 ── */}
      {activeTab === '文章设置' && (
        <>
          {/* 功能开关 */}
          <div className="card" style={cardStyle}>
            <SectionTitle icon="fa-regular fa-bolt">AI 自动化功能</SectionTitle>
            <p className="text-xs text-dim" style={{ marginTop: '-12px', marginBottom: '20px' }}>开启后，发布或更新文章时 AI 将自动执行对应任务</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {[
                { key: 'ai_summary_auto', icon: 'fa-regular fa-align-left', label: 'AI 摘要', desc: '自动生成摘要' },
                { key: 'ai_image_auto', icon: 'fa-regular fa-image', label: 'AI 特色图', desc: '自动生成封面' },
                { key: 'ai_slug_auto', icon: 'fa-regular fa-link', label: 'AI Slug', desc: 'URL 别名' },
                { key: 'ai_keywords_auto', icon: 'fa-regular fa-tags', label: 'AI 关键词', desc: '提取关键词' },
                { key: 'ai_polish_auto', icon: 'fa-regular fa-wand-magic-sparkles', label: 'AI 润色', desc: '润色优化排版' },
              ].map(item => (
                <label key={item.key} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                  padding: '16px 8px', textAlign: 'center', borderRadius: 0,
                  border: `1px solid ${config[item.key] === 'true' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: config[item.key] === 'true' ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)' : 'transparent',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <input type="checkbox" checked={config[item.key] === 'true'} onChange={e => updateConfig(item.key, String(e.target.checked))} style={{ display: 'none' }} />
                  <i className={item.icon} style={{ fontSize: '22px', color: config[item.key] === 'true' ? 'var(--color-primary)' : 'var(--color-text-dim)' }} />
                  <div style={{ fontSize: '13px', fontWeight: 600, color: config[item.key] === 'true' ? 'var(--color-primary)' : 'var(--color-text-main)' }}>{item.label}</div>
                  <div className="text-dim" style={{ fontSize: '11px' }}>{item.desc}</div>
                </label>
              ))}
            </div>
          </div>

          {/* 摘要设置 */}
          {config.ai_summary_auto === 'true' && (
            <FormSectionC title="摘要设置" icon="fa-regular fa-align-left">
              <FormRowInputC
                label="摘要最大长度"
                type="number"
                value={config.ai_summary_max_length}
                onChange={v => updateConfig('ai_summary_max_length', v)}
              />
              <FormRowTextareaC
                label="自定义提示词（可选）"
                hint="例如：请用轻松幽默的语气总结"
                rows={3}
                value={config.ai_summary_prompt}
                onChange={v => updateConfig('ai_summary_prompt', v)}
                placeholder="留空使用默认提示词"
                last
              />
            </FormSectionC>
          )}

          {/* 特色图设置 */}
          {config.ai_image_auto === 'true' && (
            <FormSectionC title="特色图设置" icon="fa-regular fa-image">
              <FormRowSelectC
                label="图片生成模型"
                value={config.ai_image_model}
                onChange={v => updateConfig('ai_image_model', v)}
                options={[
                  { value: '',            label: '使用默认图片提供商' },
                  { value: 'dall-e-3',    label: 'OpenAI DALL·E 3' },
                  { value: 'gpt-image-1', label: 'OpenAI GPT Image' },
                  { value: 'gemini',      label: 'Google Gemini Image' },
                  { value: 'wanx',        label: '通义万相' },
                  { value: 'cogview',     label: '智谱 CogView' },
                  { value: 'doubao',      label: '豆包 SeedDream' },
                  { value: 'minimax',     label: 'MiniMax Image' },
                  { value: 'flux',        label: 'SiliconFlow FLUX' },
                ]}
              />
              {/* 4 short fields paired into 2×2 — wrapping in a CSS grid
                  side-by-steps two FormRow*C in the same section row
                  while keeping the internal 32/68 label-value split. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                <FormRowSelectC
                  label="图片比例"
                  value={config.ai_image_ratio}
                  onChange={v => updateConfig('ai_image_ratio', v)}
                  options={[
                    { value: '16:9', label: '16:9（推荐）' },
                    { value: '1:1',  label: '1:1' },
                    { value: '4:3',  label: '4:3' },
                    { value: '3:2',  label: '3:2' },
                  ]}
                />
                <FormRowSelectC
                  label="图片风格"
                  value={config.ai_image_style}
                  onChange={v => updateConfig('ai_image_style', v)}
                  options={[
                    { value: 'editorial',    label: '编辑风格' },
                    { value: 'realistic',    label: '写实风格' },
                    { value: 'cinematic',    label: '电影风格' },
                    { value: 'illustration', label: '插画风格' },
                    { value: 'minimal',      label: '极简风格' },
                    { value: 'watercolor',   label: '水彩风格' },
                  ]}
                />
                <FormRowSelectC
                  label="图片格式"
                  value={config.ai_image_format}
                  onChange={v => updateConfig('ai_image_format', v)}
                  options={[
                    { value: 'webp', label: 'WebP（推荐）' },
                    { value: 'png',  label: 'PNG' },
                    { value: 'jpg',  label: 'JPEG' },
                  ]}
                />
                <FormRowInputC
                  label="压缩质量"
                  type="number"
                  value={config.ai_image_quality}
                  onChange={v => updateConfig('ai_image_quality', v)}
                  hint="1-100"
                />
              </div>
              <FormRowSelectC
                label="文字策略"
                value={config.ai_image_text}
                onChange={v => updateConfig('ai_image_text', v)}
                options={[
                  { value: 'no_text',        label: '不包含文字' },
                  { value: 'title_only',     label: '仅标题' },
                  { value: 'subtle_caption', label: '微妙文字' },
                ]}
                last
              />
            </FormSectionC>
          )}

          {/* 提示词配置 */}
          <FormSectionC
            title="自定义提示词"
            icon="fa-regular fa-terminal"
            description="自定义每个 AI 功能的指令，留空使用内置默认提示词"
          >
            <FormRowTextareaC
              label="摘要提示词"
              rows={3}
              value={config.ai_summary_prompt}
              onChange={v => updateConfig('ai_summary_prompt', v)}
              placeholder="留空使用默认：根据文章内容生成简洁摘要"
            />
            <FormRowTextareaC
              label="Slug 提示词"
              rows={3}
              value={config.ai_slug_prompt}
              onChange={v => updateConfig('ai_slug_prompt', v)}
              placeholder="留空使用默认：生成 SEO 友好的英文 URL 别名"
            />
            <FormRowTextareaC
              label="关键词提示词"
              rows={3}
              value={config.ai_keywords_prompt}
              onChange={v => updateConfig('ai_keywords_prompt', v)}
              placeholder="留空使用默认：从文章中提取 3-5 个关键词"
            />
            <FormRowTextareaC
              label="润色提示词"
              rows={3}
              value={config.ai_polish_prompt}
              onChange={v => updateConfig('ai_polish_prompt', v)}
              placeholder="留空使用默认：润色优化文章质量"
              last
            />
          </FormSectionC>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={saveConfig} loading={savingConfig}><i className="fa-regular fa-floppy-disk" style={{ fontSize: '14px' }} /> 保存</Button>
          </div>
        </>
      )}

      {/* ── 博主资料 ── */}
      {activeTab === '博主资料' && (
        <>
          <FormSectionC
            title="博主资料 & AI 记忆"
            icon="fa-regular fa-user-pen"
            description="AI 会根据这些信息了解你的写作风格和偏好，提供更个性化的回复"
          >
            <FormRowInputC
              label="博主昵称"
              value={config.ai_blogger_name}
              onChange={v => updateConfig('ai_blogger_name', v)}
              placeholder="你的名字或笔名"
            />
            <FormRowTextareaC
              label="博客简介"
              rows={3}
              value={config.ai_blogger_bio}
              onChange={v => updateConfig('ai_blogger_bio', v)}
              placeholder="简要描述你的博客主题和风格"
            />
            <FormRowTextareaC
              label="写作风格"
              rows={2}
              value={config.ai_blogger_style}
              onChange={v => updateConfig('ai_blogger_style', v)}
              placeholder="例如：轻松幽默、技术严谨、文艺清新..."
            />
            <FormRowTextareaC
              label="AI 记忆（MEMORY.md）"
              hint="这些记忆会作为上下文发送给 AI，帮助它更好地理解你"
              rows={8}
              value={config.ai_blogger_memory}
              onChange={v => updateConfig('ai_blogger_memory', v)}
              placeholder="AI 会自动在这里记录你的偏好和上下文..."
            />
            <FormRowSelectC
              label="记忆存储方式"
              value={config.ai_memory_storage}
              onChange={v => updateConfig('ai_memory_storage', v)}
              options={[
                { value: 'local', label: '本地文件' },
                { value: 's3', label: 'S3/R2 云存储' },
              ]}
              last
            />
          </FormSectionC>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={saveConfig} loading={savingConfig}><i className="fa-regular fa-floppy-disk" style={{ fontSize: '14px' }} /> 保存</Button>
          </div>
        </>
      )}

      {/* ── 系统提示词 ── */}
      {activeTab === '系统提示词' && (
        <>
          <FormSectionC title="AI 系统提示词" icon="fa-regular fa-scroll">
            <FormRowTextareaC
              label="聊天系统提示词"
              hint="定义 AI 的角色和行为方式，会在每次对话开始时发送给 AI"
              rows={8}
              value={config.ai_system_prompt}
              onChange={v => updateConfig('ai_system_prompt', v)}
              last
            />
          </FormSectionC>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={saveConfig} loading={savingConfig}><i className="fa-regular fa-floppy-disk" style={{ fontSize: '14px' }} /> 保存</Button>
          </div>
        </>
      )}

      {/* ── 数据权限 ── */}
      {activeTab === '数据权限' && (
        <>
          <FormSectionC
            title="AI 数据访问权限"
            icon="fa-regular fa-shield-halved"
            description="控制 AI 可以访问哪些站点数据作为上下文"
          >
            {(() => {
              const perms = [
                { key: 'site_basics',    label: '站点基础信息', hint: '系统版本、服务器信息' },
                { key: 'theme_info',     label: '主题信息',     hint: '当前主题和配色' },
                { key: 'active_plugins', label: '启用的插件',   hint: '插件列表' },
                { key: 'posts',          label: '文章内容',     hint: '所有已发布文章的标题和内容' },
                { key: 'pages_content',  label: '页面内容',     hint: '所有已发布页面' },
                { key: 'taxonomies',     label: '分类和标签',   hint: '分类目录和标签列表' },
                { key: 'comments',       label: '评论内容',     hint: '所有评论列表' },
                { key: 'users_count',    label: '用户统计',     hint: '按角色统计用户数量' },
                { key: 'database_query', label: '数据库查询',   hint: '允许 AI 执行只读 SQL 查询获取更多数据' },
              ];
              return perms.map((item, idx) => (
                <FormRowToggleC
                  key={item.key}
                  label={item.label}
                  hint={item.hint}
                  checked={!!dataPerms[item.key]}
                  onChange={() => togglePerm(item.key)}
                  last={idx === perms.length - 1}
                />
              ));
            })()}
          </FormSectionC>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={saveConfig} loading={savingConfig}><i className="fa-regular fa-floppy-disk" style={{ fontSize: '14px' }} /> 保存</Button>
          </div>
        </>
      )}

      {/* ── 批量任务 ── */}
      {activeTab === '批量任务' && (
        <>
          {/* 一键全部生成 */}
          <div className="card" style={{ ...cardStyle, background: 'color-mix(in srgb, var(--color-primary) 3%, transparent)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{
                width: '44px', height: '44px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-primary)', color: '#fff',
              }}>
                <i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: '20px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 6px' }}>一键生成全部 AI 数据</h3>
                <p className="text-sub" style={{ fontSize: '13px', lineHeight: 1.7, margin: '0 0 14px' }}>
                  为所有已发布文章批量生成 <strong>AI 摘要</strong> + <strong>陪读问题</strong>（跳过已有的）。
                  任务后台异步运行，每项间隔 800ms 避免触发 AI 限流。
                </p>
                <BatchProgress job={batchJobs.all} />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Button
                    onClick={() => startBatch('all', '/ai/batch-all', '任务')}
                    loading={batchLoading.all || batchJobs.all?.running}
                    disabled={batchJobs.all?.running}
                    style={{ padding: '0 20px' }}
                  >
                    <i className="fa-solid fa-bolt" style={{ fontSize: '13px', marginRight: 8 }} />
                    {batchJobs.all?.running ? '生成中…' : '一键生成全部'}
                  </Button>
                  {batchJobs.all?.running && (
                    <Button variant="secondary" onClick={() => stopBatch('all')} style={{ padding: '0 18px' }}>
                      <i className="fa-solid fa-stop" style={{ fontSize: '12px', marginRight: 6 }} /> 停止
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    disabled={batchJobs.all?.running}
                    style={{ padding: '0 20px' }}
                    onClick={async () => {
                      if (!confirm('确定清空所有文章的 AI 摘要 + 陪读问题？下次一键生成会重新从头跑。')) return;
                      try {
                        const r: any = await api.post('/ai/batch-delete');
                        const d = r.data || r;
                        toast.success(`已清空 ${d?.updated ?? 0} 篇文章的 AI 数据`);
                      } catch (e: any) {
                        toast.error(e?.response?.data?.error?.message || '清空失败');
                      }
                    }}
                  >
                    <i className="fa-regular fa-trash-can" style={{ fontSize: '13px', marginRight: 8 }} />
                    批量清空 AI 数据
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* 单独生成 - 摘要 */}
          <div className="card" style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{
                width: '40px', height: '40px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
              }}>
                <i className="fa-regular fa-align-left" style={{ fontSize: '17px', color: 'var(--color-primary)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>批量生成 AI 摘要</h3>
                <p className="text-sub" style={{ fontSize: '12px', lineHeight: 1.7, margin: '0 0 12px' }}>
                  为没有 AI 摘要的已发布文章生成摘要，用于文章预览、SEO description。
                </p>
                <BatchProgress job={batchJobs.summary} />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Button
                    onClick={() => startBatch('summary', '/ai/batch-summary', 'AI 摘要')}
                    loading={batchLoading.summary || batchJobs.summary?.running}
                    disabled={batchJobs.summary?.running}
                    variant="secondary"
                  >
                    {batchJobs.summary?.running ? '生成中…' : '生成摘要'}
                  </Button>
                  {batchJobs.summary?.running && (
                    <Button variant="danger" onClick={() => stopBatch('summary')}>
                      <i className="fa-solid fa-stop" style={{ fontSize: '12px', marginRight: 6 }} /> 停止
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 单独生成 - 陪读问题 */}
          <div className="card" style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{
                width: '40px', height: '40px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
              }}>
                <i className="fa-regular fa-circle-question" style={{ fontSize: '17px', color: 'var(--color-primary)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>批量生成陪读问题</h3>
                <p className="text-sub" style={{ fontSize: '12px', lineHeight: 1.7, margin: '0 0 12px' }}>
                  为没有陪读问题的文章生成 3 个读者可能问的问题（用于 AI 陪读面板）。
                </p>
                <BatchProgress job={batchJobs.questions} />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Button
                    onClick={() => startBatch('questions', '/ai/batch-questions', '陪读问题')}
                    loading={batchLoading.questions || batchJobs.questions?.running}
                    disabled={batchJobs.questions?.running}
                    variant="secondary"
                  >
                    {batchJobs.questions?.running ? '生成中…' : '生成问题'}
                  </Button>
                  {batchJobs.questions?.running && (
                    <Button variant="danger" onClick={() => stopBatch('questions')}>
                      <i className="fa-solid fa-stop" style={{ fontSize: '12px', marginRight: 6 }} /> 停止
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '16px 20px', background: 'var(--color-bg-soft)', border: '1px dashed var(--color-border)' }}>
            <p className="text-sub" style={{ fontSize: '12px', lineHeight: 1.8, margin: 0 }}>
              <i className="fa-regular fa-lightbulb" style={{ marginRight: 6, color: 'var(--color-primary)' }} />
              任务在后台运行，关闭此页也继续。回到此页会自动显示最新进度。新发布文章会由发布流程**自动生成**，这里用于补齐历史数据。
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// Reusable batch progress bar component
function BatchProgress({ job }: { job: any }) {
  if (!job || job.total === 0) return null;
  const total = Math.max(1, job.total);
  const progress = ((job.done + job.failed) / total) * 100;
  return (
    <div style={{ marginBottom: '12px', padding: '10px 12px', background: 'var(--color-bg-soft)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
        <span>
          {job.running ? '进行中…' : '已完成'} · 成功 {job.done}
          {job.failed > 0 && <span style={{ color: '#dc2626' }}> · 失败 {job.failed}</span>}
        </span>
        <span className="text-dim">{job.done + job.failed} / {job.total}</span>
      </div>
      <div style={{ height: 4, background: 'var(--color-border)', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: job.failed > 0 ? '#eab308' : 'var(--color-primary)',
          transition: 'width 0.3s',
        }} />
      </div>
      {job.last_error && (
        <p style={{ fontSize: '11px', color: '#dc2626', margin: '6px 0 0' }}>{job.last_error}</p>
      )}
    </div>
  );
}
