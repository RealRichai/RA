import { Job, Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';

import { TourConversionService } from './service';
import type {
  ConversionJobData,
  ConversionResult,
  WorkerConfig,
  BackpressureConfig,
  BackpressureStatus,
} from './types';
import {
  ConversionJobDataSchema,
  DEFAULT_WORKER_CONFIG,
  DEFAULT_BACKPRESSURE_CONFIG,
  BackpressureError,
} from './types';

// =============================================================================
// Queue Setup
// =============================================================================

let queue: Queue<ConversionJobData, ConversionResult> | null = null;
let worker: Worker<ConversionJobData, ConversionResult> | null = null;
let connection: IORedis | null = null;

// =============================================================================
// Backpressure Control (RR-ENG-UPDATE-2026-002)
// =============================================================================

/**
 * Simple circuit breaker implementation for queue operations
 */
class QueueCircuitBreaker {
  private failures = 0;
  private lastFailureTime: number | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly threshold: number,
    private readonly resetTimeout: number
  ) {}

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.reset();
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
      console.warn(`[TourConversion] Circuit breaker opened after ${this.failures} failures`);
    }
  }

  canExecute(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      const now = Date.now();
      if (this.lastFailureTime && now - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'half-open';
        console.info('[TourConversion] Circuit breaker entering half-open state');
        return true;
      }
      return false;
    }

    // half-open: allow one request through
    return true;
  }

  getState(): 'closed' | 'open' | 'half-open' {
    // Check if we should transition from open to half-open
    if (this.state === 'open' && this.lastFailureTime) {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'half-open';
      }
    }
    return this.state;
  }

  private reset(): void {
    this.failures = 0;
    this.lastFailureTime = null;
    this.state = 'closed';
    console.info('[TourConversion] Circuit breaker reset');
  }
}

let backpressureConfig: BackpressureConfig = DEFAULT_BACKPRESSURE_CONFIG;
let circuitBreaker: QueueCircuitBreaker | null = null;

/**
 * Initialize backpressure control
 */
export function initBackpressure(config: Partial<BackpressureConfig> = {}): void {
  backpressureConfig = { ...DEFAULT_BACKPRESSURE_CONFIG, ...config };
  circuitBreaker = new QueueCircuitBreaker(
    backpressureConfig.circuitBreakerThreshold,
    backpressureConfig.circuitBreakerResetMs
  );
}

/**
 * Get current backpressure status
 */
export async function getBackpressureStatus(): Promise<BackpressureStatus> {
  const q = getConversionQueue();
  const [waiting, active] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
  ]);

  const queueDepth = waiting + active;
  const utilizationPercent = Math.round((queueDepth / backpressureConfig.maxPendingJobs) * 100);
  const circuitState = circuitBreaker?.getState() ?? 'closed';

  let acceptingJobs = true;
  let rejectionReason: 'queue_full' | 'circuit_open' | undefined;

  if (backpressureConfig.enabled) {
    if (circuitState === 'open') {
      acceptingJobs = false;
      rejectionReason = 'circuit_open';
    } else if (queueDepth >= backpressureConfig.maxPendingJobs) {
      acceptingJobs = false;
      rejectionReason = 'queue_full';
    }
  }

  return {
    circuitBreakerState: circuitState,
    queueDepth,
    maxPendingJobs: backpressureConfig.maxPendingJobs,
    utilizationPercent: Math.min(utilizationPercent, 100),
    acceptingJobs,
    rejectionReason,
  };
}

/**
 * Record a successful job completion for circuit breaker
 */
export function recordJobSuccess(): void {
  circuitBreaker?.recordSuccess();
}

/**
 * Record a job failure for circuit breaker
 */
export function recordJobFailure(): void {
  circuitBreaker?.recordFailure();
}

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
 *
 * @throws {BackpressureError} if queue is at capacity or circuit breaker is open
 */
export async function enqueueConversionJob(
  data: ConversionJobData,
  options?: {
    priority?: number;
    delay?: number;
    jobId?: string;
    /** Skip backpressure check (use with caution) */
    bypassBackpressure?: boolean;
  }
): Promise<Job<ConversionJobData, ConversionResult>> {
  // Initialize circuit breaker if not done
  if (!circuitBreaker) {
    initBackpressure();
  }

  // Check backpressure status
  if (backpressureConfig.enabled && !options?.bypassBackpressure) {
    const status = await getBackpressureStatus();

    if (!status.acceptingJobs) {
      const reason = status.rejectionReason!;
      const message = reason === 'circuit_open'
        ? 'Tour conversion is temporarily unavailable due to high failure rate'
        : `Tour conversion queue is at capacity (${status.queueDepth}/${status.maxPendingJobs} jobs)`;

      console.warn(`[TourConversion] Job rejected: ${message}`);
      throw new BackpressureError(message, reason, status);
    }
  }

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
    // Record success for circuit breaker
    if (result.success) {
      recordJobSuccess();
    } else {
      // Job completed but with error (non-retryable failure)
      recordJobFailure();
    }
  });

  worker.on('failed', (job, err) => {
    console.error(`[TourConversion] Job ${job?.id} failed:`, err.message);
    // Record failure for circuit breaker
    recordJobFailure();
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
