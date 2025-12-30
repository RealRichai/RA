/**
 * Policy Types
 *
 * Types for AI output policy checking and violation detection.
 */

import { z } from 'zod';

// =============================================================================
// AI Violation Codes
// =============================================================================

export const AIViolationCodeSchema = z.enum([
  // Fee-related violations
  'AI_SUGGESTED_ILLEGAL_BROKER_FEE',
  'AI_SUGGESTED_EXCESSIVE_SECURITY_DEPOSIT',
  'AI_SUGGESTED_EXCESSIVE_RENT_INCREASE',

  // FCHA-related violations
  'AI_SUGGESTED_PREMATURE_BACKGROUND_CHECK',
  'AI_SUGGESTED_FCHA_STAGE_SKIP',
  'AI_SUGGESTED_PROHIBITED_INQUIRY',

  // General violations
  'AI_OUTPUT_POLICY_VIOLATION',
  'AI_SUGGESTED_DISCRIMINATORY_CRITERIA',
]);
export type AIViolationCode = z.infer<typeof AIViolationCodeSchema>;

// =============================================================================
// Violation Severity
// =============================================================================

export const ViolationSeveritySchema = z.enum([
  'info',
  'warning',
  'violation',
  'critical',
]);
export type ViolationSeverity = z.infer<typeof ViolationSeveritySchema>;

// =============================================================================
// AI Violation
// =============================================================================

export const AIViolationSchema = z.object({
  /** Violation code */
  code: AIViolationCodeSchema,
  /** Human-readable message */
  message: z.string(),
  /** Severity level */
  severity: ViolationSeveritySchema,
  /** Text that triggered the violation */
  sourceText: z.string().optional(),
  /** Evidence data */
  evidence: z.record(z.unknown()).optional(),
  /** AI context when violation occurred */
  aiContext: z
    .object({
      model: z.string(),
      conversationId: z.string().uuid().optional(),
      messageIndex: z.number().int().optional(),
    })
    .optional(),
  /** Reference to the rule that was violated */
  ruleReference: z.string().optional(),
  /** Link to documentation */
  documentationUrl: z.string().url().optional(),
});
export type AIViolation = z.infer<typeof AIViolationSchema>;

// =============================================================================
// Recommended Fix
// =============================================================================

export const RecommendedFixSchema = z.object({
  /** Action to take */
  action: z.string(),
  /** Description of the fix */
  description: z.string(),
  /** Whether this fix can be auto-applied */
  autoFixAvailable: z.boolean(),
  /** How to auto-fix (if available) */
  autoFixAction: z.string().optional(),
  /** Priority of this fix */
  priority: z.enum(['low', 'medium', 'high', 'critical']),
});
export type RecommendedFix = z.infer<typeof RecommendedFixSchema>;

// =============================================================================
// Policy Check Result
// =============================================================================

export const PolicyCheckResultSchema = z.object({
  /** Whether all checks passed */
  passed: z.boolean(),
  /** All violations found */
  violations: z.array(AIViolationSchema),
  /** Recommended fixes */
  fixes: z.array(RecommendedFixSchema),
  /** When the check was performed */
  checkedAt: z.string().datetime(),
  /** Which checks were performed */
  checksPerformed: z.array(z.string()),
  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});
export type PolicyCheckResult = z.infer<typeof PolicyCheckResultSchema>;

// =============================================================================
// AI Gate Result
// =============================================================================

export const AIGateResultSchema = z.object({
  /** Whether the output is allowed */
  allowed: z.boolean(),
  /** Full policy check result */
  checkResult: PolicyCheckResultSchema,
  /** Reason if blocked */
  blockedReason: z.string().optional(),
  /** Sanitized output with violations removed/modified */
  sanitizedOutput: z.string().optional(),
});
export type AIGateResult = z.infer<typeof AIGateResultSchema>;

// =============================================================================
// Market Rules (for policy checks)
// =============================================================================

export interface FCHARules {
  enabled: boolean;
  prohibitedBeforeConditionalOffer: string[];
  stageOrder: string[];
}

export interface MarketRules {
  /** Whether tenants are prohibited from paying broker fees */
  brokerFeeTenantProhibited: boolean;
  /** Maximum security deposit in months */
  maxSecurityDepositMonths: number;
  /** FCHA rules */
  fcha: FCHARules;
}

// =============================================================================
// Policy Check Input
// =============================================================================

export interface AIOutputCheckInput {
  /** Content to check */
  content: string;
  /** Market ID for jurisdiction-specific rules */
  marketId: string;
  /** Optional context */
  context?: {
    conversationId?: string;
    agentType?: string;
    applicationStage?: string;
  };
}
