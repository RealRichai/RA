import { z } from 'zod';

import { AuditFieldsSchema, MoneySchema, UUIDSchema } from './common';

// ============================================================================
// Compliance Autopilot Types
// ============================================================================

export const ComplianceRuleTypeSchema = z.enum([
  'fare_act', // Fair Access to Rentals in Employment Act (NY)
  'fcha', // Fair Credit Housing Act
  'good_cause', // Good Cause Eviction (NY)
  'rent_stabilization', // NYC Rent Stabilization
  'rent_control', // Rent Control
  'security_deposit', // Security deposit limits
  'source_of_income', // Source of Income discrimination
  'broker_fee', // Broker fee regulations
  'disclosure', // Required disclosures
  'lead_paint', // Lead paint disclosure
  'bedbug', // Bedbug disclosure
  'mold', // Mold disclosure
  'smoking', // Smoking policy
  'fair_housing', // Federal Fair Housing Act
  'local_ordinance', // Local municipality rules
  'habitability', // Warranty of habitability
  'eviction_notice', // Eviction notice requirements
]);
export type ComplianceRuleType = z.infer<typeof ComplianceRuleTypeSchema>;

export const ComplianceSeveritySchema = z.enum([
  'info', // Informational
  'warning', // Potential issue
  'violation', // Active violation
  'critical', // Critical violation requiring immediate action
]);
export type ComplianceSeverity = z.infer<typeof ComplianceSeveritySchema>;

export const ComplianceStatusSchema = z.enum([
  'compliant',
  'non_compliant',
  'pending_review',
  'waived', // Manually waived by admin
  'not_applicable',
]);
export type ComplianceStatus = z.infer<typeof ComplianceStatusSchema>;

// Market-specific compliance configuration
export const MarketComplianceConfigSchema = z.object({
  marketId: z.string(),
  marketName: z.string(),
  state: z.string(),
  city: z.string().optional(),

  // Rent regulations
  hasRentStabilization: z.boolean().default(false),
  hasRentControl: z.boolean().default(false),
  hasGoodCause: z.boolean().default(false),
  rentIncreaseLimit: z.number().optional(), // Percentage
  rentGuidelinesBoard: z.string().optional(),

  // Fee regulations
  maxSecurityDeposit: z.number().optional(), // Months of rent
  brokerFeeRestrictions: z.object({
    regulated: z.boolean(),
    maxPercentage: z.number().optional(),
    whoCanPay: z.enum(['tenant', 'landlord', 'either']).optional(),
  }).optional(),
  applicationFeeLimit: MoneySchema.optional(),

  // Source of income
  sourceOfIncomeProtection: z.boolean().default(false),
  protectedSources: z.array(z.string()).default([]),

  // Notice requirements
  leaseTerminationNotice: z.number().default(30), // Days
  rentIncreaseNotice: z.number().default(30), // Days
  evictionNoticeMinDays: z.number().default(14),

  // Required disclosures
  requiredDisclosures: z.array(z.object({
    type: z.string(),
    description: z.string(),
    timing: z.enum(['before_application', 'before_lease', 'at_move_in', 'annually']),
    documentRequired: z.boolean().default(false),
    signatureRequired: z.boolean().default(false),
  })).default([]),

  // FARE Act (NYC specific)
  fareActEnabled: z.boolean().default(false),
  fareActRules: z.object({
    incomeRequirementCap: z.number().optional(), // e.g., 12x monthly rent
    creditScoreMinAllowed: z.boolean().optional(),
    bankruptcyLookback: z.number().optional(), // Years
    evictionLookback: z.number().optional(), // Years
  }).optional(),

  // Local ordinances
  localOrdinances: z.array(z.object({
    name: z.string(),
    code: z.string(),
    description: z.string(),
    enforcementDate: z.coerce.date(),
    rules: z.record(z.unknown()),
  })).default([]),

  effectiveDate: z.coerce.date(),
  lastUpdated: z.coerce.date(),
});
export type MarketComplianceConfig = z.infer<typeof MarketComplianceConfigSchema>;

// Compliance check result
export const ComplianceCheckResultSchema = z.object({
  id: UUIDSchema,
  entityType: z.enum(['listing', 'lease', 'application', 'property', 'unit']),
  entityId: UUIDSchema,
  marketId: z.string(),
  checkType: ComplianceRuleTypeSchema,
  status: ComplianceStatusSchema,
  severity: ComplianceSeveritySchema,
  title: z.string(),
  description: z.string(),
  details: z.record(z.unknown()).optional(),
  recommendation: z.string().optional(),
  documentationUrl: z.string().url().optional(),
  autoFixAvailable: z.boolean().default(false),
  autoFixApplied: z.boolean().default(false),
  manualReviewRequired: z.boolean().default(false),
  reviewedBy: UUIDSchema.optional(),
  reviewedAt: z.coerce.date().optional(),
  reviewNotes: z.string().optional(),
  waivedBy: UUIDSchema.optional(),
  waivedAt: z.coerce.date().optional(),
  waiverReason: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  resolvedAt: z.coerce.date().optional(),
}).merge(AuditFieldsSchema);
export type ComplianceCheckResult = z.infer<typeof ComplianceCheckResultSchema>;

// Compliance audit log
export const ComplianceAuditLogSchema = z.object({
  id: UUIDSchema,
  entityType: z.string(),
  entityId: UUIDSchema,
  action: z.enum([
    'check_performed',
    'violation_detected',
    'violation_resolved',
    'auto_fix_applied',
    'manual_review',
    'waiver_granted',
    'escalation',
    'disclosure_sent',
    'disclosure_acknowledged',
  ]),
  performedBy: UUIDSchema.optional(),
  performedAt: z.coerce.date(),
  details: z.record(z.unknown()),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
}).merge(AuditFieldsSchema);
export type ComplianceAuditLog = z.infer<typeof ComplianceAuditLogSchema>;

