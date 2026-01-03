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
  'FARE_FEE_DISCLOSURE_MISSING',
  'FARE_LISTING_AGENT_TENANT_FEE',

  // FCHA violations
  'FCHA_CRIMINAL_CHECK_BEFORE_OFFER',
  'FCHA_CREDIT_CHECK_BEFORE_OFFER',
  'FCHA_STAGE_ORDER_VIOLATION',
  'FCHA_PROHIBITED_INQUIRY',
  'FCHA_BACKGROUND_CHECK_NOT_ALLOWED',
  'FCHA_CONDITIONAL_OFFER_REQUIRED',
  'FCHA_PREQUALIFICATION_INCOMPLETE',
  'FCHA_INDIVIDUALIZED_ASSESSMENT_REQUIRED',
  'FCHA_NOTICE_NOT_ISSUED',
  'FCHA_RESPONSE_WINDOW_ACTIVE',
  'FCHA_INVALID_STATE_TRANSITION',

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
  'FL_STANDARD',
  'IL_STANDARD',
  'WA_STANDARD',
  'CO_STANDARD',
  'MA_STANDARD',
  'NJ_STANDARD',
  'PA_STANDARD',
  'GA_STANDARD',
  'AZ_STANDARD',
  'NV_STANDARD',
  'UK_GDPR',
  'EU_GDPR',
  'LATAM_STANDARD',
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
  returnDays: z.number().optional(), // Days landlord has to return deposit after move-out
  exemptions: z.array(z.string()).optional(), // Exemption categories
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

// ============================================================================
// NYC Fair Chance Housing Workflow State Machine
// ============================================================================

/**
 * Explicit workflow states for NYC Fair Chance Housing Act compliance.
 * These states enforce the legal requirement to evaluate non-criminal
 * eligibility before any criminal background check.
 */
export const FCHAWorkflowStateSchema = z.enum([
  /** Initial application - evaluate income, credit, rental history (non-criminal) */
  'PREQUALIFICATION',
  /** Written conditional offer issued - commits a unit to applicant */
  'CONDITIONAL_OFFER',
  /** Criminal background check now permitted */
  'BACKGROUND_CHECK_ALLOWED',
  /** Adverse info found - Article 23-A individualized assessment required */
  'INDIVIDUALIZED_ASSESSMENT',
  /** Final decision made (approved or denied) */
  'FINAL_DECISION',
  /** Denied - application rejected */
  'DENIED',
  /** Approved - proceed to lease signing */
  'APPROVED',
]);

export type FCHAWorkflowState = z.infer<typeof FCHAWorkflowStateSchema>;

/**
 * Valid transitions in the FCHA workflow state machine.
 * Only these transitions are permitted.
 */
export const FCHAValidTransitions: Record<FCHAWorkflowState, FCHAWorkflowState[]> = {
  PREQUALIFICATION: ['CONDITIONAL_OFFER', 'DENIED'],
  CONDITIONAL_OFFER: ['BACKGROUND_CHECK_ALLOWED', 'DENIED'],
  BACKGROUND_CHECK_ALLOWED: ['INDIVIDUALIZED_ASSESSMENT', 'APPROVED', 'DENIED'],
  INDIVIDUALIZED_ASSESSMENT: ['APPROVED', 'DENIED'],
  FINAL_DECISION: [], // Terminal state
  DENIED: [], // Terminal state
  APPROVED: [], // Terminal state (proceed to lease)
};

/**
 * Check types that require BACKGROUND_CHECK_ALLOWED state
 */
export const FCHACriminalCheckTypes = [
  'criminal_background_check',
  'criminal_history',
  'arrest_record',
  'conviction_record',
] as const;

export type FCHACriminalCheckType = typeof FCHACriminalCheckTypes[number];

/**
 * Non-criminal checks allowed during PREQUALIFICATION
 */
export const FCHAPrequalificationCheckTypes = [
  'income_verification',
  'employment_verification',
  'credit_check',
  'rental_history',
  'eviction_history',
  'identity_verification',
] as const;

export type FCHAPrequalificationCheckType = typeof FCHAPrequalificationCheckTypes[number];

/**
 * Notice types required by FCHA
 */
export const FCHANoticeTypeSchema = z.enum([
  'conditional_offer_letter',
  'background_check_authorization',
  'adverse_action_notice',
  'individualized_assessment_notice',
  'article_23a_factors_notice',
  'final_decision_notice',
  'denial_notice',
  'approval_notice',
]);

export type FCHANoticeType = z.infer<typeof FCHANoticeTypeSchema>;

/**
 * Evidence record for FCHA workflow transitions
 */
