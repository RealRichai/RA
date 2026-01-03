/**
 * Agent Usage Service
 *
 * Tracks agent usage, costs, and enforces budget limits.
 * Uses Redis for real-time counters and database for persistence.
 */

import type { Redis } from 'ioredis';

import type {
  AgentBudgetConfig,
  BudgetAlert,
  BudgetCheck,
  CostBreakdown,
  CostSummary,
  Period,
  TokenUsageSummary,
  UsageServiceConfig,
} from './types';
import {
  DEFAULT_USAGE_CONFIG,
  DEFAULT_TOKEN_COST_RATES,
  getDailyRedisKey,
  getMonthlyRedisKey,
  getTokenUsageRedisKey,
  getRunCountRedisKey,
  getBudgetAlertRedisKey,
  getPeriodRange,
} from './types';

// =============================================================================
// Database Adapter Interface
// =============================================================================

export interface UsageDatabaseAdapter {
  // Budget management
  getBudget(organizationId: string): Promise<AgentBudgetConfig | null>;
  upsertBudget(config: AgentBudgetConfig): Promise<AgentBudgetConfig>;

  // Usage aggregation (from AgentRun table)
  getCostSummary(organizationId: string, startDate: Date, endDate: Date): Promise<CostSummary>;
  getCostBreakdown(
    organizationId: string,
    groupBy: 'model' | 'agent_type' | 'day' | 'hour',
    startDate: Date,
    endDate: Date
  ): Promise<CostBreakdown[]>;

  // Daily usage (from AIBudgetUsage table)
  getDailyUsage(organizationId: string, date: Date): Promise<{
    totalCostCents: number;
    totalTokens: number;
    requestCount: number;
  } | null>;
  upsertDailyUsage(
    organizationId: string,
    date: Date,
    costCents: number,
    tokens: number,
    requests: number
  ): Promise<void>;

  // Monthly aggregation
  getMonthlyUsage(organizationId: string, year: number, month: number): Promise<{
    totalCostCents: number;
    totalTokens: number;
    requestCount: number;
  }>;
}

// =============================================================================
// Agent Usage Service
// =============================================================================

export class AgentUsageService {
  private config: UsageServiceConfig;

  constructor(
    private redis: Redis,
    private dbAdapter: UsageDatabaseAdapter,
    config?: Partial<UsageServiceConfig>
  ) {
    this.config = { ...DEFAULT_USAGE_CONFIG, ...config };
  }

  // ===========================================================================
  // Real-time Cost Tracking (Redis)
  // ===========================================================================

  /**
   * Increment cost counter for an organization.
   * Called after each agent run completes.
   */
  async incrementCost(organizationId: string, costCents: number): Promise<void> {
    const dailyKey = getDailyRedisKey(organizationId);
    const monthlyKey = getMonthlyRedisKey(organizationId);
    const runCountKey = getRunCountRedisKey(organizationId);

    const pipeline = this.redis.pipeline();
    pipeline.incrbyfloat(dailyKey, costCents);
    pipeline.expire(dailyKey, this.config.dailyKeyTtlSeconds);
    pipeline.incrbyfloat(monthlyKey, costCents);
    pipeline.expire(monthlyKey, this.config.monthlyKeyTtlSeconds);
    pipeline.incr(runCountKey);
    pipeline.expire(runCountKey, this.config.dailyKeyTtlSeconds);

    await pipeline.exec();
  }

  /**
   * Get current daily cost from Redis.
   */
  async getCurrentDailyCost(organizationId: string): Promise<number> {
    const key = getDailyRedisKey(organizationId);
    const value = await this.redis.get(key);
    return value ? parseFloat(value) : 0;
  }

  /**
   * Get current monthly cost from Redis.
   */
  async getCurrentMonthlyCost(organizationId: string): Promise<number> {
    const key = getMonthlyRedisKey(organizationId);
    const value = await this.redis.get(key);
    return value ? parseFloat(value) : 0;
  }

