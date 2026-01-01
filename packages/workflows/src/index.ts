/**
 * @realriches/workflows
 *
 * Durable workflow foundation for long-running processes.
 * Temporal-ready architecture with local runtime for development.
 *
 * @example
 * ```typescript
 * import {
 *   LocalWorkflowRuntime,
 *   NYCApplicationComplianceWorkflow,
 *   nycComplianceActivities,
 * } from '@realriches/workflows';
 *
 * // Register activities
 * nycComplianceActivities.forEach(registerActivity);
 *
 * // Create runtime
 * const runtime = new LocalWorkflowRuntime({
 *   workflowStore: new PrismaWorkflowStore(prisma),
 *   activityStore: new PrismaActivityStore(prisma),
 *   activityCache: new InMemoryActivityCache(),
 * });
 *
 * // Start workflow
 * const workflowId = await runtime.startWorkflow(
 *   NYCApplicationComplianceWorkflow,
 *   {
 *     applicationId: 'app_123',
 *     applicantId: 'user_456',
 *     propertyId: 'prop_789',
 *     unitId: 'unit_101',
 *     organizationId: 'org_111',
 *     marketId: 'NYC',
 *   }
 * );
 * ```
 */

// Core types
export * from './types';

// Retry policies
export * from './retry';

// Activities
export * from './activities';

// Persistence
export * from './persistence';

// Runtime
export * from './runtime';

// Workflows
export * from './workflows';
