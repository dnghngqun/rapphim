'use client';
import Link from 'next/link';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
  /** Số nút trang hiển thị ở mỗi bên (mặc định 2) — tổng tối đa = 2*siblings + 5 */
  siblings?: number;
}

/**
 * Responsive Pagination Component
 * - Desktop: hiện đủ nút theo siblings
 * - Mobile (max-width 480px): chỉ hiện Trước / [trang hiện tại / tổng] / Sau
 */
export default function Pagination({
  currentPage: page,
  totalPages,
  buildHref,
  siblings = 2,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  // Tính range trang cần hiển thị
  const range = (start: number, end: number) =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const DOTS = '...';

  const pages: (number | string)[] = (() => {
    const totalNums = siblings * 2 + 5; // 1 + ... + siblings + current + siblings + ... + last
    if (totalPages <= totalNums) {
      return range(1, totalPages);
    }

    const leftSiblingIdx = Math.max(page - siblings, 1);
    const rightSiblingIdx = Math.min(page + siblings, totalPages);

    const showLeftDots = leftSiblingIdx > 2;
    const showRightDots = rightSiblingIdx < totalPages - 1;

    if (!showLeftDots && showRightDots) {
      const leftRange = range(1, 3 + siblings * 2);
      return [...leftRange, DOTS, totalPages];
    }
    if (showLeftDots && !showRightDots) {
      const rightRange = range(totalPages - (2 + siblings * 2), totalPages);
      return [1, DOTS, ...rightRange];
    }
    return [1, DOTS, ...range(leftSiblingIdx, rightSiblingIdx), DOTS, totalPages];
  })();

  return (
    <>
      {/* Desktop pagination */}
      <div className="pagination pagination-desktop">
        {page > 1 && (
          <Link href={buildHref(page - 1)} aria-label="Trang trước">← Trước</Link>
        )}
        {pages.map((p, i) =>
          p === DOTS ? (
            <span key={`dots-${i}`} className="pagination-dots">…</span>
          ) : (
            <Link
              key={p}
              href={buildHref(p as number)}
              className={p === page ? 'active' : ''}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </Link>
          )
        )}
        {page < totalPages && (
          <Link href={buildHref(page + 1)} aria-label="Trang sau">Sau →</Link>
        )}
      </div>

      {/* Mobile pagination: compact */}
      <div className="pagination pagination-mobile">
        {page > 1 ? (
          <Link href={buildHref(page - 1)} aria-label="Trang trước">← Trước</Link>
        ) : (
          <span className="pagination-disabled">← Trước</span>
        )}
        <span className="pagination-info">{page} / {totalPages}</span>
        {page < totalPages ? (
          <Link href={buildHref(page + 1)} aria-label="Trang sau">Sau →</Link>
        ) : (
          <span className="pagination-disabled">Sau →</span>
        )}
      </div>
    </>
  );
}
