import { PrismaClient, Prisma } from '@prisma/client';

// ============================================================================
// Prisma Client Singleton
// ============================================================================

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env['NODE_ENV'] === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
    errorFormat: 'pretty',
  });
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
