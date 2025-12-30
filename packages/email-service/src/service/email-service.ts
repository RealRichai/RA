/**
 * Email Service
 *
 * Main orchestrator for email delivery operations.
 */

import type { Redis } from 'ioredis';

import type { IEmailProvider } from '../providers';
import { EmailQueue, EmailWorker, DLQHandler, createDLQHandler } from '../queue';
import { renderTemplate } from '../templates';
import type {
  EmailMessage,
  EmailQueueConfig,
  SendEmailOptions,
  SendResult,
} from '../types';

import type { INotificationLogger } from './notification-logger';
import { ConsoleNotificationLogger } from './notification-logger';

export interface EmailServiceConfig {
  /** Redis connection for queue */
  connection: Redis;
  /** Email provider for sending */
  provider: IEmailProvider;
  /** Optional queue configuration */
  queueConfig?: EmailQueueConfig;
  /** Optional notification logger */
  notificationLogger?: INotificationLogger;
  /** Whether to start the worker automatically */
  startWorker?: boolean;
}

/**
 * Email service that orchestrates email delivery.
 */
export class EmailService {
  private queue: EmailQueue;
  private worker: EmailWorker | null = null;
  private dlqHandler: DLQHandler;
  private provider: IEmailProvider;
  private notificationLogger: INotificationLogger;
  private isInitialized: boolean = false;

  constructor(private config: EmailServiceConfig) {
    this.provider = config.provider;
    this.notificationLogger =
      config.notificationLogger || new ConsoleNotificationLogger();

    // Initialize queue
    this.queue = new EmailQueue(config.connection, config.queueConfig);

    // Initialize DLQ handler
    this.dlqHandler = createDLQHandler({
      onRecord: async (record) => {
        await this.notificationLogger.logFailed(record.messageId, record.error);
      },
    });

    // Start worker if requested
    if (config.startWorker !== false) {
      this.startWorker();
    }

    this.isInitialized = true;
  }

  /**
   * Start the email worker.
   */
  startWorker(): void {
    if (this.worker) {
      return; // Already started
    }

    this.worker = new EmailWorker({
      connection: this.config.connection,
      provider: this.provider,
      config: this.config.queueConfig,
      onSuccess: async (job, result) => {
        await this.notificationLogger.logSent(job.data.messageId, result);
      },
      onFailure: (job, error) => {
        // eslint-disable-next-line no-console
        console.warn(
          `[EMAIL] Job ${job.data.messageId} failed (attempt ${job.attemptsMade}): ${error.message}`
        );
      },
      onDLQ: async (job, error) => {
        await this.dlqHandler.handleFailedJob(job, error);
      },
    });
  }

  /**
   * Stop the email worker.
   */
  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  /**
   * Send an email via the queue.
   * Returns the message ID for tracking.
   */
  async send(options: SendEmailOptions): Promise<string> {
    // Add to queue
    const messageId = await this.queue.add(options);

    // Log as queued
    await this.notificationLogger.logQueued(options, messageId);

    return messageId;
  }

  /**
   * Send multiple emails via the queue.
   * Returns an array of message IDs.
   */
  async sendBulk(emails: SendEmailOptions[]): Promise<string[]> {
    const messageIds = await this.queue.addBulk(emails);

    // Log all as queued
    await Promise.all(
      emails.map((email, i) => {
        const msgId = messageIds[i];
        if (msgId) {
          return this.notificationLogger.logQueued(email, msgId);
        }
        return Promise.resolve();
      })
    );

    return messageIds;
  }

  /**
   * Send an email immediately without queuing.
   * Use for critical emails that must be sent synchronously.
   */
  async sendImmediate(options: SendEmailOptions): Promise<SendResult> {
    const messageId = `immediate_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    // Log as queued
    await this.notificationLogger.logQueued(options, messageId);

    try {
      // Render template
      const rendered = renderTemplate(options.templateId, options.data);

      // Normalize recipients
      const to = normalizeRecipients(options.to);
      const cc = options.cc ? normalizeRecipients(options.cc) : undefined;
      const bcc = options.bcc ? normalizeRecipients(options.bcc) : undefined;

      // Build message
      const message: EmailMessage = {
        id: messageId,
        templateId: options.templateId,
        to,
        cc,
        bcc,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        priority: options.priority || 'normal',
        userId: options.userId,
        organizationId: options.organizationId,
        entityType: options.entityType,
        entityId: options.entityId,
        metadata: {
          immediate: true,
          idempotencyKey: options.idempotencyKey,
        },
      };

      // Send via provider
      const result = await this.provider.send(message);

      if (result.success) {
        await this.notificationLogger.logSent(messageId, {
          success: true,
          messageId,
          providerMessageId: result.providerMessageId,
          sentAt: result.sentAt || new Date(),
        });
      } else {
        await this.notificationLogger.logFailed(
          messageId,
          result.error || 'Unknown error'
        );
      }

      return result;
    } catch (error) {
      const err = error as Error;
      await this.notificationLogger.logFailed(messageId, err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Get the status of a sent email.
   */
  async getStatus(
    messageId: string
  ): Promise<{ status: 'pending' | 'sent' | 'failed'; error?: string }> {
    const notification = await this.notificationLogger.getNotification(messageId);

    if (!notification) {
      return { status: 'pending' };
    }

    return {
      status: notification.status,
      error: notification.error,
    };
  }

  /**
   * Get queue health metrics.
   */
  async getQueueHealth(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
  }> {
    return this.queue.getHealth();
  }

  /**
   * Get DLQ records.
   */
  getDLQRecords() {
    return this.dlqHandler.getRecords();
  }

  /**
   * Get count of DLQ records.
   */
  getDLQCount(): number {
    return this.dlqHandler.getCount();
  }

  /**
   * Pause email processing.
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    if (this.worker) {
      await this.worker.pause();
    }
  }

  /**
   * Resume email processing.
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    if (this.worker) {
      this.worker.resume();
    }
  }

  /**
   * Clean old jobs from the queue.
   */
  async cleanOldJobs(
    grace: number = 3600000,
    limit: number = 1000
  ): Promise<string[]> {
    return this.queue.clean(grace, limit, 'completed');
  }

  /**
   * Close all connections and stop workers.
   */
  async close(): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
    this.isInitialized = false;
  }

  /**
   * Check if the service is ready.
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the underlying provider.
   */
  getProvider(): IEmailProvider {
    return this.provider;
  }

  /**
   * Get the underlying queue.
   */
  getQueue(): EmailQueue {
    return this.queue;
  }
}

/**
 * Normalize recipients to EmailAddress array.
 */
function normalizeRecipients(
  recipients:
    | string
    | { email: string; name?: string }
    | { email: string; name?: string }[]
): { email: string; name?: string }[] {
  if (typeof recipients === 'string') {
    return [{ email: recipients }];
  }
  if (Array.isArray(recipients)) {
    return recipients;
  }
  return [recipients];
}

/**
 * Create an email service with the given configuration.
 */
export function createEmailService(config: EmailServiceConfig): EmailService {
  return new EmailService(config);
}
