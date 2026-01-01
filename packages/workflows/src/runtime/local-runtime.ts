/**
 * Local Workflow Runtime
 *
 * In-process executor for workflows and activities.
 * Designed to be swapped with TemporalRuntime for production.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  WorkflowDefinition,
  ActivityDefinition,
  WorkflowContext,
  WorkflowExecution,
  StartWorkflowOptions,
  WaitForSignalOptions,
} from '../types';
import {
  MaxRetriesExceededError,
  ActivityTimeoutError,
  SignalTimeoutError,
} from '../types';
import type { WorkflowStore, ActivityStore } from '../persistence/types';
import type { ActivityResultCache } from '../activities/idempotency';
import { calculateRetryDelay, addJitter, isRetryableError } from '../retry/policies';

/**
 * Signal storage for workflow signals.
 */
interface SignalStore {
  /** Store a signal for a workflow */
  send(workflowId: string, signalName: string, payload?: unknown): Promise<void>;
  /** Wait for a signal (returns null if timeout) */
  waitFor(workflowId: string, signalName: string, timeoutMs: number): Promise<unknown | null>;
  /** Check if a signal exists */
  exists(workflowId: string, signalName: string): Promise<boolean>;
}

/**
 * In-memory signal store for local runtime.
 */
export class InMemorySignalStore implements SignalStore {
  private signals = new Map<string, { payload: unknown; receivedAt: Date }>();
  private waiters = new Map<string, { resolve: (value: unknown) => void; timeout: NodeJS.Timeout }>();

  private key(workflowId: string, signalName: string): string {
    return `${workflowId}:${signalName}`;
  }

  async send(workflowId: string, signalName: string, payload?: unknown): Promise<void> {
    const key = this.key(workflowId, signalName);

    // Store the signal
    this.signals.set(key, { payload, receivedAt: new Date() });

    // Wake up any waiters
    const waiter = this.waiters.get(key);
    if (waiter) {
      clearTimeout(waiter.timeout);
      waiter.resolve(payload);
      this.waiters.delete(key);
    }
  }

  async waitFor(workflowId: string, signalName: string, timeoutMs: number): Promise<unknown | null> {
    const key = this.key(workflowId, signalName);

    // Check if signal already exists
    const existing = this.signals.get(key);
    if (existing) {
      this.signals.delete(key);
      return existing.payload;
    }

    // Wait for signal with timeout
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.waiters.delete(key);
        resolve(null);
      }, timeoutMs);

      this.waiters.set(key, { resolve, timeout });
    });
  }

  async exists(workflowId: string, signalName: string): Promise<boolean> {
    return this.signals.has(this.key(workflowId, signalName));
  }

  /** Clear all signals (for testing) */
  clear(): void {
    this.signals.clear();
    for (const waiter of this.waiters.values()) {
      clearTimeout(waiter.timeout);
    }
    this.waiters.clear();
  }
}

/**
 * Runtime options.
 */
export interface LocalRuntimeOptions {
  /** Workflow persistence store */
  workflowStore: WorkflowStore;
  /** Activity persistence store */
  activityStore: ActivityStore;
  /** Activity result cache for idempotency */
  activityCache: ActivityResultCache;
  /** Signal store for workflow signals */
  signalStore?: SignalStore;
  /** Default activity result TTL in seconds */
  defaultActivityTtl?: number;
}

/**
 * Local workflow runtime.
 * Executes workflows in-process with full retry and idempotency support.
 */
export class LocalWorkflowRuntime {
  private workflowStore: WorkflowStore;
  private activityStore: ActivityStore;
  private activityCache: ActivityResultCache;
  private signalStore: SignalStore;
  private defaultActivityTtl: number;

  /** Active workflow contexts for signal handling */
  private activeWorkflows = new Map<string, WorkflowContext>();

  constructor(options: LocalRuntimeOptions) {
    this.workflowStore = options.workflowStore;
    this.activityStore = options.activityStore;
    this.activityCache = options.activityCache;
    this.signalStore = options.signalStore ?? new InMemorySignalStore();
    this.defaultActivityTtl = options.defaultActivityTtl ?? 24 * 60 * 60; // 24 hours
  }

