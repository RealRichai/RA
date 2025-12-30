/**
 * Email Worker
 *
 * BullMQ worker for processing email jobs.
 */

import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';

import type {
  EmailJobData,
  EmailJobResult,
  EmailMessage,
  EmailQueueConfig,
} from '../types';
import { DEFAULT_QUEUE_CONFIG } from '../types';
import type { IEmailProvider } from '../providers';
import { renderTemplate } from '../templates';

export interface EmailWorkerOptions {
  connection: Redis;
  provider: IEmailProvider;
  config?: EmailQueueConfig;
  onSuccess?: (job: Job<EmailJobData>, result: EmailJobResult) => void | Promise<void>;
  onFailure?: (job: Job<EmailJobData>, error: Error) => void | Promise<void>;
  onDLQ?: (job: Job<EmailJobData>, error: Error) => void | Promise<void>;
}

/**
 * Email worker that processes jobs from the queue.
 */
export class EmailWorker {
  private worker: Worker<EmailJobData, EmailJobResult>;
  private provider: IEmailProvider;
  private config: Required<EmailQueueConfig>;
  private onSuccess?: EmailWorkerOptions['onSuccess'];
  private onFailure?: EmailWorkerOptions['onFailure'];
  private onDLQ?: EmailWorkerOptions['onDLQ'];

  constructor(options: EmailWorkerOptions) {
    this.provider = options.provider;
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...options.config };
    this.onSuccess = options.onSuccess;
    this.onFailure = options.onFailure;
    this.onDLQ = options.onDLQ;

    this.worker = new Worker<EmailJobData, EmailJobResult>(
      this.config.queueName,
      async (job) => this.processJob(job),
      {
        connection: options.connection,
        concurrency: this.config.concurrency,
      }
    );

    // Set up event handlers
    this.worker.on('completed', (job, result) => {
      if (this.onSuccess && result.success) {
        this.onSuccess(job, result);
      }
    });

    this.worker.on('failed', (job, error) => {
      if (job) {
        const attemptsMade = job.attemptsMade;
        const maxAttempts = job.data.maxAttempts || this.config.maxRetries;

        if (attemptsMade >= maxAttempts && this.onDLQ) {
          // Final failure - move to DLQ
          this.onDLQ(job, error);
        } else if (this.onFailure) {
          // Intermediate failure - will be retried
          this.onFailure(job, error);
        }
      }
    });
  }

  /**
   * Process an email job.
   */
  private async processJob(job: Job<EmailJobData>): Promise<EmailJobResult> {
    const { data } = job;

    try {
      // Render the template
      const rendered = renderTemplate(data.templateId, data.templateData);

      // Build the email message
      const message: EmailMessage = {
        id: data.messageId,
        templateId: data.templateId,
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        priority: data.priority,
        userId: data.userId,
        organizationId: data.organizationId,
        entityType: data.entityType,
        entityId: data.entityId,
        metadata: {
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          idempotencyKey: data.idempotencyKey,
        },
      };

      // Send the email
      const result = await this.provider.send(message);

      if (!result.success) {
        // Throw error to trigger retry
        throw new Error(result.error || 'Failed to send email');
      }

      return {
        success: true,
        messageId: data.messageId,
        providerMessageId: result.providerMessageId,
        sentAt: result.sentAt || new Date(),
      };
    } catch (error) {
      const err = error as Error;

      // Update job progress
      await job.updateProgress({
        attempt: job.attemptsMade + 1,
        error: err.message,
      });

      throw error; // Re-throw to trigger BullMQ retry
    }
  }

  /**
   * Pause the worker.
   */
  async pause(doNotWaitActive: boolean = false): Promise<void> {
    await this.worker.pause(doNotWaitActive);
  }

  /**
   * Resume the worker.
   */
  resume(): void {
    this.worker.resume();
  }

  /**
   * Close the worker.
   */
  async close(): Promise<void> {
    await this.worker.close();
  }

  /**
   * Check if the worker is running.
   */
  isRunning(): boolean {
    return this.worker.isRunning();
  }

  /**
   * Check if the worker is paused.
   */
  isPaused(): boolean {
    return this.worker.isPaused();
  }

  /**
   * Get the underlying BullMQ worker instance.
   */
  getWorker(): Worker<EmailJobData, EmailJobResult> {
    return this.worker;
  }
}

/**
 * Create an email worker with the given options.
 */
export function createEmailWorker(options: EmailWorkerOptions): EmailWorker {
  return new EmailWorker(options);
}
