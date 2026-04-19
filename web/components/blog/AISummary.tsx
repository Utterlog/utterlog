'use client';

import './ai-styles.css';

interface AISummaryProps {
  postId: number;
  aiSummary?: string;
  excerpt?: string;
}

export default function AISummary({ aiSummary, excerpt }: AISummaryProps) {
  // Prefer the real AI-generated summary when it exists; fall back to
  // the plain excerpt so the block still has something to show when
  // admins clear ai_summary via 批量清空 AI 数据.
  const body = (aiSummary && aiSummary.trim()) || (excerpt && excerpt.trim()) || '';
  const isAI = !!(aiSummary && aiSummary.trim());
  if (!body) return null;

  return (
    <div className="blog-ai-summary">
      <div className="blog-ai-summary-header">
        <i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: '14px' }} />
        <span>{isAI ? 'AI 摘要' : '文章摘要'}</span>
      </div>
      <div className="blog-ai-summary-body">{body}</div>
    </div>
  );
}
