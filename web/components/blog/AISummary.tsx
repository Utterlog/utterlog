'use client';

import './ai-styles.css';

interface AISummaryProps {
  postId: number;
  excerpt?: string;
}

export default function AISummary({ postId, excerpt }: AISummaryProps) {
  if (!excerpt) return null;

  return (
    <div className="blog-ai-summary">
      <div className="blog-ai-summary-header">
        <i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: '14px' }} />
        <span>AI 摘要</span>
      </div>
      <div className="blog-ai-summary-body">{excerpt}</div>
    </div>
  );
}
