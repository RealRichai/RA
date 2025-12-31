/**
 * Cache Plugin Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import {
  cachePlugin,
  CacheKeys,
  CacheTags,
  CacheTTL,
} from '../src/plugins/cache';

// Mock Redis for testing
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  ttl: vi.fn(),
  sadd: vi.fn(),
  smembers: vi.fn(),
  expire: vi.fn(),
  scan: vi.fn(),
  pipeline: vi.fn(() => ({
    sadd: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  })),
};

describe('CacheKeys', () => {
  it('should generate correct user keys', () => {
    expect(CacheKeys.user('usr_123')).toBe('user:usr_123');
    expect(CacheKeys.userByEmail('test@example.com')).toBe('user:email:test@example.com');
    expect(CacheKeys.userProfile('usr_123')).toBe('user:profile:usr_123');
  });

  it('should generate correct listing keys', () => {
    expect(CacheKeys.listing('lst_123')).toBe('listing:lst_123');
    expect(CacheKeys.listingsByProperty('prp_123')).toBe('listings:property:prp_123');
    expect(CacheKeys.listingsActive()).toBe('listings:active');
    expect(CacheKeys.listingsFeatured()).toBe('listings:featured');
  });

  it('should generate correct property keys', () => {
    expect(CacheKeys.property('prp_123')).toBe('property:prp_123');
    expect(CacheKeys.propertiesByOwner('usr_123')).toBe('properties:owner:usr_123');
  });

  it('should generate correct analytics keys', () => {
    expect(CacheKeys.analyticsOverview('usr_123')).toBe('analytics:overview:usr_123');
    expect(CacheKeys.analyticsDashboard('usr_123', 'monthly')).toBe('analytics:dashboard:usr_123:monthly');
  });
});

describe('CacheTags', () => {
  it('should generate correct entity tags', () => {
    expect(CacheTags.user('usr_123')).toBe('user:usr_123');
    expect(CacheTags.listing('lst_123')).toBe('listing:lst_123');
    expect(CacheTags.property('prp_123')).toBe('property:prp_123');
  });

  it('should generate correct collection tags', () => {
    expect(CacheTags.allListings()).toBe('listings');
    expect(CacheTags.allProperties()).toBe('properties');
    expect(CacheTags.allUsers()).toBe('users');
  });
});

describe('CacheTTL', () => {
  it('should have correct TTL values', () => {
    expect(CacheTTL.SHORT).toBe(60);
    expect(CacheTTL.MEDIUM).toBe(300);
    expect(CacheTTL.LONG).toBe(900);
    expect(CacheTTL.HOUR).toBe(3600);
    expect(CacheTTL.DAY).toBe(86400);
  });
});

describe('Cache Plugin - Disabled', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('should use no-op implementation when disabled', async () => {
    await app.register(cachePlugin, { enabled: false });
    await app.ready();

    expect(app.cache).toBeDefined();

    // All operations should be no-ops
    const result = await app.cache.get('test');
    expect(result).toBeNull();

    await app.cache.set('test', { value: 1 });
    const afterSet = await app.cache.get('test');
    expect(afterSet).toBeNull();

    const exists = await app.cache.exists('test');
    expect(exists).toBe(false);
  });

  it('should call factory in getOrSet when disabled', async () => {
    await app.register(cachePlugin, { enabled: false });
    await app.ready();

    const factory = vi.fn().mockResolvedValue({ data: 'test' });
    const result = await app.cache.getOrSet('key', factory);

    expect(factory).toHaveBeenCalledOnce();
    expect(result).toEqual({ data: 'test' });
  });
});

// Mock redis plugin to satisfy dependency
const mockRedisPlugin = fp(
  async (fastify: FastifyInstance) => {
    fastify.decorate('redis', mockRedis);
  },
  { name: 'redis' }
);

describe('Cache Plugin - With Mock Redis', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });

    // Register mock redis plugin with proper name for dependency resolution
    await app.register(mockRedisPlugin);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should get values from cache', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ id: 1, name: 'test' }));

    await app.register(cachePlugin, { enabled: true, prefix: 'test' });
    await app.ready();

    const result = await app.cache.get<{ id: number; name: string }>('mykey');

    expect(result).toEqual({ id: 1, name: 'test' });
    expect(mockRedis.get).toHaveBeenCalledWith('test:mykey');
  });

  it('should return null for missing keys', async () => {
    mockRedis.get.mockResolvedValue(null);

    await app.register(cachePlugin, { enabled: true, prefix: 'test' });
    await app.ready();

    const result = await app.cache.get('missing');

    expect(result).toBeNull();
  });

  it('should set values with TTL', async () => {
    mockRedis.setex.mockResolvedValue('OK');

    await app.register(cachePlugin, { enabled: true, prefix: 'test', defaultTtl: 300 });
    await app.ready();

    await app.cache.set('mykey', { data: 'value' });

    expect(mockRedis.setex).toHaveBeenCalledWith(
      'test:mykey',
      300,
      JSON.stringify({ data: 'value' })
    );
  });

  it('should use custom TTL when provided', async () => {
    mockRedis.setex.mockResolvedValue('OK');

    await app.register(cachePlugin, { enabled: true, prefix: 'test', defaultTtl: 300 });
    await app.ready();

    await app.cache.set('mykey', { data: 'value' }, { ttl: 600 });

    expect(mockRedis.setex).toHaveBeenCalledWith(
      'test:mykey',
      600,
      JSON.stringify({ data: 'value' })
    );
  });

  it('should delete keys', async () => {
    mockRedis.del.mockResolvedValue(1);

    await app.register(cachePlugin, { enabled: true, prefix: 'test' });
    await app.ready();

    const result = await app.cache.delete('mykey');

    expect(result).toBe(true);
    expect(mockRedis.del).toHaveBeenCalledWith('test:mykey');
  });

  it('should check key existence', async () => {
    mockRedis.exists.mockResolvedValue(1);

    await app.register(cachePlugin, { enabled: true, prefix: 'test' });
    await app.ready();

    const exists = await app.cache.exists('mykey');

    expect(exists).toBe(true);
    expect(mockRedis.exists).toHaveBeenCalledWith('test:mykey');
  });

  it('should get TTL for key', async () => {
    mockRedis.ttl.mockResolvedValue(120);

    await app.register(cachePlugin, { enabled: true, prefix: 'test' });
    await app.ready();

    const ttl = await app.cache.ttl('mykey');

    expect(ttl).toBe(120);
    expect(mockRedis.ttl).toHaveBeenCalledWith('test:mykey');
  });

  it('should track cache stats', async () => {
    mockRedis.get.mockResolvedValueOnce(null); // miss
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ data: 'value' })); // hit
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);

    await app.register(cachePlugin, { enabled: true, prefix: 'test' });
    await app.ready();

    await app.cache.get('key1'); // miss
    await app.cache.get('key2'); // hit
    await app.cache.set('key3', 'value');
    await app.cache.delete('key1');

    const stats = app.cache.getStats();

    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.sets).toBe(1);
    expect(stats.deletes).toBe(1);
  });

  it('should reset stats', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ data: 'value' }));

    await app.register(cachePlugin, { enabled: true, prefix: 'test' });
    await app.ready();

    await app.cache.get('key');
    expect(app.cache.getStats().hits).toBe(1);

    app.cache.resetStats();
    expect(app.cache.getStats().hits).toBe(0);
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ cached: true }));

      await app.register(cachePlugin, { enabled: true, prefix: 'test' });
      await app.ready();

      const factory = vi.fn().mockResolvedValue({ computed: true });
      const result = await app.cache.getOrSet('key', factory);

      expect(result).toEqual({ cached: true });
      expect(factory).not.toHaveBeenCalled();
    });

    it('should compute and cache value if not exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      await app.register(cachePlugin, { enabled: true, prefix: 'test' });
      await app.ready();

      const factory = vi.fn().mockResolvedValue({ computed: true });
      const result = await app.cache.getOrSet('key', factory, { ttl: 60 });

      expect(result).toEqual({ computed: true });
      expect(factory).toHaveBeenCalledOnce();
      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });

  describe('deleteByTag', () => {
    it('should delete all keys with tag', async () => {
      mockRedis.smembers.mockResolvedValue(['test:key1', 'test:key2', 'test:key3']);
      const mockPipeline = {
        del: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      await app.register(cachePlugin, { enabled: true, prefix: 'test' });
      await app.ready();

      const count = await app.cache.deleteByTag('listings');

      expect(count).toBe(3);
      expect(mockRedis.smembers).toHaveBeenCalledWith('test:_tags:listings');
    });

    it('should return 0 if no keys found', async () => {
      mockRedis.smembers.mockResolvedValue([]);

      await app.register(cachePlugin, { enabled: true, prefix: 'test' });
      await app.ready();

      const count = await app.cache.deleteByTag('empty');

      expect(count).toBe(0);
    });
  });
});
