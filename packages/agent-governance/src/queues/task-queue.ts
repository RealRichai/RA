/**
 * AI Task Queue
 *
 * BullMQ-based task queue with retry, backoff, and idempotency.
 */

import { randomUUID } from 'crypto';

import type {
  AITask,
  TaskOutcome,
  TaskPriority,
  AgentType,
  QueueHealth,
  Result,
} from '../types';
import { Ok, Err } from '../types';

// =============================================================================
// Queue Configuration
// =============================================================================

export interface QueueConfig {
  name: string;
  connection: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  defaultJobOptions?: {
    attempts?: number;
    backoff?: {
      type: 'fixed' | 'exponential';
      delay: number;
    };
    timeout?: number;
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
  };
  limiter?: {
    max: number;
    duration: number;
  };
}

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  timeout: 300000, // 5 minutes
  removeOnComplete: 100, // Keep last 100
  removeOnFail: 500, // Keep last 500 failed
};

// =============================================================================
// Priority Mapping
// =============================================================================

const PRIORITY_VALUES: Record<TaskPriority, number> = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
};

// =============================================================================
// Task Queue Manager (Abstract for multiple implementations)
// =============================================================================

export interface TaskQueueManager {
  add(task: AITask): Promise<Result<string>>;
  addBulk(tasks: AITask[]): Promise<Result<string[]>>;
  getJob(jobId: string): Promise<Result<AITask | null>>;
  getHealth(): Promise<QueueHealth>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  clean(grace: number, limit: number, status: 'completed' | 'failed'): Promise<number>;
  close(): Promise<void>;
}

// =============================================================================
// In-Memory Queue (for testing/development)
// =============================================================================

export class InMemoryTaskQueue implements TaskQueueManager {
  private name: string;
  private jobs: Map<string, { task: AITask; status: 'waiting' | 'active' | 'completed' | 'failed' }> = new Map();
  private paused: boolean = false;
  private processedCount: number = 0;
  private failedCount: number = 0;
  private idempotencyKeys: Set<string> = new Set();

  constructor(name: string) {
    this.name = name;
  }

  add(task: AITask): Promise<Result<string>> {
    // Check idempotency
    if (this.idempotencyKeys.has(task.idempotencyKey)) {
      return Promise.resolve(Err('DUPLICATE_TASK', `Task with idempotency key ${task.idempotencyKey} already exists`));
    }

    const jobId = `job_${randomUUID()}`;
    this.jobs.set(jobId, { task, status: 'waiting' });
    this.idempotencyKeys.add(task.idempotencyKey);

    return Promise.resolve(Ok(jobId));
  }

  async addBulk(tasks: AITask[]): Promise<Result<string[]>> {
    const jobIds: string[] = [];

    for (const task of tasks) {
      const result = await this.add(task);
      if (result.ok) {
        jobIds.push(result.data);
      }
    }

    return Ok(jobIds);
  }

  getJob(jobId: string): Promise<Result<AITask | null>> {
    const job = this.jobs.get(jobId);
    return Promise.resolve(Ok(job?.task || null));
  }

  getHealth(): Promise<QueueHealth> {
    const jobs = Array.from(this.jobs.values());

    return Promise.resolve({
      queueName: this.name,
      waiting: jobs.filter((j) => j.status === 'waiting').length,
      active: jobs.filter((j) => j.status === 'active').length,
      completed: this.processedCount,
      failed: this.failedCount,
      delayed: 0,
      paused: this.paused,
      workers: 1,
      lastCheckedAt: new Date(),
    });
  }

  pause(): Promise<void> {
    this.paused = true;
    return Promise.resolve();
  }

  resume(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  clean(_grace: number, limit: number, status: 'completed' | 'failed'): Promise<number> {
    const targetStatus = status === 'completed' ? 'completed' : 'failed';
    let cleaned = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === targetStatus && cleaned < limit) {
        this.jobs.delete(jobId);
        cleaned++;
      }
    }

    return Promise.resolve(cleaned);
  }

  close(): Promise<void> {
    this.jobs.clear();
    this.idempotencyKeys.clear();
    return Promise.resolve();
  }

  // Test helpers
  markCompleted(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'completed';
      this.processedCount++;
    }
  }

  markFailed(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      this.failedCount++;
    }
  }

  getWaitingJobs(): AITask[] {
    return Array.from(this.jobs.values())
      .filter((j) => j.status === 'waiting')
      .map((j) => j.task)
      .sort((a, b) => PRIORITY_VALUES[a.priority] - PRIORITY_VALUES[b.priority]);
  }
}

// =============================================================================
// Task Factory
// =============================================================================

