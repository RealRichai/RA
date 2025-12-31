/**
 * Partner Health Monitoring Job
 *
 * Monitors partner API availability and health.
 * Stores metrics and alerts on status changes.
 */

import { prisma } from '@realriches/database';
import { getProviderRegistry } from '@realriches/revenue-engine';
import type { PartnerProvider } from '@realriches/revenue-engine';
import { logger } from '@realriches/utils';
import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';

import type { JobDefinition } from './scheduler';

// =============================================================================
// Types
// =============================================================================

interface HealthCheckResult {
  provider: PartnerProvider;
  available: boolean;
  credentialsValid: boolean;
  responseTimeMs: number;
  error?: string;
  timestamp: Date;
}

interface ProviderHealthStatus {
  provider: PartnerProvider;
  status: 'healthy' | 'degraded' | 'down';
  lastCheck: string;
  lastHealthy: string | null;
  consecutiveFailures: number;
  avgResponseTimeMs: number;
  uptimePercent: number;
}

// =============================================================================
// Constants
// =============================================================================

const HEALTH_KEY_PREFIX = 'partner:health:';
const HEALTH_HISTORY_KEY = 'partner:health:history';
const CONSECUTIVE_FAILURES_ALERT = 3;
const RESPONSE_TIME_DEGRADED_MS = 5000;

// Store Redis connection
let redisClient: Redis | null = null;

// =============================================================================
// Partner Health Job
// =============================================================================

