/**
 * Ledger Types
 *
 * Types for AgentRun audit logging and cost tracking.
 */

import { z } from 'zod';

import { PolicyCheckResultSchema } from '../policy/types';
import { RedactionReportSchema } from '../redaction/types';
import { LLMModelSchema } from '../types';

// =============================================================================
// Agent Run Status
// =============================================================================

export const AgentRunStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'blocked', // Blocked by policy gate
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

// =============================================================================
// Agent Run Input
// =============================================================================

export const AgentRunInputSchema = z.object({
  // Context
  userId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  marketId: z.string().optional(),

  // Request
  model: LLMModelSchema,
  provider: z.string(),
  agentType: z.string().optional(),

  // Messages (already redacted)
  promptMessages: z.array(
    z.object({
      role: z.string(),
      content: z.string(),
    })
  ),

  // Request metadata
  requestConfig: z
    .object({
      timeout: z.number().optional(),
      maxTokens: z.number().optional(),
      temperature: z.number().optional(),
    })
    .optional(),

  requestId: z.string().optional(),
});
export type AgentRunInput = z.infer<typeof AgentRunInputSchema>;

// =============================================================================
// Agent Run
// =============================================================================

export const AgentRunSchema = z.object({
  id: z.string().uuid(),

  // Context references
  userId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  marketId: z.string().optional(),

  // Request details
  model: LLMModelSchema,
  provider: z.string(),
  agentType: z.string().optional(),

  // Redacted content (never store original PII)
  promptRedacted: z.string(),
  outputRedacted: z.string().optional(),

  // Redaction reports
  promptRedactionReport: RedactionReportSchema.optional(),
  outputRedactionReport: RedactionReportSchema.optional(),

  // Policy check result
  policyCheckResult: PolicyCheckResultSchema.optional(),

  // Token usage
  tokensPrompt: z.number().int().min(0),
  tokensCompletion: z.number().int().min(0),
  tokensTotal: z.number().int().min(0),

  // Cost tracking (cents)
  cost: z.number().min(0),

  // Status and timing
  status: AgentRunStatusSchema,
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
  processingTimeMs: z.number().optional(),

  // Error info
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),

  // Request metadata
  requestId: z.string().optional(),
  providerRequestId: z.string().optional(),

  // Audit
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

// =============================================================================
// Budget Usage
// =============================================================================

export const BudgetUsageSchema = z.object({
  /** Daily cost for user in cents */
  userDaily: z.number().min(0),
  /** Daily cost for organization in cents */
  orgDaily: z.number().min(0),
  /** Global daily cost in cents */
  globalDaily: z.number().min(0),
});
export type BudgetUsage = z.infer<typeof BudgetUsageSchema>;
