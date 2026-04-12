'use client';

import { ChevronLeft, ChevronRight } from '@/components/icons';

interface TableProps {
  columns: { key: string; title: string; width?: string; render?: (row: any) => React.ReactNode }[];
  data: any[];
  keyField?: string;
  loading?: boolean;
  emptyText?: string;
}

export function Table({ columns, data, keyField = 'id', loading, emptyText = '暂无数据' }: TableProps) {
  if (loading) {
    return (
      <div className="text-dim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', fontSize: '14px' }}>
        加载中...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-dim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', fontSize: '14px' }}>
        {emptyText}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ width: col.width }}>{col.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row[keyField]} className="hover:bg-soft" style={{ transition: 'background-color 0.1s' }}>
              {columns.map((col) => (
                <td key={`${row[keyField]}-${col.key}`}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  total?: number;
}

export function Pagination({ currentPage, totalPages, onPageChange, total }: PaginationProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px', borderTop: '1px solid var(--color-divider)',
    }}>
      <span className="text-dim" style={{ fontSize: '13px' }}>
        {total !== undefined ? `共 ${total} 条` : ''}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          style={{
            padding: '5px', borderRadius: '1px', border: '1px solid var(--color-border)',
            background: 'var(--color-bg-card)', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
            opacity: currentPage <= 1 ? 0.4 : 1,
          }}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sub" style={{ fontSize: '13px' }}>{currentPage} / {totalPages}</span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          style={{
            padding: '5px', borderRadius: '1px', border: '1px solid var(--color-border)',
            background: 'var(--color-bg-card)', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
            opacity: currentPage >= totalPages ? 0.4 : 1,
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
