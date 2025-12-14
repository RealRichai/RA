/**
 * Cache Client
 * Redis client with circuit breaker and distributed locking
 */

import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let redis: Redis | null = null;
let circuitOpen = false;
let failureCount = 0;
const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT = 30000;

function createRedisClient(): Redis | null {
  if (!env.REDIS_URL) {
    logger.warn('Redis URL not configured, cache disabled');
    return null;
  }

  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  client.on('error', (err) => {
    logger.error({ err }, 'Redis error');
    failureCount++;
    if (failureCount >= FAILURE_THRESHOLD) {
      circuitOpen = true;
      setTimeout(() => {
        circuitOpen = false;
        failureCount = 0;
      }, RESET_TIMEOUT);
    }
  });

  client.on('connect', () => {
    logger.info('Redis connected');
    failureCount = 0;
  });

  return client;
}

export function getRedis(): Redis | null {
  if (circuitOpen) return null;
  if (!redis) redis = createRedisClient();
  return redis;
}

export const CachePrefix = {
  USER: 'user:',
  SESSION: 'session:',
  LISTING: 'listing:',
  RATE_LIMIT: 'rate:',
} as const;

export const CacheTTL = {
  SHORT: 60,
  MEDIUM: 300,
  LONG: 3600,
  DAY: 86400,
} as const;

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttl = CacheTTL.MEDIUM): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.setex(key, ttl, JSON.stringify(value));
  } catch {
    // Ignore cache errors
  }
}

export async function cacheDelete(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.del(key);
  } catch {
    // Ignore cache errors
  }
}

export async function checkCacheHealth(): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    await client.ping();
    return true;
  } catch {
    return false;
  }
}

export async function disconnectCache(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis disconnected');
  }
}

// Distributed lock
export async function acquireLock(key: string, ttl = 30): Promise<boolean> {
  const client = getRedis();
  if (!client) return true;
  const result = await client.set(`lock:${key}`, '1', 'EX', ttl, 'NX');
  return result === 'OK';
}

export async function releaseLock(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  await client.del(`lock:${key}`);
}
