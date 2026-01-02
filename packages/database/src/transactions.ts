/**
 * Serializable Transaction Wrapper
 *
 * Provides atomic, concurrency-safe transactions for critical operations:
 * - Ledger posting and partner attribution
 * - Compliance decisions with audit logging
 * - Payment webhook processing (idempotent)
 *
 * Features:
 * - SERIALIZABLE isolation for guaranteed consistency
 * - Deterministic retry with exponential backoff for transient conflicts
 * - Idempotency support for payment/webhook operations
 * - Transaction client propagation for nested operations
 *
 * @see docs/architecture/transactions.md
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './index';

// ============================================================================
// Types
// ============================================================================

/**
 * Transaction client type that can be the main prisma client or a transaction client
 */
export type TransactionClient = Prisma.TransactionClient | PrismaClient;

/**
 * Options for serializable transactions
 */
export interface SerializableTransactionOptions {
  /** Maximum time to wait for transaction lock (ms) */
  maxWait?: number;
  /** Transaction timeout (ms) */
  timeout?: number;
  /** Maximum retry attempts for serialization failures */
  maxRetries?: number;
  /** Base delay for exponential backoff (ms) */
  baseDelay?: number;
  /** Maximum delay between retries (ms) */
  maxDelay?: number;
  /** Optional idempotency key for duplicate prevention */
  idempotencyKey?: string;
  /** Context for logging/debugging */
  context?: string;
}

/**
 * Result of a transaction execution with metadata
 */
export interface TransactionResult<T> {
  /** The result of the transaction */
  result: T;
  /** Number of retry attempts made */
  attempts: number;
  /** Total execution time (ms) */
  durationMs: number;
  /** Whether the transaction was idempotent (already processed) */
  wasIdempotent?: boolean;
}

/**
 * Error thrown when transaction fails after all retries
 */
export class TransactionError extends Error {
  public readonly code: string;
  public readonly attempts: number;
  public readonly originalCause?: Error;

  constructor(
    message: string,
    code: string,
    attempts: number,
    originalCause?: Error
  ) {
    super(message, { cause: originalCause });
    this.name = 'TransactionError';
    this.code = code;
    this.attempts = attempts;
    this.originalCause = originalCause;
  }
}

/**
 * Error codes for transaction failures
 */
export const TransactionErrorCode = {
  SERIALIZATION_FAILURE: 'SERIALIZATION_FAILURE',
  DEADLOCK: 'DEADLOCK',
  TIMEOUT: 'TIMEOUT',
  MAX_RETRIES_EXCEEDED: 'MAX_RETRIES_EXCEEDED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  UNKNOWN: 'UNKNOWN',
} as const;

// ============================================================================
// Error Detection
// ============================================================================

/**
 * PostgreSQL error codes for transient failures that can be retried
 */
const RETRYABLE_PG_CODES = [
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '55P03', // lock_not_available
  '57014', // query_canceled (timeout, can retry)
];

/**
 * Check if an error is a serialization failure that can be retried
 */
export function isSerializationError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034 is Prisma's code for transaction conflict
    if (error.code === 'P2034') return true;

    // Check for PostgreSQL error codes in meta
    const meta = error.meta as { code?: string } | undefined;
    if (meta?.code && RETRYABLE_PG_CODES.includes(meta.code)) {
      return true;
    }
  }

  // Check raw PostgreSQL error message
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('could not serialize access') ||
      message.includes('deadlock detected') ||
      message.includes('lock not available') ||
      message.includes('serialization failure')
    );
  }

  return false;
}

/**
 * Check if an error is a timeout
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2024'; // Timed out
  }
  if (error instanceof Error) {
    return error.message.toLowerCase().includes('timeout');
  }
  return false;
}

// ============================================================================
// Delay Utilities
// ============================================================================

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  // Add jitter (0-25% of delay) to prevent thundering herd
  const jitter = exponentialDelay * Math.random() * 0.25;
  // Cap at maxDelay
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Transaction Execution
// ============================================================================

/**
 * Default options for serializable transactions
 */
const DEFAULT_OPTIONS: Required<Omit<SerializableTransactionOptions, 'idempotencyKey' | 'context'>> = {
  maxWait: 5000,    // 5 seconds to acquire lock
  timeout: 30000,   // 30 seconds transaction timeout
  maxRetries: 3,    // 3 retry attempts
  baseDelay: 100,   // 100ms base delay
  maxDelay: 2000,   // 2 second max delay
};

/**
 * Execute a function within a SERIALIZABLE transaction with retry logic.
 *
 * Use this for critical operations that require:
 * - Atomicity across multiple writes
 * - Concurrency safety (no lost updates, phantom reads)
 * - Automatic retry on serialization conflicts
 *
 * @example
 * // Ledger posting with evidence
 * const result = await withSerializableTransaction(async (tx) => {
 *   const transaction = await tx.ledgerTransaction.create({ ... });
 *   const entries = await tx.ledgerEntry.createMany({ ... });
 *   await tx.auditLog.create({ ... });
 *   return { transaction, entries };
 * }, { context: 'ledger-post' });
 *
 * @example
 * // Idempotent payment processing
 * const result = await withSerializableTransaction(async (tx) => {
 *   // Check idempotency first
 *   const existing = await tx.payment.findUnique({
 *     where: { externalId: paymentIntentId }
 *   });
 *   if (existing) return { existing, wasIdempotent: true };
 *
 *   // Process new payment
 *   return tx.payment.create({ ... });
 * }, {
 *   idempotencyKey: paymentIntentId,
 *   context: 'stripe-webhook'
 * });
 */