  /**
   * Get current daily run count.
   */
  async getCurrentDailyRunCount(organizationId: string): Promise<number> {
    const key = getRunCountRedisKey(organizationId);
    const value = await this.redis.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  // ===========================================================================
  // Token Tracking
  // ===========================================================================

  /**
   * Record token usage for a specific model.
   */
  async recordTokenUsage(
    organizationId: string,
    model: string,
    tokensIn: number,
    tokensOut: number
  ): Promise<void> {
    const key = getTokenUsageRedisKey(organizationId, model);
    const data = JSON.stringify({ tokensIn, tokensOut, timestamp: Date.now() });

    await this.redis.lpush(key, data);
    await this.redis.ltrim(key, 0, 9999); // Keep last 10K entries
    await this.redis.expire(key, this.config.dailyKeyTtlSeconds);
  }

  /**
   * Calculate cost for tokens based on model.
   */
  calculateTokenCost(model: string, tokensIn: number, tokensOut: number): number {
    const defaultRates = { input: 1, output: 3 }; // Fallback rates
    const rates = this.config.tokenCostRates[model] ?? DEFAULT_TOKEN_COST_RATES['default'] ?? defaultRates;
    // Cost per 1K tokens in cents
    const inputCost = (tokensIn / 1000) * rates.input;
    const outputCost = (tokensOut / 1000) * rates.output;
    return Math.round((inputCost + outputCost) * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Get token usage summary for a period.
   */
  async getTokenUsage(organizationId: string, period: Period): Promise<TokenUsageSummary> {
    const { start, end } = getPeriodRange(period);
    const summary = await this.dbAdapter.getCostSummary(organizationId, start, end);

    return {
      organizationId,
      period,
      totalTokensIn: summary.totalTokensIn,
      totalTokensOut: summary.totalTokensOut,
      totalCostCents: summary.totalCostCents,
      byModel: Object.entries(summary.byModel).map(([model, data]) => ({
        model,
        tokensIn: data.tokensIn,
        tokensOut: data.tokensOut,
        costCents: data.totalCostCents,
      })),
    };
  }

  // ===========================================================================
  // Budget Enforcement
  // ===========================================================================

  /**
   * Get or create budget config for an organization.
   */
  async getBudgetConfig(organizationId: string): Promise<AgentBudgetConfig> {
    const existing = await this.dbAdapter.getBudget(organizationId);
    if (existing) return existing;

    // Return default config (not persisted until explicitly set)
    return {
      organizationId,
      dailyLimitCents: this.config.defaultDailyBudgetCents,
      monthlyLimitCents: this.config.defaultMonthlyBudgetCents,
      alertThresholds: [this.config.warningThreshold, this.config.criticalThreshold, 1.0],
      isEnabled: true,
    };
  }

  /**
   * Set budget config for an organization.
   */
  async setBudgetConfig(config: AgentBudgetConfig): Promise<AgentBudgetConfig> {
    return this.dbAdapter.upsertBudget(config);
  }

  /**
   * Check if daily budget allows more usage.
   */
  async checkDailyBudget(organizationId: string): Promise<BudgetCheck> {
    const config = await this.getBudgetConfig(organizationId);

    if (!config.isEnabled) {
      return {
        allowed: true,
        currentCostCents: 0,
        budgetLimitCents: -1, // Unlimited
        remainingCents: -1,
        percentUsed: 0,
        periodType: 'daily',
      };
    }

    const currentCost = await this.getCurrentDailyCost(organizationId);
    const remaining = Math.max(0, config.dailyLimitCents - currentCost);
    const percentUsed = config.dailyLimitCents > 0 ? (currentCost / config.dailyLimitCents) * 100 : 0;

    return {
      allowed: currentCost < config.dailyLimitCents,
      currentCostCents: currentCost,
      budgetLimitCents: config.dailyLimitCents,
      remainingCents: remaining,
      percentUsed,
      periodType: 'daily',
    };
  }

  /**
   * Check if monthly budget allows more usage.
   */
  async checkMonthlyBudget(organizationId: string): Promise<BudgetCheck> {
    const config = await this.getBudgetConfig(organizationId);

    if (!config.isEnabled) {
      return {
        allowed: true,
        currentCostCents: 0,
        budgetLimitCents: -1,
        remainingCents: -1,
        percentUsed: 0,
        periodType: 'monthly',
      };
    }

    const currentCost = await this.getCurrentMonthlyCost(organizationId);
    const remaining = Math.max(0, config.monthlyLimitCents - currentCost);
    const percentUsed = config.monthlyLimitCents > 0 ? (currentCost / config.monthlyLimitCents) * 100 : 0;

    return {
      allowed: currentCost < config.monthlyLimitCents,
      currentCostCents: currentCost,
      budgetLimitCents: config.monthlyLimitCents,
      remainingCents: remaining,
      percentUsed,
      periodType: 'monthly',
    };
  }

  /**
   * Check both daily and monthly budgets.
   */
  async checkBudget(organizationId: string): Promise<{ daily: BudgetCheck; monthly: BudgetCheck }> {
    const [daily, monthly] = await Promise.all([
      this.checkDailyBudget(organizationId),
      this.checkMonthlyBudget(organizationId),
    ]);
    return { daily, monthly };
  }

  // ===========================================================================
  // Budget Alerts
  // ===========================================================================

  /**
   * Check budget thresholds and return any triggered alerts.
   * Uses Redis to avoid duplicate alerts within the same period.
   */
  async checkBudgetThresholds(organizationId: string): Promise<BudgetAlert[]> {
    const config = await this.getBudgetConfig(organizationId);
    if (!config.isEnabled) return [];

    const alerts: BudgetAlert[] = [];
    const now = new Date();

    // Check daily thresholds
    const dailyCheck = await this.checkDailyBudget(organizationId);
    for (const threshold of config.alertThresholds) {
      if (dailyCheck.percentUsed >= threshold * 100) {
        const alertKey = getBudgetAlertRedisKey(organizationId, threshold, 'daily');
        const alreadyAlerted = await this.redis.get(alertKey);

        if (!alreadyAlerted) {
          const alertType = threshold >= 1.0 ? 'exceeded' : threshold >= 0.9 ? 'critical' : 'warning';
          alerts.push({
            type: alertType,
            threshold,
            currentPercent: dailyCheck.percentUsed,
            periodType: 'daily',
            message: `Daily agent budget ${alertType}: ${dailyCheck.percentUsed.toFixed(1)}% used ($${(dailyCheck.currentCostCents / 100).toFixed(2)} of $${(dailyCheck.budgetLimitCents / 100).toFixed(2)})`,
            triggeredAt: now,
          });

          // Mark as alerted for today
          await this.redis.set(alertKey, '1', 'EX', 86400);
        }
      }
    }

    // Check monthly thresholds
    const monthlyCheck = await this.checkMonthlyBudget(organizationId);
    for (const threshold of config.alertThresholds) {
      if (monthlyCheck.percentUsed >= threshold * 100) {
        const alertKey = getBudgetAlertRedisKey(organizationId, threshold, 'monthly');
        const alreadyAlerted = await this.redis.get(alertKey);

        if (!alreadyAlerted) {
          const alertType = threshold >= 1.0 ? 'exceeded' : threshold >= 0.9 ? 'critical' : 'warning';
          alerts.push({
            type: alertType,
            threshold,
            currentPercent: monthlyCheck.percentUsed,
            periodType: 'monthly',
            message: `Monthly agent budget ${alertType}: ${monthlyCheck.percentUsed.toFixed(1)}% used ($${(monthlyCheck.currentCostCents / 100).toFixed(2)} of $${(monthlyCheck.budgetLimitCents / 100).toFixed(2)})`,
            triggeredAt: now,
          });

          // Mark as alerted for this month (30 days)
          await this.redis.set(alertKey, '1', 'EX', 86400 * 30);
        }
      }
    }

    return alerts;
  }

  // ===========================================================================
  // Cost Breakdown & Reporting
  // ===========================================================================

  /**
   * Get cost summary for a period.
   */
  async getCostSummary(
    organizationId: string,
    period: Period,
    customStart?: Date,
    customEnd?: Date
  ): Promise<CostSummary> {
    const { start, end } = getPeriodRange(period, customStart, customEnd);
    return this.dbAdapter.getCostSummary(organizationId, start, end);
  }

  /**
   * Get cost breakdown by dimension.
   */
  async getCostBreakdown(
    organizationId: string,
    groupBy: 'model' | 'agent_type' | 'day' | 'hour',
    period: Period,
    customStart?: Date,
    customEnd?: Date
  ): Promise<CostBreakdown[]> {
    const { start, end } = getPeriodRange(period, customStart, customEnd);
    return this.dbAdapter.getCostBreakdown(organizationId, groupBy, start, end);
  }

  // ===========================================================================
  // Period Reset
  // ===========================================================================

  /**
   * Reset daily counters (called at midnight or manually).
   */
  async resetDailyCounters(organizationId: string): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Persist yesterday's data to database before clearing
    const dailyCost = await this.getCurrentDailyCost(organizationId);
    const dailyRuns = await this.getCurrentDailyRunCount(organizationId);

    if (dailyCost > 0 || dailyRuns > 0) {
      await this.dbAdapter.upsertDailyUsage(
        organizationId,
        yesterday,
        dailyCost,
        0, // tokens would need separate tracking
        dailyRuns
      );
    }

    // Clear daily alert flags
    const config = await this.getBudgetConfig(organizationId);
    for (const threshold of config.alertThresholds) {
      const alertKey = getBudgetAlertRedisKey(organizationId, threshold, 'daily');
      await this.redis.del(alertKey);
    }
  }

  /**
   * Get usage status for dashboard display.
   */
  async getUsageStatus(organizationId: string): Promise<{
    daily: BudgetCheck;
    monthly: BudgetCheck;
    config: AgentBudgetConfig;
    runCount: number;
  }> {
    const [daily, monthly, config, runCount] = await Promise.all([
      this.checkDailyBudget(organizationId),
      this.checkMonthlyBudget(organizationId),
      this.getBudgetConfig(organizationId),
      this.getCurrentDailyRunCount(organizationId),
    ]);

    return { daily, monthly, config, runCount };
  }
}
