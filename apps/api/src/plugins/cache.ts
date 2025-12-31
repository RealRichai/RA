/**
 * Redis Caching Plugin
 *
 * Provides a type-safe caching layer with:
 * - Get/set/delete operations with TTL
 * - Cache-aside pattern (getOrSet)
 * - Tag-based invalidation for related data
 * - Namespace prefixing to avoid key collisions
 * - Prometheus metrics for hit/miss rates
 * - JSON serialization for complex objects
 */

import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import type Redis from 'ioredis';

// =============================================================================
// Types
// =============================================================================

export interface CacheOptions {
  /** Time-to-live in seconds */
  ttl?: number;
  /** Tags for group invalidation */
  tags?: string[];
}

export interface CachePluginOptions {
  /** Enable/disable caching */
  enabled?: boolean;
  /** Prefix for all cache keys */
  prefix?: string;
  /** Default TTL in seconds */
  defaultTtl?: number;
  /** Enable metrics collection */
  collectMetrics?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}

export interface CacheService {
  /** Get a value from cache */
  get<T>(key: string): Promise<T | null>;

  /** Set a value in cache */
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;

  /** Get value or compute and cache it */
  getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T>;

  /** Delete a single key */
  delete(key: string): Promise<boolean>;

  /** Delete all keys with a specific tag */
  deleteByTag(tag: string): Promise<number>;

  /** Delete all keys matching a pattern */
  deleteByPattern(pattern: string): Promise<number>;

  /** Check if key exists */
  exists(key: string): Promise<boolean>;

  /** Get remaining TTL for a key */
  ttl(key: string): Promise<number>;

  /** Get cache statistics */
  getStats(): CacheStats;

  /** Reset statistics */
  resetStats(): void;

  /** Clear all cache (use with caution) */
  flush(): Promise<void>;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_OPTIONS: Required<CachePluginOptions> = {
  enabled: true,
  prefix: 'cache',
  defaultTtl: 300, // 5 minutes
  collectMetrics: true,
};

// Tag index key prefix
const TAG_INDEX_PREFIX = '_tags';

// =============================================================================
// Cache Service Implementation
// =============================================================================

class RedisCacheService implements CacheService {
  private redis: Redis;
  private prefix: string;
  private defaultTtl: number;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
  };

  constructor(redis: Redis, options: Required<CachePluginOptions>) {
    this.redis = redis;
    this.prefix = options.prefix;
    this.defaultTtl = options.defaultTtl;
  }

