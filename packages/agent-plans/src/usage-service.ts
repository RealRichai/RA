/**
 * Plan Usage Service
 *
 * Tracks and enforces usage limits for organization plans.
 * Uses Redis for fast cached lookups and atomic increments.
 */

import type { Redis } from 'ioredis';

import type {
  UsageType,
  UsageCheckResult,
  UsageIncrementResult,
  PlanLimits,
} from './types';

// =============================================================================
// Types
// =============================================================================

export interface PlanUsageServiceConfig {
  redis: Redis;
  /** Cache TTL for usage data in seconds (default: 60) */
  cacheTtlSeconds?: number;
  /** Database adapter for persisting usage */
  db?: UsageDatabaseAdapter;
}

export interface UsageDatabaseAdapter {
  getOrganizationPlan(organizationId: string): Promise<{
    id: string;
    planId: string;
    limits: PlanLimits;
    customCallLimit?: number;
    customGenerationLimit?: number;
    customTaskLimit?: number;
    billingCycleStart: Date;
    billingCycleEnd: Date;
  } | null>;

  getCurrentUsage(organizationId: string, periodStart: Date): Promise<{
    callsUsed: number;
    generationsUsed: number;
    tasksUsed: number;
  } | null>;

  incrementUsage(
    organizationId: string,
    periodStart: Date,
    type: UsageType,
    amount: number
  ): Promise<number>;

  recordOverage(
    organizationId: string,
    periodStart: Date,
    type: UsageType,
    amount: number
  ): Promise<void>;
}

// =============================================================================
// Plan Usage Service
// =============================================================================

export class PlanUsageService {
  private redis: Redis;
  private cacheTtlSeconds: number;
  private db?: UsageDatabaseAdapter;

  constructor(config: PlanUsageServiceConfig) {
    this.redis = config.redis;
    this.cacheTtlSeconds = config.cacheTtlSeconds ?? 60;
    this.db = config.db;
  }

  // ---------------------------------------------------------------------------
  // Usage Checking
  // ---------------------------------------------------------------------------

  /**
   * Check if an organization can perform an action within their plan limits.
   * Uses Redis cache for fast lookups.
   */
  async checkUsage(
    organizationId: string,
    type: UsageType,
    amount: number = 1
  ): Promise<UsageCheckResult> {
    const cacheKey = this.getCacheKey(organizationId, type);

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const { currentUsage, limit } = JSON.parse(cached);
      return this.buildCheckResult(currentUsage, limit, amount);
    }

    // Fetch from database
    const { usage, limit } = await this.fetchUsageFromDb(organizationId, type);

    // Cache for future lookups
    await this.redis.setex(
      cacheKey,
      this.cacheTtlSeconds,
      JSON.stringify({ currentUsage: usage, limit })
    );

