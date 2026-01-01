/**
 * Persistence Layer Types
 *
 * Interfaces for workflow and activity state persistence.
 * Implementations can use Prisma, Redis, or other storage.
 */

import type { WorkflowExecution, ActivityExecution, WorkflowStatus, ActivityStatus, WorkflowStateEntry } from '../types';

/**
 * Options for creating a workflow execution record.
 */
export interface CreateWorkflowOptions {
  workflowId: string;
  runId: string;
  workflowName: string;
  workflowVersion: string;
  input: unknown;
  actorId?: string;
  organizationId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Options for updating a workflow execution.
 */
export interface UpdateWorkflowOptions {
  status?: WorkflowStatus;
  currentStep?: string;
  output?: unknown;
  error?: string;
  stateEntry?: WorkflowStateEntry;
}

/**
 * Options for querying workflow executions.
 */
export interface QueryWorkflowsOptions {
  workflowName?: string;
  status?: WorkflowStatus;
  organizationId?: string;
  actorId?: string;
  startedAfter?: Date;
  startedBefore?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Workflow execution store interface.
 */
export interface WorkflowStore {
  /**
   * Create a new workflow execution record.
   */
  create(options: CreateWorkflowOptions): Promise<WorkflowExecution>;

  /**
   * Get a workflow execution by ID.
   */
  get(workflowId: string): Promise<WorkflowExecution | null>;

  /**
   * Update a workflow execution.
   */
  update(workflowId: string, options: UpdateWorkflowOptions): Promise<WorkflowExecution>;

  /**
   * Update workflow status.
   */
  updateStatus(workflowId: string, status: WorkflowStatus): Promise<WorkflowExecution>;

  /**
   * Mark workflow as completed with output.
   */
  complete(workflowId: string, output: unknown): Promise<WorkflowExecution>;

  /**
   * Mark workflow as failed with error.
   */
  fail(workflowId: string, error: Error): Promise<WorkflowExecution>;

  /**
   * Cancel a workflow.
   */
  cancel(workflowId: string, reason?: string): Promise<WorkflowExecution>;

  /**
   * Add a state history entry.
   */
  addStateEntry(workflowId: string, entry: WorkflowStateEntry): Promise<WorkflowExecution>;

  /**
   * Query workflow executions.
   */
  query(options: QueryWorkflowsOptions): Promise<WorkflowExecution[]>;

  /**
   * Count workflow executions matching criteria.
   */
  count(options: QueryWorkflowsOptions): Promise<number>;
}

/**
 * Options for creating an activity execution record.
 */
export interface CreateActivityOptions {
  workflowId: string;
  activityName: string;
  idempotencyKey: string;
  input: unknown;
}

/**
 * Activity execution store interface.
 */
export interface ActivityStore {
  /**
   * Create a new activity execution record.
   */
  create(options: CreateActivityOptions): Promise<ActivityExecution>;

  /**
   * Get an activity execution by idempotency key.
   */
  getByKey(idempotencyKey: string): Promise<ActivityExecution | null>;

  /**
   * Get all activity executions for a workflow.
   */
  getByWorkflow(workflowId: string): Promise<ActivityExecution[]>;

  /**
   * Update activity status.
   */
  updateStatus(id: string, status: ActivityStatus): Promise<ActivityExecution>;

  /**
   * Mark activity as completed with output.
   */
  complete(id: string, output: unknown): Promise<ActivityExecution>;

  /**
   * Mark activity as failed with error.
   */
  fail(id: string, error: Error): Promise<ActivityExecution>;

  /**
   * Increment attempt count.
   */
  incrementAttempt(id: string): Promise<ActivityExecution>;
}
