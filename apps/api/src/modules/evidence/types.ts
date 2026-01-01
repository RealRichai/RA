/**
 * SOC2 Evidence Types
 *
 * TypeScript types and Zod schemas for the SOC2 evidence system.
 */

import { z } from 'zod';

// =============================================================================
// SOC2 Categories and Scopes
// =============================================================================

export const SOC2CategorySchema = z.enum([
  'Security',
  'Availability',
  'ProcessingIntegrity',
  'Confidentiality',
  'Privacy',
]);
export type SOC2Category = z.infer<typeof SOC2CategorySchema>;

export const EvidenceScopeSchema = z.enum(['org', 'tenant', 'user']);
export type EvidenceScope = z.infer<typeof EvidenceScopeSchema>;

export const EvidenceEventOutcomeSchema = z.enum([
  'success',
  'failure',
  'blocked',
  'allowed',
  'pending',
]);
export type EvidenceEventOutcome = z.infer<typeof EvidenceEventOutcomeSchema>;

export const ActorTypeSchema = z.enum(['user', 'system', 'api_key', 'service']);
export type ActorType = z.infer<typeof ActorTypeSchema>;

// =============================================================================
// Evidence Emit Input
// =============================================================================

export const EvidenceEmitInputSchema = z.object({
  // Required fields
  controlId: z.string().min(1),
  category: SOC2CategorySchema,
  eventType: z.string().min(1),
  eventOutcome: EvidenceEventOutcomeSchema,
  summary: z.string().min(1),
  scope: EvidenceScopeSchema,
  actorType: ActorTypeSchema,

  // Actor context
  actorId: z.string().uuid().optional(),
  actorEmail: z.string().email().optional(),
  organizationId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),

  // Event details
  details: z.record(z.unknown()).optional(),

  // References
  auditLogIds: z.array(z.string()).optional(),
  complianceCheckId: z.string().uuid().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),

  // Request context
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  requestId: z.string().optional(),

  // Timestamp (defaults to now)
  occurredAt: z.date().optional(),
});

export type EvidenceEmitInput = z.infer<typeof EvidenceEmitInputSchema>;

// =============================================================================
// Evidence Record (from database)
// =============================================================================

export interface EvidenceRecord {
  id: string;
  controlId: string;
  category: SOC2Category;
  actorId: string | null;
  actorEmail: string | null;
  actorType: string;
  organizationId: string | null;
  tenantId: string | null;
  scope: EvidenceScope;
  eventType: string;
  eventOutcome: string;
  summary: string;
  details: Record<string, unknown> | null;
  contentHash: string;
  previousHash: string | null;
  auditLogIds: string[];
  complianceCheckId: string | null;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  occurredAt: Date;
  recordedAt: Date;
}

// =============================================================================
// Query Parameters
// =============================================================================

export const EvidenceQueryParamsSchema = z.object({
  organizationId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  controlId: z.string().optional(),
  category: SOC2CategorySchema.optional(),
  eventType: z.string().optional(),
  eventOutcome: EvidenceEventOutcomeSchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  actorId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type EvidenceQueryParams = z.infer<typeof EvidenceQueryParamsSchema>;

// =============================================================================
// Verification Results
// =============================================================================

export interface IntegrityVerificationResult {
  valid: boolean;
  recordId: string;
  expectedHash: string;
  actualHash: string;
  errors: string[];
}

export interface ChainVerificationResult {
  valid: boolean;
  recordsChecked: number;
  brokenAt?: string;
  errors: string[];
}

// =============================================================================
// Audit Report
// =============================================================================

export interface EvidenceAuditReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalRecords: number;
  };
  byCategory: Record<string, number>;
  byControl: Record<string, number>;
  byOutcome: Record<string, number>;
  integrityStatus: {
    valid: boolean;
    errors: string[];
  };
}

// =============================================================================
// Control Mapping
// =============================================================================

export interface SOC2ControlMapping {
  controlId: string;
  category: SOC2Category;
  title: string;
  description: string;
}
