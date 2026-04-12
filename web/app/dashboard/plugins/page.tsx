'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { Check, Upload, Settings } from '@/components/icons';

const installedPlugins = [
  { id: 'ai-assistant', name: 'AI 助手', desc: '内置 AI 聊天、内容生成、摘要、Slug 生成', author: 'Utterlog!', version: '1.0.0', active: true, builtin: true },
  { id: 'music-player', name: '音乐播放器', desc: '内置多皮肤音乐播放器，支持网易云/酷狗', author: 'Utterlog!', version: '1.0.0', active: true, builtin: true },
  { id: 'federation', name: '联邦社交', desc: '跨站关注、联邦评论、RSS 聚合', author: 'Utterlog!', version: '1.0.0', active: true, builtin: true },
  { id: 'telegram-bot', name: 'Telegram Bot', desc: '通过 Telegram 管理博客、发布说说、AI 聊天', author: 'Utterlog!', version: '1.0.0', active: false, builtin: true },
];

const marketPlugins = [
  { id: 'analytics', name: '访问统计', desc: '自托管的网站访问分析，无需第三方', author: '社区', version: '1.0.0' },
  { id: 'sitemap', name: 'Sitemap', desc: '自动生成 sitemap.xml 和 robots.txt', author: '社区', version: '1.0.0' },
  { id: 'memos-sync', name: 'Memos 同步', desc: '从 Memos 服务器同步说说', author: '社区', version: '0.8.0' },
  { id: 'douban', name: '豆瓣同步', desc: '从豆瓣同步电影、图书记录', author: '社区', version: '0.9.0' },
  { id: 'webmention', name: 'Webmention', desc: '接收和发送 Webmention 互动', author: '社区', version: '1.0.0' },
  { id: 'search', name: '全文搜索', desc: '基于 Bleve 的本地全文搜索引擎', author: '社区', version: '1.0.0' },
];

export default function PluginsPage() {
  const [activeTab, setActiveTab] = useState<'installed' | 'market'>('installed');

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)', marginBottom: '20px' }}>
        {[
          { key: 'installed' as const, label: `已安装 (${installedPlugins.length})` },
          { key: 'market' as const, label: '插件市场' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '10px 20px', fontSize: '14px', fontWeight: activeTab === tab.key ? 600 : 400,
            color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-sub)',
            borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            borderBottom: activeTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'none', cursor: 'pointer',
          }}>{tab.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <label style={{ alignSelf: 'center', cursor: 'pointer' }}>
          <input type="file" accept=".zip" style={{ display: 'none' }} />
          <span className="btn btn-secondary text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Upload size={14} /> 上传插件
          </span>
        </label>
      </div>

      {activeTab === 'installed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {installedPlugins.map(plugin => (
            <div key={plugin.id} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              {/* Icon */}
              <div style={{
                width: '40px', height: '40px', borderRadius: '1px',
                background: plugin.active ? 'var(--color-primary)' : 'var(--color-bg-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                color: plugin.active ? '#fff' : 'var(--color-text-dim)', fontSize: '16px', fontWeight: 700,
              }}>
                {plugin.name[0]}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>{plugin.name}</span>
                  {plugin.builtin && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '2px', background: 'var(--color-bg-soft)', color: 'var(--color-text-dim)' }}>内置</span>}
                  <span className="text-dim" style={{ fontSize: '11px' }}>v{plugin.version}</span>
                </div>
                <p className="text-dim" style={{ fontSize: '12px', marginTop: '2px' }}>{plugin.desc}</p>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {plugin.active ? (
                  <>
                    <button className="btn btn-ghost text-dim" style={{ fontSize: '12px', padding: '4px 8px' }} title="设置"><Settings size={14} /></button>
                    <Button variant="secondary" style={{ fontSize: '11px', padding: '4px 10px' }}>禁用</Button>
                  </>
                ) : (
                  <Button style={{ fontSize: '11px', padding: '4px 10px' }}>启用</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'market' && (
        <>
          <p className="text-dim" style={{ fontSize: '13px', marginBottom: '16px' }}>
            浏览社区插件，一键安装。开发者可参阅 <a href="https://utterlog.io/docs/plugins" target="_blank" className="text-primary-themed">插件开发文档</a> 创建自定义插件。
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {marketPlugins.map(plugin => (
              <div key={plugin.id} className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '1px', background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: 'var(--color-text-dim)' }}>
                    {plugin.name[0]}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600 }}>{plugin.name}</h3>
                    <span className="text-dim" style={{ fontSize: '11px' }}>{plugin.author} · v{plugin.version}</span>
                  </div>
                </div>
                <p className="text-dim" style={{ fontSize: '12px', marginBottom: '10px' }}>{plugin.desc}</p>
                <Button style={{ width: '100%', fontSize: '12px' }}>安装</Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