export async function withSerializableTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: SerializableTransactionOptions
): Promise<TransactionResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await prisma.$transaction(fn, {
        maxWait: opts.maxWait,
        timeout: opts.timeout,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });

      return {
        result,
        attempts: attempt + 1,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is a retryable error
      const isRetryable = isSerializationError(error) || isTimeoutError(error);

      if (!isRetryable || attempt >= opts.maxRetries) {
        // Not retryable or exhausted retries
        const code = isSerializationError(error)
          ? TransactionErrorCode.SERIALIZATION_FAILURE
          : isTimeoutError(error)
            ? TransactionErrorCode.TIMEOUT
            : TransactionErrorCode.UNKNOWN;

        throw new TransactionError(
          `Transaction failed after ${attempt + 1} attempts: ${lastError.message}`,
          attempt >= opts.maxRetries ? TransactionErrorCode.MAX_RETRIES_EXCEEDED : code,
          attempt + 1,
          lastError
        );
      }

      // Calculate backoff delay
      const delay = calculateBackoffDelay(attempt, opts.baseDelay, opts.maxDelay);

      if (process.env['NODE_ENV'] !== 'test') {
        console.warn(
          `[Transaction] Retry ${attempt + 1}/${opts.maxRetries} for ${opts.context || 'unknown'}: ` +
          `${lastError.message}. Waiting ${delay}ms...`
        );
      }

      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs this
  throw new TransactionError(
    `Transaction failed: ${lastError?.message || 'Unknown error'}`,
    TransactionErrorCode.MAX_RETRIES_EXCEEDED,
    opts.maxRetries + 1,
    lastError
  );
}

/**
 * Execute within an existing transaction or create a new SERIALIZABLE one.
 *
 * Use this when you need to support both standalone and nested operations.
 * If a transaction client is provided, uses it directly (no nesting).
 * Otherwise, creates a new serializable transaction.
 *
 * @example
 * async function createLedgerEntry(data: ..., tx?: TransactionClient) {
 *   return withSerializableTransactionOrExisting(tx, async (client) => {
 *     return client.ledgerEntry.create({ data });
 *   });
 * }
 */
export async function withSerializableTransactionOrExisting<T>(
  existingTx: TransactionClient | undefined,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: SerializableTransactionOptions
): Promise<T> {
  if (existingTx && existingTx !== prisma) {
    // Already in a transaction, execute directly
    return fn(existingTx as Prisma.TransactionClient);
  }

  // Create new serializable transaction
  const result = await withSerializableTransaction(fn, options);
  return result.result;
}

// ============================================================================
// Specialized Transaction Helpers
// ============================================================================

/**
 * Execute a ledger operation atomically.
 * Ensures double-entry bookkeeping integrity.
 */
export async function withLedgerTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  context?: string
): Promise<TransactionResult<T>> {
  return withSerializableTransaction(fn, {
    context: context || 'ledger',
    maxRetries: 5,      // More retries for critical ledger ops
    timeout: 60000,     // Longer timeout for complex ledger operations
  });
}

/**
 * Execute a compliance decision atomically with audit logging.
 * Ensures decision + evidence are written together.
 */
export async function withComplianceTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  context?: string
): Promise<TransactionResult<T>> {
  return withSerializableTransaction(fn, {
    context: context || 'compliance',
    maxRetries: 3,
    timeout: 30000,
  });
}

/**
 * Execute an idempotent webhook operation.
 * Uses the provided key to prevent duplicate processing.
 */
export async function withIdempotentTransaction<T>(
  idempotencyKey: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  context?: string
): Promise<TransactionResult<T>> {
  return withSerializableTransaction(fn, {
    idempotencyKey,
    context: context || 'webhook',
    maxRetries: 3,
    timeout: 30000,
  });
}

// ============================================================================
// Transaction Metrics
// ============================================================================

interface TransactionMetrics {
  total: number;
  successful: number;
  failed: number;
  retried: number;
  avgDurationMs: number;
  avgRetries: number;
}

let transactionMetrics: TransactionMetrics = {
  total: 0,
  successful: 0,
  failed: 0,
  retried: 0,
  avgDurationMs: 0,
  avgRetries: 0,
};

let totalDurationMs = 0;
let totalRetries = 0;

/**
 * Get transaction execution metrics
 */
export function getTransactionMetrics(): TransactionMetrics {
  return { ...transactionMetrics };
}

/**
 * Reset transaction metrics
 */
export function resetTransactionMetrics(): void {
  transactionMetrics = {
    total: 0,
    successful: 0,
    failed: 0,
    retried: 0,
    avgDurationMs: 0,
    avgRetries: 0,
  };
  totalDurationMs = 0;
  totalRetries = 0;
}

/**
 * Record a transaction result for metrics
 */
export function recordTransactionMetrics(
  result: TransactionResult<unknown> | { failed: true; attempts: number; durationMs: number }
): void {
  transactionMetrics.total++;
  totalDurationMs += result.durationMs;
  totalRetries += result.attempts - 1;

  if ('failed' in result && result.failed) {
    transactionMetrics.failed++;
  } else {
    transactionMetrics.successful++;
  }

  if (result.attempts > 1) {
    transactionMetrics.retried++;
  }

  transactionMetrics.avgDurationMs = totalDurationMs / transactionMetrics.total;
  transactionMetrics.avgRetries = totalRetries / transactionMetrics.total;
}
