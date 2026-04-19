'use client';

import './ai-styles.css';

interface AISummaryProps {
  postId: number;
  aiSummary?: string;
  excerpt?: string;
}

// Renders up to two stacked blocks on the post inner page:
//   1. 文章摘要 — whatever `excerpt` holds (author-written or auto-
//      derived from content)
//   2. AI 摘要 — `aiSummary` from the generator
// Either one is independently optional. Clearing ai_summary via the
// admin's 批量清空 AI 数据 hides the AI block on next render; the
// excerpt block stays. Blocks share the same card style.
export default function AISummary({ aiSummary, excerpt }: AISummaryProps) {
  const ex = (excerpt || '').trim();
  const ai = (aiSummary || '').trim();
  if (!ex && !ai) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {ex && (
        <div className="blog-ai-summary">
          <div className="blog-ai-summary-header">
            <i className="fa-regular fa-align-left" style={{ fontSize: '14px' }} />
            <span>文章摘要</span>
          </div>
          <div className="blog-ai-summary-body">{ex}</div>
        </div>
      )}
      {ai && (
        <div className="blog-ai-summary">
          <div className="blog-ai-summary-header">
            <i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: '14px' }} />
            <span>AI 摘要</span>
          </div>
          <div className="blog-ai-summary-body">{ai}</div>
        </div>
      )}
    </div>
  );
}
