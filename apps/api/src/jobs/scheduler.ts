/**
 * Job Scheduler
 *
 * Manages background jobs using BullMQ with Redis.
 * Supports cron-based scheduling for recurring jobs.
 */

import { logger } from '@realriches/utils';
import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';


// =============================================================================
// Types
// =============================================================================

export interface JobDefinition {
  name: string;
  handler: (job: Job) => Promise<void>;
  cron?: string;
  options?: {
    attempts?: number;
    backoff?: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
  };
}

export interface JobSchedulerConfig {
  connection: Redis;
  prefix?: string;
  concurrency?: number;
}

// =============================================================================
// Job Scheduler
// =============================================================================

export class JobScheduler {
  private queue: Queue;
  private worker: Worker | null = null;
  private jobs: Map<string, JobDefinition> = new Map();
  private config: JobSchedulerConfig;

  constructor(config: JobSchedulerConfig) {
    this.config = config;
    this.queue = new Queue('realriches:jobs', {
      connection: config.connection,
      prefix: config.prefix || 'bull',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    });
  }

  /**
   * Register a job definition.
   */
  register(job: JobDefinition): void {
    this.jobs.set(job.name, job);
    logger.info({ jobName: job.name, cron: job.cron }, 'Job registered');
  }

  /**
   * Start the job scheduler.
   * Sets up workers and schedules recurring jobs.
   */
  async start(): Promise<void> {
    // Create worker to process jobs
    this.worker = new Worker(
      'realriches:jobs',
      async (job: Job) => {
        const definition = this.jobs.get(job.name);
        if (!definition) {
          logger.warn({ jobName: job.name }, 'Unknown job type');
          return;
        }

        const startTime = Date.now();
        logger.info({ jobName: job.name, jobId: job.id }, 'Job started');

        try {
          await definition.handler(job);
          logger.info(
            { jobName: job.name, jobId: job.id, duration: Date.now() - startTime },
            'Job completed'
          );
        } catch (error) {
          logger.error(
            { jobName: job.name, jobId: job.id, error, duration: Date.now() - startTime },
            'Job failed'
          );
          throw error;
        }
      },
      {
        connection: this.config.connection,
        concurrency: this.config.concurrency || 5,
      }
    );

    // Set up event handlers
    this.worker.on('failed', (job, err) => {
      logger.error(
        { jobName: job?.name, jobId: job?.id, error: err.message, attempt: job?.attemptsMade },
        'Job failed'
      );
    });

    this.worker.on('error', (err) => {
      logger.error({ error: err.message }, 'Worker error');
    });

    // Schedule recurring jobs
    for (const [name, job] of this.jobs.entries()) {
      if (job.cron) {
        await this.queue.add(
          name,
          {},
          {
            repeat: { pattern: job.cron },
            ...job.options,
          }
        );
        logger.info({ jobName: name, cron: job.cron }, 'Recurring job scheduled');
      }
    }

    logger.info({ jobCount: this.jobs.size }, 'Job scheduler started');
  }

  /**
   * Add a one-time job to the queue.
   */
  async addJob(name: string, data: Record<string, unknown> = {}, delay?: number): Promise<string> {
    const job = await this.queue.add(name, data, {
      delay,
    });
    return job.id || '';
  }

  /**
   * Stop the scheduler and close connections.
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
    await this.queue.close();
    logger.info('Job scheduler stopped');
  }

  /**
   * Get queue statistics.
   */
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }
}