  /**
   * Start a new workflow execution.
   * Returns immediately with the workflow ID.
   * The workflow executes asynchronously.
   */
  async startWorkflow<TInput, TOutput>(
    workflow: WorkflowDefinition<TInput, TOutput>,
    input: TInput,
    options?: StartWorkflowOptions
  ): Promise<string> {
    const workflowId = options?.workflowId ?? `wf_${uuidv4()}`;
    const runId = `run_${uuidv4()}`;

    // Persist initial state
    await this.workflowStore.create({
      workflowId,
      runId,
      workflowName: workflow.name,
      workflowVersion: workflow.version,
      input,
      actorId: options?.actorId,
      organizationId: options?.organizationId,
      metadata: options?.metadata,
    });

    // Execute asynchronously (don't await)
    this.executeWorkflow(workflow, workflowId, runId, input, options).catch((err) => {
      console.error(`Workflow ${workflowId} failed:`, err);
    });

    return workflowId;
  }

  /**
   * Execute a workflow synchronously.
   * Waits for completion and returns the result.
   */
  async executeWorkflowSync<TInput, TOutput>(
    workflow: WorkflowDefinition<TInput, TOutput>,
    input: TInput,
    options?: StartWorkflowOptions
  ): Promise<TOutput> {
    const workflowId = options?.workflowId ?? `wf_${uuidv4()}`;
    const runId = `run_${uuidv4()}`;

    // Persist initial state
    await this.workflowStore.create({
      workflowId,
      runId,
      workflowName: workflow.name,
      workflowVersion: workflow.version,
      input,
      actorId: options?.actorId,
      organizationId: options?.organizationId,
      metadata: options?.metadata,
    });

    return this.executeWorkflow(workflow, workflowId, runId, input, options);
  }

  /**
   * Internal workflow execution.
   */
  private async executeWorkflow<TInput, TOutput>(
    workflow: WorkflowDefinition<TInput, TOutput>,
    workflowId: string,
    runId: string,
    input: TInput,
    options?: StartWorkflowOptions
  ): Promise<TOutput> {
    const ctx: WorkflowContext = {
      workflowId,
      runId,
      attempt: 1,
      startedAt: new Date(),
      actorId: options?.actorId,
      organizationId: options?.organizationId,
      metadata: options?.metadata ?? {},
    };

    // Track active workflow
    this.activeWorkflows.set(workflowId, ctx);

    try {
      await this.workflowStore.updateStatus(workflowId, 'running');

      const output = await workflow.execute(ctx, input);

      await this.workflowStore.complete(workflowId, output);
      return output;
    } catch (error) {
      await this.workflowStore.fail(workflowId, error as Error);
      throw error;
    } finally {
      this.activeWorkflows.delete(workflowId);
    }
  }

  /**
   * Execute an activity with retry and idempotency.
   */
  async executeActivity<TInput, TOutput>(
    activity: ActivityDefinition<TInput, TOutput>,
    input: TInput,
    workflowId: string
  ): Promise<TOutput> {
    const idempotencyKey = activity.idempotencyKey(input);

    // Check for cached result (idempotency)
    const cached = await this.activityCache.get(idempotencyKey);
    if (cached) {
      return cached.result as TOutput;
    }

    // Check for existing completed activity in database
    const existingActivity = await this.activityStore.getByKey(idempotencyKey);
    if (existingActivity?.status === 'completed' && existingActivity.output !== undefined) {
      // Cache and return
      await this.activityCache.set(idempotencyKey, existingActivity.output, this.defaultActivityTtl);
      return existingActivity.output as TOutput;
    }

    // Create activity record
    const activityRecord = await this.activityStore.create({
      workflowId,
      activityName: activity.name,
      idempotencyKey,
      input,
    });

    // Execute with retry
    return this.executeWithRetry(activity, input, activityRecord.id, idempotencyKey);
  }

