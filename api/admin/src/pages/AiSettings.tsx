
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
  { id: '功能分配',   label: '功能分配',   icon: 'fa-regular fa-shuffle' },
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
  // Purpose list comes from the backend so adding a new AI feature
  // (api/internal/handler/ai.go AIPurposes) doesn't require a SPA
  // rebuild — the form rows are rendered by mapping over this array.
  const [purposes, setPurposes] = useState<Array<{ key: string; label: string; hint?: string }>>([]);
  // Built-in default prompts loaded from the same /ai/providers
  // payload. The 自定义提示词 textareas pre-fill with the value
  // for the matching key (summary / slug / keywords / polish /
  // questions), so admins see exactly what runs when they leave a
  // field empty. Clearing the textarea + saving = restore default
  // (the option key gets stored as ''; backend's resolvePrompt
  // falls back to the constant).
  const [promptDefaults, setPromptDefaults] = useState<Record<string, string>>({});
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
    // Prompt textareas start empty — load() pre-fills them with the
    // built-in Chinese defaults from the backend (handler/ai_prompts.go
    // AIPromptDefaults) when the corresponding option is empty.
    // Clearing the textarea + 保存 stores '' which makes backend
    // resolvePrompt fall back to the constant on every call.
    ai_summary_prompt: '',
    ai_slug_prompt: '',
    ai_keywords_prompt: '',
    ai_polish_prompt: '',
    ai_questions_prompt: '',
    ai_image_auto: 'false',
    ai_slug_auto: 'false',
    ai_keywords_auto: 'false',
    ai_polish_auto: 'false',
    // ai_image_model removed: was a placebo label that didn't drive
    // dispatch (real provider lookup goes through ai_providers).
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
      const pu = provR.data?.purposes || provR.purposes || [];
      const pd = provR.data?.prompt_defaults || provR.prompt_defaults || {};
      setProviders(p);
      setPresets(pr);
      setPurposes(pu);
      setPromptDefaults(pd);

      // Load AI options
      const opts = optR.data || optR || {};
      const newConfig = { ...config };
      Object.keys(newConfig).forEach(key => {
        if (opts[key] !== undefined && opts[key] !== '') newConfig[key] = opts[key];
      });

      // Pre-fill prompt textareas with the built-in default when the
      // admin hasn't saved a custom value yet. The textarea always
      // shows real text (not a placeholder), so admins can edit/copy
      // it directly. Backend resolvePrompt sees '' as 'use default',
      // so saving an unedited default-filled box is identical to
      // saving an empty box — both restore default behaviour on the
      // server. Mapping: prompt_defaults key → option key.
      const promptKeyMap: Record<string, string> = {
        summary:   'ai_summary_prompt',
        slug:      'ai_slug_prompt',
        keywords:  'ai_keywords_prompt',
        polish:    'ai_polish_prompt',
        questions: 'ai_questions_prompt',
      };
      Object.entries(promptKeyMap).forEach(([defaultKey, optKey]) => {
        const saved = opts[optKey];
        if (saved && String(saved).trim() !== '') {
          newConfig[optKey] = String(saved);
        } else if (pd[defaultKey]) {
          newConfig[optKey] = pd[defaultKey];
        }
      });

      // Also pick up any ai_purpose_*_provider keys we got back from
      // the API. These aren't in the initial useState because the
      // purposes list is server-driven (AIPurposes in handler/ai.go),
      // so we can't know up-front what keys to expect — copy any
      // key that matches the prefix.
      Object.keys(opts).forEach(key => {
        if (key.startsWith('ai_purpose_') && key.endsWith('_provider')) {
          newConfig[key] = opts[key];
        }
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
      // Map prompt option key → matching default key so we can detect
      // 'value equals current default' and store '' instead. That way
      // an admin who never customised a prompt automatically gets any
      // future default-prompt update without having to re-edit. Only
      // textareas where the user explicitly typed a different version
      // persist as a stored value.
      const promptOptToDefaultKey: Record<string, string> = {
        ai_summary_prompt:   'summary',
        ai_slug_prompt:      'slug',
        ai_keywords_prompt:  'keywords',
        ai_polish_prompt:    'polish',
        ai_questions_prompt: 'questions',
      };
      Object.entries(config).forEach(([k, v]) => {
        if (!k.startsWith('ai_')) return;
        const defaultKey = promptOptToDefaultKey[k];
        if (defaultKey) {
          const def = promptDefaults[defaultKey] ?? '';
          // Compare trimmed strings — admins occasionally append a
          // trailing newline, that shouldn't count as a custom edit.
          if ((v ?? '').trim() === def.trim()) {
            aiOpts[k] = '';
            return;
          }
        }
        aiOpts[k] = v;
      });
      await api.put('/options', aiOpts);
      toast.success('设置已保存');
    } catch {
      toast.error('保存失败');
    }
    setSavingConfig(false);
  };

  // Reset a prompt textarea to the built-in default. Doesn't save —
  // user has to click 保存 to persist. Lets users preview the default
  // without committing in case they want to discard the reset.
  const resetPrompt = (optionKey: string, defaultKey: string) => {
    const def = promptDefaults[defaultKey] ?? '';
    updateConfig(optionKey, def);
    toast.success('已恢复默认提示词，记得点保存');
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
              /* Modal form spacing matches the established admin pattern
                 (Movies / MusicPlaylists / SyncSitesPanel etc.): explicit
                 flex column with a single consistent row gap rather than
                 Tailwind space-y-4. 18px gives the label/input pairs
                 enough breathing room — space-y-4 (16px) made labels read
                 as if they were stuck to the input above them. */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {!editing.id && Object.keys(presets).length > 0 && (
                  <>
                    <div>
                      <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>快速预设</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {Object.entries(presets).map(([key, p]: [string, any]) => (
                          <Button key={key} variant="secondary" size="sm" onClick={() => applyPreset(key)}>{p.name}</Button>
                        ))}
                      </div>
                    </div>
                    {/* Divider — same color/weight as FormSectionC dividers
                        in Settings.tsx so the modal feels like part of the
                        same UI family. */}
                    <div style={{ height: '1px', background: 'var(--color-border)' }} />
                  </>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>温度 ({editing.temperature})</label>
                    <input type="range" min="0" max="2" step="0.1" value={editing.temperature} onChange={e => setEditing({ ...editing, temperature: parseFloat(e.target.value) })} style={{ width: '100%' }} />
                  </div>
                  <Input label="超时(秒)" type="number" value={editing.timeout} onChange={e => setEditing({ ...editing, timeout: parseInt(e.target.value) })} />
                </div>
                {/* Toggle group — light divider above so booleans read as
                    a separate concern from the connection fields. 14px
                    inner gap matches the per-row spacing of the form. */}
                <div style={{ height: '1px', background: 'var(--color-border)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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

      {/* ── 功能分配 ── per-purpose model selection */}
      {activeTab === '功能分配' && (
        <>
          <FormSectionC
            title="功能模型分配"
            icon="fa-regular fa-shuffle"
            description="为每个 AI 功能单独指定一个 type=文本 的提供商。留空 = 使用默认提供商（即 type=文本 + is_default=true 的那条）。某个功能的指定提供商失败时会自动回退到默认链。"
          >
            {purposes.length === 0 ? (
              <div className="text-dim" style={{ fontSize: '13px', padding: '12px 0' }}>
                后端尚未启用功能分配（升级到 v1.3+）
              </div>
            ) : (
              purposes.map((pu, idx) => {
                const optKey = `ai_purpose_${pu.key}_provider`;
                const current = String(config[optKey] ?? '');
                const textProviders = providers.filter(
                  (p: any) => p.type === 'text' && p.is_active,
                );
                return (
                  <FormRowSelectC
                    key={pu.key}
                    label={pu.label}
                    hint={pu.hint}
                    value={current}
                    onChange={v => updateConfig(optKey, v)}
                    options={[
                      { value: '', label: '使用默认（按 is_default 顺序）' },
                      ...textProviders.map((p: any) => ({
                        value: String(p.id),
                        label: `${p.name} · ${p.model}`,
                      })),
                    ]}
                    last={idx === purposes.length - 1}
                  />
                );
              })
            )}
          </FormSectionC>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <Button onClick={saveConfig} loading={savingConfig}>
              <i className="fa-regular fa-floppy-disk" style={{ fontSize: '14px' }} /> 保存
            </Button>
          </div>
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
              {/* The 摘要提示词 textarea now lives in the
                  「自定义提示词」section below alongside Slug /
                  关键词 / 润色 — keeping the prompt editor in one
                  place avoids the previous bug where this section
                  had its own duplicate field. */}
            </FormSectionC>
          )}

          {/* 特色图设置 */}
          {config.ai_image_auto === 'true' && (
            <FormSectionC title="特色图设置" icon="fa-regular fa-image" description="后端实际生效的提供商在「提供商」标签页里配置（type=图片，is_default）。下面四个参数（比例 / 风格 / 格式 / 质量 / 文字策略）会在文章编辑器点 ✨ AI 生成封面 时合成进 prompt 或用于上传后转码。">
              {/* The old 'preferred model family' select was removed
                  — the dispatch reads from ai_providers (type=image),
                  so a UI hint that doesn't drive anything was just
                  more noise. */}
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
            description="文本框默认填入内置提示词模板（中文版），可直接编辑保存。清空后保存即恢复默认；点「恢复默认」按钮把当前默认填回输入框（不会自动保存）。占位符 {title} {content} {excerpt} {min_len} {max_len} {tags_count} 会在调用时替换。"
          >
            {([
              { key: 'summary',   label: '摘要提示词',   rows: 8 },
              { key: 'slug',      label: 'Slug 提示词',  rows: 6 },
              { key: 'keywords',  label: '关键词提示词', rows: 5 },
              { key: 'polish',    label: '润色提示词',   rows: 8 },
              { key: 'questions', label: '推荐问题提示词', rows: 5 },
            ] as const).map((row, idx, arr) => {
              const optKey = `ai_${row.key}_prompt`;
              const def = promptDefaults[row.key] ?? '';
              const current = String(config[optKey] ?? '');
              const isDefault = current.trim() === def.trim();
              return (
                <div key={row.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderBottom: idx === arr.length - 1 ? 'none' : '1px solid var(--color-border)', paddingBottom: idx === arr.length - 1 ? 0 : '14px', marginBottom: idx === arr.length - 1 ? 0 : '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="text-sub" style={{ fontSize: '13px', fontWeight: 500 }}>{row.label}</label>
                    <button
                      type="button"
                      onClick={() => resetPrompt(optKey, row.key)}
                      disabled={isDefault}
                      title={isDefault ? '当前已是默认' : '把内置默认提示词填回这个输入框'}
                      style={{
                        background: 'none', border: 'none', padding: '2px 6px',
                        fontSize: '12px', cursor: isDefault ? 'default' : 'pointer',
                        color: isDefault ? 'var(--color-text-dim)' : 'var(--color-primary)',
                      }}
                    >
                      <i className="fa-regular fa-rotate-left" style={{ fontSize: '11px', marginRight: '3px' }} />
                      恢复默认
                    </button>
                  </div>
                  <textarea
                    className="input focus-ring"
                    rows={row.rows}
                    value={current}
                    onChange={e => updateConfig(optKey, e.target.value)}
                    placeholder="清空保存即恢复默认"
                    style={{ fontSize: '12px', fontFamily: 'var(--font-mono, monospace)', resize: 'vertical' }}
                  />
                </div>
              );
            })}
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
