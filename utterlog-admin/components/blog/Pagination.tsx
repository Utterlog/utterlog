'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from '@/components/icons';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath?: string;
}

export default function Pagination({ currentPage, totalPages, basePath = '' }: PaginationProps) {
  if (totalPages <= 1) return null;

  const getPageUrl = (page: number) => {
    if (page === 1) return basePath || '/';
    return `${basePath}?page=${page}`;
  };

  return (
    <nav className="flex items-center justify-center gap-2 mt-12 pt-8 border-t border-line">
      {/* 上一页 */}
      {currentPage > 1 ? (
        <Link
          href={getPageUrl(currentPage - 1)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-sub hover:text-main rounded-md hover:bg-soft transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          上一页
        </Link>
      ) : (
        <span className="flex items-center gap-1 px-3 py-1.5 text-sm text-dim cursor-not-allowed">
          <ChevronLeft className="w-4 h-4" />
          上一页
        </span>
      )}

      {/* 页码 */}
      <div className="flex items-center gap-1">
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((page) => {
            // 显示当前页附近的页码
            if (page === 1 || page === totalPages) return true;
            if (Math.abs(page - currentPage) <= 1) return true;
            return false;
          })
          .map((page, index, arr) => {
            // 插入省略号
            const prev = arr[index - 1];
            const showEllipsis = prev && page - prev > 1;

            return (
              <span key={page} className="flex items-center">
                {showEllipsis && (
                  <span className="px-2 text-sm text-dim">&hellip;</span>
                )}
                {page === currentPage ? (
                  <span className="w-8 h-8 flex items-center justify-center text-sm font-medium text-primary-themed bg-soft rounded-md">
                    {page}
                  </span>
                ) : (
                  <Link
                    href={getPageUrl(page)}
                    className="w-8 h-8 flex items-center justify-center text-sm text-sub hover:text-main rounded-md hover:bg-soft transition-colors"
                  >
                    {page}
                  </Link>
                )}
              </span>
            );
          })}
      </div>

      {/* 下一页 */}
      {currentPage < totalPages ? (
        <Link
          href={getPageUrl(currentPage + 1)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-sub hover:text-main rounded-md hover:bg-soft transition-colors"
        >
          下一页
          <ChevronRight className="w-4 h-4" />
        </Link>
      ) : (
        <span className="flex items-center gap-1 px-3 py-1.5 text-sm text-dim cursor-not-allowed">
          下一页
          <ChevronRight className="w-4 h-4" />
        </span>
      )}
    </nav>
  );
}
