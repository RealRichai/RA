/**
 * Email Queue
 *
 * BullMQ queue for processing email jobs.
 */

import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';

import type {
  EmailJobData,
  EmailPriority,
  EmailQueueConfig,
  SendEmailOptions,
} from '../types';
import { DEFAULT_QUEUE_CONFIG } from '../types';

// Priority mapping (lower number = higher priority)
const PRIORITY_VALUES: Record<EmailPriority, number> = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
};

/**
 * Email queue wrapper around BullMQ.
 */
export class EmailQueue {
  private queue: Queue<EmailJobData>;
  private config: Required<EmailQueueConfig>;

  constructor(connection: Redis, config: EmailQueueConfig = {}) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };

    this.queue = new Queue<EmailJobData>(this.config.queueName, {
      connection,
      defaultJobOptions: {
        attempts: this.config.maxRetries,
        backoff: {
          type: 'exponential',
          delay: this.config.retryDelay,
        },
        removeOnComplete: {
          count: this.config.removeOnComplete,
        },
        removeOnFail: {
          count: this.config.removeOnFail,
        },
      },
    });
  }

  /**
   * Add an email job to the queue.
   */
  async add(options: SendEmailOptions): Promise<string> {
    const messageId = generateMessageId();
    const idempotencyKey = options.idempotencyKey || messageId;

    // Normalize recipients
    const to = normalizeRecipients(options.to);
    const cc = options.cc ? normalizeRecipients(options.cc) : undefined;
    const bcc = options.bcc ? normalizeRecipients(options.bcc) : undefined;

    const jobData: EmailJobData = {
      messageId,
      templateId: options.templateId,
      to,
      cc,
      bcc,
      templateData: options.data,
      priority: options.priority || 'normal',
      scheduledAt: options.scheduledAt,
      userId: options.userId,
      organizationId: options.organizationId,
      entityType: options.entityType,
      entityId: options.entityId,
      attempt: 0,
      maxAttempts: this.config.maxRetries,
      idempotencyKey,
    };

    const jobOptions: JobsOptions = {
      jobId: idempotencyKey, // Use idempotency key as job ID for deduplication
      priority: PRIORITY_VALUES[options.priority || 'normal'],
    };

    // Schedule for later if specified
    if (options.scheduledAt) {
      const delay = options.scheduledAt.getTime() - Date.now();
      if (delay > 0) {
        jobOptions.delay = delay;
      }
    }

    await this.queue.add('send-email', jobData, jobOptions);

    return messageId;
  }

  /**
   * Add multiple email jobs to the queue.
   */
  async addBulk(emails: SendEmailOptions[]): Promise<string[]> {
    const jobs = emails.map((options) => {
      const messageId = generateMessageId();
      const idempotencyKey = options.idempotencyKey || messageId;
      const to = normalizeRecipients(options.to);
      const cc = options.cc ? normalizeRecipients(options.cc) : undefined;
      const bcc = options.bcc ? normalizeRecipients(options.bcc) : undefined;

      return {
        name: 'send-email',
        data: {
          messageId,
          templateId: options.templateId,
          to,
          cc,
          bcc,
          templateData: options.data,
          priority: options.priority || 'normal',
          scheduledAt: options.scheduledAt,
          userId: options.userId,
          organizationId: options.organizationId,
          entityType: options.entityType,
          entityId: options.entityId,
          attempt: 0,
          maxAttempts: this.config.maxRetries,
          idempotencyKey,
        } as EmailJobData,
        opts: {
          jobId: idempotencyKey,
          priority: PRIORITY_VALUES[options.priority || 'normal'],
          delay: options.scheduledAt
            ? Math.max(0, options.scheduledAt.getTime() - Date.now())
            : undefined,
        } as JobsOptions,
      };
    });

    await this.queue.addBulk(jobs);

    return jobs.map((j) => j.data.messageId);
  }

  /**
   * Get queue health metrics.
   */
  async getHealth(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
  }> {
    const [waiting, active, completed, failed, delayed, isPaused] =
      await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getCompletedCount(),
        this.queue.getFailedCount(),
        this.queue.getDelayedCount(),
        this.queue.isPaused(),
      ]);

    return { waiting, active, completed, failed, delayed, paused: isPaused };
  }

  /**
   * Pause the queue.
   */
  async pause(): Promise<void> {
    await this.queue.pause();
  }

  /**
   * Resume the queue.
   */
  async resume(): Promise<void> {
    await this.queue.resume();
  }

  /**
   * Clean old jobs from the queue.
   */
  async clean(
    grace: number = 3600000, // 1 hour
    limit: number = 1000,
    type: 'completed' | 'failed' | 'delayed' | 'wait' | 'active' = 'completed'
  ): Promise<string[]> {
    return this.queue.clean(grace, limit, type);
  }

  /**
   * Close the queue connection.
   */
  async close(): Promise<void> {
    await this.queue.close();
  }

  /**
   * Get the underlying BullMQ queue instance.
   */
  getQueue(): Queue<EmailJobData> {
    return this.queue;
  }
}

/**
 * Generate a unique message ID.
 */
function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `msg_${timestamp}${random}`;
}

/**
 * Normalize recipients to EmailAddress array.
 */
function normalizeRecipients(
  recipients: string | { email: string; name?: string } | { email: string; name?: string }[]
): { email: string; name?: string }[] {
  if (typeof recipients === 'string') {
    return [{ email: recipients }];
  }
  if (Array.isArray(recipients)) {
    return recipients;
  }
  return [recipients];
}
