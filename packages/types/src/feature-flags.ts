import { z } from 'zod';
import { AuditFieldsSchema, UUIDSchema } from './common';

// ============================================================================
// Feature Flags & Market Toggles
// ============================================================================

export const FeatureFlagTypeSchema = z.enum([
  'boolean', // Simple on/off
  'percentage', // Gradual rollout
  'user_segment', // Specific user groups
  'market', // Market-specific
  'organization', // Per-organization
  'variant', // A/B testing variants
]);
export type FeatureFlagType = z.infer<typeof FeatureFlagTypeSchema>;

export const FeatureFlagSchema = z.object({
  id: UUIDSchema,
  key: z.string().regex(/^[a-z][a-z0-9_]*$/), // Snake case identifier
  name: z.string(),
  description: z.string().optional(),
  type: FeatureFlagTypeSchema,

  // Status
  enabled: z.boolean().default(false),
  defaultValue: z.unknown(),

  // Rules (evaluated in order)
  rules: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    conditions: z.array(z.object({
      attribute: z.string(),
      operator: z.enum([
        'equals',
        'not_equals',
        'contains',
        'not_contains',
        'in',
        'not_in',
        'greater_than',
        'less_than',
        'matches',
        'before',
        'after',
      ]),
      value: z.unknown(),
    })),
    variation: z.unknown(), // Value to return if conditions match
    percentage: z.number().min(0).max(100).optional(), // For gradual rollout
  })).default([]),

  // Variants (for A/B testing)
  variants: z.array(z.object({
    key: z.string(),
    value: z.unknown(),
    weight: z.number().min(0).max(100), // Percentage allocation
    description: z.string().optional(),
  })).optional(),

  // Targeting
  targetedUsers: z.array(UUIDSchema).default([]),
  excludedUsers: z.array(UUIDSchema).default([]),
  targetedOrganizations: z.array(UUIDSchema).default([]),
  targetedMarkets: z.array(z.string()).default([]),

  // Scheduling
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),

  // Environment overrides
  environmentOverrides: z.record(z.object({
    enabled: z.boolean(),
    value: z.unknown().optional(),
  })).optional(),

  // Metadata
  tags: z.array(z.string()).default([]),
  category: z.string().optional(),
  owner: z.string().optional(),
  jiraTicket: z.string().optional(),

  // Stale detection
  lastEvaluatedAt: z.coerce.date().optional(),
  evaluationCount: z.number().int().default(0),
  isStale: z.boolean().default(false),

  // Prerequisites (other flags that must be enabled)
  prerequisites: z.array(z.object({
    flagKey: z.string(),
    variation: z.unknown(),
  })).default([]),
}).merge(AuditFieldsSchema);
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

// Feature flag evaluation context
export const EvaluationContextSchema = z.object({
  userId: UUIDSchema.optional(),
  organizationId: UUIDSchema.optional(),
  userRole: z.string().optional(),
  userEmail: z.string().email().optional(),
  marketId: z.string().optional(),
  environment: z.enum(['development', 'staging', 'production']).optional(),
  platform: z.enum(['web', 'mobile', 'api']).optional(),
  version: z.string().optional(),
  customAttributes: z.record(z.unknown()).optional(),
});
export type EvaluationContext = z.infer<typeof EvaluationContextSchema>;

// Feature flag evaluation result
export const EvaluationResultSchema = z.object({
  flagKey: z.string(),
  value: z.unknown(),
  variationIndex: z.number().int().optional(),
  reason: z.enum([
    'off', // Flag is disabled
    'fallthrough', // Used default rule
    'target_match', // Matched a user/org target
    'rule_match', // Matched a rule condition
    'prerequisite_failed', // Prerequisite flag condition not met
    'error', // Evaluation error
  ]),
  ruleIndex: z.number().int().optional(),
  inExperiment: z.boolean().default(false),
});
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

