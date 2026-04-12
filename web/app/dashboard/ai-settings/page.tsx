'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

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

const settingsTabs = ['提供商', '聊天配置', '特色图', '摘要', '博主资料', '系统提示词', '数据权限'];

export default function AiSettingsPage() {
  const [activeTab, setActiveTab] = useState('提供商');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [presets, setPresets] = useState<Record<string, any>>({});
  const [editing, setEditing] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/ai/providers');
      if (r.success) {
        setProviders(r.data.providers || []);
        setPresets(r.data.presets || {});
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const r: any = await api.post('/ai/providers', editing);
      if (r.success) {
        setEditing(null);
        load();
      } else {
        alert(r.error || '保存失败');
      }
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (!confirm('确定删除此提供商？')) return;
    await api.delete(`/ai/providers/${id}`);
    load();
  };

  const test = async () => {
    if (!editing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r: any = await api.post('/ai/test', {
        endpoint: editing.endpoint,
        model: editing.model,
        api_key: editing.api_key,
      });
      setTestResult({ ok: r.success, msg: r.success ? `连接成功: ${r.data?.content || 'OK'}` : (r.error || '失败') });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || '网络错误' });
    }
    setTesting(false);
  };

  const applyPreset = (key: string) => {
    const p = presets[key];
    if (!p || !editing) return;
    setEditing({
      ...editing,
      name: p.name,
      slug: key,
      endpoint: p.endpoint,
      model: p.models[0] || '',
    });
  };

  // Chat & summary config state
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI assistant for a blog system called Utterlog. Respond in the same language the user uses. Be concise and helpful.');
  const [chatTemp, setChatTemp] = useState(0.7);
  const [summaryAutoEnabled, setSummaryAutoEnabled] = useState(false);
  const [summaryMaxLength, setSummaryMaxLength] = useState(200);
  const [summaryPrompt, setSummaryPrompt] = useState('');
  const [guestChatEnabled, setGuestChatEnabled] = useState(false);
  const [chatPosition, setChatPosition] = useState<'right' | 'left'>('right');

  if (loading) return <div className="p-6 text-dim">加载中...</div>;

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)', marginBottom: '20px' }}>
        {settingsTabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '10px 20px', fontSize: '14px', fontWeight: activeTab === tab ? 600 : 400,
            color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-sub)',
            borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'none', cursor: 'pointer', transition: 'all 0.15s',
          }}>{tab}</button>
        ))}
      </div>

      {/* Tab: 提供商 */}
      {activeTab === '提供商' && <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 700 }}>AI 提供商设置</h1>
        <button
          onClick={() => setEditing({ ...defaultProvider })}
          className="btn btn-primary"
          style={{ fontSize: '13px', padding: '6px 16px' }}
        >
          添加提供商
        </button>
      </div>

      {/* Provider list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {providers.map((p: any) => (
          <div key={p.id} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{p.name}</span>
                {p.is_default && <span className="badge" style={{ fontSize: '10px', padding: '1px 6px', background: 'var(--color-primary)', color: '#fff', borderRadius: '3px' }}>默认</span>}
                {p.type === 'image' && <span className="badge" style={{ fontSize: '10px', padding: '1px 6px', background: 'var(--color-bg-soft)', borderRadius: '3px' }}>图片</span>}
                {!p.is_active && <span className="badge text-dim" style={{ fontSize: '10px' }}>已禁用</span>}
              </div>
              <p className="text-dim" style={{ fontSize: '12px', marginTop: '2px' }}>{p.model} · {p.endpoint}</p>
            </div>
            <button onClick={() => setEditing(p)} className="btn btn-ghost text-sub" style={{ fontSize: '12px', padding: '4px 10px' }}>编辑</button>
            <button onClick={() => remove(p.id)} className="btn btn-ghost text-dim" style={{ fontSize: '12px', padding: '4px 10px' }}>删除</button>
          </div>
        ))}
        {providers.length === 0 && (
          <div className="card text-dim" style={{ padding: '40px', textAlign: 'center', fontSize: '14px' }}>
            暂无提供商，点击上方按钮添加
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <>
          <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div className="card" style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 51, width: '520px', maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto',
            padding: '24px', boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>
              {editing.id ? '编辑提供商' : '添加提供商'}
            </h2>

            {/* Preset selector */}
            {!editing.id && (
              <div style={{ marginBottom: '16px' }}>
                <label className="text-sub" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>快速预设</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {Object.entries(presets).map(([key, p]: [string, any]) => (
                    <button key={key} onClick={() => applyPreset(key)} className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 10px', border: '1px solid var(--color-border)' }}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label className="text-sub" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>名称</label>
                  <input className="input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="如: OpenAI" />
                </div>
                <div style={{ width: '100px' }}>
                  <label className="text-sub" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>类型</label>
                  <select className="input" value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value })}>
                    <option value="text">文本</option>
                    <option value="image">图片</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sub" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>API 端点</label>
                <input className="input" value={editing.endpoint} onChange={e => setEditing({ ...editing, endpoint: e.target.value })} placeholder="https://api.openai.com/v1/chat/completions" />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label className="text-sub" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>模型</label>
                  {editing.slug && presets[editing.slug] ? (
                    <select className="input" value={editing.model} onChange={e => setEditing({ ...editing, model: e.target.value })}>
                      {presets[editing.slug].models.map((m: string) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <input className="input" value={editing.model} onChange={e => setEditing({ ...editing, model: e.target.value })} placeholder="gpt-4.1-mini" />
                  )}
                </div>
              </div>

              <div>
                <label className="text-sub" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>API Key</label>
                <input className="input" type="password" value={editing.api_key} onChange={e => setEditing({ ...editing, api_key: e.target.value })} placeholder="sk-..." />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label className="text-sub" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>温度 ({editing.temperature})</label>
                  <input type="range" min="0" max="2" step="0.1" value={editing.temperature} onChange={e => setEditing({ ...editing, temperature: parseFloat(e.target.value) })} style={{ width: '100%' }} />
                </div>
                <div style={{ width: '100px' }}>
                  <label className="text-sub" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>超时(秒)</label>
                  <input className="input" type="number" value={editing.timeout} onChange={e => setEditing({ ...editing, timeout: parseInt(e.target.value) })} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                  启用
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.is_default} onChange={e => setEditing({ ...editing, is_default: e.target.checked })} />
                  设为默认
                </label>
              </div>

              {testResult && (
                <div style={{
                  padding: '8px 12px', borderRadius: '1px', fontSize: '12px',
                  background: testResult.ok ? 'rgba(76,175,115,0.1)' : 'rgba(220,53,69,0.1)',
                  color: testResult.ok ? '#4CAF73' : '#DC3545',
                  border: `1px solid ${testResult.ok ? 'rgba(76,175,115,0.2)' : 'rgba(220,53,69,0.2)'}`,
                }}>
                  {testResult.msg}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button onClick={test} disabled={testing} className="btn btn-ghost" style={{ fontSize: '13px', padding: '6px 14px' }}>
                  {testing ? '测试中...' : '测试连接'}
                </button>
                <button onClick={() => setEditing(null)} className="btn btn-ghost" style={{ fontSize: '13px', padding: '6px 14px' }}>取消</button>
                <button onClick={save} disabled={saving} className="btn btn-primary" style={{ fontSize: '13px', padding: '6px 16px' }}>
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      </>}

      {/* Tab: 聊天配置 */}
      {activeTab === '聊天配置' && (
        <div className="space-y-4">
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>前端聊天气泡</h3>
            <div className="space-y-3">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={guestChatEnabled} onChange={e => setGuestChatEnabled(e.target.checked)} />
                允许访客（未登录）使用 AI 聊天
              </label>
              <div>
                <label className="block text-xs text-sub mb-1">气泡位置</label>
                <select className="input text-sm" value={chatPosition} onChange={e => setChatPosition(e.target.value as any)}>
                  <option value="right">右下角</option>
                  <option value="left">左下角</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-sub mb-1">对话温度 ({chatTemp})</label>
                <input type="range" min="0" max="2" step="0.1" value={chatTemp} onChange={e => setChatTemp(parseFloat(e.target.value))} style={{ width: '100%' }} />
                <p className="text-xs text-dim mt-1">越低越精确，越高越有创意</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: 摘要 */}
      {activeTab === '摘要' && (
        <div className="space-y-4">
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>AI 摘要设置</h3>
            <div className="space-y-3">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={summaryAutoEnabled} onChange={e => setSummaryAutoEnabled(e.target.checked)} />
                发布文章时自动生成摘要
              </label>
              <div>
                <label className="block text-xs text-sub mb-1">摘要最大长度</label>
                <input type="number" className="input text-sm" value={summaryMaxLength} onChange={e => setSummaryMaxLength(parseInt(e.target.value) || 200)} />
              </div>
              <div>
                <label className="block text-xs text-sub mb-1">自定义摘要提示词（可选）</label>
                <textarea className="input text-sm resize-none" rows={3} value={summaryPrompt} onChange={e => setSummaryPrompt(e.target.value)} placeholder="留空使用默认提示词" />
                <p className="text-xs text-dim mt-1">自定义 AI 生成摘要时的指令，例如：请用轻松幽默的语气总结</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: 特色图 */}
      {activeTab === '特色图' && (
        <div className="space-y-4">
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>AI 特色图生成</h3>
            <p className="text-xs text-dim mb-4">使用 AI 根据文章标题和内容自动生成封面图片</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-sub mb-1">图片生成模型</label>
                <select className="input text-sm">
                  <option value="">使用默认图片提供商</option>
                  <option value="dall-e-3">OpenAI DALL·E 3</option>
                  <option value="gpt-image-1">OpenAI GPT Image</option>
                  <option value="gemini">Google Gemini Image</option>
                  <option value="wanx">通义万相</option>
                  <option value="cogview">智谱 CogView</option>
                  <option value="doubao">豆包 SeedDream</option>
                  <option value="minimax">MiniMax Image</option>
                  <option value="flux">SiliconFlow FLUX</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-sub mb-1">图片比例</label>
                <select className="input text-sm">
                  <option value="16:9">16:9（推荐，文章封面）</option>
                  <option value="1:1">1:1（正方形）</option>
                  <option value="4:3">4:3</option>
                  <option value="3:2">3:2</option>
                  <option value="9:16">9:16（竖版）</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-sub mb-1">图片风格</label>
                <select className="input text-sm">
                  <option value="editorial">编辑风格（干净、专业）</option>
                  <option value="realistic">写实风格</option>
                  <option value="cinematic">电影风格</option>
                  <option value="illustration">插画风格</option>
                  <option value="minimal">极简风格</option>
                  <option value="watercolor">水彩风格</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-sub mb-1">图片格式</label>
                <select className="input text-sm">
                  <option value="webp">WebP（推荐）</option>
                  <option value="png">PNG</option>
                  <option value="jpg">JPEG</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-sub mb-1">压缩质量</label>
                <input type="number" className="input text-sm" defaultValue={82} min={1} max={100} />
              </div>
              <div>
                <label className="block text-xs text-sub mb-1">文字策略</label>
                <select className="input text-sm">
                  <option value="no_text">不包含文字</option>
                  <option value="title_only">仅标题</option>
                  <option value="subtle_caption">微妙文字</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: 博主资料 */}
      {activeTab === '博主资料' && (
        <div className="space-y-4">
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>博主资料 & AI 记忆</h3>
            <p className="text-xs text-dim mb-4">AI 会根据这些信息了解你的写作风格和偏好，提供更个性化的回复</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-sub mb-1">博主昵称</label>
                <input className="input text-sm" placeholder="你的名字或笔名" />
              </div>
              <div>
                <label className="block text-xs text-sub mb-1">博客简介</label>
                <textarea className="input text-sm resize-none" rows={3} placeholder="简要描述你的博客主题和风格" />
              </div>
              <div>
                <label className="block text-xs text-sub mb-1">写作风格</label>
                <textarea className="input text-sm resize-none" rows={2} placeholder="例如：轻松幽默、技术严谨、文艺清新..." />
              </div>
              <div>
                <label className="block text-xs text-sub mb-1">AI 记忆（MEMORY.md）</label>
                <textarea className="input text-sm font-mono resize-none" rows={8} placeholder="AI 会自动在这里记录你的偏好和上下文..." />
                <p className="text-xs text-dim mt-1">这些记忆会作为上下文发送给 AI，帮助它更好地理解你</p>
              </div>
              <div>
                <label className="block text-xs text-sub mb-1">记忆存储方式</label>
                <select className="input text-sm">
                  <option value="local">本地文件</option>
                  <option value="s3">S3/R2 云存储</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: 数据权限 */}
      {activeTab === '数据权限' && (
        <div className="space-y-4">
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>AI 数据访问权限</h3>
            <p className="text-xs text-dim mb-4">控制 AI 可以访问哪些站点数据作为上下文</p>
            <div className="space-y-2">
              {[
                { key: 'site_basics', label: '站点基础信息', desc: '系统版本、服务器信息' },
                { key: 'theme_info', label: '主题信息', desc: '当前主题和配色' },
                { key: 'active_plugins', label: '启用的插件', desc: '插件列表' },
                { key: 'posts', label: '文章内容', desc: '所有已发布文章的标题和内容' },
                { key: 'pages_content', label: '页面内容', desc: '所有已发布页面' },
                { key: 'taxonomies', label: '分类和标签', desc: '分类目录和标签列表' },
                { key: 'comments', label: '评论内容', desc: '所有评论列表' },
                { key: 'users_count', label: '用户统计', desc: '按角色统计用户数量' },
              ].map(item => (
                <label key={item.key} className="flex items-start gap-3 p-3 rounded-[4px] hover:bg-soft cursor-pointer transition-colors">
                  <input type="checkbox" className="mt-0.5" />
                  <div>
                    <span className="text-sm font-medium text-main">{item.label}</span>
                    <p className="text-xs text-dim mt-0.5">{item.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2 pt-4">
              <button className="btn btn-secondary text-sm">收集站点数据</button>
              <button className="btn btn-secondary text-sm">查看已收集数据</button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: 系统提示词 */}
      {activeTab === '系统提示词' && (
        <div className="space-y-4">
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>AI 系统提示词</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-sub mb-1">聊天系统提示词</label>
                <textarea className="input text-sm font-mono resize-none" rows={8} value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} />
                <p className="text-xs text-dim mt-1">定义 AI 的角色和行为方式，会在每次对话开始时发送给 AI</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary text-sm" style={{ padding: '6px 16px' }}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
