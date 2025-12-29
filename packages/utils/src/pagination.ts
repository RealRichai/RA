export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CursorPaginationParams {
  cursor?: string;
  limit: number;
  direction?: 'forward' | 'backward';
}

export interface CursorPaginatedResult<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Calculate pagination metadata
 */
export function getPaginationMeta(
  total: number,
  page: number,
  limit: number
): Omit<PaginatedResult<never>, 'items'> {
  const totalPages = Math.ceil(total / limit);

  return {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Create a paginated result
 */
export function createPaginatedResult<T>(
  items: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  return {
    items,
    ...getPaginationMeta(total, params.page, params.limit),
  };
}

/**
 * Calculate offset for database query
 */
export function getOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Parse pagination params from query string
 */
export function parsePaginationParams(query: Record<string, unknown>): PaginationParams {
  const page = Math.max(1, parseInt(String(query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query['limit'] ?? '20'), 10) || 20));
  const sortBy = query['sortBy'] ? String(query['sortBy']) : undefined;
  const sortOrder = query['sortOrder'] === 'asc' ? 'asc' : 'desc';

  return { page, limit, sortBy, sortOrder };
}

/**
 * Encode cursor for cursor-based pagination
 */
export function encodeCursor(data: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

/**
 * Decode cursor for cursor-based pagination
 */
export function decodeCursor(cursor: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Create a cursor-paginated result
 */
export function createCursorPaginatedResult<T extends Record<string, unknown>>(
  items: T[],
  limit: number,
  cursorField: keyof T
): CursorPaginatedResult<T> {
  const hasMore = items.length > limit;
  const resultItems = hasMore ? items.slice(0, limit) : items;

  const lastItem = resultItems[resultItems.length - 1];
  const cursor = lastItem ? encodeCursor({ [cursorField]: lastItem[cursorField] }) : null;

  return {
    items: resultItems,
    cursor,
    hasMore,
  };
}

/**
 * Generate page numbers for pagination UI
 */
export function getPageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible = 7
): (number | 'ellipsis')[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [];
  const sidePages = Math.floor((maxVisible - 3) / 2); // Pages on each side of current

  // Always include first page
  pages.push(1);

  if (currentPage <= sidePages + 2) {
    // Near the beginning
    for (let i = 2; i <= Math.min(maxVisible - 2, totalPages - 1); i++) {
      pages.push(i);
    }
    pages.push('ellipsis');
  } else if (currentPage >= totalPages - sidePages - 1) {
    // Near the end
    pages.push('ellipsis');
    for (let i = Math.max(totalPages - maxVisible + 3, 2); i <= totalPages - 1; i++) {
      pages.push(i);
    }
  } else {
    // In the middle
    pages.push('ellipsis');
    for (let i = currentPage - sidePages; i <= currentPage + sidePages; i++) {
      pages.push(i);
    }
    pages.push('ellipsis');
  }

  // Always include last page
  if (totalPages > 1) {
    pages.push(totalPages);
  }

  return pages;
}