  private prefixKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  private tagIndexKey(tag: string): string {
    return `${this.prefix}:${TAG_INDEX_PREFIX}:${tag}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const prefixedKey = this.prefixKey(key);
      const value = await this.redis.get(prefixedKey);

      if (value === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return JSON.parse(value) as T;
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache get error');
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      const prefixedKey = this.prefixKey(key);
      const ttl = options?.ttl ?? this.defaultTtl;
      const serialized = JSON.stringify(value);

      if (ttl > 0) {
        await this.redis.setex(prefixedKey, ttl, serialized);
      } else {
        await this.redis.set(prefixedKey, serialized);
      }

      // Register key with tags for group invalidation
      if (options?.tags && options.tags.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const tag of options.tags) {
          const tagKey = this.tagIndexKey(tag);
          pipeline.sadd(tagKey, prefixedKey);
          // Set expiry on tag index slightly longer than cache TTL
          if (ttl > 0) {
            pipeline.expire(tagKey, ttl + 60);
          }
        }
        await pipeline.exec();
      }

      this.stats.sets++;
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache set error');
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Compute the value
    const value = await factory();

    // Cache it (fire and forget for performance)
    this.set(key, value, options).catch((error) => {
      logger.error({ error, key }, 'Cache set in getOrSet failed');
    });

    return value;
  }

  async delete(key: string): Promise<boolean> {
    try {
      const prefixedKey = this.prefixKey(key);
      const result = await this.redis.del(prefixedKey);
      this.stats.deletes++;
      return result > 0;
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache delete error');
      return false;
    }
  }

  async deleteByTag(tag: string): Promise<number> {
    try {
      const tagKey = this.tagIndexKey(tag);
      const keys = await this.redis.smembers(tagKey);

      if (keys.length === 0) {
        return 0;
      }

      // Delete all keys and the tag index
      const pipeline = this.redis.pipeline();
      for (const key of keys) {
        pipeline.del(key);
      }
      pipeline.del(tagKey);
      await pipeline.exec();

      this.stats.deletes += keys.length;
      logger.info({ tag, count: keys.length }, 'Cache invalidated by tag');
      return keys.length;
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, tag }, 'Cache deleteByTag error');
      return 0;
    }
  }

  async deleteByPattern(pattern: string): Promise<number> {
    try {
      const prefixedPattern = this.prefixKey(pattern);
      let cursor = '0';
      let deletedCount = 0;

      // Use SCAN to avoid blocking Redis
      do {
        const [newCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          prefixedPattern,
          'COUNT',
          100
        );
        cursor = newCursor;

        if (keys.length > 0) {
          await this.redis.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      this.stats.deletes += deletedCount;
      logger.info({ pattern, count: deletedCount }, 'Cache invalidated by pattern');
      return deletedCount;
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, pattern }, 'Cache deleteByPattern error');
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const prefixedKey = this.prefixKey(key);
      const result = await this.redis.exists(prefixedKey);
      return result > 0;
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache exists error');
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      const prefixedKey = this.prefixKey(key);
      return await this.redis.ttl(prefixedKey);
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache ttl error');
      return -2; // Key does not exist
    }
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    };
  }

  async flush(): Promise<void> {
    try {
      const pattern = `${this.prefix}:*`;
      let cursor = '0';
      let deletedCount = 0;

      do {
        const [newCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );
        cursor = newCursor;

        if (keys.length > 0) {
          await this.redis.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      logger.warn({ count: deletedCount }, 'Cache flushed');
    } catch (error) {
      this.stats.errors++;
      logger.error({ error }, 'Cache flush error');
    }
  }
}

// =============================================================================
// Disabled Cache (No-op implementation)
// =============================================================================

class DisabledCacheService implements CacheService {
  async get<T>(): Promise<T | null> {
    return null;
  }

  async set(): Promise<void> {
    // No-op
  }

  async getOrSet<T>(_key: string, factory: () => Promise<T>): Promise<T> {
    return factory();
  }

  async delete(): Promise<boolean> {
    return false;
  }

  async deleteByTag(): Promise<number> {
    return 0;
  }

  async deleteByPattern(): Promise<number> {
    return 0;
  }

  async exists(): Promise<boolean> {
    return false;
  }

  async ttl(): Promise<number> {
    return -2;
  }

  getStats(): CacheStats {
    return { hits: 0, misses: 0, sets: 0, deletes: 0, errors: 0 };
  }

  resetStats(): void {
    // No-op
  }

  async flush(): Promise<void> {
    // No-op
  }
}

// =============================================================================
// Cache Key Builders
// =============================================================================

export const CacheKeys = {
  // User cache keys
  user: (id: string) => `user:${id}`,
  userByEmail: (email: string) => `user:email:${email}`,
  userProfile: (id: string) => `user:profile:${id}`,

  // Listing cache keys
  listing: (id: string) => `listing:${id}`,
  listingsByProperty: (propertyId: string) => `listings:property:${propertyId}`,
  listingsActive: () => 'listings:active',
  listingsFeatured: () => 'listings:featured',

  // Property cache keys
  property: (id: string) => `property:${id}`,
  propertiesByOwner: (ownerId: string) => `properties:owner:${ownerId}`,

  // Lease cache keys
  lease: (id: string) => `lease:${id}`,
  leasesByProperty: (propertyId: string) => `leases:property:${propertyId}`,
  leasesByTenant: (tenantId: string) => `leases:tenant:${tenantId}`,

  // Analytics cache keys
  analyticsOverview: (userId: string) => `analytics:overview:${userId}`,
  analyticsDashboard: (userId: string, period: string) => `analytics:dashboard:${userId}:${period}`,

  // Config/Settings cache
  featureFlags: () => 'config:feature-flags',
  systemSettings: () => 'config:settings',
};

// =============================================================================
// Cache Tags for Group Invalidation
// =============================================================================

export const CacheTags = {
  user: (id: string) => `user:${id}`,
  listing: (id: string) => `listing:${id}`,
  property: (id: string) => `property:${id}`,
  lease: (id: string) => `lease:${id}`,
  allListings: () => 'listings',
  allProperties: () => 'properties',
  allUsers: () => 'users',
};

// =============================================================================
// TTL Presets (in seconds)
// =============================================================================

export const CacheTTL = {
  /** 1 minute - for rapidly changing data */
  SHORT: 60,
  /** 5 minutes - default for most data */
  MEDIUM: 300,
  /** 15 minutes - for slower changing data */
  LONG: 900,
  /** 1 hour - for stable data */
  HOUR: 3600,
  /** 24 hours - for rarely changing data */
  DAY: 86400,
};

// =============================================================================
// Plugin
// =============================================================================

const cachePluginCallback: FastifyPluginCallback<CachePluginOptions> = (
  fastify,
  opts,
  done
) => {
  const options: Required<CachePluginOptions> = {
    ...DEFAULT_OPTIONS,
    ...opts,
  };

  let cacheService: CacheService;

  if (!options.enabled) {
    logger.info('Cache disabled, using no-op implementation');
    cacheService = new DisabledCacheService();
  } else if (!fastify.redis) {
    logger.warn('Redis not available, cache disabled');
    cacheService = new DisabledCacheService();
  } else {
    cacheService = new RedisCacheService(fastify.redis, options);
    logger.info({ prefix: options.prefix, defaultTtl: options.defaultTtl }, 'Cache enabled');
  }

  // Decorate fastify with cache service
  fastify.decorate('cache', cacheService);

  // Add cache stats to metrics if metrics plugin is registered
  if (options.collectMetrics && fastify.metrics) {
    // Periodically update cache metrics
    const metricsInterval = setInterval(() => {
      const stats = cacheService.getStats();
      // Metrics will be picked up by the metrics plugin
      logger.debug({ stats }, 'Cache stats');
    }, 60000);

    fastify.addHook('onClose', async () => {
      clearInterval(metricsInterval);
    });
  }

  done();
};

export const cachePlugin = fp(cachePluginCallback, {
  name: 'cache',
  // No hard dependency on redis - gracefully degrades to no-op if redis unavailable
});

// =============================================================================
// Type Augmentation
// =============================================================================

declare module 'fastify' {
  interface FastifyInstance {
    cache: CacheService;
  }
}

// =============================================================================
// Exports
// =============================================================================

export { CacheService, CacheStats, CacheOptions };
