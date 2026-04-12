'use client';

import { useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import {
  ImageIcon, LinkIcon, Eye,
} from '@/components/icons';

/* ── toolbar shortcut helpers ── */
function wrap(
  ta: HTMLTextAreaElement,
  before: string,
  after: string,
  onChange: (v: string) => void,
  placeholder = '',
) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const sel = value.slice(s, e) || placeholder;
  const next = value.slice(0, s) + before + sel + after + value.slice(e);
  onChange(next);
  requestAnimationFrame(() => {
    ta.focus();
    ta.selectionStart = s + before.length;
    ta.selectionEnd = s + before.length + sel.length;
  });
}

function linePrefix(
  ta: HTMLTextAreaElement,
  prefix: string,
  onChange: (v: string) => void,
) {
  const { selectionStart: s, value } = ta;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  onChange(next);
  requestAnimationFrame(() => {
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + prefix.length;
  });
}

/* ── toolbar button defs ── */
interface TBBtn {
  label: string;
  icon: React.ReactNode;
  action: (ta: HTMLTextAreaElement, onChange: (v: string) => void) => void;
}

const TB_SIZE = 16;

const toolbar: TBBtn[] = [
  {
    label: '粗体',
    icon: <span className="font-bold text-xs">B</span>,
    action: (ta, fn) => wrap(ta, '**', '**', fn, '粗体文本'),
  },
  {
    label: '斜体',
    icon: <span className="italic text-xs">I</span>,
    action: (ta, fn) => wrap(ta, '*', '*', fn, '斜体文本'),
  },
  {
    label: '代码',
    icon: <span className="font-mono text-xs">&lt;/&gt;</span>,
    action: (ta, fn) => wrap(ta, '`', '`', fn, 'code'),
  },
  {
    label: '标题',
    icon: <span className="font-bold text-xs">H2</span>,
    action: (ta, fn) => linePrefix(ta, '## ', fn),
  },
  {
    label: '引用',
    icon: <span className="text-xs font-serif">&ldquo;</span>,
    action: (ta, fn) => linePrefix(ta, '> ', fn),
  },
  {
    label: '列表',
    icon: (
      <svg width={TB_SIZE} height={TB_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
    action: (ta, fn) => linePrefix(ta, '- ', fn),
  },
  {
    label: '链接',
    icon: <LinkIcon size={TB_SIZE} />,
    action: (ta, fn) => wrap(ta, '[', '](url)', fn, '链接文本'),
  },
  {
    label: '图片',
    icon: <ImageIcon size={TB_SIZE} />,
    action: (ta, fn) => wrap(ta, '![', '](url)', fn, 'alt'),
  },
  {
    label: '代码块',
    icon: <span className="font-mono text-[10px]">{'{ }'}</span>,
    action: (ta, fn) => wrap(ta, '```\n', '\n```', fn, ''),
  },
  {
    label: '分割线',
    icon: <span className="text-xs">—</span>,
    action: (ta, fn) => {
      const { selectionStart: s, value } = ta;
      const next = value.slice(0, s) + '\n---\n' + value.slice(s);
      fn(next);
      requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + 5; });
    },
  },
];

/* ── component ── */
interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder = '开始写作...',
  className = '',
  minHeight = '500px',
}: MarkdownEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  const handleToolbar = useCallback(
    (btn: TBBtn) => {
      if (taRef.current) btn.action(taRef.current, onChange);
    },
    [onChange],
  );

  /* Tab key → insert 2 spaces */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.currentTarget;
        const { selectionStart: s, value: v } = ta;
        const next = v.slice(0, s) + '  ' + v.slice(s);
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = s + 2;
        });
      }
    },
    [onChange],
  );

  return (
    <div className={`flex flex-col border border-line rounded-[4px] overflow-hidden bg-card ${className}`}>
      {/* toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-line bg-soft">
        <span className="flex items-center gap-1 text-xs text-dim mr-2">
          <Eye size={14} /> Markdown
        </span>
        <span className="w-px h-4 bg-[var(--color-border)] mx-1" />
        {toolbar.map((btn) => (
          <button
            key={btn.label}
            type="button"
            title={btn.label}
            className="p-1.5 rounded-[3px] text-sub hover:text-main hover:bg-[var(--color-bg-card)] transition-colors"
            onClick={() => handleToolbar(btn)}
          >
            {btn.icon}
          </button>
        ))}
        <span className="ml-auto text-xs text-dim">支持直接上传或从附件库选图插入</span>
      </div>

      {/* editor body: left input + right preview */}
      <div className="flex flex-1" style={{ minHeight }}>
        {/* left: raw markdown */}
        <div className="flex-1 flex flex-col border-r border-line">
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 w-full p-4 resize-none bg-transparent text-sm text-main font-mono leading-relaxed focus:outline-none placeholder:text-dim"
            style={{ minHeight }}
            spellCheck={false}
          />
        </div>

        {/* right: preview */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-4 py-1.5 border-b border-line bg-soft">
            <span className="text-xs text-dim">前台样式预览</span>
            <span className="text-xs text-dim flex items-center gap-2">
              已同步
            </span>
          </div>
          <div className="flex-1 p-4 overflow-y-auto blog-prose text-sm">
            {value ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight, rehypeSlug]}>
                {value}
              </ReactMarkdown>
            ) : (
              <p className="text-dim italic">预览区域，输入 Markdown 后实时渲染...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