  /**
   * Execute an activity with retry logic.
   */
  private async executeWithRetry<TInput, TOutput>(
    activity: ActivityDefinition<TInput, TOutput>,
    input: TInput,
    activityId: string,
    idempotencyKey: string
  ): Promise<TOutput> {
    const policy = activity.retryPolicy;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < policy.maximumAttempts) {
      attempt++;

      try {
        await this.activityStore.updateStatus(activityId, 'running');

        // Execute with timeout
        const result = await this.withTimeout(activity.execute(input), activity.timeout, activity.name);

        // Cache result for idempotency
        await this.activityCache.set(idempotencyKey, result, this.defaultActivityTtl);

        // Mark activity complete
        await this.activityStore.complete(activityId, result);

        return result;
      } catch (error) {
        lastError = error as Error;

        // Check if error is non-retryable
        if (!isRetryableError(lastError, policy)) {
          await this.activityStore.fail(activityId, lastError);
          throw lastError;
        }

        // Check if we've exhausted retries
        if (attempt >= policy.maximumAttempts) {
          await this.activityStore.fail(activityId, lastError);
          throw new MaxRetriesExceededError(activity.name, attempt, lastError);
        }

        // Calculate delay with jitter
        const delay = addJitter(calculateRetryDelay(policy, attempt));

        // Mark as retrying and increment attempt
        await this.activityStore.incrementAttempt(activityId);

        // Wait before retry
        await this.sleep(delay);
      }
    }

    // Should not reach here, but just in case
    throw new MaxRetriesExceededError(activity.name, attempt, lastError);
  }

  /**
   * Wait for a signal in the workflow.
   */
  async waitForSignal(
    workflowId: string,
    signalName: string,
    options?: WaitForSignalOptions
  ): Promise<unknown> {
    const timeoutMs = options?.timeout ?? 7 * 24 * 60 * 60 * 1000; // 7 days default

    // Update workflow status
    await this.workflowStore.updateStatus(workflowId, 'waiting_signal');
    await this.workflowStore.addStateEntry(workflowId, {
      step: `waiting_for_signal:${signalName}`,
      timestamp: new Date(),
    });

    const result = await this.signalStore.waitFor(workflowId, signalName, timeoutMs);

    // Update workflow status back to running
    await this.workflowStore.updateStatus(workflowId, 'running');

    if (result === null) {
      if (options?.defaultValue !== undefined) {
        return options.defaultValue;
      }
      throw new SignalTimeoutError(signalName, timeoutMs);
    }

    return result;
  }

  /**
   * Send a signal to a workflow.
   */
  async sendSignal(workflowId: string, signalName: string, payload?: unknown): Promise<void> {
    await this.signalStore.send(workflowId, signalName, payload);

    // Add state entry
    await this.workflowStore.addStateEntry(workflowId, {
      step: `signal_received:${signalName}`,
      timestamp: new Date(),
      data: { payload },
    });
  }

  /**
   * Get workflow execution status.
   */
  async getWorkflow(workflowId: string): Promise<WorkflowExecution | null> {
    return this.workflowStore.get(workflowId);
  }

  /**
   * Cancel a running workflow.
   */
  async cancelWorkflow(workflowId: string, reason?: string): Promise<void> {
    await this.workflowStore.cancel(workflowId, reason);
  }

  /**
   * Execute with timeout.
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, activityName: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new ActivityTimeoutError(activityName, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Sleep for a given duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create an activity executor bound to a specific workflow.
   * This provides a cleaner API for workflow definitions.
   */
  createActivityExecutor(workflowId: string) {
    return {
      execute: <TInput, TOutput>(
        activity: ActivityDefinition<TInput, TOutput>,
        input: TInput
      ): Promise<TOutput> => {
        return this.executeActivity(activity, input, workflowId);
      },
    };
  }

  /**
   * Create a signal handler bound to a specific workflow.
   */
  createSignalHandler(workflowId: string) {
    return {
      waitFor: (signalName: string, options?: WaitForSignalOptions): Promise<unknown> => {
        return this.waitForSignal(workflowId, signalName, options);
      },
    };
  }
}

/**
 * Generate a unique workflow ID.
 */
export function generateWorkflowId(): string {
  return `wf_${uuidv4()}`;
}

/**
 * Generate a unique run ID.
 */
export function generateRunId(): string {
  return `run_${uuidv4()}`;
}
