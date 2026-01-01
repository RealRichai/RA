/**
 * Core Workflow Types
 *
 * Temporal-compatible type definitions for durable workflows.
 * These types are designed to work with a local runtime now
 * and migrate seamlessly to Temporal later.
 */

/**
 * Workflow execution context passed to every workflow.
 * Contains metadata about the current execution.
 */
export interface WorkflowContext {
  /** Unique identifier for this workflow instance */
  workflowId: string;
  /** Unique identifier for this specific run (allows re-runs) */
  runId: string;
  /** Current attempt number (1-based) */
  attempt: number;
  /** When this execution started */
  startedAt: Date;
  /** User or system that initiated the workflow */
  actorId?: string;
  /** Organization context for multi-tenancy */
  organizationId?: string;
  /** Arbitrary metadata for the workflow */
  metadata: Record<string, unknown>;
}

/**
 * Workflow definition - the blueprint for a workflow.
 * @template TInput The input type for the workflow
 * @template TOutput The output type for the workflow
 */
export interface WorkflowDefinition<TInput = unknown, TOutput = unknown> {
  /** Unique name identifying this workflow type */
  name: string;
  /** Semantic version of this workflow definition */
  version: string;
  /** The main execution function */
  execute: (ctx: WorkflowContext, input: TInput) => Promise<TOutput>;
  /** Default retry policy for this workflow */
  retryPolicy?: RetryPolicy;
  /** Human-readable description */
  description?: string;
}

/**
 * Activity definition with idempotency support.
 * Activities are individual steps within a workflow.
 * @template TInput The input type for the activity
 * @template TOutput The output type for the activity
 */
export interface ActivityDefinition<TInput = unknown, TOutput = unknown> {
  /** Unique name identifying this activity type */
  name: string;
  /** The execution function */
  execute: (input: TInput) => Promise<TOutput>;
  /** Retry policy for this activity */
  retryPolicy: RetryPolicy;
  /** Function to generate idempotency key from input */
  idempotencyKey: (input: TInput) => string;
  /** Timeout in milliseconds */
  timeout: number;
  /** Human-readable description */
  description?: string;
}

/**
 * Retry policy configuration (Temporal-compatible).
 * Defines how failed activities should be retried.
 */
export interface RetryPolicy {
  /** Initial retry interval in milliseconds */
  initialInterval: number;
  /** Multiplier for subsequent retry intervals */
  backoffCoefficient: number;
  /** Maximum retry interval in milliseconds */
  maximumInterval: number;
  /** Maximum number of retry attempts */
  maximumAttempts: number;
  /** Error types that should not be retried */
  nonRetryableErrors?: string[];
}

/**
 * Status of a workflow execution.
 */
export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'waiting_signal'
  | 'timed_out';

/**
 * Status of an activity execution.
 */
export type ActivityStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'timed_out';

/**
 * A single entry in the workflow state history.
 */
export interface WorkflowStateEntry {
  /** The step/state at this point */
  step: string;
  /** When this state was entered */
  timestamp: Date;
  /** Optional data associated with this state */
  data?: Record<string, unknown>;
}

/**
 * Full workflow execution record.
 */
export interface WorkflowExecution {
  /** Database ID */
  id: string;
  /** Workflow instance ID */
  workflowId: string;
  /** Run ID for this execution */
  runId: string;
  /** Name of the workflow definition */
  workflowName: string;
  /** Version of the workflow definition */
  workflowVersion: string;
  /** Current execution status */
  status: WorkflowStatus;
  /** Input provided to the workflow */
  input: unknown;
  /** Output from the workflow (if completed) */
  output?: unknown;
  /** Error message (if failed) */
  error?: string;
  /** Current step in the workflow */
  currentStep?: string;
  /** History of state transitions */
  stateHistory: WorkflowStateEntry[];
  /** Actor who started the workflow */
  actorId?: string;
  /** Organization context */
  organizationId?: string;
  /** When the workflow started */
  startedAt: Date;
  /** When the workflow completed */
  completedAt?: Date;
}

/**
 * Activity execution record.
 */
export interface ActivityExecution {
  /** Database ID */
  id: string;
  /** Parent workflow ID */
  workflowId: string;
  /** Name of the activity */
  activityName: string;
  /** Idempotency key */
  idempotencyKey: string;
  /** Current execution status */
  status: ActivityStatus;
  /** Input to the activity */
  input: unknown;
  /** Output from the activity (if completed) */
  output?: unknown;
  /** Error message (if failed) */
  error?: string;
  /** Current attempt number */
  attempt: number;
  /** When the activity started */
  startedAt: Date;
  /** When the activity completed */
  completedAt?: Date;
}

/**
 * Signal to send to a waiting workflow.
 */
export interface WorkflowSignal {
  /** Name of the signal */
  name: string;
  /** Payload data */
  payload?: unknown;
  /** When the signal was sent */
  sentAt: Date;
}

/**
 * Options for waiting for a signal.
 */
export interface WaitForSignalOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Default value if timeout occurs */
  defaultValue?: unknown;
}

/**
 * Options for starting a workflow.
 */
export interface StartWorkflowOptions {
  /** Custom workflow ID (auto-generated if not provided) */
  workflowId?: string;
  /** Actor who is starting the workflow */
  actorId?: string;
  /** Organization context */
  organizationId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Error thrown when an activity exceeds maximum retries.
 */
export class MaxRetriesExceededError extends Error {
  constructor(
    public readonly activityName: string,
    public readonly attempts: number,
    public readonly lastError: Error | null
  ) {
    super(
      `Activity '${activityName}' failed after ${attempts} attempts: ${lastError?.message ?? 'Unknown error'}`
    );
    this.name = 'MaxRetriesExceededError';
  }
}

/**
 * Error thrown when an activity times out.
 */
export class ActivityTimeoutError extends Error {
  constructor(
    public readonly activityName: string,
    public readonly timeoutMs: number
  ) {
    super(`Activity '${activityName}' timed out after ${timeoutMs}ms`);
    this.name = 'ActivityTimeoutError';
  }
}

/**
 * Error thrown when a workflow is cancelled.
 */
export class WorkflowCancelledError extends Error {
  constructor(
    public readonly workflowId: string,
    public readonly reason?: string
  ) {
    super(`Workflow '${workflowId}' was cancelled: ${reason ?? 'No reason provided'}`);
    this.name = 'WorkflowCancelledError';
  }
}

/**
 * Error thrown when a signal wait times out.
 */
export class SignalTimeoutError extends Error {
  constructor(
    public readonly signalName: string,
    public readonly timeoutMs: number
  ) {
    super(`Timed out waiting for signal '${signalName}' after ${timeoutMs}ms`);
    this.name = 'SignalTimeoutError';
  }
}
