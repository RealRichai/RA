/**
 * Enhanced Rate Limiting Plugin
 *
 * Provides tier-based rate limiting with Redis backend.
 * Supports per-user limits, categories, and quota tracking.
 */

import type {
  RateLimitCategory,
  RateLimitPolicy,
  RateLimitResult,
  RateLimitState,
  RateLimitTier,
  TierRateLimits,
} from '@realriches/types';
import {
  DEFAULT_CATEGORY_POLICIES,
  DEFAULT_TIER_LIMITS,
  buildRateLimitHeaders,
  getTierFromRole,
} from '@realriches/types';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import type { Redis } from 'ioredis';

// =============================================================================
// Types
// =============================================================================

export interface RateLimitOptions {
  category?: RateLimitCategory;
  override?: Partial<RateLimitPolicy>;
  skip?: boolean;
}

interface RateLimitPluginOptions {
  enabled?: boolean;
  redisPrefix?: string;
  includeHeaders?: boolean;
  logExceeded?: boolean;
  tierLimits?: Partial<Record<RateLimitTier, Partial<TierRateLimits>>>;
}

// =============================================================================
// Rate Limit Service
// =============================================================================

class RateLimitService {
  private redis: Redis;
  private prefix: string;
  private tierLimits: Record<RateLimitTier, TierRateLimits>;
  private categoryPolicies: Record<RateLimitCategory, RateLimitPolicy>;

  constructor(
    redis: Redis,
    options: {
      prefix?: string;
      tierLimits?: Partial<Record<RateLimitTier, Partial<TierRateLimits>>>;
    } = {}
  ) {
    this.redis = redis;
    this.prefix = options.prefix || 'rl';

    // Merge custom tier limits with defaults
    this.tierLimits = { ...DEFAULT_TIER_LIMITS };
    if (options.tierLimits) {
      for (const [tier, limits] of Object.entries(options.tierLimits)) {
        this.tierLimits[tier as RateLimitTier] = {
          ...this.tierLimits[tier as RateLimitTier],
          ...limits,
        };
      }
    }

    this.categoryPolicies = { ...DEFAULT_CATEGORY_POLICIES };
  }

  /**
   * Check if a request is allowed under rate limits.
   */
  async checkLimit(
    key: string,
    category: RateLimitCategory,
    tier: RateLimitTier
  ): Promise<RateLimitResult> {
    const policy = this.categoryPolicies[category];
    const tierConfig = this.tierLimits[tier];

    // Calculate effective limit based on tier and category
    const limit = this.getEffectiveLimit(category, tierConfig, policy.limit);
    const windowMs = policy.windowMs;

    const now = Date.now();
    const windowKey = `${this.prefix}:${category}:${key}`;

    // Use Redis MULTI for atomic operations
    const multi = this.redis.multi();

    // Get current count and window info
    multi.get(windowKey);
    multi.pttl(windowKey);

    const results = await multi.exec();
    if (!results) {
      // Redis error, allow request but log
      logger.warn({ key, category }, 'Rate limit check failed, allowing request');
      return this.createAllowedResult(key, category, limit, now, windowMs);
    }

    const [countResult, ttlResult] = results;
    const currentCount = parseInt((countResult[1] as string) || '0', 10);
    const ttl = (ttlResult[1] as number) || -2;

    // Calculate window timing
    let windowStart: number;
    let windowEnd: number;

    if (ttl === -2 || ttl === -1) {
      // Key doesn't exist or has no TTL, start new window
      windowStart = now;
      windowEnd = now + windowMs;
    } else {
      windowEnd = now + ttl;
      windowStart = windowEnd - windowMs;
    }

    // Check if limit exceeded
    if (currentCount >= limit) {
      const retryAfter = Math.ceil(ttl / 1000);
      return {
        allowed: false,
        state: {
          key,
          category,
          count: currentCount,
          windowStart,
          windowEnd,
          limit,
          remaining: 0,
          resetAt: Math.ceil(windowEnd / 1000),
        },
        retryAfter,
        reason: `Rate limit exceeded for ${category}`,
      };
    }

    // Increment counter
    const newCount = await this.incrementCounter(windowKey, windowMs);

    return {
      allowed: true,
      state: {
        key,
        category,
        count: newCount,
        windowStart,
        windowEnd,
        limit,
        remaining: Math.max(0, limit - newCount),
        resetAt: Math.ceil(windowEnd / 1000),
      },
    };
  }

