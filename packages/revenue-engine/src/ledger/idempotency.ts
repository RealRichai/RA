/**
 * Idempotency Layer
 *
 * Redis-backed idempotency key enforcement to prevent duplicate transactions.
 */

import type { Redis } from 'ioredis';

// =============================================================================
// Types
// =============================================================================

export interface IdempotencyRecord {
  key: string;
  transactionId: string;
  status: 'processing' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface IdempotencyConfig {
  redis: Redis;
  keyPrefix?: string;
  defaultTTLSeconds?: number;
  lockTimeoutSeconds?: number;
}

export interface IdempotencyCheckResult {
  isNew: boolean;
  existingRecord?: IdempotencyRecord;
}

// =============================================================================
// Idempotency Manager
// =============================================================================

export class IdempotencyManager {
  private redis: Redis;
  private keyPrefix: string;
  private defaultTTL: number;
  private lockTimeout: number;

  constructor(config: IdempotencyConfig) {
    this.redis = config.redis;
    this.keyPrefix = config.keyPrefix || 'idem:';
    this.defaultTTL = config.defaultTTLSeconds || 86400; // 24 hours
    this.lockTimeout = config.lockTimeoutSeconds || 30; // 30 seconds
  }

  /**
   * Generate the Redis key for an idempotency key.
   */
  private getRedisKey(idempotencyKey: string): string {
    return `${this.keyPrefix}${idempotencyKey}`;
  }

  /**
   * Generate the lock key for an idempotency key.
   */
  private getLockKey(idempotencyKey: string): string {
    return `${this.keyPrefix}lock:${idempotencyKey}`;
  }

  /**
   * Check if an idempotency key exists and acquire a lock if new.
   */
  async checkAndLock(idempotencyKey: string): Promise<IdempotencyCheckResult> {
    const redisKey = this.getRedisKey(idempotencyKey);
    const lockKey = this.getLockKey(idempotencyKey);

    // Check if record exists
    const existing = await this.redis.get(redisKey);
    if (existing) {
      const record: IdempotencyRecord = JSON.parse(existing);
      return { isNew: false, existingRecord: record };
    }

    // Try to acquire lock
    const lockAcquired = await this.redis.set(
      lockKey,
      'locked',
      'EX',
      this.lockTimeout,
      'NX'
    );

    if (!lockAcquired) {
      // Another process is handling this key
      // Wait briefly and check again
      await new Promise((resolve) => setTimeout(resolve, 100));
      const retryExisting = await this.redis.get(redisKey);
      if (retryExisting) {
        const record: IdempotencyRecord = JSON.parse(retryExisting);
        return { isNew: false, existingRecord: record };
      }

      // Still locked, treat as processing
      return {
        isNew: false,
        existingRecord: {
          key: idempotencyKey,
          transactionId: '',
          status: 'processing',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + this.lockTimeout * 1000),
        },
      };
    }

    return { isNew: true };
  }

  /**
   * Record a processing transaction.
   */
  async recordProcessing(
    idempotencyKey: string,
    transactionId: string
  ): Promise<void> {
    const redisKey = this.getRedisKey(idempotencyKey);
    const now = new Date();

    const record: IdempotencyRecord = {
      key: idempotencyKey,
      transactionId,
      status: 'processing',
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.defaultTTL * 1000),
    };

    await this.redis.setex(redisKey, this.defaultTTL, JSON.stringify(record));
  }

  /**
   * Mark a transaction as completed.
   */
  async recordCompleted(
    idempotencyKey: string,
    transactionId: string,
    result?: unknown
  ): Promise<void> {
    const redisKey = this.getRedisKey(idempotencyKey);
    const lockKey = this.getLockKey(idempotencyKey);
    const now = new Date();

    const record: IdempotencyRecord = {
      key: idempotencyKey,
      transactionId,
      status: 'completed',
      result,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.defaultTTL * 1000),
    };

    await this.redis.setex(redisKey, this.defaultTTL, JSON.stringify(record));
    await this.redis.del(lockKey);
  }

  /**
   * Mark a transaction as failed.
   */
  async recordFailed(
    idempotencyKey: string,
    transactionId: string,
    error: string
  ): Promise<void> {
    const redisKey = this.getRedisKey(idempotencyKey);
    const lockKey = this.getLockKey(idempotencyKey);
    const now = new Date();

    const record: IdempotencyRecord = {
      key: idempotencyKey,
      transactionId,
      status: 'failed',
      error,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.defaultTTL * 1000),
    };

    await this.redis.setex(redisKey, this.defaultTTL, JSON.stringify(record));
    await this.redis.del(lockKey);
  }

  /**
   * Get an existing idempotency record.
   */
  async getRecord(idempotencyKey: string): Promise<IdempotencyRecord | null> {
    const redisKey = this.getRedisKey(idempotencyKey);
    const existing = await this.redis.get(redisKey);

    if (!existing) return null;

    return JSON.parse(existing);
  }

  /**
   * Delete an idempotency record (for cleanup/testing).
   */
  async deleteRecord(idempotencyKey: string): Promise<void> {
    const redisKey = this.getRedisKey(idempotencyKey);
    const lockKey = this.getLockKey(idempotencyKey);

    await this.redis.del(redisKey, lockKey);
  }

  /**
   * Release a lock without completing (for error recovery).
   */
  async releaseLock(idempotencyKey: string): Promise<void> {
    const lockKey = this.getLockKey(idempotencyKey);
    await this.redis.del(lockKey);
  }
}

// =============================================================================
// Idempotency Key Generators
// =============================================================================

/**
 * Generate an idempotency key for a payment.
 */
export function generatePaymentIdempotencyKey(
  paymentIntentId: string,
  operation: string
): string {
  return `pay:${paymentIntentId}:${operation}`;
}

/**
 * Generate an idempotency key for a partner operation.
 */
export function generatePartnerIdempotencyKey(
  partnerId: string,
  operation: string,
  referenceId: string
): string {
  return `partner:${partnerId}:${operation}:${referenceId}`;
}

/**
 * Generate an idempotency key for a webhook event.
 */
export function generateWebhookIdempotencyKey(eventId: string): string {
  return `webhook:${eventId}`;
}

/**
 * Generate an idempotency key for a referral.
 */
export function generateReferralIdempotencyKey(
  referralId: string,
  operation: string
): string {
  return `referral:${referralId}:${operation}`;
}

// =============================================================================
// Mock Redis for Testing
// =============================================================================

export class MockRedis {
  private store: Map<string, { value: string; expiresAt: number }> = new Map();
  private locks: Set<string> = new Set();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(
    key: string,
    value: string,
    exMode?: string,
    exValue?: number,
    nxMode?: string
  ): Promise<string | null> {
    if (nxMode === 'NX' && this.store.has(key)) {
      return null;
    }

    const expiresAt = exMode === 'EX' && exValue
      ? Date.now() + exValue * 1000
      : Date.now() + 86400000;

    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<string> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + seconds * 1000,
    });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) deleted++;
    }
    return deleted;
  }

  // For testing
  clear(): void {
    this.store.clear();
    this.locks.clear();
  }
}

/**
 * Create an idempotency manager with mock Redis for testing.
 */
export function createMockIdempotencyManager(): IdempotencyManager {
  const mockRedis = new MockRedis();
  return new IdempotencyManager({
    redis: mockRedis as unknown as Redis,
  });
}
