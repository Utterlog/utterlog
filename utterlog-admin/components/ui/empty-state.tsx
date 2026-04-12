'use client';

import { Package } from '@/components/icons';
import { Button } from './button';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
}

export function EmptyState({
  title = '暂无数据',
  description = '开始创建您的第一条记录吧',
  actionText,
  onAction,
}: EmptyStateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px' }}>
      <div className="bg-soft" style={{ width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
        <Package size={28} className="text-dim" />
      </div>
      <h3 className="text-main" style={{ fontSize: '16px', fontWeight: 500, marginBottom: '4px' }}>{title}</h3>
      <p className="text-dim" style={{ fontSize: '14px', marginBottom: '16px' }}>{description}</p>
      {actionText && onAction && (
        <Button onClick={onAction}>{actionText}</Button>
      )}
    </div>
  );
}