    return this.buildCheckResult(usage, limit, amount);
  }

  /**
   * Check if organization is at or above limit (hard block check).
   */
  async isAtLimit(organizationId: string, type: UsageType): Promise<boolean> {
    const result = await this.checkUsage(organizationId, type, 1);
    return !result.allowed;
  }

  /**
   * Get remaining usage for a type.
   */
  async getRemaining(organizationId: string, type: UsageType): Promise<number> {
    const result = await this.checkUsage(organizationId, type, 0);
    return result.remaining;
  }

  // ---------------------------------------------------------------------------
  // Usage Incrementing
  // ---------------------------------------------------------------------------

  /**
   * Increment usage for an organization. Uses Redis atomic increment.
   * Persists to database asynchronously.
   */
  async incrementUsage(
    organizationId: string,
    type: UsageType,
    amount: number = 1
  ): Promise<UsageIncrementResult> {
    const cacheKey = this.getCacheKey(organizationId, type);

    // Get current limit
    const { limit } = await this.fetchUsageFromDb(organizationId, type);

    // Atomic increment in Redis
    const counterKey = this.getCounterKey(organizationId, type);
    const newUsage = await this.redis.incrby(counterKey, amount);

    // Check if this pushed us over limit
    const wasAtLimit = newUsage - amount >= limit && limit !== -1;
    const isNowOverage = newUsage > limit && limit !== -1;

    // Update cache
    await this.redis.setex(
      cacheKey,
      this.cacheTtlSeconds,
      JSON.stringify({ currentUsage: newUsage, limit })
    );

    // Persist to database asynchronously
    this.persistUsageAsync(organizationId, type, amount, isNowOverage);

    return {
      success: true,
      newUsage,
      wasAtLimit,
      isNowOverage,
    };
  }

  /**
   * Decrement usage (for rollbacks/refunds).
   */
  async decrementUsage(
    organizationId: string,
    type: UsageType,
    amount: number = 1
  ): Promise<number> {
    const counterKey = this.getCounterKey(organizationId, type);
    const newUsage = await this.redis.decrby(counterKey, amount);

    // Invalidate cache
    await this.redis.del(this.getCacheKey(organizationId, type));

    return Math.max(0, newUsage);
  }

  // ---------------------------------------------------------------------------
  // Rate Limiting
  // ---------------------------------------------------------------------------

  /**
   * Check rate limit (calls per minute).
   */
  async checkRateLimit(
    organizationId: string,
    windowSeconds: number = 60
  ): Promise<{ allowed: boolean; currentRate: number; limit: number }> {
    const plan = await this.db?.getOrganizationPlan(organizationId);
    const limit = plan?.limits.callsPerMinute ?? 10;

    const rateKey = `rate:${organizationId}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    const currentRate = parseInt((await this.redis.get(rateKey)) ?? '0', 10);

    return {
      allowed: currentRate < limit,
      currentRate,
      limit,
    };
  }

  /**
   * Increment rate counter.
   */
  async incrementRateCounter(
    organizationId: string,
    windowSeconds: number = 60
  ): Promise<number> {
    const rateKey = `rate:${organizationId}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    const count = await this.redis.incr(rateKey);

    // Set expiry if this is a new key
    if (count === 1) {
      await this.redis.expire(rateKey, windowSeconds);
    }

    return count;
  }

  // ---------------------------------------------------------------------------
  // Billing Period Management
  // ---------------------------------------------------------------------------

  /**
   * Reset usage counters for a new billing period.
   */
  async resetForNewPeriod(organizationId: string): Promise<void> {
    const usageTypes: UsageType[] = ['calls', 'generations', 'tasks'];

    for (const type of usageTypes) {
      await this.redis.del(this.getCounterKey(organizationId, type));
      await this.redis.del(this.getCacheKey(organizationId, type));
    }
  }

  /**
   * Get full usage summary for an organization.
   */
  async getUsageSummary(organizationId: string): Promise<{
    calls: UsageCheckResult;
    generations: UsageCheckResult;
    tasks: UsageCheckResult;
  }> {
    const [calls, generations, tasks] = await Promise.all([
      this.checkUsage(organizationId, 'calls', 0),
      this.checkUsage(organizationId, 'generations', 0),
      this.checkUsage(organizationId, 'tasks', 0),
    ]);

    return { calls, generations, tasks };
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private getCacheKey(organizationId: string, type: UsageType): string {
    return `usage:cache:${organizationId}:${type}`;
  }

  private getCounterKey(organizationId: string, type: UsageType): string {
    return `usage:counter:${organizationId}:${type}`;
  }

  private buildCheckResult(
    currentUsage: number,
    limit: number,
    requestedAmount: number
  ): UsageCheckResult {
    // -1 means unlimited
    if (limit === -1) {
      return {
        allowed: true,
        currentUsage,
        limit: -1,
        remaining: Infinity,
        isOverage: false,
      };
    }

    const remaining = Math.max(0, limit - currentUsage);
    const wouldExceed = currentUsage + requestedAmount > limit;
    const isOverage = currentUsage > limit;

    return {
      allowed: !wouldExceed,
      currentUsage,
      limit,
      remaining,
      isOverage,
      overageAmount: isOverage ? currentUsage - limit : undefined,
    };
  }

  private async fetchUsageFromDb(
    organizationId: string,
    type: UsageType
  ): Promise<{ usage: number; limit: number }> {
    if (!this.db) {
      // Default fallback if no DB adapter
      return { usage: 0, limit: 100 };
    }

    const plan = await this.db.getOrganizationPlan(organizationId);
    if (!plan) {
      // No plan = free tier limits
      return {
        usage: 0,
        limit: type === 'calls' ? 10 : type === 'generations' ? 100 : 50,
      };
    }

    // Get effective limit (custom override or plan default)
    let limit: number;
    switch (type) {
      case 'calls':
        limit = plan.customCallLimit ?? plan.limits.monthlyCallLimit;
        break;
      case 'generations':
        limit = plan.customGenerationLimit ?? plan.limits.monthlyGenerationLimit;
        break;
      case 'tasks':
        limit = plan.customTaskLimit ?? plan.limits.monthlyTaskLimit;
        break;
    }

    // Get current usage from database
    const currentUsage = await this.db.getCurrentUsage(
      organizationId,
      plan.billingCycleStart
    );

    let usage: number;
    switch (type) {
      case 'calls':
        usage = currentUsage?.callsUsed ?? 0;
        break;
      case 'generations':
        usage = currentUsage?.generationsUsed ?? 0;
        break;
      case 'tasks':
        usage = currentUsage?.tasksUsed ?? 0;
        break;
    }

    return { usage, limit };
  }

  private persistUsageAsync(
    organizationId: string,
    type: UsageType,
    amount: number,
    isOverage: boolean
  ): void {
    // Fire and forget - don't block on database write
    if (!this.db) return;

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    this.db.incrementUsage(organizationId, periodStart, type, amount).catch((err) => {
      console.error(`Failed to persist usage for ${organizationId}:${type}:`, err);
    });

    if (isOverage) {
      this.db.recordOverage(organizationId, periodStart, type, amount).catch((err) => {
        console.error(`Failed to record overage for ${organizationId}:${type}:`, err);
      });
    }
  }
}

// =============================================================================
// Singleton Factory
// =============================================================================

let usageServiceInstance: PlanUsageService | null = null;

export function getPlanUsageService(config?: PlanUsageServiceConfig): PlanUsageService {
  if (!usageServiceInstance && config) {
    usageServiceInstance = new PlanUsageService(config);
  }
  if (!usageServiceInstance) {
    throw new Error('PlanUsageService not initialized. Call with config first.');
  }
  return usageServiceInstance;
}
