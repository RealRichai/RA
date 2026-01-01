import { Job, Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';

import { TourConversionService } from './service';
import type { ConversionJobData, ConversionResult, WorkerConfig } from './types';
import { ConversionJobDataSchema, DEFAULT_WORKER_CONFIG } from './types';

// =============================================================================
// Queue Setup
// =============================================================================

let queue: Queue<ConversionJobData, ConversionResult> | null = null;
let worker: Worker<ConversionJobData, ConversionResult> | null = null;
let connection: IORedis | null = null;

/**
 * Initialize the Redis connection
 */
function getConnection(redisUrl: string): IORedis {
  if (!connection) {
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return connection;
}

/**
 * Get or create the conversion queue
 */
export function getConversionQueue(
  config: Partial<WorkerConfig> = {}
): Queue<ConversionJobData, ConversionResult> {
  if (!queue) {
    const fullConfig = { ...DEFAULT_WORKER_CONFIG, ...config };
    queue = new Queue<ConversionJobData, ConversionResult>(fullConfig.queueName, {
      connection: getConnection(fullConfig.redisUrl),
      defaultJobOptions: {
        attempts: fullConfig.maxRetries,
        backoff: {
          type: 'exponential',
          delay: fullConfig.backoffDelay,
        },
        removeOnComplete: {
          count: 100, // Keep last 100 completed jobs
        },
        removeOnFail: {
          count: 500, // Keep last 500 failed jobs for debugging
        },
      },
    });
  }
  return queue;
}

/**
 * Add a conversion job to the queue
 */
export async function enqueueConversionJob(
  data: ConversionJobData,
  options?: {
    priority?: number;
    delay?: number;
    jobId?: string;
  }
): Promise<Job<ConversionJobData, ConversionResult>> {
  const q = getConversionQueue();

  // Validate job data
  const validated = ConversionJobDataSchema.parse(data);

  return q.add('convert', validated, {
    priority: options?.priority,
    delay: options?.delay,
    jobId: options?.jobId ?? `tour-${validated.tourAssetId}`,
  });
}

// =============================================================================
// Worker Implementation
// =============================================================================

/**
 * Process a conversion job
 */
async function processConversionJob(
  job: Job<ConversionJobData, ConversionResult>
): Promise<ConversionResult> {
  const service = new TourConversionService();
  const useMock = process.env['NODE_ENV'] === 'test' || process.env['USE_MOCK'] === 'true';

  // Log job start
  console.log(`[TourConversion] Starting job ${job.id} for asset ${job.data.tourAssetId}`);

  // Update progress
  await job.updateProgress(10);

  try {
    const result = await service.processJob(job.data, useMock);

    // Update progress
    await job.updateProgress(100);

    if (result.success) {
      console.log(
        `[TourConversion] Job ${job.id} completed successfully. ` +
        `SOG: ${result.sogS3Key}, QA Score: ${result.qaReport?.score.toFixed(3)}`
      );
    } else {
      console.error(
        `[TourConversion] Job ${job.id} failed: ${result.error?.message}`
      );

      // If not retryable, we still return the result (job will complete)
      // If retryable, throw to trigger BullMQ retry
      if (result.error?.retryable) {
        throw new Error(result.error.message);
      }
    }

    return result;
  } catch (err) {
    console.error(`[TourConversion] Job ${job.id} error:`, err);
    throw err;
  }
}

/**
 * Start the conversion worker
 */
export function startWorker(
  config: Partial<WorkerConfig> = {}
): Worker<ConversionJobData, ConversionResult> {
  if (worker) {
    return worker;
  }

  const fullConfig = { ...DEFAULT_WORKER_CONFIG, ...config };

  worker = new Worker<ConversionJobData, ConversionResult>(
    fullConfig.queueName,
    processConversionJob,
    {
      connection: getConnection(fullConfig.redisUrl),
      concurrency: fullConfig.concurrency,
      limiter: {
        max: 10,
        duration: 60000, // 10 jobs per minute max
      },
    }
  );

  // Event handlers
  worker.on('completed', (job, result) => {
    console.log(
      `[TourConversion] Job ${job.id} completed:`,
      result.success ? 'SUCCESS' : 'FAILED'
    );
  });

  worker.on('failed', (job, err) => {
    console.error(`[TourConversion] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[TourConversion] Worker error:', err);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[TourConversion] Job ${jobId} stalled`);
  });

  console.log(
    `[TourConversion] Worker started with concurrency ${fullConfig.concurrency}`
  );

  return worker;
}

/**
 * Stop the worker gracefully
 */
export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
  console.log('[TourConversion] Worker stopped');
}

/**
 * Get worker stats
 */
export async function getWorkerStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const q = getConversionQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
    q.getCompletedCount(),
    q.getFailedCount(),
    q.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

// =============================================================================
// CLI Entry Point
// =============================================================================

if (require.main === module) {
  console.log('[TourConversion] Starting worker from CLI...');

  startWorker();

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[TourConversion] Shutting down...');
    await stopWorker();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}
