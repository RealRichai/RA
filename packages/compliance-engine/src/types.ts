/**
 * Compliance Engine Types
 *
 * Core type definitions for compliance enforcement protocol.
 */

import { z } from 'zod';

// ============================================================================
// Violation Types
// ============================================================================

export const ViolationSeveritySchema = z.enum([
  'info',
  'warning',
  'violation',
  'critical',
]);

export type ViolationSeverity = z.infer<typeof ViolationSeveritySchema>;

export const ViolationCodeSchema = z.enum([
  // FARE Act violations
  'FARE_BROKER_FEE_PROHIBITED',
  'FARE_BROKER_FEE_EXCESSIVE',
  'FARE_INCOME_REQUIREMENT_EXCESSIVE',
  'FARE_CREDIT_SCORE_THRESHOLD_EXCESSIVE',
  'FARE_DISCLOSURE_MISSING',

  // FCHA violations
  'FCHA_CRIMINAL_CHECK_BEFORE_OFFER',
  'FCHA_CREDIT_CHECK_BEFORE_OFFER',
  'FCHA_STAGE_ORDER_VIOLATION',
  'FCHA_PROHIBITED_INQUIRY',

  // Good Cause violations
  'GOOD_CAUSE_RENT_INCREASE_EXCESSIVE',
  'GOOD_CAUSE_EVICTION_INVALID_REASON',
  'GOOD_CAUSE_NOTICE_PERIOD_INSUFFICIENT',
  'GOOD_CAUSE_CPI_FALLBACK_USED',

  // Rent Stabilization violations
  'RENT_STAB_PREFERENTIAL_EXCEEDS_LEGAL',
  'RENT_STAB_INCREASE_EXCEEDS_RGB',
  'RENT_STAB_REGISTRATION_MISSING',

  // Security Deposit violations
  'SECURITY_DEPOSIT_EXCESSIVE',
  'SECURITY_DEPOSIT_RETURN_OVERDUE',

  // Disclosure violations
  'DISCLOSURE_NOT_DELIVERED',
  'DISCLOSURE_NOT_ACKNOWLEDGED',
  'DISCLOSURE_EXPIRED',

  // GDPR violations (UK)
  'GDPR_CONSENT_MISSING',
  'GDPR_DATA_RETENTION_EXCEEDED',
  'GDPR_LAWFUL_BASIS_MISSING',
  'GDPR_PRIVACY_NOTICE_MISSING',
  'GDPR_DATA_SUBJECT_REQUEST_OVERDUE',
  'GDPR_PERSONAL_DATA_UNPROTECTED',
  'GDPR_REDACTION_REQUIRED',

  // General
  'MARKET_RULE_VIOLATION',
  'FEATURE_DISABLED',
]);

export type ViolationCode = z.infer<typeof ViolationCodeSchema>;

export const ViolationSchema = z.object({
  code: ViolationCodeSchema,
  message: z.string(),
  severity: ViolationSeveritySchema,
  evidence: z.record(z.unknown()).optional(),
  ruleReference: z.string().optional(),
  documentationUrl: z.string().url().optional(),
});

export type Violation = z.infer<typeof ViolationSchema>;

// ============================================================================
// Recommended Fix Types
// ============================================================================

export const RecommendedFixSchema = z.object({
  action: z.string(),
  description: z.string(),
  autoFixAvailable: z.boolean().default(false),
  autoFixAction: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
});

export type RecommendedFix = z.infer<typeof RecommendedFixSchema>;

// ============================================================================
// Compliance Decision Object
// ============================================================================

export const ComplianceDecisionSchema = z.object({
  passed: z.boolean(),
  violations: z.array(ViolationSchema),
  recommendedFixes: z.array(RecommendedFixSchema),
  policyVersion: z.string(),
  marketPack: z.string(),
  marketPackVersion: z.string(),
  checkedAt: z.string().datetime(),
  checksPerformed: z.array(z.string()),
  metadata: z.record(z.unknown()).optional(),
});

export type ComplianceDecision = z.infer<typeof ComplianceDecisionSchema>;

// ============================================================================
// Market Pack Types
// ============================================================================

export const MarketPackIdSchema = z.enum([
  'NYC_STRICT',
  'US_STANDARD',
  'CA_STANDARD',
  'TX_STANDARD',
  'UK_GDPR',
]);

export type MarketPackId = z.infer<typeof MarketPackIdSchema>;

export const MarketPackVersionSchema = z.object({
  major: z.number(),
  minor: z.number(),
  patch: z.number(),
});

export type MarketPackVersion = z.infer<typeof MarketPackVersionSchema>;

export const BrokerFeeRuleSchema = z.object({
  enabled: z.boolean(),
  maxMultiplier: z.number().optional(), // e.g., 1 = one month rent
  paidBy: z.enum(['tenant', 'landlord', 'either', 'prohibited']),
  exemptions: z.array(z.string()).optional(),
});

export const SecurityDepositRuleSchema = z.object({
  enabled: z.boolean(),
  maxMonths: z.number(),
  interestRequired: z.boolean().optional(),
  separateAccountRequired: z.boolean().optional(),
});

