/**
 * Activity Type Definitions
 *
 * Types for defining and executing workflow activities.
 */

import type { ActivityDefinition, RetryPolicy } from '../types';

/**
 * Options for defining an activity.
 */
export interface DefineActivityOptions<TInput, TOutput> {
  /** Unique name for this activity */
  name: string;
  /** Retry policy configuration */
  retryPolicy: RetryPolicy;
  /** Function to generate idempotency key from input */
  idempotencyKey: (input: TInput) => string;
  /** Timeout in milliseconds */
  timeout: number;
  /** The execution function */
  execute: (input: TInput) => Promise<TOutput>;
  /** Optional description */
  description?: string;
}

/**
 * Define a new activity with the specified options.
 * This is the primary way to create activities.
 */
export function defineActivity<TInput, TOutput>(
  options: DefineActivityOptions<TInput, TOutput>
): ActivityDefinition<TInput, TOutput> {
  return {
    name: options.name,
    retryPolicy: options.retryPolicy,
    idempotencyKey: options.idempotencyKey,
    timeout: options.timeout,
    execute: options.execute,
    description: options.description,
  };
}

/**
 * Execution context for an activity.
 * Provides access to workflow context within an activity.
 */
export interface ActivityContext {
  /** Parent workflow ID */
  workflowId: string;
  /** Current attempt number (1-based) */
  attempt: number;
  /** Activity start time */
  startedAt: Date;
  /** Heartbeat function to keep activity alive */
  heartbeat: () => Promise<void>;
}

/**
 * Result of an activity execution.
 */
export interface ActivityResult<T> {
  /** Whether the activity succeeded */
  success: boolean;
  /** The result value (if successful) */
  value?: T;
  /** Error message (if failed) */
  error?: string;
  /** Number of attempts made */
  attempts: number;
  /** Total execution time in ms */
  durationMs: number;
}

/**
 * Activity registry entry.
 */
export interface RegisteredActivity {
  /** The activity definition */
  definition: ActivityDefinition<unknown, unknown>;
  /** When this activity was registered */
  registeredAt: Date;
}
