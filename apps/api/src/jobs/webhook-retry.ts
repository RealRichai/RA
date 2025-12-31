/**
 * Webhook Retry Job
 *
 * Handles retry logic for failed outgoing webhook deliveries.
 * Uses exponential backoff with configurable max attempts.
 */

import { createHmac } from 'crypto';

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';

import type { JobDefinition } from './scheduler';

// =============================================================================
// Types
// =============================================================================

export interface WebhookDelivery {
  id: string;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  payload: Record<string, unknown>;
  secret?: string;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: Date;
  createdAt: Date;
  lastAttemptAt?: Date;
  lastError?: string;
  lastStatusCode?: number;
  entityType?: string;
  entityId?: string;
  eventType: string;
  source: string;
}

interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  responseBody?: string;
  responseTimeMs: number;
}

// =============================================================================
// Constants
// =============================================================================

const WEBHOOK_QUEUE_KEY = 'webhooks:pending';
const WEBHOOK_DLQ_KEY = 'webhooks:dlq';
const WEBHOOK_STATS_KEY = 'webhooks:stats';
const MAX_ATTEMPTS = 5;
const INITIAL_DELAY_MS = 60000; // 1 minute
const MAX_DELAY_MS = 3600000; // 1 hour
const BATCH_SIZE = 50;
const DELIVERY_TIMEOUT_MS = 30000;

// Store Redis connection
let redisClient: Redis | null = null;

// =============================================================================
// Webhook Retry Job
// =============================================================================

