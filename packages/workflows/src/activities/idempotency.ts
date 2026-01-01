/**
 * Idempotency Utilities
 *
 * Ensures activities execute exactly once by caching results
 * and using idempotency keys to detect duplicate executions.
 */

import { createHash } from 'crypto';

/**
 * Generate an idempotency key for an activity.
 *
 * Format: {activityName}:{contentHash}
 *
 * The content hash is a SHA-256 hash of the JSON-serialized input,
 * truncated to 16 characters for readability.
 *
 * @param activityName Name of the activity
 * @param input Input to the activity
 * @returns Idempotency key string
 */
export function generateIdempotencyKey(activityName: string, input: unknown): string {
  const contentHash = hashContent(input);
  return `${activityName}:${contentHash}`;
}

/**
 * Hash content to a short string.
 * Uses SHA-256 and takes the first 16 characters.
 */
export function hashContent(content: unknown): string {
  const serialized = JSON.stringify(content, sortedReplacer);
  return createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

/**
 * JSON replacer that sorts object keys for consistent hashing.
 */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce(
        (sorted, key) => {
          sorted[key] = (value as Record<string, unknown>)[key];
          return sorted;
        },
        {} as Record<string, unknown>
      );
  }
  return value;
}

/**
 * Cached activity result.
 */
export interface CachedActivityResult {
  /** The cached result value */
  result: unknown;
  /** When the result was cached */
  completedAt: Date;
  /** Activity name for reference */
  activityName: string;
  /** TTL in seconds when cached */
  ttlSeconds: number;
}

/**
 * Activity result cache interface.
 * Implementations can use Redis, in-memory, or other storage.
 */
export interface ActivityResultCache {
  /**
   * Get a cached result by idempotency key.
   * @returns The cached result or null if not found/expired
   */
  get(key: string): Promise<CachedActivityResult | null>;

  /**
   * Set a result in the cache.
   * @param key Idempotency key
   * @param result Result to cache
   * @param ttlSeconds Time-to-live in seconds
   */
  set(key: string, result: unknown, ttlSeconds: number): Promise<void>;

  /**
   * Delete a cached result.
   * @param key Idempotency key
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a key exists in the cache.
   * @param key Idempotency key
   */
  exists(key: string): Promise<boolean>;
}

/**
 * In-memory activity result cache.
 * Useful for testing and single-instance deployments.
 */
export class InMemoryActivityCache implements ActivityResultCache {
  private cache = new Map<string, { data: CachedActivityResult; expiresAt: number }>();

  async get(key: string): Promise<CachedActivityResult | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  async set(key: string, result: unknown, ttlSeconds: number): Promise<void> {
    const data: CachedActivityResult = {
      result,
      completedAt: new Date(),
      activityName: key.split(':')[0] ?? 'unknown',
      ttlSeconds,
    };
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /** Clear all cached results */
  clear(): void {
    this.cache.clear();
  }

  /** Get the number of cached entries */
  size(): number {
    return this.cache.size;
  }
}

/**
 * Redis-backed activity result cache.
 * For production multi-instance deployments.
 */
export class RedisActivityCache implements ActivityResultCache {
  constructor(
    private redis: { get: (k: string) => Promise<string | null>; setex: (k: string, ttl: number, v: string) => Promise<unknown>; del: (k: string) => Promise<unknown>; exists: (k: string) => Promise<number> },
    private prefix: string = 'wf:act:'
  ) {}

  async get(key: string): Promise<CachedActivityResult | null> {
    const data = await this.redis.get(this.prefix + key);
    if (!data) return null;

    try {
      return JSON.parse(data) as CachedActivityResult;
    } catch {
      return null;
    }
  }

  async set(key: string, result: unknown, ttlSeconds: number): Promise<void> {
    const data: CachedActivityResult = {
      result,
      completedAt: new Date(),
      activityName: key.split(':')[0] ?? 'unknown',
      ttlSeconds,
    };
    await this.redis.setex(this.prefix + key, ttlSeconds, JSON.stringify(data));
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }

  async exists(key: string): Promise<boolean> {
    const count = await this.redis.exists(this.prefix + key);
    return count > 0;
  }
}

/**
 * Default TTL for activity results (24 hours).
 */
export const DEFAULT_ACTIVITY_TTL_SECONDS = 24 * 60 * 60;
