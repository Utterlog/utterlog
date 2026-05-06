'use client';

import { useState } from 'react';
import AIReaderChat from '@/components/blog/AIReaderChat';
import CommentList from '@/components/blog/CommentList';

export function CommentCount({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);

  if (typeof window !== 'undefined') {
    (window as any).__nebulaSetCommentCount = setCount;
  }

  return <span>{count} comments</span>;
}

export function CommentSection({
  postId,
  title,
  excerpt,
  authorAvatar,
}: {
  postId: number;
  title?: string;
  excerpt?: string;
  authorAvatar?: string;
}) {
  return (
    <section className="nebula-comments">
      <CommentList
        postId={postId}
        title={title}
        onCommentCountChange={(count: number) => {
          if (typeof window !== 'undefined' && (window as any).__nebulaSetCommentCount) {
            (window as any).__nebulaSetCommentCount(count);
          }
        }}
      />
      <AIReaderChat postId={postId} title={title || ''} excerpt={excerpt || ''} authorAvatar={authorAvatar} />
    </section>
  );
}
