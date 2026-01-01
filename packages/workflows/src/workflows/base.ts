/**
 * Base Workflow Utilities
 *
 * Helper functions for defining workflows.
 */

import type { WorkflowDefinition, RetryPolicy } from '../types';

/**
 * Options for defining a workflow.
 */
export interface DefineWorkflowOptions<TInput, TOutput> {
  /** Unique name for this workflow */
  name: string;
  /** Semantic version */
  version: string;
  /** The execution function */
  execute: (
    ctx: import('../types').WorkflowContext,
    input: TInput
  ) => Promise<TOutput>;
  /** Default retry policy */
  retryPolicy?: RetryPolicy;
  /** Human-readable description */
  description?: string;
}

/**
 * Define a new workflow with the specified options.
 */
export function defineWorkflow<TInput, TOutput>(
  options: DefineWorkflowOptions<TInput, TOutput>
): WorkflowDefinition<TInput, TOutput> {
  return {
    name: options.name,
    version: options.version,
    execute: options.execute,
    retryPolicy: options.retryPolicy,
    description: options.description,
  };
}

/**
 * Workflow registry for type-safe workflow lookup.
 */
const workflowRegistry = new Map<string, WorkflowDefinition<unknown, unknown>>();

/**
 * Register a workflow definition.
 */
export function registerWorkflow<TInput, TOutput>(
  workflow: WorkflowDefinition<TInput, TOutput>
): void {
  if (workflowRegistry.has(workflow.name)) {
    throw new Error(`Workflow '${workflow.name}' is already registered`);
  }
  workflowRegistry.set(workflow.name, workflow as WorkflowDefinition<unknown, unknown>);
}

/**
 * Get a registered workflow by name.
 */
export function getWorkflow(name: string): WorkflowDefinition<unknown, unknown> | undefined {
  return workflowRegistry.get(name);
}

/**
 * Check if a workflow is registered.
 */
export function hasWorkflow(name: string): boolean {
  return workflowRegistry.has(name);
}

/**
 * Get all registered workflow names.
 */
export function getWorkflowNames(): string[] {
  return Array.from(workflowRegistry.keys());
}

/**
 * Clear all registered workflows (for testing).
 */
export function clearWorkflowRegistry(): void {
  workflowRegistry.clear();
}