// Market configuration (market-specific toggles)
export const MarketConfigSchema = z.object({
  id: UUIDSchema,
  marketId: z.string(), // NYC, LA, SF, etc.
  name: z.string(),
  state: z.string(),
  city: z.string().optional(),
  timezone: z.string(),

  // Enable/disable market
  isEnabled: z.boolean().default(true),
  launchDate: z.coerce.date().optional(),

  // Feature toggles for this market
  features: z.record(z.object({
    enabled: z.boolean(),
    value: z.unknown().optional(),
    notes: z.string().optional(),
  })),

  // Compliance settings
  compliance: z.object({
    fareActEnabled: z.boolean().default(false),
    fchaEnabled: z.boolean().default(true),
    goodCauseEnabled: z.boolean().default(false),
    rentStabilizationEnabled: z.boolean().default(false),
    sourceOfIncomeProtection: z.boolean().default(false),
    brokerFeeRegulations: z.boolean().default(false),
    localOrdinances: z.array(z.string()).default([]),
  }),

  // Market-specific limits
  limits: z.object({
    maxSecurityDepositMonths: z.number().optional(),
    maxApplicationFee: z.number().optional(),
    evictionNoticeDays: z.number().optional(),
    rentIncreaseNoticeDays: z.number().optional(),
  }),

  // Integrations
  integrations: z.object({
    mls: z.object({
      enabled: z.boolean().default(false),
      provider: z.string().optional(),
      apiKey: z.string().optional(), // Encrypted reference
    }).optional(),
    utilities: z.array(z.object({
      type: z.string(),
      providerId: UUIDSchema,
    })).default([]),
  }).optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type MarketConfig = z.infer<typeof MarketConfigSchema>;

// Module toggles (feature modules that can be enabled/disabled)
export const ModuleConfigSchema = z.object({
  id: UUIDSchema,
  moduleKey: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum([
    'core',
    'leasing',
    'payments',
    'maintenance',
    'compliance',
    'ai',
    'marketing',
    'commerce',
    'commercial',
    'analytics',
  ]),

  // Global status
  isEnabled: z.boolean().default(true),
  isBeta: z.boolean().default(false),
  isEnterprise: z.boolean().default(false),

  // Dependencies
  dependencies: z.array(z.string()).default([]),

  // Per-organization overrides
  organizationOverrides: z.record(z.object({
    enabled: z.boolean(),
    tier: z.string().optional(),
    expiresAt: z.coerce.date().optional(),
  })).default({}),

  // Per-market availability
  marketAvailability: z.record(z.boolean()).default({}),

  // Configuration schema
  configSchema: z.record(z.unknown()).optional(),

  // Billing
  requiresPaidPlan: z.boolean().default(false),
  minimumPlan: z.enum(['free', 'starter', 'professional', 'enterprise']).optional(),
  addonPrice: z.number().optional(), // Monthly in cents

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type ModuleConfig = z.infer<typeof ModuleConfigSchema>;

// Predefined feature flags for the platform
export const PLATFORM_FEATURE_FLAGS = {
  // Core features
  MULTI_PROPERTY_SUPPORT: 'multi_property_support',
  PORTFOLIO_VIEW: 'portfolio_view',

  // AI features
  AI_LEASING_CONCIERGE: 'ai_leasing_concierge',
  AI_VOICE_ASSISTANT: 'ai_voice_assistant',
  AI_MAINTENANCE_TRIAGE: 'ai_maintenance_triage',
  AI_DOCUMENT_ANALYSIS: 'ai_document_analysis',
  HF_CTS_ENABLED: 'hf_cts_enabled',

  // Compliance
  COMPLIANCE_AUTOPILOT: 'compliance_autopilot',
  FARE_ACT_ENFORCEMENT: 'fare_act_enforcement',
  GOOD_CAUSE_ENFORCEMENT: 'good_cause_enforcement',

  // Payments
  ACH_PAYMENTS: 'ach_payments',
  CARD_PAYMENTS: 'card_payments',
  AUTOPAY: 'autopay',
  RENT_REWARDS: 'rent_rewards',
  CREDIT_REPORTING: 'credit_reporting',

  // Deposit alternatives
  LEASELOCK_INTEGRATION: 'leaselock_integration',
  RHINO_INTEGRATION: 'rhino_integration',
  GUARANTOR_PRODUCTS: 'guarantor_products',

  // Marketing
  FLYER_GENERATOR: 'flyer_generator',
  VIDEO_TOURS: 'video_tours',
  VIRTUAL_STAGING: 'virtual_staging',
  THREE_D_GS_VR: '3dgs_vr_tours',
  TEMPLATE_MARKETPLACE: 'template_marketplace',

  // Commerce
  UTILITIES_CONCIERGE: 'utilities_concierge',
  MOVING_SERVICES: 'moving_services',
  VENDOR_MARKETPLACE: 'vendor_marketplace',

  // Commercial
  COMMERCIAL_MODULE: 'commercial_module',
  UNDERWRITING_TOOLS: 'underwriting_tools',
  STACKING_PLANS: 'stacking_plans',
  FRACTIONAL_OWNERSHIP: 'fractional_ownership',

  // God View
  GOD_VIEW_DASHBOARD: 'god_view_dashboard',
  ADVANCED_ANALYTICS: 'advanced_analytics',

  // REBNY
  REBNY_LEASE_TEMPLATES: 'rebny_lease_templates',
  REBNY_COMPLIANCE: 'rebny_compliance',

  // Digital vault
  DIGITAL_VAULT: 'digital_vault',
  E_SIGNATURES: 'e_signatures',
} as const;

export type PlatformFeatureFlag = typeof PLATFORM_FEATURE_FLAGS[keyof typeof PLATFORM_FEATURE_FLAGS];
