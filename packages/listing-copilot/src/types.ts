/**
 * Listing Copilot Types
 *
 * Core types and Zod schemas for the Listing Copilot workflow.
 */

import { z } from 'zod';

// ============================================================================
// Listing Draft Types
// ============================================================================

export const ListingDraftSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  propertyType: z.enum(['apartment', 'house', 'condo', 'townhouse', 'commercial']),
  bedrooms: z.number().int().min(0),
  bathrooms: z.number().min(0),
  squareFeet: z.number().positive().optional(),
  monthlyRent: z.number().positive(),
  address: z.object({
    street: z.string(),
    unit: z.string().optional(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
  }),
  amenities: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
  /** Broker fee information for FARE Act compliance */
  hasBrokerFee: z.boolean().default(false),
  brokerFeeAmount: z.number().optional(),
  brokerFeePaidBy: z.enum(['tenant', 'landlord']).optional(),
  agentRepresentation: z.enum(['landlord', 'tenant', 'dual', 'none']).optional(),
});

export type ListingDraft = z.infer<typeof ListingDraftSchema>;

// ============================================================================
// Property Facts Types
// ============================================================================

export const PropertyFactsSchema = z.object({
  yearBuilt: z.number().int().optional(),
  lotSize: z.number().positive().optional(),
  parkingSpaces: z.number().int().min(0).optional(),
  heatingType: z.string().optional(),
  coolingType: z.string().optional(),
  laundryType: z.enum(['in_unit', 'building', 'none']).optional(),
  petPolicy: z.enum(['allowed', 'cats_only', 'dogs_only', 'no_pets', 'case_by_case']).optional(),
  utilities: z.object({
    electricIncluded: z.boolean().default(false),
    gasIncluded: z.boolean().default(false),
    waterIncluded: z.boolean().default(false),
    internetIncluded: z.boolean().default(false),
  }).optional(),
  nearbyTransit: z.array(z.string()).default([]),
  neighborhoodHighlights: z.array(z.string()).default([]),
  securityDeposit: z.number().optional(),
  leaseTermMonths: z.number().int().positive().optional(),
  availableDate: z.string().optional(),
  /** Additional facts for market-specific compliance */
  isRentStabilized: z.boolean().optional(),
  legalRentAmount: z.number().optional(),
});

export type PropertyFacts = z.infer<typeof PropertyFactsSchema>;

// ============================================================================
// Channel Types
// ============================================================================

export const ChannelTargetSchema = z.enum([
  'zillow',
  'streeteasy',
  'mls_reso',
  'apartments_com',
  'realtor_com',
  'trulia',
]);

export type ChannelTarget = z.infer<typeof ChannelTargetSchema>;

// ============================================================================
// Copilot Input Types
// ============================================================================

export const CopilotOptionsSchema = z.object({
  /** Dry-run mode - simulates channel posting without actually posting. Default: true */
  dryRun: z.boolean().default(true),
  /** Skip compliance checks - for testing only. Default: false */
  skipCompliance: z.boolean().default(false),
  /** Target channels for publishing */
  channels: z.array(ChannelTargetSchema).default([]),
});

export type CopilotOptions = z.infer<typeof CopilotOptionsSchema>;

export const TemplateOverridesSchema = z.object({
  flyerTemplateId: z.string().optional(),
  brochureTemplateId: z.string().optional(),
  deckTemplateId: z.string().optional(),
});

export type TemplateOverrides = z.infer<typeof TemplateOverridesSchema>;

export const CopilotInputSchema = z.object({
  listingDraft: ListingDraftSchema,
  propertyFacts: PropertyFactsSchema,
  marketId: z.string(),
  tenantId: z.string(),
  templateOverrides: TemplateOverridesSchema.optional(),
  options: CopilotOptionsSchema.optional(),
});

export type CopilotInput = z.infer<typeof CopilotInputSchema>;

// ============================================================================
// Optimized Listing Copy Types
// ============================================================================

export interface OptimizedListingCopy {
  title: string;
  description: string;
  highlights: string[];
  seoKeywords: string[];
  /** Market-specific disclosure text */
  disclosureText?: string;
  /** Prompt hash for audit trail */
  promptHash: string;
  /** Token usage for budget tracking */
  tokensUsed: number;
}

// ============================================================================
// Artifact Types
// ============================================================================

export interface ArtifactRef {
  id: string;
  type: 'flyer_pdf' | 'brochure_pdf' | 'broker_deck_pptx';
  vaultPath: string;
  contentType: string;
  checksum: string;
  sizeBytes: number;
  generatedAt: Date;
  evidenceId: string;
}