export const RentIncreaseRuleSchema = z.object({
  enabled: z.boolean(),
  maxPercentage: z.number().optional(), // e.g., 5 = 5%
  cpiPlusPercentage: z.number().optional(), // e.g., 5 = CPI + 5%
  noticeRequired: z.boolean(),
  noticeDays: z.number().optional(),
  goodCauseRequired: z.boolean().optional(),
});

export const DisclosureRequirementSchema = z.object({
  type: z.string(),
  requiredBefore: z.enum(['listing_publish', 'application', 'lease_signing', 'move_in']),
  signatureRequired: z.boolean(),
  expirationDays: z.number().optional(),
});

export const FCHAStageSchema = z.enum([
  'initial_inquiry',
  'application_submitted',
  'application_review',
  'conditional_offer',
  'background_check',
  'final_approval',
  'lease_signing',
]);

export type FCHAStage = z.infer<typeof FCHAStageSchema>;

export const FCHARuleSchema = z.object({
  enabled: z.boolean(),
  prohibitedBeforeConditionalOffer: z.array(z.enum([
    'criminal_background_check',
    'credit_check',
    'eviction_history',
  ])),
  stageOrder: z.array(FCHAStageSchema),
});

export const GDPRRuleSchema = z.object({
  enabled: z.boolean(),
  dataRetentionDays: z.number().default(2555), // ~7 years default
  consentRequired: z.boolean().default(true),
  lawfulBases: z.array(z.enum([
    'consent',
    'contract',
    'legal_obligation',
    'vital_interests',
    'public_task',
    'legitimate_interests',
  ])).default(['contract', 'legal_obligation']),
  dataSubjectRequestDays: z.number().default(30), // 30 days to respond
  privacyNoticeRequired: z.boolean().default(true),
  redactionPolicies: z.object({
    enabled: z.boolean().default(true),
    autoRedactAfterDays: z.number().optional(),
    fieldsToRedact: z.array(z.string()).default([
      'nationalInsuranceNumber',
      'bankAccountDetails',
      'passportNumber',
      'dateOfBirth',
    ]),
  }).optional(),
});

export type GDPRRule = z.infer<typeof GDPRRuleSchema>;

export const MarketPackRulesSchema = z.object({
  brokerFee: BrokerFeeRuleSchema,
  securityDeposit: SecurityDepositRuleSchema,
  rentIncrease: RentIncreaseRuleSchema,
  disclosures: z.array(DisclosureRequirementSchema),
  fareAct: z.object({
    enabled: z.boolean(),
    maxIncomeRequirementMultiplier: z.number().optional(), // e.g., 40 = 40x rent
    maxCreditScoreThreshold: z.number().optional(),
  }).optional(),
  fcha: FCHARuleSchema.optional(),
  goodCause: z.object({
    enabled: z.boolean(),
    maxRentIncreaseOverCPI: z.number().optional(), // percentage points above CPI
    validEvictionReasons: z.array(z.string()).optional(),
  }).optional(),
  rentStabilization: z.object({
    enabled: z.boolean(),
    rgbBoardUrl: z.string().optional(),
  }).optional(),
  gdpr: GDPRRuleSchema.optional(),
});

export type MarketPackRules = z.infer<typeof MarketPackRulesSchema>;

export const MarketPackSchema = z.object({
  id: MarketPackIdSchema,
  name: z.string(),
  version: MarketPackVersionSchema,
  effectiveDate: z.string().datetime(),
  description: z.string(),
  jurisdiction: z.string(),
  rules: MarketPackRulesSchema,
  metadata: z.record(z.unknown()).optional(),
});

export type MarketPack = z.infer<typeof MarketPackSchema>;

// ============================================================================
// Enforcement Context Types
// ============================================================================

export const EntityTypeSchema = z.enum([
  'listing',
  'lease',
  'property',
  'unit',
  'application',
]);

export type EntityType = z.infer<typeof EntityTypeSchema>;

export const EnforcementContextSchema = z.object({
  entityType: EntityTypeSchema,
  entityId: z.string(),
  marketId: z.string(),
  marketPackId: MarketPackIdSchema,
  userId: z.string().optional(),
  organizationId: z.string().optional(),
  action: z.string(),
  timestamp: z.string().datetime(),
  previousState: z.record(z.unknown()).optional(),
  newState: z.record(z.unknown()).optional(),
});

export type EnforcementContext = z.infer<typeof EnforcementContextSchema>;

// ============================================================================
// CPI Provider Types
// ============================================================================

export const CPIDataSchema = z.object({
  year: z.number(),
  month: z.number(),
  value: z.number(),
  source: z.string(),
  region: z.string(),
  isFallback: z.boolean().default(false),
});

export type CPIData = z.infer<typeof CPIDataSchema>;

export interface ICPIProvider {
  getCurrentCPI(region: string): Promise<CPIData>;
  getCPIForDate(region: string, year: number, month: number): Promise<CPIData>;
  getAnnualCPIChange(region: string): Promise<{ percentage: number; isFallback: boolean }>;
}

// ============================================================================
// Gate Result Types
// ============================================================================

export const GateResultSchema = z.object({
  allowed: z.boolean(),
  decision: ComplianceDecisionSchema,
  blockedReason: z.string().optional(),
  auditLogId: z.string().optional(),
  complianceCheckId: z.string().optional(),
});

export type GateResult = z.infer<typeof GateResultSchema>;
