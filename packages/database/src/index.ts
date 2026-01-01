import { PrismaClient, Prisma } from '@prisma/client';

// ============================================================================
// Query Metrics
// ============================================================================

export interface QueryMetrics {
  totalQueries: number;
  slowQueries: number;
  errors: number;
  avgDuration: number;
  lastReset: Date;
}

const queryMetrics: QueryMetrics = {
  totalQueries: 0,
  slowQueries: 0,
  errors: 0,
  avgDuration: 0,
  lastReset: new Date(),
};

const SLOW_QUERY_THRESHOLD_MS = 100;
let totalDuration = 0;

export function getQueryMetrics(): QueryMetrics {
  return { ...queryMetrics };
}

export function resetQueryMetrics(): void {
  queryMetrics.totalQueries = 0;
  queryMetrics.slowQueries = 0;
  queryMetrics.errors = 0;
  queryMetrics.avgDuration = 0;
  queryMetrics.lastReset = new Date();
  totalDuration = 0;
}

// ============================================================================
// Prisma Client Singleton with Monitoring
// ============================================================================

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  const logLevel = process.env['NODE_ENV'] === 'development'
    ? ['query', 'info', 'warn', 'error'] as const
    : process.env['ENABLE_QUERY_LOGGING'] === 'true'
      ? ['query', 'warn', 'error'] as const
      : ['warn', 'error'] as const;

  const client = new PrismaClient({
    log: logLevel.map(level => ({
      emit: 'event' as const,
      level,
    })),
    errorFormat: 'pretty',
  });

  // Query performance monitoring
  client.$on('query' as never, (e: { duration: number; query: string }) => {
    queryMetrics.totalQueries++;
    totalDuration += e.duration;
    queryMetrics.avgDuration = totalDuration / queryMetrics.totalQueries;

    if (e.duration > SLOW_QUERY_THRESHOLD_MS) {
      queryMetrics.slowQueries++;
      if (process.env['NODE_ENV'] !== 'test') {
        console.warn(`[Prisma] Slow query (${e.duration}ms): ${e.query.slice(0, 200)}...`);
      }
    }
  });

  // Error monitoring
  client.$on('error' as never, () => {
    queryMetrics.errors++;
  });

  return client;
};

export const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env['NODE_ENV'] !== 'production') {
  globalThis.prisma = prisma;
}

// ============================================================================
// Database utilities
// ============================================================================

/**
 * Execute a function within a transaction
 */
export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }
): Promise<T> {
  return prisma.$transaction(fn, options);
}

/**
 * Check if the database is connected
 */
export async function checkConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Disconnect from the database
 */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Soft delete helper - adds deletedAt timestamp
 */
export function softDelete() {
  return { deletedAt: new Date() };
}

/**
 * Filter to exclude soft-deleted records
 */
export const notDeleted = { deletedAt: null };

/**
 * Create pagination parameters for Prisma
 */
export function getPrismaPageParams(page: number, limit: number) {
  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}

/**
 * Create order by clause from sort params
 */
export function getPrismaOrderBy(
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
  defaultSort = 'createdAt',
  defaultOrder: 'asc' | 'desc' = 'desc'
): Record<string, 'asc' | 'desc'> {
  return {
    [sortBy || defaultSort]: sortOrder || defaultOrder,
  };
}

/**
 * Handle unique constraint violations
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * Handle not found errors
 */
export function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}

/**
 * Handle foreign key constraint violations
 */
export function isForeignKeyError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  );
}

// ============================================================================
// Re-exports
// ============================================================================

export { PrismaClient, Prisma };

// Export generated types
export * from '@prisma/client';

// ============================================================================
// Repositories
// ============================================================================

export {
  tourAssetRepository,
  tourConversionJobRepository,
  type CreateTourAssetInput,
  type UpdateTourAssetInput,
  type TourAssetFilters,
  type CreateConversionJobInput,
  type ConversionJobFilters,
} from './repositories/tour';
