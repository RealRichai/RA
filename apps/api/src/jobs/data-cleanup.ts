/**
 * Data Cleanup Job
 *
 * Purges expired and stale data from the database and Redis.
 * Runs daily at 3 AM to minimize impact on production traffic.
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';

import type { JobDefinition } from './scheduler';
import { WebhookRetryJob } from './webhook-retry';

// =============================================================================
// Types
// =============================================================================

interface CleanupResult {
  table: string;
  deleted: number;
  duration: number;
}

interface CleanupSummary {
  totalDeleted: number;
  totalDuration: number;
  results: CleanupResult[];
  errors: Array<{ table: string; error: string }>;
}

// =============================================================================
// Configuration
// =============================================================================

const CLEANUP_CONFIG = {
  // Sessions: expired
  sessions: {
    enabled: true,
    // Delete sessions that expired
  },
  // RefreshTokens: expired or revoked > 7 days ago
  refreshTokens: {
    enabled: true,
    revokedRetentionDays: 7,
  },
  // Notifications: read > 30 days, unread > 90 days
  notifications: {
    enabled: true,
    readRetentionDays: 30,
    unreadRetentionDays: 90,
  },
  // AuditLogs: older than 90 days (configurable)
  auditLogs: {
    enabled: true,
    retentionDays: 90,
  },
  // AI Conversations: ended > 30 days
  aiConversations: {
    enabled: true,
    endedRetentionDays: 30,
  },
  // AI Contexts: expired
  aiContexts: {
    enabled: true,
  },
  // JobRecords: completed/failed > 7 days
  jobRecords: {
    enabled: true,
    retentionDays: 7,
  },
  // ProcessedWebhooks: older than 30 days
  processedWebhooks: {
    enabled: true,
    retentionDays: 30,
  },
  // Webhook DLQ (Redis): older than 7 days
  webhookDLQ: {
    enabled: true,
    retentionDays: 7,
  },
  // Expired listings: archived > 90 days
  expiredListings: {
    enabled: true,
    archivedRetentionDays: 90,
  },
};

// Store Redis connection
let redisClient: Redis | null = null;

// =============================================================================
// Data Cleanup Job
// =============================================================================

export class DataCleanupJob {
  /**
   * Get job definition for the scheduler.
   * Runs daily at 3 AM.
   */
  static getDefinition(): JobDefinition {
    return {
      name: 'data-cleanup',
      handler: (job: Job) => DataCleanupJob.execute(job),
      cron: '0 3 * * *', // Daily at 3 AM
      options: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 300000 }, // 5 min retry
        removeOnComplete: 30,
        removeOnFail: 60,
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
   * Execute the data cleanup.
   */
  static async execute(job: Job): Promise<CleanupSummary> {
    const startTime = Date.now();
    const results: CleanupResult[] = [];
    const errors: Array<{ table: string; error: string }> = [];

    logger.info({ jobId: job.id }, 'Starting data cleanup');

    // Run each cleanup task
    const tasks = [
      { name: 'sessions', fn: () => DataCleanupJob.cleanupSessions() },
      { name: 'refreshTokens', fn: () => DataCleanupJob.cleanupRefreshTokens() },
      { name: 'notifications', fn: () => DataCleanupJob.cleanupNotifications() },
      { name: 'auditLogs', fn: () => DataCleanupJob.cleanupAuditLogs() },
      { name: 'aiConversations', fn: () => DataCleanupJob.cleanupAIConversations() },
      { name: 'aiContexts', fn: () => DataCleanupJob.cleanupAIContexts() },
      { name: 'jobRecords', fn: () => DataCleanupJob.cleanupJobRecords() },
      { name: 'processedWebhooks', fn: () => DataCleanupJob.cleanupProcessedWebhooks() },
      { name: 'webhookDLQ', fn: () => DataCleanupJob.cleanupWebhookDLQ() },
      { name: 'expiredListings', fn: () => DataCleanupJob.cleanupExpiredListings() },
    ];

    for (const task of tasks) {
      const config = CLEANUP_CONFIG[task.name as keyof typeof CLEANUP_CONFIG];
      if (!config?.enabled) {
        continue;
      }

      try {
        const taskStart = Date.now();
        const deleted = await task.fn();
        results.push({
          table: task.name,
          deleted,
          duration: Date.now() - taskStart,
        });

        if (deleted > 0) {
          logger.info(
            { table: task.name, deleted, duration: Date.now() - taskStart },
            'Cleanup completed for table'
          );
        }
      } catch (error) {
        const err = error as Error;
        errors.push({ table: task.name, error: err.message });
        logger.error({ table: task.name, error: err.message }, 'Cleanup failed for table');
      }
    }

    const summary: CleanupSummary = {
      totalDeleted: results.reduce((sum, r) => sum + r.deleted, 0),
      totalDuration: Date.now() - startTime,
      results,
      errors,
    };

    logger.info(
      {
        jobId: job.id,
        totalDeleted: summary.totalDeleted,
        totalDuration: summary.totalDuration,
        tablesProcessed: results.length,
        errorsCount: errors.length,
      },
      'Data cleanup completed'
    );

    // Create admin notification if significant cleanup or errors
    if (summary.totalDeleted > 1000 || errors.length > 0) {
      await DataCleanupJob.notifyAdmins(summary);
    }

    return summary;
  }

  // ===========================================================================
  // Cleanup Tasks
  // ===========================================================================

  /**
   * Delete expired sessions.
   */
  private static async cleanupSessions(): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { isValid: false, updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        ],
      },
    });
    return result.count;
  }

  /**
   * Delete expired or old revoked refresh tokens.
   */
  private static async cleanupRefreshTokens(): Promise<number> {
    const config = CLEANUP_CONFIG.refreshTokens;
    const revokedCutoff = new Date(Date.now() - config.revokedRetentionDays * 24 * 60 * 60 * 1000);

    const result = await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revoked: true, revokedAt: { lt: revokedCutoff } },
        ],
      },
    });
    return result.count;
  }

  /**
   * Delete old notifications.
   */
  private static async cleanupNotifications(): Promise<number> {
    const config = CLEANUP_CONFIG.notifications;
    const readCutoff = new Date(Date.now() - config.readRetentionDays * 24 * 60 * 60 * 1000);
    const unreadCutoff = new Date(Date.now() - config.unreadRetentionDays * 24 * 60 * 60 * 1000);

    const result = await prisma.notification.deleteMany({
      where: {
        OR: [
          // Read notifications older than 30 days
          { readAt: { not: null, lt: readCutoff } },
          // Unread notifications older than 90 days
          { readAt: null, createdAt: { lt: unreadCutoff } },
          // Expired notifications
          { expiresAt: { lt: new Date() } },
        ],
      },
    });
    return result.count;
  }

  /**
   * Delete old audit logs.
   */
  private static async cleanupAuditLogs(): Promise<number> {
    const config = CLEANUP_CONFIG.auditLogs;
    const cutoff = new Date(Date.now() - config.retentionDays * 24 * 60 * 60 * 1000);

    const result = await prisma.auditLog.deleteMany({
      where: {
        timestamp: { lt: cutoff },
      },
    });
    return result.count;
  }

  /**
   * Delete old ended AI conversations and their messages.
   */
  private static async cleanupAIConversations(): Promise<number> {
    const config = CLEANUP_CONFIG.aiConversations;
    const cutoff = new Date(Date.now() - config.endedRetentionDays * 24 * 60 * 60 * 1000);

    // Messages cascade delete with conversations
    const result = await prisma.aIConversation.deleteMany({
      where: {
        status: 'ended',
        endedAt: { lt: cutoff },
      },
    });
    return result.count;
  }

  /**
   * Delete expired AI contexts.
   */
  private static async cleanupAIContexts(): Promise<number> {
    const result = await prisma.aIContext.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  }

  /**
   * Delete old completed/failed job records.
   */
  private static async cleanupJobRecords(): Promise<number> {
    const config = CLEANUP_CONFIG.jobRecords;
    const cutoff = new Date(Date.now() - config.retentionDays * 24 * 60 * 60 * 1000);

    const result = await prisma.jobRecord.deleteMany({
      where: {
        status: { in: ['completed', 'failed'] },
        updatedAt: { lt: cutoff },
      },
    });
    return result.count;
  }

  /**
   * Delete old processed webhooks.
   */
  private static async cleanupProcessedWebhooks(): Promise<number> {
    const config = CLEANUP_CONFIG.processedWebhooks;
    const cutoff = new Date(Date.now() - config.retentionDays * 24 * 60 * 60 * 1000);

    const result = await prisma.processedWebhook.deleteMany({
      where: {
        processedAt: { lt: cutoff },
      },
    });
    return result.count;
  }

  /**
   * Purge old webhook DLQ entries from Redis.
   */
  private static async cleanupWebhookDLQ(): Promise<number> {
    const config = CLEANUP_CONFIG.webhookDLQ;
    return await WebhookRetryJob.purgeOldData(config.retentionDays);
  }

  /**
   * Delete old archived listings.
   */
  private static async cleanupExpiredListings(): Promise<number> {
    const config = CLEANUP_CONFIG.expiredListings;
    const cutoff = new Date(Date.now() - config.archivedRetentionDays * 24 * 60 * 60 * 1000);

    // Only delete truly stale listings - archived and not updated for 90+ days
    const result = await prisma.listing.deleteMany({
      where: {
        status: 'archived',
        updatedAt: { lt: cutoff },
      },
    });
    return result.count;
  }

  // ===========================================================================
  // Admin Notifications
  // ===========================================================================

  /**
   * Notify admins of significant cleanup operations.
   */
  private static async notifyAdmins(summary: CleanupSummary): Promise<void> {
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ['admin', 'super_admin'] },
        status: 'active',
      },
      select: { id: true },
      take: 5,
    });

    const hasErrors = summary.errors.length > 0;
    const title = hasErrors
      ? `Data cleanup completed with ${summary.errors.length} errors`
      : `Data cleanup: ${summary.totalDeleted.toLocaleString()} records purged`;

    const detailLines = summary.results
      .filter((r) => r.deleted > 0)
      .map((r) => `- ${r.table}: ${r.deleted.toLocaleString()} records`)
      .join('\n');

    const errorLines = summary.errors.map((e) => `- ${e.table}: ${e.error}`).join('\n');

    const body = hasErrors
      ? `Cleanup completed in ${(summary.totalDuration / 1000).toFixed(1)}s.\n\n${detailLines}\n\nErrors:\n${errorLines}`
      : `Cleanup completed in ${(summary.totalDuration / 1000).toFixed(1)}s.\n\n${detailLines}`;

    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: hasErrors ? 'cleanup_warning' : 'cleanup_report',
          channel: 'in_app',
          title,
          body,
          data: {
            totalDeleted: summary.totalDeleted,
            totalDuration: summary.totalDuration,
            results: summary.results,
            errors: summary.errors,
            priority: hasErrors ? 'high' : 'low',
          },
          status: 'sent',
        },
      });
    }
  }

  // ===========================================================================
  // Manual Cleanup API
  // ===========================================================================

  /**
   * Get cleanup statistics without deleting.
   */
  static async getCleanupStats(): Promise<{
    sessions: number;
    refreshTokens: number;
    notifications: number;
    auditLogs: number;
    aiConversations: number;
    aiContexts: number;
    jobRecords: number;
    processedWebhooks: number;
  }> {
    const config = CLEANUP_CONFIG;

    const [
      sessions,
      refreshTokens,
      notifications,
      auditLogs,
      aiConversations,
      aiContexts,
      jobRecords,
      processedWebhooks,
    ] = await Promise.all([
      // Sessions
      prisma.session.count({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { isValid: false, updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          ],
        },
      }),
      // RefreshTokens
      prisma.refreshToken.count({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            {
              revoked: true,
              revokedAt: {
                lt: new Date(Date.now() - config.refreshTokens.revokedRetentionDays * 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      }),
      // Notifications
      prisma.notification.count({
        where: {
          OR: [
            {
              readAt: {
                not: null,
                lt: new Date(Date.now() - config.notifications.readRetentionDays * 24 * 60 * 60 * 1000),
              },
            },
            {
              readAt: null,
              createdAt: {
                lt: new Date(Date.now() - config.notifications.unreadRetentionDays * 24 * 60 * 60 * 1000),
              },
            },
            { expiresAt: { lt: new Date() } },
          ],
        },
      }),
      // AuditLogs
      prisma.auditLog.count({
        where: {
          timestamp: {
            lt: new Date(Date.now() - config.auditLogs.retentionDays * 24 * 60 * 60 * 1000),
          },
        },
      }),
      // AI Conversations
      prisma.aIConversation.count({
        where: {
          status: 'ended',
          endedAt: {
            lt: new Date(Date.now() - config.aiConversations.endedRetentionDays * 24 * 60 * 60 * 1000),
          },
        },
      }),
      // AI Contexts
      prisma.aIContext.count({
        where: {
          expiresAt: { lt: new Date() },
        },
      }),
      // JobRecords
      prisma.jobRecord.count({
        where: {
          status: { in: ['completed', 'failed'] },
          updatedAt: {
            lt: new Date(Date.now() - config.jobRecords.retentionDays * 24 * 60 * 60 * 1000),
          },
        },
      }),
      // ProcessedWebhooks
      prisma.processedWebhook.count({
        where: {
          processedAt: {
            lt: new Date(Date.now() - config.processedWebhooks.retentionDays * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      sessions,
      refreshTokens,
      notifications,
      auditLogs,
      aiConversations,
      aiContexts,
      jobRecords,
      processedWebhooks,
    };
  }

  /**
   * Run cleanup for a specific table manually.
   */
  static async cleanupTable(
    table: keyof typeof CLEANUP_CONFIG
  ): Promise<{ deleted: number; duration: number }> {
    const startTime = Date.now();

    const taskMap: Record<string, () => Promise<number>> = {
      sessions: () => DataCleanupJob.cleanupSessions(),
      refreshTokens: () => DataCleanupJob.cleanupRefreshTokens(),
      notifications: () => DataCleanupJob.cleanupNotifications(),
      auditLogs: () => DataCleanupJob.cleanupAuditLogs(),
      aiConversations: () => DataCleanupJob.cleanupAIConversations(),
      aiContexts: () => DataCleanupJob.cleanupAIContexts(),
      jobRecords: () => DataCleanupJob.cleanupJobRecords(),
      processedWebhooks: () => DataCleanupJob.cleanupProcessedWebhooks(),
      webhookDLQ: () => DataCleanupJob.cleanupWebhookDLQ(),
      expiredListings: () => DataCleanupJob.cleanupExpiredListings(),
    };

    const task = taskMap[table];
    if (!task) {
      throw new Error(`Unknown table: ${table}`);
    }

    const deleted = await task();
    return {
      deleted,
      duration: Date.now() - startTime,
    };
  }
}