export class WebhookRetryJob {
  /**
   * Get job definition for the scheduler.
   * Runs every 2 minutes to check for pending retries.
   */
  static getDefinition(): JobDefinition {
    return {
      name: 'webhook-retry',
      handler: (job: Job) => WebhookRetryJob.execute(job),
      cron: '*/2 * * * *', // Every 2 minutes
      options: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 30000 },
        removeOnComplete: 100,
        removeOnFail: 200,
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
   * Execute the webhook retry processing.
   */
  static async execute(job: Job): Promise<void> {
    if (!redisClient) {
      logger.warn('Redis not initialized for webhook retry');
      return;
    }

    const startTime = Date.now();
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let movedToDLQ = 0;

    logger.info({ jobId: job.id }, 'Starting webhook retry processing');

    try {
      const now = Date.now();

      // Get pending webhooks that are due for retry
      const pendingIds = await redisClient.zrangebyscore(
        WEBHOOK_QUEUE_KEY,
        '-inf',
        now,
        'LIMIT',
        0,
        BATCH_SIZE
      );

      if (pendingIds.length === 0) {
        logger.debug({ jobId: job.id }, 'No webhooks pending retry');
        return;
      }

      logger.info(
        { jobId: job.id, count: pendingIds.length },
        'Found webhooks to retry'
      );

      for (const id of pendingIds) {
        const deliveryStr = await redisClient.hget('webhooks:data', id);
        if (!deliveryStr) {
          // Remove orphaned entry
          await redisClient.zrem(WEBHOOK_QUEUE_KEY, id);
          continue;
        }

        const delivery: WebhookDelivery = JSON.parse(deliveryStr);
        processed++;

        // Attempt delivery
        const result = await WebhookRetryJob.attemptDelivery(delivery);

        if (result.success) {
          succeeded++;
          // Remove from queue and data
          await redisClient.zrem(WEBHOOK_QUEUE_KEY, id);
          await redisClient.hdel('webhooks:data', id);

          // Update stats
          await redisClient.hincrby(WEBHOOK_STATS_KEY, 'delivered', 1);
          await redisClient.hincrby(WEBHOOK_STATS_KEY, `delivered:${delivery.source}`, 1);

          logger.info(
            { webhookId: id, eventType: delivery.eventType, attempt: delivery.attempt },
            'Webhook delivered successfully'
          );
        } else {
          failed++;

          // Update delivery record
          delivery.attempt++;
          delivery.lastAttemptAt = new Date();
          delivery.lastError = result.error;
          delivery.lastStatusCode = result.statusCode;

          if (delivery.attempt >= delivery.maxAttempts) {
            // Move to dead-letter queue
            movedToDLQ++;
            await redisClient.zrem(WEBHOOK_QUEUE_KEY, id);
            await redisClient.zadd(WEBHOOK_DLQ_KEY, Date.now(), id);
            await redisClient.hset('webhooks:data', id, JSON.stringify(delivery));

            // Update stats
            await redisClient.hincrby(WEBHOOK_STATS_KEY, 'failed', 1);
            await redisClient.hincrby(WEBHOOK_STATS_KEY, `failed:${delivery.source}`, 1);

            // Create alert notification for admins
            await WebhookRetryJob.alertDLQ(delivery);

            logger.warn(
              {
                webhookId: id,
                eventType: delivery.eventType,
                attempts: delivery.attempt,
                error: result.error,
              },
              'Webhook moved to DLQ'
            );
          } else {
            // Calculate next retry with exponential backoff
            const delay = Math.min(
              INITIAL_DELAY_MS * Math.pow(2, delivery.attempt - 1),
              MAX_DELAY_MS
            );
            delivery.nextRetryAt = new Date(Date.now() + delay);

            // Update in queue
            await redisClient.zadd(
              WEBHOOK_QUEUE_KEY,
              delivery.nextRetryAt.getTime(),
              id
            );
            await redisClient.hset('webhooks:data', id, JSON.stringify(delivery));

            // Update stats
            await redisClient.hincrby(WEBHOOK_STATS_KEY, 'retried', 1);

            logger.info(
              {
                webhookId: id,
                eventType: delivery.eventType,
                attempt: delivery.attempt,
                nextRetry: delivery.nextRetryAt,
                error: result.error,
              },
              'Webhook scheduled for retry'
            );
          }
        }
      }

      logger.info(
        {
          jobId: job.id,
          duration: Date.now() - startTime,
          processed,
          succeeded,
          failed,
          movedToDLQ,
        },
        'Webhook retry processing completed'
      );
    } catch (error) {
      logger.error({ jobId: job.id, error }, 'Webhook retry processing failed');
      throw error;
    }
  }

  /**
   * Attempt to deliver a webhook.
   */
  private static async attemptDelivery(
    delivery: WebhookDelivery
  ): Promise<DeliveryResult> {
    const startTime = Date.now();

    try {
      // Sign payload if secret is provided
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'RealRiches-Webhook/1.0',
        'X-Webhook-ID': delivery.id,
        'X-Webhook-Event': delivery.eventType,
        'X-Webhook-Attempt': String(delivery.attempt + 1),
        ...delivery.headers,
      };

      if (delivery.secret) {
        const timestamp = Math.floor(Date.now() / 1000);
        const payloadStr = JSON.stringify(delivery.payload);
        const signedPayload = `${timestamp}.${payloadStr}`;
        const signature = createHmac('sha256', delivery.secret)
          .update(signedPayload)
          .digest('hex');
        headers['X-Webhook-Signature'] = `t=${timestamp},v1=${signature}`;
      }

      const response = await fetch(delivery.url, {
        method: delivery.method,
        headers,
        body: JSON.stringify(delivery.payload),
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });

      const responseBody = await response.text();
      const responseTimeMs = Date.now() - startTime;

      if (response.ok) {
        return {
          success: true,
          statusCode: response.status,
          responseBody: responseBody.slice(0, 500),
          responseTimeMs,
        };
      }

      // Non-2xx response
      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${responseBody.slice(0, 200)}`,
        responseBody: responseBody.slice(0, 500),
        responseTimeMs,
      };
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      const err = error as Error;

      // Check for timeout
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return {
          success: false,
          error: `Timeout after ${DELIVERY_TIMEOUT_MS}ms`,
          responseTimeMs,
        };
      }

      // Network or other error
      return {
        success: false,
        error: err.message,
        responseTimeMs,
      };
    }
  }

  /**
   * Alert admins about DLQ entries.
   */
  private static async alertDLQ(delivery: WebhookDelivery): Promise<void> {
    // Find admin users
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ['admin', 'super_admin'] },
        status: 'active',
      },
      select: { id: true },
      take: 5,
    });

    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: 'webhook_dlq',
          channel: 'in_app',
          title: `Webhook failed: ${delivery.eventType}`,
          body: `Webhook delivery to ${delivery.url} failed after ${delivery.attempt} attempts. Last error: ${delivery.lastError}`,
          data: {
            webhookId: delivery.id,
            eventType: delivery.eventType,
            url: delivery.url,
            source: delivery.source,
            attempts: delivery.attempt,
            lastError: delivery.lastError,
            priority: 'high',
          },
          status: 'sent',
        },
      });
    }
  }

  // ===========================================================================
  // Public API for Queueing Webhooks
  // ===========================================================================

  /**
   * Queue a webhook for delivery.
   */
  static async queueWebhook(options: {
    url: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    payload: Record<string, unknown>;
    secret?: string;
    eventType: string;
    source: string;
    entityType?: string;
    entityId?: string;
    maxAttempts?: number;
    delayMs?: number;
  }): Promise<string> {
    if (!redisClient) {
      throw new Error('Redis not initialized for webhook queue');
    }

    const id = `wh_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const deliveryTime = Date.now() + (options.delayMs || 0);

    const delivery: WebhookDelivery = {
      id,
      url: options.url,
      method: options.method || 'POST',
      headers: options.headers || {},
      payload: options.payload,
      secret: options.secret,
      attempt: 0,
      maxAttempts: options.maxAttempts || MAX_ATTEMPTS,
      nextRetryAt: new Date(deliveryTime),
      createdAt: new Date(),
      eventType: options.eventType,
      source: options.source,
      entityType: options.entityType,
      entityId: options.entityId,
    };

    // Store delivery data
    await redisClient.hset('webhooks:data', id, JSON.stringify(delivery));

    // Add to sorted set for scheduling
    await redisClient.zadd(WEBHOOK_QUEUE_KEY, deliveryTime, id);

    // Update stats
    await redisClient.hincrby(WEBHOOK_STATS_KEY, 'queued', 1);
    await redisClient.hincrby(WEBHOOK_STATS_KEY, `queued:${options.source}`, 1);

    logger.info(
      { webhookId: id, eventType: options.eventType, url: options.url },
      'Webhook queued'
    );

    return id;
  }

  /**
   * Get webhook delivery status.
   */
  static async getWebhookStatus(
    id: string
  ): Promise<{
    status: 'pending' | 'delivered' | 'failed';
    delivery?: WebhookDelivery;
  } | null> {
    if (!redisClient) return null;

    const deliveryStr = await redisClient.hget('webhooks:data', id);
    if (!deliveryStr) return null;

    const delivery: WebhookDelivery = JSON.parse(deliveryStr);

    // Check if in pending queue
    const inQueue = await redisClient.zscore(WEBHOOK_QUEUE_KEY, id);
    if (inQueue !== null) {
      return { status: 'pending', delivery };
    }

    // Check if in DLQ
    const inDLQ = await redisClient.zscore(WEBHOOK_DLQ_KEY, id);
    if (inDLQ !== null) {
      return { status: 'failed', delivery };
    }

    // Otherwise delivered (data cleaned up)
    return { status: 'delivered', delivery };
  }

  /**
   * Get queue statistics.
   */
  static async getStats(): Promise<{
    pending: number;
    dlq: number;
    stats: Record<string, number>;
  }> {
    if (!redisClient) {
      return { pending: 0, dlq: 0, stats: {} };
    }

    const [pending, dlq, stats] = await Promise.all([
      redisClient.zcard(WEBHOOK_QUEUE_KEY),
      redisClient.zcard(WEBHOOK_DLQ_KEY),
      redisClient.hgetall(WEBHOOK_STATS_KEY),
    ]);

    const statsRecord: Record<string, number> = {};
    for (const [key, value] of Object.entries(stats)) {
      statsRecord[key] = parseInt(value, 10);
    }

    return { pending, dlq, stats: statsRecord };
  }

  /**
   * Get DLQ entries.
   */
  static async getDLQEntries(limit: number = 50): Promise<WebhookDelivery[]> {
    if (!redisClient) return [];

    const ids = await redisClient.zrange(WEBHOOK_DLQ_KEY, 0, limit - 1);
    const entries: WebhookDelivery[] = [];

    for (const id of ids) {
      const deliveryStr = await redisClient.hget('webhooks:data', id);
      if (deliveryStr) {
        entries.push(JSON.parse(deliveryStr));
      }
    }

    return entries;
  }

  /**
   * Retry a DLQ entry manually.
   */
  static async retryDLQEntry(id: string): Promise<boolean> {
    if (!redisClient) return false;

    const deliveryStr = await redisClient.hget('webhooks:data', id);
    if (!deliveryStr) return false;

    const delivery: WebhookDelivery = JSON.parse(deliveryStr);

    // Remove from DLQ
    await redisClient.zrem(WEBHOOK_DLQ_KEY, id);

    // Reset attempt count and re-queue
    delivery.attempt = 0;
    delivery.nextRetryAt = new Date();

    await redisClient.hset('webhooks:data', id, JSON.stringify(delivery));
    await redisClient.zadd(WEBHOOK_QUEUE_KEY, Date.now(), id);

    logger.info({ webhookId: id }, 'DLQ entry requeued for retry');
    return true;
  }

  /**
   * Delete a DLQ entry.
   */
  static async deleteDLQEntry(id: string): Promise<boolean> {
    if (!redisClient) return false;

    await redisClient.zrem(WEBHOOK_DLQ_KEY, id);
    await redisClient.hdel('webhooks:data', id);

    logger.info({ webhookId: id }, 'DLQ entry deleted');
    return true;
  }

  /**
   * Purge old data (cleanup job).
   */
  static async purgeOldData(olderThanDays: number = 7): Promise<number> {
    if (!redisClient) return 0;

    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    // Remove old DLQ entries
    const removed = await redisClient.zremrangebyscore(WEBHOOK_DLQ_KEY, '-inf', cutoff);

    logger.info({ removed, olderThanDays }, 'Purged old DLQ entries');
    return removed;
  }
}
