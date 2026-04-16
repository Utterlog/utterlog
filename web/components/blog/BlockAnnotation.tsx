'use client';

import { useState, useRef, useEffect } from 'react';
import { useAnnotations, type Annotation } from './AnnotationProvider';

interface BlockAnnotationProps {
  blockId: string;
  children: React.ReactNode;
}

function formatTime(ts: number) {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`;
  return d.toLocaleDateString('zh-CN');
}

export default function BlockAnnotation({ blockId, children }: BlockAnnotationProps) {
  const { annotations, activeBlock, setActiveBlock, addAnnotation } = useAnnotations();
  const [hovered, setHovered] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const blockAnnotations = annotations[blockId] || [];
  const isActive = activeBlock === blockId;
  const hasAnnotations = blockAnnotations.length > 0;

  // Close panel on click outside
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setActiveBlock(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isActive, setActiveBlock]);

  const handleSubmit = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const ok = await addAnnotation(blockId, input.trim());
    if (ok) setInput('');
    setSending(false);
  };

  return (
    <div
      style={{ position: 'relative', marginLeft: '-40px', paddingLeft: '40px' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Left-side annotation trigger */}
      {(hovered || isActive || hasAnnotations) && (
        <div
          style={{
            position: 'absolute', left: '0px', top: '2px', width: '32px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            transition: 'opacity 0.15s',
            opacity: hovered || isActive ? 1 : 0.6,
          }}
          onClick={() => setActiveBlock(isActive ? null : blockId)}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* Avatar stack — shown when annotations exist */}
            {hasAnnotations && blockAnnotations.slice(0, 3).map((a, i) => (
              <div key={a.id} style={{
                width: '24px', height: '24px', borderRadius: '50%',
                border: '2px solid var(--color-bg-card)',
                marginLeft: i > 0 ? '-8px' : 0,
                overflow: 'hidden', background: 'var(--color-bg-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 3 - i,
              }}>
                {a.user_avatar ? (
                  <img src={a.user_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-primary)' }}>
                    {a.user_name[0]}
                  </span>
                )}
              </div>
            ))}
            {hasAnnotations && blockAnnotations.length > 3 && (
              <span style={{ fontSize: '10px', color: 'var(--color-text-dim)', marginLeft: '2px' }}>
                +{blockAnnotations.length - 3}
              </span>
            )}
            {/* Plus button — always shown when hovered or active; also when no annotations */}
            {(hovered || isActive || !hasAnnotations) && (
              <div style={{
                width: '24px', height: '24px', borderRadius: '50%',
                border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-color 0.15s, opacity 0.15s',
                marginLeft: hasAnnotations ? '4px' : 0,
                zIndex: 0,
              }}>
                <i className="fa-solid fa-plus" style={{ fontSize: '10px', color: 'var(--color-text-dim)' }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {children}

      {/* Annotation panel */}
      {isActive && (
        <div ref={panelRef} style={{
          position: 'absolute', left: '0px', top: '32px', zIndex: 100,
          width: '320px', maxHeight: '400px',
          background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
          borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--color-border)',
            fontSize: '12px', fontWeight: 600, color: 'var(--color-text-sub)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{blockAnnotations.length > 0 ? `${blockAnnotations.length} 条点评` : '发表点评'}</span>
            <button onClick={() => setActiveBlock(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)' }}>
              <i className="fa-regular fa-xmark" style={{ fontSize: '12px' }} />
            </button>
          </div>

          {/* Annotations list */}
          {blockAnnotations.length > 0 && (
            <div style={{ maxHeight: '240px', overflow: 'auto', padding: '8px 14px' }}>
              {blockAnnotations.map(a => (
                <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-divider)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      overflow: 'hidden', background: 'var(--color-bg-soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {a.user_avatar ? (
                        <img src={a.user_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: '8px', fontWeight: 700, color: 'var(--color-primary)' }}>{a.user_name[0]}</span>
                      )}
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-main)' }}>{a.user_name}</span>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-dim)' }}>{formatTime(a.created_at)}</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-sub)', lineHeight: 1.6, margin: 0 }}>{a.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Input form */}
          <div style={{ padding: '10px 14px', borderTop: blockAnnotations.length > 0 ? '1px solid var(--color-border)' : 'none' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                placeholder="写下你的点评..."
                style={{
                  flex: 1, padding: '6px 10px', fontSize: '12px',
                  border: '1px solid var(--color-border)', borderRadius: '6px',
                  background: 'var(--color-bg-card)', color: 'var(--color-text-main)',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={sending || !input.trim()}
                style={{
                  padding: '6px 12px', fontSize: '12px', fontWeight: 500,
                  background: input.trim() ? 'var(--color-primary)' : 'var(--color-bg-soft)',
                  color: input.trim() ? '#fff' : 'var(--color-text-dim)',
                  border: 'none', borderRadius: '6px', cursor: input.trim() ? 'pointer' : 'default',
                  flexShrink: 0,
                }}
              >
                发送
              </button>
            </div>
            <p style={{ fontSize: '10px', color: 'var(--color-text-dim)', marginTop: '6px' }}>
              <i className="fa-sharp fa-light fa-globe" style={{ marginRight: '4px' }} />
              仅 Utterlog 网络用户可点评
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
