'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Check, Upload } from '@/components/icons';
import { optionsApi } from '@/lib/api';
import toast from 'react-hot-toast';

// Import theme manifests
import Utterlog2026Manifest from '@/themes/Utterlog2026/theme.json';
import LaredManifest from '@/themes/Lared/theme.json';
import WestlifeManifest from '@/themes/Westlife/theme.json';

interface ThemeInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  colors: { primary?: string; background?: string };
}

const installedThemes: ThemeInfo[] = [
  { id: 'Utterlog2026', ...Utterlog2026Manifest },
  { id: 'Lared', ...LaredManifest },
  { id: 'Westlife', ...WestlifeManifest },
];

export default function ThemesPage() {
  const [activeTab, setActiveTab] = useState<'installed' | 'market'>('installed');
  const [activeTheme, setActiveTheme] = useState('Utterlog2026');
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    fetchActiveTheme();
  }, []);

  const fetchActiveTheme = async () => {
    try {
      const r: any = await optionsApi.get('active_theme');
      const val = r.data?.value || r.value;
      if (val) setActiveTheme(val);
    } catch {
      // Default theme
    }
  };

  const switchTheme = async (themeId: string) => {
    if (themeId === activeTheme) return;
    setSwitching(themeId);
    try {
      await optionsApi.update('active_theme', themeId);
      setActiveTheme(themeId);
      toast.success(`主题已切换为「${themeId}」`);
    } catch {
      toast.error('切换主题失败');
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)', marginBottom: '20px' }}>
        {[
          { key: 'installed' as const, label: `已安装 (${installedThemes.length})` },
          { key: 'market' as const, label: '主题市场' },
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
          <input type="file" accept=".zip" style={{ display: 'none' }} onChange={() => toast('主题上传功能即将上线')} />
          <span className="btn btn-secondary text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Upload size={14} /> 上传主题
          </span>
        </label>
      </div>

      {activeTab === 'installed' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {installedThemes.map(theme => {
            const isActive = theme.id === activeTheme;
            const isSwitching = switching === theme.id;
            return (
              <div key={theme.id} className="card" style={{ overflow: 'hidden', border: isActive ? '2px solid var(--color-primary)' : undefined }}>
                {/* Preview */}
                <div style={{
                  height: '140px',
                  background: theme.colors?.background || '#f5f5f5',
                  borderBottom: '1px solid var(--color-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                  <div style={{
                    width: '60%', height: '70%', background: '#fff', borderRadius: '4px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: '12px',
                    display: 'flex', flexDirection: 'column', gap: '6px',
                  }}>
                    <div style={{ width: '60%', height: '4px', background: theme.colors?.primary || '#666', borderRadius: '2px' }} />
                    <div style={{ width: '100%', height: '3px', background: '#eee', borderRadius: '2px' }} />
                    <div style={{ width: '80%', height: '3px', background: '#eee', borderRadius: '2px' }} />
                    <div style={{ width: '40%', height: '3px', background: '#eee', borderRadius: '2px' }} />
                  </div>
                  {isActive && (
                    <div style={{
                      position: 'absolute', top: '8px', right: '8px',
                      background: 'var(--color-primary)', color: '#fff',
                      fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px',
                    }}>
                      使用中
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: '16px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>{theme.name}</h3>
                  <p className="text-dim" style={{ fontSize: '12px', marginBottom: '12px' }}>{theme.description}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                    <span className="text-dim">{theme.author} · v{theme.version}</span>
                    {isActive ? (
                      <span style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '12px' }}>
                        <Check size={14} /> 已激活
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => switchTheme(theme.id)}
                        loading={isSwitching}
                        style={{ fontSize: '12px', padding: '4px 12px' }}
                      >
                        启用
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Upload slot */}
          <label className="card" style={{
            border: '2px dashed var(--color-border)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', minHeight: '240px', cursor: 'pointer',
          }}>
            <input type="file" accept=".zip" style={{ display: 'none' }} onChange={() => toast('主题上传功能即将上线')} />
            <Upload size={24} className="text-dim" />
            <p className="text-dim" style={{ fontSize: '13px', marginTop: '8px' }}>上传自定义主题</p>
            <p className="text-dim" style={{ fontSize: '11px', marginTop: '2px' }}>支持 .zip 格式</p>
          </label>
        </div>
      )}

      {activeTab === 'market' && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p className="text-dim" style={{ fontSize: '15px', marginBottom: '8px' }}>主题市场即将上线</p>
          <p className="text-dim" style={{ fontSize: '13px' }}>
            开发者可参阅主题开发文档创建自定义主题，提交到主题市场供所有用户使用
          </p>
        </div>
      )}

      {/* Theme directory info */}
      <div style={{ marginTop: '24px', padding: '16px', background: 'var(--color-bg-soft)', borderRadius: '4px' }}>
        <p className="text-dim" style={{ fontSize: '12px' }}>
          主题目录：<code style={{ background: 'var(--color-bg-card)', padding: '2px 6px', borderRadius: '2px' }}>themes/</code>
          &nbsp;&middot;&nbsp;
          插件目录：<code style={{ background: 'var(--color-bg-card)', padding: '2px 6px', borderRadius: '2px' }}>plugins/</code>
        </p>
      </div>
    </div>
  );
}