// Disclosure tracking
export const DisclosureSchema = z.object({
  id: UUIDSchema,
  type: z.string(),
  name: z.string(),
  description: z.string(),
  marketId: z.string(),
  templateId: UUIDSchema.optional(),
  requiredFor: z.array(z.enum(['listing', 'application', 'lease', 'move_in'])),
  signatureRequired: z.boolean().default(false),
  expirationDays: z.number().int().optional(),
  content: z.string(),
  legalCitation: z.string().optional(),
  effectiveDate: z.coerce.date(),
  isActive: z.boolean().default(true),
}).merge(AuditFieldsSchema);
export type Disclosure = z.infer<typeof DisclosureSchema>;

export const DisclosureRecordSchema = z.object({
  id: UUIDSchema,
  disclosureId: UUIDSchema,
  recipientId: UUIDSchema,
  recipientEmail: z.string().email(),
  entityType: z.enum(['listing', 'application', 'lease']),
  entityId: UUIDSchema,
  sentAt: z.coerce.date(),
  viewedAt: z.coerce.date().optional(),
  acknowledgedAt: z.coerce.date().optional(),
  signedAt: z.coerce.date().optional(),
  signatureUrl: z.string().optional(),
  ipAddress: z.string().optional(),
  documentId: UUIDSchema.optional(),
  expiresAt: z.coerce.date().optional(),
}).merge(AuditFieldsSchema);
export type DisclosureRecord = z.infer<typeof DisclosureRecordSchema>;

// FARE Act specific types
export const FAREActCheckSchema = z.object({
  applicationId: UUIDSchema,
  checkDate: z.coerce.date(),
  violations: z.array(z.object({
    rule: z.string(),
    description: z.string(),
    severity: ComplianceSeveritySchema,
    details: z.record(z.unknown()),
  })),
  isCompliant: z.boolean(),
  recommendations: z.array(z.string()),

  // Specific FARE Act checks
  incomeRequirementCheck: z.object({
    applied: MoneySchema,
    limit: MoneySchema,
    compliant: z.boolean(),
  }).optional(),

  creditScoreCheck: z.object({
    minimumRequired: z.number().optional(),
    compliant: z.boolean(),
  }).optional(),

  evictionHistoryCheck: z.object({
    lookbackYears: z.number(),
    foundEvictions: z.number(),
    compliant: z.boolean(),
  }).optional(),

  bankruptcyCheck: z.object({
    lookbackYears: z.number(),
    foundBankruptcies: z.number(),
    compliant: z.boolean(),
  }).optional(),
}).merge(AuditFieldsSchema);
export type FAREActCheck = z.infer<typeof FAREActCheckSchema>;

// Good Cause Eviction types
export const GoodCauseCheckSchema = z.object({
  leaseId: UUIDSchema,
  propertyId: UUIDSchema,
  checkDate: z.coerce.date(),

  // Property eligibility
  propertyExempt: z.boolean(),
  exemptionReason: z.string().optional(),

  // Rent increase check
  proposedRentIncrease: z.number().optional(), // Percentage
  allowedRentIncrease: z.number().optional(),
  rentIncreaseCompliant: z.boolean(),

  // Non-renewal check
  nonRenewalReason: z.string().optional(),
  nonRenewalPermitted: z.boolean(),

  // Overall compliance
  isCompliant: z.boolean(),
  violations: z.array(z.string()),
  recommendations: z.array(z.string()),
}).merge(AuditFieldsSchema);
export type GoodCauseCheck = z.infer<typeof GoodCauseCheckSchema>;

// Compliance report
export const ComplianceReportSchema = z.object({
  id: UUIDSchema,
  reportType: z.enum(['property', 'portfolio', 'market', 'audit']),
  entityId: UUIDSchema.optional(),
  marketId: z.string().optional(),
  reportDate: z.coerce.date(),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),

  summary: z.object({
    totalChecks: z.number().int(),
    compliant: z.number().int(),
    nonCompliant: z.number().int(),
    pendingReview: z.number().int(),
    critical: z.number().int(),
    complianceRate: z.number(), // Percentage
  }),

  byRuleType: z.record(z.object({
    total: z.number().int(),
    compliant: z.number().int(),
    nonCompliant: z.number().int(),
  })),

  violations: z.array(z.object({
    checkId: UUIDSchema,
    entityType: z.string(),
    entityId: UUIDSchema,
    ruleType: ComplianceRuleTypeSchema,
    severity: ComplianceSeveritySchema,
    description: z.string(),
    detectedAt: z.coerce.date(),
    status: ComplianceStatusSchema,
  })),

  recommendations: z.array(z.string()),
  generatedBy: UUIDSchema,
  documentId: UUIDSchema.optional(),
}).merge(AuditFieldsSchema);
export type ComplianceReport = z.infer<typeof ComplianceReportSchema>;

// Compliance alert/notification
export const ComplianceAlertSchema = z.object({
  id: UUIDSchema,
  type: z.enum([
    'violation_detected',
    'deadline_approaching',
    'document_expiring',
    'regulation_change',
    'renewal_compliance',
    'audit_required',
  ]),
  severity: ComplianceSeveritySchema,
  entityType: z.string(),
  entityId: UUIDSchema,
  title: z.string(),
  message: z.string(),
  actionRequired: z.boolean(),
  actionUrl: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  dismissedAt: z.coerce.date().optional(),
  dismissedBy: UUIDSchema.optional(),
  resolvedAt: z.coerce.date().optional(),
}).merge(AuditFieldsSchema);
export type ComplianceAlert = z.infer<typeof ComplianceAlertSchema>;