export const FCHATransitionEvidenceSchema = z.object({
  applicationId: z.string(),
  transitionId: z.string(),
  fromState: FCHAWorkflowStateSchema,
  toState: FCHAWorkflowStateSchema,
  timestamp: z.string().datetime(),
  /** Actor who initiated the transition */
  actorId: z.string(),
  actorType: z.enum(['system', 'user', 'agent']),
  /** Notices issued as part of this transition */
  noticesIssued: z.array(z.object({
    type: FCHANoticeTypeSchema,
    issuedAt: z.string().datetime(),
    deliveryMethod: z.enum(['email', 'mail', 'in_app', 'hand_delivered']),
    recipientId: z.string(),
  })).optional(),
  /** Response window tracking for applicant responses */
  responseWindow: z.object({
    opensAt: z.string().datetime(),
    closesAt: z.string().datetime(),
    daysAllowed: z.number(),
    responded: z.boolean().default(false),
    respondedAt: z.string().datetime().optional(),
  }).optional(),
  /** Background check details if applicable */
  backgroundCheck: z.object({
    type: z.string(),
    requestedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
    result: z.enum(['clear', 'adverse_info_found', 'pending', 'error']).optional(),
    adverseInfoDetails: z.string().optional(),
  }).optional(),
  /** Individualized assessment details if applicable */
  individualizedAssessment: z.object({
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
    article23AFactorsConsidered: z.array(z.string()).optional(),
    mitigatingFactorsProvided: z.array(z.string()).optional(),
    rationale: z.string().optional(),
  }).optional(),
  /** Prequalification criteria results */
  prequalificationResults: z.object({
    incomeVerified: z.boolean().optional(),
    creditCheckPassed: z.boolean().optional(),
    rentalHistoryVerified: z.boolean().optional(),
    employmentVerified: z.boolean().optional(),
    allCriteriaMet: z.boolean(),
  }).optional(),
  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type FCHATransitionEvidence = z.infer<typeof FCHATransitionEvidenceSchema>;

/**
 * FCHA workflow state record - tracks current state and history
 */
export const FCHAWorkflowRecordSchema = z.object({
  applicationId: z.string(),
  currentState: FCHAWorkflowStateSchema,
  stateHistory: z.array(z.object({
    state: FCHAWorkflowStateSchema,
    enteredAt: z.string().datetime(),
    exitedAt: z.string().datetime().optional(),
    transitionId: z.string().optional(),
  })),
  conditionalOfferIssuedAt: z.string().datetime().optional(),
  conditionalOfferUnitId: z.string().optional(),
  backgroundCheckAllowedAt: z.string().datetime().optional(),
  individualizedAssessmentStartedAt: z.string().datetime().optional(),
  finalDecisionAt: z.string().datetime().optional(),
  finalDecisionResult: z.enum(['approved', 'denied']).optional(),
  activeResponseWindow: z.object({
    opensAt: z.string().datetime(),
    closesAt: z.string().datetime(),
    daysAllowed: z.number(),
    purpose: z.string(),
  }).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type FCHAWorkflowRecord = z.infer<typeof FCHAWorkflowRecordSchema>;

export const FCHARuleSchema = z.object({
  enabled: z.boolean(),
  prohibitedBeforeConditionalOffer: z.array(z.enum([
    'criminal_background_check',
    'credit_check',
    'eviction_history',
  ])),
  stageOrder: z.array(FCHAStageSchema),
  /** Enhanced workflow settings */
  workflow: z.object({
    /** Days applicant has to respond to adverse action notice */
    adverseActionResponseDays: z.number().default(5),
    /** Days applicant has to provide mitigating factors */
    mitigatingFactorsResponseDays: z.number().default(10),
    /** Article 23-A factors that must be considered */
    article23AFactors: z.array(z.string()).default([
      'nature_of_offense',
      'time_elapsed_since_offense',
      'age_at_time_of_offense',
      'evidence_of_rehabilitation',
      'relationship_to_housing',
      'legitimate_business_interest',
    ]),
    /** Required notices for each state */
    requiredNotices: z.record(z.array(FCHANoticeTypeSchema)).optional(),
  }).optional(),
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

// California AB 1482 (Tenant Protection Act) Schema
export const AB1482RuleSchema = z.object({
  enabled: z.boolean(),
  rentCapFormula: z.string().optional(), // e.g., 'cpi_plus_5_max_10'
  justCauseEvictionRequired: z.boolean().optional(),
  validEvictionReasons: z.array(z.string()).optional(),
  relocationAssistance: z.object({
    required: z.boolean(),
    amount: z.string().optional(), // e.g., 'one_month_rent'
    noFaultEvictionsOnly: z.boolean().optional(),
  }).optional(),
  exemptions: z.array(z.string()).optional(),
});

// Texas Property Code Schema
export const TexasPropertyCodeRuleSchema = z.object({
  enabled: z.boolean(),
  repairRemedies: z.object({
    enabled: z.boolean(),
    noticeRequired: z.boolean().optional(),
    noticeDays: z.number().optional(),
    landlordResponseDays: z.number().optional(),
    tenantRemedies: z.array(z.string()).optional(),
  }).optional(),
  lockoutProhibited: z.boolean().optional(),
  utilityShutoffProhibited: z.boolean().optional(),
  retaliationProhibited: z.boolean().optional(),
  retaliationPeriodDays: z.number().optional(), // Months presumption period
  securityDevices: z.object({
    required: z.boolean(),
    types: z.array(z.string()).optional(),
    landlordMustProvide: z.boolean().optional(),
    tenantCanRequest: z.boolean().optional(),
  }).optional(),
});

// No Rent Control Schema (for states with preemption)
export const NoRentControlRuleSchema = z.object({
  enabled: z.boolean(),
  statePreemption: z.boolean().optional(),
  citiesCannotEnact: z.boolean().optional(),
  reference: z.string().optional(),
});

// Chicago RLTO Schema (Illinois)
export const ChicagoRLTORuleSchema = z.object({
  enabled: z.boolean(),
  securityDepositInterestRate: z.string().optional(),
  interestPaymentFrequency: z.string().optional(),
  summaryOfRightsRequired: z.boolean().optional(),
  moveInMoveOutInspection: z.boolean().optional(),
  tenantRemedies: z.array(z.string()).optional(),
});

// Washington RCW Schema
export const WashingtonRCWRuleSchema = z.object({
  enabled: z.boolean(),
  moveInChecklist: z.object({
    required: z.boolean(),
    tenantSignatureRequired: z.boolean().optional(),
    landlordMustProvide: z.boolean().optional(),
  }).optional(),
  depositDeductionRules: z.object({
    itemizedStatementRequired: z.boolean().optional(),
    photoDocumentationRecommended: z.boolean().optional(),
    normalWearExcluded: z.boolean().optional(),
  }).optional(),
  retaliationProtection: z.object({
    enabled: z.boolean(),
    protectedActivities: z.array(z.string()).optional(),
    presumptionPeriodDays: z.number().optional(),
  }).optional(),
});

// Seattle Just Cause Schema
export const SeattleJustCauseRuleSchema = z.object({
  enabled: z.boolean(),
  validEvictionReasons: z.array(z.string()).optional(),
  relocationAssistance: z.object({
    required: z.boolean(),
    conditions: z.array(z.string()).optional(),
  }).optional(),
});

// Colorado Warranty of Habitability Schema
export const ColoradoWarrantyOfHabitabilitySchema = z.object({
  enabled: z.boolean(),
  landlordObligations: z.array(z.string()).optional(),
  tenantRemedies: z.array(z.string()).optional(),
  noticeRequired: z.boolean().optional(),
  noticeDays: z.number().optional(),
});

// Massachusetts Rules Schema
export const MassachusettsRulesSchema = z.object({
  enabled: z.boolean(),
  lastMonthRent: z.object({
    canCollect: z.boolean(),
    interestRequired: z.boolean().optional(),
  }).optional(),
  statementOfCondition: z.object({
    required: z.boolean(),
    withinDays: z.number().optional(),
    tenantResponseDays: z.number().optional(),
  }).optional(),
  securityDepositInterest: z.object({
    rate: z.string().optional(),
    paymentFrequency: z.string().optional(),
  }).optional(),
});

// New Jersey Rules Schema
export const NewJerseyRulesSchema = z.object({
  enabled: z.boolean(),
  truthInRenting: z.object({
    required: z.boolean(),
    dgcaApproved: z.boolean().optional(),
  }).optional(),
  securityDepositInterest: z.object({
    annualPayment: z.boolean().optional(),
    bankMustBeInNJ: z.boolean().optional(),
  }).optional(),
  antiEvictionAct: z.object({
    enabled: z.boolean(),
    goodCauseRequired: z.boolean().optional(),
  }).optional(),
});

// Pennsylvania Rules Schema
export const PennsylvaniaRulesSchema = z.object({
  enabled: z.boolean(),
  securityDepositTiers: z.object({
    firstYear: z.number(),
    afterFirstYear: z.number(),
  }).optional(),
  escrowAfterTwoYears: z.object({
    required: z.boolean(),
    interestRate: z.string().optional(),
  }).optional(),
  philadelphiaRules: z.object({
    fairHousingOrdinance: z.boolean().optional(),
    goodCauseEviction: z.boolean().optional(),
  }).optional(),
});

// Georgia Rules Schema
export const GeorgiaRulesSchema = z.object({
  enabled: z.boolean(),
  escrowRequirement: z.object({
    unitsThreshold: z.number(),
    bankingInstitutionRequired: z.boolean().optional(),
  }).optional(),
  moveInInspection: z.object({
    required: z.boolean(),
    tenantSignatureRequired: z.boolean().optional(),
    listMustBeComprehensive: z.boolean().optional(),
  }).optional(),
  securityDepositDeductions: z.object({
    itemizedStatementRequired: z.boolean().optional(),
    withinThreeDays: z.boolean().optional(),
  }).optional(),
});

// Arizona Rules Schema
export const ArizonaRulesSchema = z.object({
  enabled: z.boolean(),
  moveInInspection: z.object({
    required: z.boolean(),
    landlordMustProvide: z.boolean().optional(),
    tenantHas5DaysToComplete: z.boolean().optional(),
  }).optional(),
  nonrefundableFees: z.object({
    mustBeDisclosed: z.boolean().optional(),
    separateFromDeposit: z.boolean().optional(),
  }).optional(),
  poolSafety: z.object({
    noticeRequired: z.boolean().optional(),
    fencingRequirements: z.boolean().optional(),
  }).optional(),
  remedies: z.object({
    repairAndDeduct: z.boolean().optional(),
    maxDeductAmount: z.string().optional(),
    rentWithholding: z.boolean().optional(),
  }).optional(),
});

// Nevada Rules Schema
export const NevadaRulesSchema = z.object({
  enabled: z.boolean(),
  foreclosureDisclosure: z.object({
    required: z.boolean(),
    mustDiscloseIfInForeclosure: z.boolean().optional(),
  }).optional(),
  moveInChecklist: z.object({
    recommended: z.boolean().optional(),
    helpfulForDepositDisputes: z.boolean().optional(),
  }).optional(),
  landlordRemedies: z.object({
    summaryEviction: z.boolean().optional(),
    noticePeriods: z.object({
      nonPayment: z.number().optional(),
      leaseViolation: z.number().optional(),
      unlawfulDetainer: z.number().optional(),
    }).optional(),
  }).optional(),
  tenantRemedies: z.object({
    repairAndDeduct: z.boolean().optional(),
    rentWithholding: z.boolean().optional(),
    habitabilityStandards: z.boolean().optional(),
  }).optional(),
});

export const MarketPackRulesSchema = z.object({
  brokerFee: BrokerFeeRuleSchema,
  securityDeposit: SecurityDepositRuleSchema,
  rentIncrease: RentIncreaseRuleSchema,
  disclosures: z.array(DisclosureRequirementSchema),
  fareAct: z.object({
    enabled: z.boolean(),
    maxIncomeRequirementMultiplier: z.number().optional(), // e.g., 40 = 40x rent
    maxCreditScoreThreshold: z.number().optional(),
    /** When broker represents landlord, tenant cannot be charged broker fees */
    listingAgentTenantFeeProhibited: z.boolean().default(true),
    /** All tenant-paid fees must be disclosed in listing and rental agreement */
    feeDisclosureRequired: z.boolean().default(true),
    /** Fees that must be disclosed to tenants */
    disclosableFeeTypes: z.array(z.string()).default([
      'broker_fee',
      'application_fee',
      'move_in_fee',
      'amenity_fee',
      'pet_fee',
      'parking_fee',
      'administrative_fee',
    ]),
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
  ab1482: AB1482RuleSchema.optional(), // California Tenant Protection Act
  texasPropertyCode: TexasPropertyCodeRuleSchema.optional(), // Texas Property Code
  noRentControl: NoRentControlRuleSchema.optional(), // State rent control preemption
  chicagoRLTO: ChicagoRLTORuleSchema.optional(), // Illinois Chicago RLTO
  washingtonRCW: WashingtonRCWRuleSchema.optional(), // Washington RCW 59.18
  seattleJustCause: SeattleJustCauseRuleSchema.optional(), // Seattle Just Cause Eviction
  coloradoWarrantyOfHabitability: ColoradoWarrantyOfHabitabilitySchema.optional(), // Colorado Warranty
  massachusettsRules: MassachusettsRulesSchema.optional(), // Massachusetts specific rules
  newJerseyRules: NewJerseyRulesSchema.optional(), // New Jersey specific rules
  pennsylvaniaRules: PennsylvaniaRulesSchema.optional(), // Pennsylvania specific rules
  georgiaRules: GeorgiaRulesSchema.optional(), // Georgia specific rules
  arizonaRules: ArizonaRulesSchema.optional(), // Arizona specific rules
  nevadaRules: NevadaRulesSchema.optional(), // Nevada specific rules
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
  // i18n and GDPR properties
  gdprMode: z.boolean().default(false),
  defaultLocale: z.string().default('en'),
  supportedLocales: z.array(z.string()).default(['en']),
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
