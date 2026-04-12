'use client';

import { useEffect, useState, useRef } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Sparkles, Trash2 } from '@/components/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: number;
}

interface Conversation {
  id: number;
  title: string;
  message_count: number;
  updated_at: number;
}

export default function AiChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [loading, setLoading] = useState(true);
  const msgEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadConversations(); }, []);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/ai/conversations');
      if (r.success) setConversations(r.data || []);
    } catch {}
    setLoading(false);
  };

  const loadMessages = async (id: number) => {
    setActiveId(id);
    try {
      const r: any = await api.get(`/ai/conversations/${id}`);
      if (r.success) setMessages(r.data?.messages || []);
    } catch {}
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  };

  const deleteConv = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('删除此对话？')) return;
    await api.delete(`/ai/conversations/${id}`);
    if (activeId === id) newChat();
    loadConversations();
  };

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;

    setInput('');
    setSending(true);

    // Add user message immediately
    const userMsg: Message = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);

    try {
      // Use SSE streaming
      const token = useAuthStore.getState().accessToken || '';
      const body = JSON.stringify({
        message: msg,
        conversation_id: activeId || 0,
        stream: true,
      });

      const response = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body,
      });

      if (!response.ok) {
        const err = await response.json();
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.error || response.statusText}` }]);
        setSending(false);
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let newConvId = activeId;

      if (reader) {
        setStreaming('');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'meta' && data.conversation_id) {
                newConvId = data.conversation_id;
                if (!activeId) setActiveId(newConvId);
              } else if (data.type === 'chunk') {
                fullContent += data.content;
                setStreaming(fullContent);
              } else if (data.type === 'done') {
                // Done
              }
            } catch {}
          }
        }
      }

      // Replace streaming with final message
      setStreaming('');
      if (fullContent) {
        setMessages(prev => [...prev, { role: 'assistant', content: fullContent }]);
      }

      loadConversations();
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    }

    setSending(false);
    inputRef.current?.focus();
  };

  // Auto scroll
  useEffect(() => {
    msgEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const formatTime = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: conversation list */}
      <div style={{
        width: '260px', flexShrink: 0, borderRight: '1px solid var(--color-border)',
        display: 'flex', flexDirection: 'column', background: 'var(--color-bg-soft)',
      }}>
        <div style={{ padding: '12px', flexShrink: 0 }}>
          <button onClick={newChat} className="btn btn-primary" style={{ width: '100%', fontSize: '13px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Sparkles size={14} /> 新对话
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 6px 12px' }}>
          {conversations.map(c => (
            <div
              key={c.id}
              onClick={() => loadMessages(c.id)}
              style={{
                padding: '10px 10px',
                borderRadius: '1px', cursor: 'pointer',
                marginBottom: '2px',
                background: activeId === c.id ? 'var(--color-bg-card)' : 'transparent',
                border: activeId === c.id ? '1px solid var(--color-border)' : '1px solid transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <p style={{
                  fontSize: '13px', fontWeight: activeId === c.id ? 600 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flex: 1, minWidth: 0,
                }}>
                  {c.title || '新对话'}
                </p>
                <button
                  onClick={(e) => deleteConv(c.id, e)}
                  className="text-dim"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '14px', lineHeight: 1, flexShrink: 0 }}
                >
                  ×
                </button>
              </div>
              <p className="text-dim" style={{ fontSize: '11px', marginTop: '2px' }}>
                {c.message_count} 条消息 · {formatTime(c.updated_at)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Right: chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {messages.length === 0 && !streaming && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
              <Sparkles size={36} style={{ color: 'var(--color-text-dim)' }} />
              <p className="text-dim" style={{ fontSize: '14px' }}>开始一段新对话</p>
              <p className="text-dim" style={{ fontSize: '12px', maxWidth: '400px', textAlign: 'center', lineHeight: 1.6 }}>
                可以聊天、生成文章 slug、摘要、格式化内容等
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{
              marginBottom: '16px',
              display: 'flex', gap: '10px',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              {msg.role === 'assistant' && (
                <div style={{ width: '28px', height: '28px', borderRadius: '1px', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                  <Sparkles size={14} style={{ color: '#fff' }} />
                </div>
              )}
              <div style={{
                maxWidth: '75%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '4px 4px 1px 4px' : '4px 4px 4px 1px',
                background: msg.role === 'user' ? 'var(--color-primary)' : 'var(--color-bg-soft)',
                color: msg.role === 'user' ? '#fff' : 'var(--color-text-main)',
                fontSize: '14px', lineHeight: 1.6,
              }}>
                {msg.role === 'assistant' ? (
                  <div className="blog-prose" style={{ fontSize: '14px' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</span>
                )}
              </div>
            </div>
          ))}

          {/* Streaming response */}
          {streaming && (
            <div style={{ marginBottom: '16px', display: 'flex', gap: '10px', justifyContent: 'flex-start' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '1px', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                <Sparkles size={14} style={{ color: '#fff' }} />
              </div>
              <div style={{
                maxWidth: '75%', padding: '10px 14px',
                borderRadius: '4px 4px 4px 1px',
                background: 'var(--color-bg-soft)',
                fontSize: '14px', lineHeight: 1.6,
              }}>
                <div className="blog-prose" style={{ fontSize: '14px' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streaming}</ReactMarkdown>
                </div>
                <span style={{ animation: 'blink 1s infinite' }}>▊</span>
                <style>{`@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {sending && !streaming && (
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                padding: '12px 16px', borderRadius: '4px 4px 4px 1px',
                background: 'var(--color-bg-soft)', display: 'flex', gap: '4px',
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: 'var(--color-text-dim)',
                    animation: `typing 1.2s ease-in-out ${i * 0.15}s infinite`,
                  }} />
                ))}
                <style>{`@keyframes typing { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }`}</style>
              </div>
            </div>
          )}

          <div ref={msgEnd} />
        </div>

        {/* Input area */}
        <div style={{
          padding: '12px 24px 20px', borderTop: '1px solid var(--color-border)',
          background: 'var(--color-bg-card)',
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
              rows={1}
              style={{
                flex: 1, resize: 'none', padding: '10px 14px',
                border: '1px solid var(--color-border)', borderRadius: '1px',
                background: 'var(--color-bg-main)', color: 'var(--color-text-main)',
                fontSize: '14px', lineHeight: 1.5, outline: 'none',
                minHeight: '42px', maxHeight: '120px',
              }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="btn btn-primary"
              style={{
                padding: '10px 18px', fontSize: '13px', flexShrink: 0,
                opacity: sending || !input.trim() ? 0.5 : 1,
              }}
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