export interface CreateTaskOptions {
  type: string;
  agentType: AgentType;
  payload: Record<string, unknown>;
  tenantId: string;
  userId?: string;
  market?: string;
  priority?: TaskPriority;
  idempotencyKey?: string;
  maxRetries?: number;
  timeoutMs?: number;
  scheduledFor?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Create a new AI task.
 */
export function createTask(options: CreateTaskOptions): AITask {
  return {
    id: `task_${randomUUID()}`,
    type: options.type,
    agentType: options.agentType,
    priority: options.priority || 'normal',
    payload: options.payload,
    idempotencyKey: options.idempotencyKey || `${options.type}_${randomUUID()}`,
    tenantId: options.tenantId,
    userId: options.userId,
    market: options.market,
    maxRetries: options.maxRetries ?? 3,
    retryCount: 0,
    backoffMs: 1000,
    timeoutMs: options.timeoutMs ?? 300000,
    createdAt: new Date(),
    scheduledFor: options.scheduledFor,
    metadata: options.metadata,
  };
}

// =============================================================================
// Outcome Recording
// =============================================================================

export interface TaskOutcomeRecorder {
  record(outcome: TaskOutcome): Promise<Result<void>>;
  getByTaskId(taskId: string): Promise<Result<TaskOutcome | null>>;
  getRecent(limit: number): Promise<Result<TaskOutcome[]>>;
}

export class InMemoryOutcomeRecorder implements TaskOutcomeRecorder {
  private outcomes: Map<string, TaskOutcome> = new Map();

  record(outcome: TaskOutcome): Promise<Result<void>> {
    this.outcomes.set(outcome.taskId, outcome);
    return Promise.resolve(Ok(undefined));
  }

  getByTaskId(taskId: string): Promise<Result<TaskOutcome | null>> {
    return Promise.resolve(Ok(this.outcomes.get(taskId) || null));
  }

  getRecent(limit: number): Promise<Result<TaskOutcome[]>> {
    const all = Array.from(this.outcomes.values());
    all.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
    return Promise.resolve(Ok(all.slice(0, limit)));
  }

  clear(): void {
    this.outcomes.clear();
  }
}

// =============================================================================
// Queue Manager with Outcome Logging
// =============================================================================

export class AITaskQueueManager {
  private queue: TaskQueueManager;
  private outcomeRecorder: TaskOutcomeRecorder;
  private onOutcome?: (outcome: TaskOutcome) => Promise<void>;

  constructor(
    queue: TaskQueueManager,
    outcomeRecorder: TaskOutcomeRecorder,
    options?: {
      onOutcome?: (outcome: TaskOutcome) => Promise<void>;
    }
  ) {
    this.queue = queue;
    this.outcomeRecorder = outcomeRecorder;
    this.onOutcome = options?.onOutcome;
  }

  /**
   * Enqueue a task.
   */
  async enqueue(task: AITask): Promise<Result<string>> {
    return this.queue.add(task);
  }

  /**
   * Enqueue multiple tasks.
   */
  async enqueueBulk(tasks: AITask[]): Promise<Result<string[]>> {
    return this.queue.addBulk(tasks);
  }

  /**
   * Record task completion.
   */
  async recordOutcome(outcome: TaskOutcome): Promise<Result<void>> {
    const result = await this.outcomeRecorder.record(outcome);

    if (result.ok && this.onOutcome) {
      await this.onOutcome(outcome);
    }

    return result;
  }

  /**
   * Get queue health.
   */
  async getHealth(): Promise<QueueHealth> {
    return this.queue.getHealth();
  }

  /**
   * Pause the queue.
   */
  async pause(): Promise<void> {
    return this.queue.pause();
  }

  /**
   * Resume the queue.
   */
  async resume(): Promise<void> {
    return this.queue.resume();
  }

  /**
   * Get recent outcomes.
   */
  async getRecentOutcomes(limit: number = 100): Promise<Result<TaskOutcome[]>> {
    return this.outcomeRecorder.getRecent(limit);
  }

  /**
   * Calculate success rate from recent outcomes.
   */
  async getSuccessRate(limit: number = 100): Promise<number> {
    const outcomesResult = await this.outcomeRecorder.getRecent(limit);
    if (!outcomesResult.ok || outcomesResult.data.length === 0) {
      return 0;
    }

    const successful = outcomesResult.data.filter((o) => o.success).length;
    return (successful / outcomesResult.data.length) * 100;
  }

  /**
   * Close the queue.
   */
  async close(): Promise<void> {
    return this.queue.close();
  }
}

// =============================================================================
// Queue Registry
// =============================================================================

export class QueueRegistry {
  private queues: Map<string, AITaskQueueManager> = new Map();

  register(name: string, manager: AITaskQueueManager): void {
    this.queues.set(name, manager);
  }

  get(name: string): AITaskQueueManager | undefined {
    return this.queues.get(name);
  }

  getOrThrow(name: string): AITaskQueueManager {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue ${name} not found`);
    }
    return queue;
  }

  async getAllHealth(): Promise<QueueHealth[]> {
    const healthPromises = Array.from(this.queues.values()).map((q) => q.getHealth());
    return Promise.all(healthPromises);
  }

  async pauseAll(): Promise<void> {
    await Promise.all(Array.from(this.queues.values()).map((q) => q.pause()));
  }

  async resumeAll(): Promise<void> {
    await Promise.all(Array.from(this.queues.values()).map((q) => q.resume()));
  }

  async closeAll(): Promise<void> {
    await Promise.all(Array.from(this.queues.values()).map((q) => q.close()));
    this.queues.clear();
  }

  list(): string[] {
    return Array.from(this.queues.keys());
  }
}

// =============================================================================
// Default Queue Names
// =============================================================================

export const QUEUE_NAMES = {
  LEASING: 'ai:leasing',
  MAINTENANCE: 'ai:maintenance',
  DOCUMENTS: 'ai:documents',
  COMPLIANCE: 'ai:compliance',
  VOICE: 'ai:voice',
  ANALYTICS: 'ai:analytics',
  NOTIFICATIONS: 'ai:notifications',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