  /**
   * Increment the counter for a key.
   */
  private async incrementCounter(key: string, windowMs: number): Promise<number> {
    const multi = this.redis.multi();
    multi.incr(key);
    multi.pexpire(key, windowMs);

    const results = await multi.exec();
    if (!results) return 1;

    return (results[0][1] as number) || 1;
  }

  /**
   * Get effective limit based on tier and category.
   */
  private getEffectiveLimit(
    category: RateLimitCategory,
    tierConfig: TierRateLimits,
    policyLimit: number
  ): number {
    // Use tier-specific limits for known categories
    switch (category) {
      case 'ai':
        return tierConfig.aiRequestsPerMinute;
      case 'write':
        return tierConfig.writeRequestsPerMinute;
      case 'default':
        return tierConfig.requestsPerMinute;
      default:
        // For other categories, scale the policy limit by tier
        const tierMultiplier = tierConfig.requestsPerMinute / DEFAULT_TIER_LIMITS.free.requestsPerMinute;
        return Math.ceil(policyLimit * tierMultiplier);
    }
  }

  /**
   * Create an allowed result for error cases.
   */
  private createAllowedResult(
    key: string,
    category: RateLimitCategory,
    limit: number,
    now: number,
    windowMs: number
  ): RateLimitResult {
    return {
      allowed: true,
      state: {
        key,
        category,
        count: 0,
        windowStart: now,
        windowEnd: now + windowMs,
        limit,
        remaining: limit,
        resetAt: Math.ceil((now + windowMs) / 1000),
      },
    };
  }

  /**
   * Check daily quota for a user.
   */
  async checkDailyQuota(userId: string, tier: RateLimitTier): Promise<{
    allowed: boolean;
    used: number;
    limit: number;
    remaining: number;
  }> {
    const tierConfig = this.tierLimits[tier];
    if (tierConfig.dailyQuota === 0) {
      // Unlimited quota
      return { allowed: true, used: 0, limit: 0, remaining: Infinity };
    }

    const today = new Date().toISOString().split('T')[0];
    const quotaKey = `${this.prefix}:quota:${userId}:${today}`;

    const used = parseInt((await this.redis.get(quotaKey)) || '0', 10);
    const remaining = Math.max(0, tierConfig.dailyQuota - used);

    if (used >= tierConfig.dailyQuota) {
      return {
        allowed: false,
        used,
        limit: tierConfig.dailyQuota,
        remaining: 0,
      };
    }

    // Increment quota
    const multi = this.redis.multi();
    multi.incr(quotaKey);
    multi.expire(quotaKey, 86400); // 24 hours
    await multi.exec();

    return {
      allowed: true,
      used: used + 1,
      limit: tierConfig.dailyQuota,
      remaining: remaining - 1,
    };
  }

  /**
   * Get current rate limit state without incrementing.
   */
  async getState(
    key: string,
    category: RateLimitCategory,
    tier: RateLimitTier
  ): Promise<RateLimitState> {
    const policy = this.categoryPolicies[category];
    const tierConfig = this.tierLimits[tier];
    const limit = this.getEffectiveLimit(category, tierConfig, policy.limit);
    const windowMs = policy.windowMs;

    const windowKey = `${this.prefix}:${category}:${key}`;
    const now = Date.now();

    const [count, ttl] = await Promise.all([
      this.redis.get(windowKey),
      this.redis.pttl(windowKey),
    ]);

    const currentCount = parseInt(count || '0', 10);
    const windowEnd = ttl > 0 ? now + ttl : now + windowMs;
    const windowStart = windowEnd - windowMs;

    return {
      key,
      category,
      count: currentCount,
      windowStart,
      windowEnd,
      limit,
      remaining: Math.max(0, limit - currentCount),
      resetAt: Math.ceil(windowEnd / 1000),
    };
  }

  /**
   * Reset rate limit for a key.
   */
  async reset(key: string, category?: RateLimitCategory): Promise<void> {
    if (category) {
      await this.redis.del(`${this.prefix}:${category}:${key}`);
    } else {
      // Reset all categories
      const categories: RateLimitCategory[] = ['default', 'ai', 'auth', 'write', 'upload', 'webhook', 'public'];
      const keys = categories.map((c) => `${this.prefix}:${c}:${key}`);
      await this.redis.del(...keys);
    }
  }
}

// =============================================================================
// Plugin
// =============================================================================

let rateLimitService: RateLimitService | null = null;