export class PartnerHealthJob {
  /**
   * Get job definition for the scheduler.
   * Runs every 15 minutes.
   */
  static getDefinition(): JobDefinition {
    return {
      name: 'partner-health',
      handler: (job: Job) => PartnerHealthJob.execute(job),
      cron: '*/15 * * * *', // Every 15 minutes
      options: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 30000 },
        removeOnComplete: 50,
        removeOnFail: 100,
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
   * Execute health check for all partners.
   */
  static async execute(job: Job): Promise<void> {
    const startTime = Date.now();
    const results: HealthCheckResult[] = [];

    logger.info({ jobId: job.id }, 'Starting partner health check');

    try {
      const registry = getProviderRegistry();
      const providers = registry.getAllProviders();

      // Check each provider in parallel
      const checks = Array.from(providers.entries()).map(async ([providerId, provider]) => {
        const checkStart = Date.now();
        let available = false;
        let credentialsValid = false;
        let error: string | undefined;

        try {
          available = await provider.isAvailable();
          if (available) {
            credentialsValid = await provider.validateCredentials();
          }
        } catch (err) {
          error = (err as Error).message;
        }

        const result: HealthCheckResult = {
          provider: providerId,
          available,
          credentialsValid,
          responseTimeMs: Date.now() - checkStart,
          error,
          timestamp: new Date(),
        };

        results.push(result);
        return result;
      });

      await Promise.all(checks);

      // Process results
      for (const result of results) {
        await PartnerHealthJob.processHealthResult(result);
      }

      // Log summary
      const healthy = results.filter((r) => r.available && r.credentialsValid).length;
      const degraded = results.filter(
        (r) => r.available && !r.credentialsValid
      ).length;
      const down = results.filter((r) => !r.available).length;

      logger.info(
        {
          jobId: job.id,
          duration: Date.now() - startTime,
          total: results.length,
          healthy,
          degraded,
          down,
        },
        'Partner health check completed'
      );
    } catch (error) {
      logger.error({ jobId: job.id, error }, 'Partner health check failed');
      throw error;
    }
  }

  /**
   * Process a single health check result.
   */
  private static async processHealthResult(result: HealthCheckResult): Promise<void> {
    if (!redisClient) {
      logger.warn('Redis not initialized for health check');
      return;
    }

    const key = `${HEALTH_KEY_PREFIX}${result.provider}`;
    const prevStatusStr = await redisClient.get(key);
    const prevStatus: ProviderHealthStatus | null = prevStatusStr
      ? JSON.parse(prevStatusStr)
      : null;

    // Determine new status
    let status: 'healthy' | 'degraded' | 'down';
    if (!result.available) {
      status = 'down';
    } else if (!result.credentialsValid || result.responseTimeMs > RESPONSE_TIME_DEGRADED_MS) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    // Calculate metrics
    const consecutiveFailures =
      status === 'down'
        ? (prevStatus?.consecutiveFailures || 0) + 1
        : 0;

    const lastHealthy =
      status === 'healthy'
        ? result.timestamp.toISOString()
        : prevStatus?.lastHealthy || null;

    // Calculate rolling average response time (weighted)
    const avgResponseTimeMs = prevStatus
      ? Math.round(prevStatus.avgResponseTimeMs * 0.7 + result.responseTimeMs * 0.3)
      : result.responseTimeMs;

    // Calculate uptime (simple: based on last 96 checks = 24 hours at 15 min intervals)
    const historyKey = `${key}:history`;
    await redisClient.lpush(historyKey, status === 'healthy' ? '1' : '0');
    await redisClient.ltrim(historyKey, 0, 95);
    const history = await redisClient.lrange(historyKey, 0, 95);
    const healthyCount = history.filter((h) => h === '1').length;
    const uptimePercent = Math.round((healthyCount / Math.max(history.length, 1)) * 100);

    // Create new status
    const newStatus: ProviderHealthStatus = {
      provider: result.provider,
      status,
      lastCheck: result.timestamp.toISOString(),
      lastHealthy,
      consecutiveFailures,
      avgResponseTimeMs,
      uptimePercent,
    };

    // Store status
    await redisClient.set(key, JSON.stringify(newStatus));

    // Store in history for reporting
    await redisClient.zadd(
      HEALTH_HISTORY_KEY,
      result.timestamp.getTime(),
      JSON.stringify({
        ...result,
        status,
      })
    );

    // Trim history to last 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    await redisClient.zremrangebyscore(HEALTH_HISTORY_KEY, '-inf', sevenDaysAgo);

    // Check for status changes and alert
    if (prevStatus && prevStatus.status !== status) {
      await PartnerHealthJob.handleStatusChange(result.provider, prevStatus.status, status, result.error);
    }

    // Alert on consecutive failures
    if (consecutiveFailures === CONSECUTIVE_FAILURES_ALERT) {
      await PartnerHealthJob.alertConsecutiveFailures(result.provider, consecutiveFailures, result.error);
    }

    logger.debug(
      {
        provider: result.provider,
        status,
        responseTimeMs: result.responseTimeMs,
        uptimePercent,
      },
      'Health check recorded'
    );
  }

  /**
   * Handle status change notification.
   */
  private static async handleStatusChange(
    provider: PartnerProvider,
    oldStatus: string,
    newStatus: string,
    error?: string
  ): Promise<void> {
    logger.warn(
      { provider, oldStatus, newStatus, error },
      'Partner status changed'
    );

    // Find admin users to notify
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ['admin', 'super_admin'] },
        status: 'active',
      },
      select: { id: true, email: true },
      take: 10,
    });

    // Create notifications for admins
    const isRecovery = newStatus === 'healthy';
    const title = isRecovery
      ? `Partner recovered: ${provider}`
      : `Partner ${newStatus}: ${provider}`;
    const body = isRecovery
      ? `The ${provider} partner integration has recovered and is now healthy.`
      : `The ${provider} partner integration is ${newStatus}. ${error || 'Please investigate.'}`;

    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: isRecovery ? 'partner_recovered' : 'partner_outage',
          channel: 'in_app',
          title,
          body,
          data: {
            provider,
            oldStatus,
            newStatus,
            error,
            timestamp: new Date().toISOString(),
            priority: isRecovery ? 'normal' : 'high',
          },
          status: 'sent',
        },
      });
    }
  }

  /**
   * Alert on consecutive failures.
   */
  private static async alertConsecutiveFailures(
    provider: PartnerProvider,
    failures: number,
    error?: string
  ): Promise<void> {
    logger.error(
      { provider, failures, error },
      'Partner consecutive failures threshold reached'
    );

    // Find admin users to notify
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ['admin', 'super_admin'] },
        status: 'active',
      },
      select: { id: true },
      take: 10,
    });

    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: 'partner_critical',
          channel: 'in_app',
          title: `CRITICAL: ${provider} down for ${failures} checks`,
          body: `The ${provider} partner integration has failed ${failures} consecutive health checks. Error: ${error || 'Unknown'}. Immediate attention required.`,
          data: {
            provider,
            consecutiveFailures: failures,
            error,
            timestamp: new Date().toISOString(),
            priority: 'critical',
          },
          status: 'sent',
        },
      });
    }
  }

  /**
   * Get current health status for all partners.
   */
  static async getAllHealthStatus(): Promise<ProviderHealthStatus[]> {
    if (!redisClient) return [];

    const keys = await redisClient.keys(`${HEALTH_KEY_PREFIX}*`);
    const statuses: ProviderHealthStatus[] = [];

    for (const key of keys) {
      // Skip history keys
      if (key.includes(':history')) continue;

      const statusStr = await redisClient.get(key);
      if (statusStr) {
        statuses.push(JSON.parse(statusStr));
      }
    }

    return statuses.sort((a, b) => a.provider.localeCompare(b.provider));
  }

  /**
   * Get health status for a specific partner.
   */
  static async getHealthStatus(provider: PartnerProvider): Promise<ProviderHealthStatus | null> {
    if (!redisClient) return null;

    const key = `${HEALTH_KEY_PREFIX}${provider}`;
    const statusStr = await redisClient.get(key);

    return statusStr ? JSON.parse(statusStr) : null;
  }

  /**
   * Get health history for reporting.
   */
  static async getHealthHistory(
    startTime: Date,
    endTime: Date = new Date()
  ): Promise<HealthCheckResult[]> {
    if (!redisClient) return [];

    const results = await redisClient.zrangebyscore(
      HEALTH_HISTORY_KEY,
      startTime.getTime(),
      endTime.getTime()
    );

    return results.map((r) => JSON.parse(r));
  }
}
