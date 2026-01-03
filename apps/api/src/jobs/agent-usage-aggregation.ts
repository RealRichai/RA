/**
 * Agent Usage Aggregation Job
 *
 * Aggregates Redis usage counters to database and checks budget thresholds.
 * Runs hourly to persist usage data and detect budget alerts.
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';

import type { JobDefinition } from './scheduler';

// =============================================================================
// Types
// =============================================================================

interface AggregationResult {
  organizationsProcessed: number;
  costAggregated: number;
  alertsTriggered: number;
  duration: number;
}

interface OrganizationUsage {
  organizationId: string;
  dailyCostCents: number;
  monthlyCostCents: number;
  runCount: number;
}

// =============================================================================
// Constants
// =============================================================================

const REDIS_DAILY_KEY_PREFIX = 'agent:cost:daily:';
const REDIS_MONTHLY_KEY_PREFIX = 'agent:cost:monthly:';
const REDIS_RUN_COUNT_PREFIX = 'agent:runs:count:';
const REDIS_ALERT_KEY_PREFIX = 'agent:budget:alert:';

// Store Redis connection
let redisClient: Redis | null = null;

// =============================================================================
// Agent Usage Aggregation Job
// =============================================================================

export class AgentUsageAggregationJob {
  /**
   * Get job definition for the scheduler.
   * Runs hourly to aggregate usage data.
   */
  static getDefinition(): JobDefinition {
    return {
      name: 'agent-usage-aggregation',
      handler: (job: Job) => AgentUsageAggregationJob.execute(job),
      cron: '0 * * * *', // Every hour at minute 0
      options: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: 24, // Keep last 24 runs
        removeOnFail: 48,
      },
    };
  }

  /**
   * Initialize with Redis connection.
   */
  static initializeRedis(redis: Redis): void {
    redisClient = redis;
  }

  /**
   * Execute the usage aggregation.
   */
  static async execute(job: Job): Promise<AggregationResult> {
    const startTime = Date.now();

    logger.info({ jobId: job.id }, 'Starting agent usage aggregation');

    if (!redisClient) {
      throw new Error('Redis client not initialized');
    }

    try {
      // Get all organizations with active usage
      const organizationIds = await AgentUsageAggregationJob.getActiveOrganizations();

      let totalCostAggregated = 0;
      let totalAlertsTriggered = 0;

      // Process each organization
      for (const orgId of organizationIds) {
        const usage = await AgentUsageAggregationJob.getOrganizationUsage(orgId);

        // Update database with current usage
        if (usage.dailyCostCents > 0 || usage.runCount > 0) {
          await AgentUsageAggregationJob.persistUsageToDatabase(usage);
          totalCostAggregated += usage.dailyCostCents;
        }

        // Check budget thresholds and trigger alerts
        const alertCount = await AgentUsageAggregationJob.checkBudgetThresholds(orgId, usage);
        totalAlertsTriggered += alertCount;
      }

      const result: AggregationResult = {
        organizationsProcessed: organizationIds.length,
        costAggregated: totalCostAggregated,
        alertsTriggered: totalAlertsTriggered,
        duration: Date.now() - startTime,
      };

      logger.info(
        {
          jobId: job.id,
          organizations: result.organizationsProcessed,
          costCents: result.costAggregated,
          alerts: result.alertsTriggered,
          duration: result.duration,
        },
        'Agent usage aggregation completed'
      );

      return result;
    } catch (error) {
      logger.error({ jobId: job.id, error }, 'Agent usage aggregation failed');
      throw error;
    }
  }

  /**
   * Get list of organizations with active usage in Redis.
   */
  static async getActiveOrganizations(): Promise<string[]> {
    if (!redisClient) return [];

    // Scan for all daily cost keys to find active organizations
    const organizations = new Set<string>();
    let cursor = '0';

    do {
      const [nextCursor, keys] = await redisClient.scan(
        cursor,
        'MATCH',
        `${REDIS_DAILY_KEY_PREFIX}*`,
        'COUNT',
        100
      );
      cursor = nextCursor;

      for (const key of keys) {
        // Extract organization ID from key: agent:cost:daily:{orgId}:{date}
        const parts = key.split(':');
        if (parts.length >= 4) {
          organizations.add(parts[3]!);
        }
      }
    } while (cursor !== '0');

    return Array.from(organizations);
  }

  /**
   * Get usage data for an organization from Redis.
   */
  static async getOrganizationUsage(organizationId: string): Promise<OrganizationUsage> {
    if (!redisClient) {
      return {
        organizationId,
        dailyCostCents: 0,
        monthlyCostCents: 0,
        runCount: 0,
      };
    }

    const today = new Date().toISOString().split('T')[0];
    const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const dailyKey = `${REDIS_DAILY_KEY_PREFIX}${organizationId}:${today}`;
    const monthlyKey = `${REDIS_MONTHLY_KEY_PREFIX}${organizationId}:${month}`;
    const runCountKey = `${REDIS_RUN_COUNT_PREFIX}${organizationId}:${today}`;

    const [dailyCost, monthlyCost, runCount] = await Promise.all([
      redisClient.get(dailyKey),
      redisClient.get(monthlyKey),
      redisClient.get(runCountKey),
    ]);

    return {
      organizationId,
      dailyCostCents: dailyCost ? parseFloat(dailyCost) : 0,
      monthlyCostCents: monthlyCost ? parseFloat(monthlyCost) : 0,
      runCount: runCount ? parseInt(runCount, 10) : 0,
    };
  }

  /**
   * Persist usage data to database for long-term storage and reporting.
   */
  static async persistUsageToDatabase(usage: OrganizationUsage): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get total tokens from recent runs
    const runStats = await prisma.agentRun.aggregate({
      where: {
        organizationId: usage.organizationId,
        startedAt: {
          gte: today,
        },
      },
      _sum: {
        tokensTotal: true,
      },
    });

    // Upsert to AIBudgetUsage table
    await prisma.aIBudgetUsage.upsert({
      where: {
        // Use composite key if available, otherwise find by org + date
        id: `usage_${usage.organizationId}_${today.toISOString().split('T')[0]}`,
      },
      create: {
        organizationId: usage.organizationId,
        date: today,
        totalCost: Math.round(usage.dailyCostCents),
        totalTokens: runStats._sum.tokensTotal || 0,
        requestCount: usage.runCount,
      },
      update: {
        totalCost: Math.round(usage.dailyCostCents),
        totalTokens: runStats._sum.tokensTotal || 0,
        requestCount: usage.runCount,
      },
    });
  }

  /**
   * Check budget thresholds and trigger alerts.
   */
  static async checkBudgetThresholds(
    organizationId: string,
    usage: OrganizationUsage
  ): Promise<number> {
    if (!redisClient) return 0;

    // Get budget configuration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const budget = await (prisma as any).agentBudget.findUnique({
      where: { organizationId },
    });

    if (!budget || !budget.isEnabled) {
      return 0;
    }

    const thresholds = budget.alertThresholds as number[];
    let alertCount = 0;

    // Check daily thresholds
    const dailyPercent = (usage.dailyCostCents / budget.dailyLimitCents) * 100;
    for (const threshold of thresholds) {
      if (dailyPercent >= threshold * 100) {
        const alertKey = `${REDIS_ALERT_KEY_PREFIX}${organizationId}:daily:${threshold}`;
        const alreadyAlerted = await redisClient.get(alertKey);

        if (!alreadyAlerted) {
          await AgentUsageAggregationJob.triggerBudgetAlert(
            organizationId,
            'daily',
            threshold,
            dailyPercent,
            usage.dailyCostCents,
            budget.dailyLimitCents
          );
          await redisClient.set(alertKey, '1', 'EX', 86400); // 24 hours
          alertCount++;
        }
      }
    }

    // Check monthly thresholds
    const monthlyPercent = (usage.monthlyCostCents / budget.monthlyLimitCents) * 100;
    for (const threshold of thresholds) {
      if (monthlyPercent >= threshold * 100) {
        const alertKey = `${REDIS_ALERT_KEY_PREFIX}${organizationId}:monthly:${threshold}`;
        const alreadyAlerted = await redisClient.get(alertKey);

        if (!alreadyAlerted) {
          await AgentUsageAggregationJob.triggerBudgetAlert(
            organizationId,
            'monthly',
            threshold,
            monthlyPercent,
            usage.monthlyCostCents,
            budget.monthlyLimitCents
          );
          await redisClient.set(alertKey, '1', 'EX', 86400 * 30); // 30 days
          alertCount++;
        }
      }
    }

    return alertCount;
  }

  /**
   * Trigger a budget alert (log and create notification).
   */
  static async triggerBudgetAlert(
    organizationId: string,
    periodType: 'daily' | 'monthly',
    threshold: number,
    percentUsed: number,
    currentCostCents: number,
    limitCents: number
  ): Promise<void> {
    const alertType = threshold >= 1.0 ? 'exceeded' : threshold >= 0.9 ? 'critical' : 'warning';

    const message = `${periodType.charAt(0).toUpperCase() + periodType.slice(1)} AI budget ${alertType}: ${percentUsed.toFixed(1)}% used ($${(currentCostCents / 100).toFixed(2)} of $${(limitCents / 100).toFixed(2)})`;

    logger.warn(
      {
        organizationId,
        alertType,
        periodType,
        threshold,
        percentUsed,
        currentCostUsd: currentCostCents / 100,
        limitUsd: limitCents / 100,
      },
      message
    );

    // Create notification for organization admins
    try {
      // Find organization admins
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admins = await (prisma as any).userOrganization.findMany({
        where: {
          organizationId,
          role: { in: ['owner', 'admin'] },
        },
        select: {
          userId: true,
        },
      });

      // Create notifications for each admin
      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            userId: admin.userId,
            type: 'BUDGET_ALERT',
            channel: 'in_app',
            title: `AI Budget ${alertType.charAt(0).toUpperCase() + alertType.slice(1)}`,
            body: message,
            data: {
              organizationId,
              alertType,
              periodType,
              threshold,
              percentUsed,
              currentCostCents,
              limitCents,
            },
          },
        });
      }
    } catch (error) {
      // Non-blocking - log error but don't fail the job
      logger.error({ organizationId, error }, 'Failed to create budget alert notification');
    }
  }

  /**
   * Run daily cleanup of old Redis keys.
   * Called at end of day to archive and clean up.
   */
  static async cleanupOldKeys(): Promise<number> {
    if (!redisClient) return 0;

    let cleanedCount = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Keep 7 days of detailed data
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    // Scan for old daily keys
    let cursor = '0';
    const keysToDelete: string[] = [];

    do {
      const [nextCursor, keys] = await redisClient.scan(
        cursor,
        'MATCH',
        `${REDIS_DAILY_KEY_PREFIX}*`,
        'COUNT',
        100
      );
      cursor = nextCursor;

      for (const key of keys) {
        // Check if key date is before cutoff
        const parts = key.split(':');
        const keyDate = parts[parts.length - 1];
        if (keyDate && keyDate < cutoffDateStr) {
          keysToDelete.push(key);
        }
      }
    } while (cursor !== '0');

    // Delete old keys in batches
    if (keysToDelete.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < keysToDelete.length; i += batchSize) {
        const batch = keysToDelete.slice(i, i + batchSize);
        await redisClient.del(...batch);
        cleanedCount += batch.length;
      }
    }

    logger.info({ cleanedCount }, 'Cleaned up old agent usage Redis keys');
    return cleanedCount;
  }
}