export interface GeneratedArtifacts {
  flyerPdf?: ArtifactRef;
  brochurePdf?: ArtifactRef;
  brokerDeckPptx?: ArtifactRef;
}

// ============================================================================
// Compliance Types
// ============================================================================

export interface ComplianceViolation {
  code: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  field?: string;
  evidence?: Record<string, unknown>;
}

export interface ComplianceGateResult {
  passed: boolean;
  violations: ComplianceViolation[];
  marketPack: string;
  marketPackVersion: string;
  checksPerformed: string[];
  gatedAt: Date;
}

// ============================================================================
// Channel Simulation Types
// ============================================================================

export interface ChannelPayload {
  channel: ChannelTarget;
  payload: Record<string, unknown>;
  isValid: boolean;
  validationErrors?: string[];
}

export interface ChannelSimulationResult {
  channel: ChannelTarget;
  wouldPost: boolean;
  simulatedPayload: ChannelPayload;
  timestamp: Date;
}

export interface ChannelPostResult {
  channel: ChannelTarget;
  success: boolean;
  externalId?: string;
  error?: string;
  timestamp: Date;
}

// ============================================================================
// Evidence Types
// ============================================================================

export interface ToolUsageEntry {
  tool: string;
  inputHash: string;
  outputHash: string;
  durationMs: number;
  timestamp: Date;
}

export interface PolicyGateResult {
  gate: string;
  passed: boolean;
  violationCount: number;
  timestamp: Date;
}

export interface CopilotEvidenceRecord {
  runId: string;
  tenantId: string;
  listingId?: string;
  promptHash: string;
  toolUsage: ToolUsageEntry[];
  policyGateResults: PolicyGateResult[];
  artifactEvidenceIds: string[];
  budgetConsumed: number;
  status: 'completed' | 'blocked' | 'failed';
  timestamp: Date;
}

// ============================================================================
// Workflow Result Types
// ============================================================================

export type CopilotStatus = 'pending' | 'running' | 'completed' | 'blocked' | 'failed';

export interface CopilotResult {
  runId: string;
  status: CopilotStatus;
  generatedCopy?: OptimizedListingCopy;
  artifacts?: GeneratedArtifacts;
  complianceResult?: ComplianceGateResult;
  channelResults?: ChannelSimulationResult[] | ChannelPostResult[];
  evidence: CopilotEvidenceRecord;
  error?: string;
  completedAt?: Date;
}

// ============================================================================
// Template Types
// ============================================================================

export const TemplateTypeSchema = z.enum(['flyer', 'brochure', 'broker_deck']);
export type TemplateType = z.infer<typeof TemplateTypeSchema>;

export interface CopilotTemplate {
  id: string;
  tenantId: string;
  name: string;
  type: TemplateType;
  vaultPath: string;
  validated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface CopilotConfig {
  /** Default to dry-run mode */
  defaultDryRun: boolean;
  /** Maximum tokens per LLM call */
  maxTokensPerCall: number;
  /** Budget limit per tenant per day (in tokens) */
  dailyBudgetLimit: number;
  /** Default templates directory */
  defaultTemplatesPath: string;
  /** Vault bucket for artifacts */
  artifactsBucket: string;
  /** Enable evidence logging */
  evidenceEnabled: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

export class CopilotError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CopilotError';
  }
}

export class CopyGenerationError extends CopilotError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'COPY_GENERATION_FAILED', details);
    this.name = 'CopyGenerationError';
  }
}

export class ArtifactGenerationError extends CopilotError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ARTIFACT_GENERATION_FAILED', details);
    this.name = 'ArtifactGenerationError';
  }
}

export class ComplianceBlockedError extends CopilotError {
  constructor(
    message: string,
    public readonly violations: ComplianceViolation[]
  ) {
    super(message, 'COMPLIANCE_BLOCKED', { violations });
    this.name = 'ComplianceBlockedError';
  }
}

export class BudgetExceededError extends CopilotError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'BUDGET_EXCEEDED', details);
    this.name = 'BudgetExceededError';
  }
}

export class KillSwitchActiveError extends CopilotError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'KILL_SWITCH_ACTIVE', details);
    this.name = 'KillSwitchActiveError';
  }
}

export class TemplateValidationError extends CopilotError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TEMPLATE_VALIDATION_FAILED', details);
    this.name = 'TemplateValidationError';
  }
}