const rateLimitPluginCallback: FastifyPluginCallback<RateLimitPluginOptions> = (
  fastify,
  opts,
  done
) => {
  const {
    enabled = true,
    redisPrefix = 'rl',
    includeHeaders = true,
    logExceeded = true,
    tierLimits,
  } = opts;

  if (!enabled) {
    logger.info('Rate limiting disabled');
    done();
    return;
  }

  // Initialize service with Redis
  rateLimitService = new RateLimitService(fastify.redis, {
    prefix: redisPrefix,
    tierLimits,
  });

  // Decorate fastify with rate limit checker (use different name to avoid conflict with @fastify/rate-limit)
  fastify.decorate('rateLimitService', rateLimitService);

  // Add rate limit decorator function
  fastify.decorate(
    'checkRateLimit',
    async function (
      request: FastifyRequest,
      reply: FastifyReply,
      options: RateLimitOptions = {}
    ): Promise<boolean> {
      if (options.skip || !rateLimitService) {
        return true;
      }

      const category = options.category || 'default';

      // Determine rate limit key (user ID or IP)
      const policy = DEFAULT_CATEGORY_POLICIES[category];
      let key: string;

      if (policy.keyType === 'user' && request.user) {
        key = request.user.id;
      } else if (policy.keyType === 'ip') {
        key = request.headers['x-forwarded-for']?.toString() || request.ip;
      } else {
        // user_or_ip: prefer user if authenticated
        key = request.user?.id || request.headers['x-forwarded-for']?.toString() || request.ip;
      }

      // Get tier from user role
      const tier = getTierFromRole(request.user?.role);

      // Check if role should skip rate limiting
      if (policy.skipRoles?.includes(request.user?.role || '')) {
        return true;
      }

      // Apply override if provided
      const effectivePolicy = options.override
        ? { ...policy, ...options.override }
        : policy;

      // Check rate limit
      const result = await rateLimitService.checkLimit(key, category, tier);

      // Add rate limit headers if enabled
      if (includeHeaders) {
        const headers = buildRateLimitHeaders(result.state, result.retryAfter);
        for (const [header, value] of Object.entries(headers)) {
          reply.header(header, value);
        }
      }

      if (!result.allowed) {
        if (logExceeded) {
          logger.warn({
            key,
            category,
            tier,
            limit: result.state.limit,
            count: result.state.count,
            endpoint: request.url,
            userId: request.user?.id,
            ip: request.ip,
          }, 'Rate limit exceeded');
        }

        reply.status(429).send({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: effectivePolicy.errorMessage || 'Too many requests, please try again later',
            details: {
              category,
              limit: result.state.limit,
              remaining: 0,
              retryAfter: result.retryAfter,
              resetAt: new Date(result.state.resetAt * 1000).toISOString(),
            },
          },
        });

        return false;
      }

      return true;
    }
  );

  // Add daily quota checker
  fastify.decorate(
    'checkDailyQuota',
    async function (
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<boolean> {
      if (!request.user || !rateLimitService) {
        return true;
      }

      const tier = getTierFromRole(request.user.role);
      const result = await rateLimitService.checkDailyQuota(request.user.id, tier);

      if (!result.allowed) {
        reply.status(429).send({
          success: false,
          error: {
            code: 'DAILY_QUOTA_EXCEEDED',
            message: 'Daily request quota exceeded. Quota resets at midnight UTC.',
            details: {
              used: result.used,
              limit: result.limit,
              resetsAt: new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString(),
            },
          },
        });

        return false;
      }

      // Add quota headers
      if (result.limit > 0) {
        reply.header('X-DailyQuota-Limit', String(result.limit));
        reply.header('X-DailyQuota-Remaining', String(result.remaining));
      }

      return true;
    }
  );

  logger.info('Enhanced rate limiting enabled');
  done();
};

export const rateLimitPlugin = fp(rateLimitPluginCallback, {
  name: 'rate-limit-enhanced',
  dependencies: ['redis'],
});

// Type augmentation
declare module 'fastify' {
  interface FastifyInstance {
    rateLimit: RateLimitService;
    checkRateLimit: (
      request: FastifyRequest,
      reply: FastifyReply,
      options?: RateLimitOptions
    ) => Promise<boolean>;
    checkDailyQuota: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<boolean>;
  }
}

// =============================================================================
// Exports
// =============================================================================

export { RateLimitService };

/**
 * Get rate limit service instance.
 */
export function getRateLimitService(): RateLimitService | null {
  return rateLimitService;
}
