import IORedis from 'ioredis';
import { env } from '../config/env.js';

const RedisCtor: any = (IORedis as any).default ?? IORedis;

export const redis = new RedisCtor(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  lazyConnect: true,
  ...(env.REDIS_TLS_ENABLED ? { tls: {} } : {}),
});

redis.on('error', (err: unknown) => {
  console.error('Redis error:', err);
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    process.exit(1);
  }
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  console.log('📤 Redis disconnected');
}

// Cache utilities
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as unknown as T;
    }
  },

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, data);
    } else {
      await redis.set(key, data);
    }
  },

  async del(key: string): Promise<void> {
    await redis.del(key);
  },

  async delPattern(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },

  async exists(key: string): Promise<boolean> {
    const result = await redis.exists(key);
    return result === 1;
  },

  async incr(key: string): Promise<number> {
    return redis.incr(key);
  },

  async expire(key: string, seconds: number): Promise<void> {
    await redis.expire(key, seconds);
  },
};

// Session management
export const sessionStore = {
  async create(userId: string, sessionId: string, data: Record<string, unknown>, ttlSeconds = 86400 * 7): Promise<void> {
    const key = `session:${userId}:${sessionId}`;
    await cache.set(key, data, ttlSeconds);
    await redis.sadd(`user_sessions:${userId}`, sessionId);
  },

  async get(userId: string, sessionId: string): Promise<Record<string, unknown> | null> {
    const key = `session:${userId}:${sessionId}`;
    return cache.get(key);
  },

  async destroy(userId: string, sessionId: string): Promise<void> {
    const key = `session:${userId}:${sessionId}`;
    await cache.del(key);
    await redis.srem(`user_sessions:${userId}`, sessionId);
  },

  async destroyAll(userId: string): Promise<void> {
    const sessions = await redis.smembers(`user_sessions:${userId}`);
    for (const sessionId of sessions) {
      await cache.del(`session:${userId}:${sessionId}`);
    }
    await redis.del(`user_sessions:${userId}`);
  },
};

// Rate limiting
export const rateLimiter = {
  async check(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const now = Math.floor(Date.now() / 1000);
    const windowKey = `ratelimit:${key}:${Math.floor(now / windowSeconds)}`;
    
    const count = await redis.incr(windowKey);
    if (count === 1) {
      await redis.expire(windowKey, windowSeconds);
    }

    const resetAt = (Math.floor(now / windowSeconds) + 1) * windowSeconds * 1000;

    return {
      allowed: count <= maxRequests,
      remaining: Math.max(0, maxRequests - count),
      resetAt,
    };
  },
};
