/**
 * Revenue Engine Types
 *
 * Core types for ledger, partner integrations, and revenue modules.
 */

import { z } from 'zod';

// =============================================================================
// Ledger Types
// =============================================================================

export const AccountTypeSchema = z.enum([
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
]);

export type AccountType = z.infer<typeof AccountTypeSchema>;

export const AccountCodeSchema = z.enum([
  // Assets
  'CASH',
  'ACCOUNTS_RECEIVABLE',
  'STRIPE_CLEARING',
  'PARTNER_RECEIVABLE',

  // Liabilities
  'ACCOUNTS_PAYABLE',
  'SECURITY_DEPOSITS_HELD',
  'DEFERRED_REVENUE',
  'PARTNER_PAYABLE',

  // Revenue
  'PLATFORM_FEE_REVENUE',
  'DEPOSIT_ALT_COMMISSION',
  'INSURANCE_COMMISSION',
  'GUARANTOR_COMMISSION',
  'UTILITIES_REFERRAL_FEE',
  'MOVING_REFERRAL_FEE',
  'MARKETPLACE_REFERRAL_FEE',

  // Expense
  'PAYMENT_PROCESSING_FEE',
  'PARTNER_PAYOUT',
  'REFUND_EXPENSE',
]);

export type AccountCode = z.infer<typeof AccountCodeSchema>;

export const LedgerAccountSchema = z.object({
  id: z.string(),
  code: AccountCodeSchema,
  name: z.string(),
  type: AccountTypeSchema,
  parentId: z.string().optional(),
  balance: z.number().default(0),
  currency: z.string().default('USD'),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type LedgerAccount = z.infer<typeof LedgerAccountSchema>;

export const TransactionStatusSchema = z.enum([
  'pending',
  'posted',
  'voided',
  'reversed',
]);

export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

export const TransactionTypeSchema = z.enum([
  'payment_received',
  'payment_refund',
  'partner_commission',
  'partner_payout',
  'platform_fee',
  'transfer',
  'adjustment',
  'reversal',
]);

export type TransactionType = z.infer<typeof TransactionTypeSchema>;

export const LedgerEntrySchema = z.object({
  accountCode: AccountCodeSchema,
  amount: z.number(),
  isDebit: z.boolean(),
});

export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const LedgerTransactionSchema = z.object({
  id: z.string(),
  idempotencyKey: z.string(),
  type: TransactionTypeSchema,
  status: TransactionStatusSchema,
  entries: z.array(LedgerEntrySchema),
  amount: z.number(), // Absolute transaction amount
  currency: z.string().default('USD'),
  description: z.string(),

  // References
  externalId: z.string().optional(), // Stripe payment_intent, etc.
  referenceType: z.string().optional(), // 'payment', 'invoice', 'payout'
  referenceId: z.string().optional(), // Internal reference ID

  // Reconciliation
  reconciliationRef: z.string().optional(),
  reconciledAt: z.date().optional(),

  // Audit
  createdBy: z.string().optional(),
  postedAt: z.date().optional(),
  voidedAt: z.date().optional(),
  voidReason: z.string().optional(),

  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type LedgerTransaction = z.infer<typeof LedgerTransactionSchema>;

// Allocation/Waterfall for revenue splitting
export const AllocationRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  priority: z.number(), // Lower = first
  type: z.enum(['percentage', 'fixed', 'remainder']),
  value: z.number(), // Percentage (0-100) or fixed amount
  targetAccountCode: AccountCodeSchema,
  condition: z.object({
    minAmount: z.number().optional(),
    maxAmount: z.number().optional(),
    transactionTypes: z.array(TransactionTypeSchema).optional(),
    partnerIds: z.array(z.string()).optional(),
  }).optional(),
  isActive: z.boolean().default(true),
});

export type AllocationRule = z.infer<typeof AllocationRuleSchema>;

export const AllocationResultSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  accountCode: AccountCodeSchema,
  amount: z.number(),
  percentage: z.number().optional(),
});

export type AllocationResult = z.infer<typeof AllocationResultSchema>;

// =============================================================================
// Partner Integration Types
// =============================================================================

export const PartnerProviderSchema = z.enum([
  // Deposit alternatives
  'leaselock',
  'rhino',
  'jetty',

  // Insurance
  'lemonade',
  'state_farm',
  'assurant',
  'sure',

  // Guarantor
  'the_guarantors',
  'insurent',
  'leap',
  'rhino_guarantor',

  // Utilities
  'conedison',
  'national_grid',
  'spectrum',
  'verizon',

  // Moving
  'two_men_truck',
  'pods',
  'uhaul',

  // Generic
  'internal',
]);

export type PartnerProvider = z.infer<typeof PartnerProviderSchema>;

export const PartnerProductTypeSchema = z.enum([
  'deposit_alternative',
  'renters_insurance',
  'guarantor',
  'utility_setup',
  'moving_service',
  'vendor_referral',
]);

export type PartnerProductType = z.infer<typeof PartnerProductTypeSchema>;

export const ContractStatusSchema = z.enum([
  'quoted',
  'pending_bind',
  'bound',
  'active',
  'cancelled',
  'expired',
  'renewed',
]);

export type ContractStatus = z.infer<typeof ContractStatusSchema>;

// Quote request/response
export const QuoteRequestSchema = z.object({
  productType: PartnerProductTypeSchema,
  provider: PartnerProviderSchema,
  applicantId: z.string(),
  leaseId: z.string().optional(),
  propertyId: z.string(),
  unitId: z.string().optional(),

  // Coverage details
  coverageAmount: z.number().optional(),
  term: z.number().optional(), // Months
  startDate: z.date().optional(),

  // Applicant info
  applicantInfo: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    dateOfBirth: z.date().optional(),
    ssn: z.string().optional(), // Last 4 or full, encrypted
    creditScore: z.number().optional(),
    annualIncome: z.number().optional(),
  }),

  // Property info
  propertyInfo: z.object({
    address: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    monthlyRent: z.number(),
    squareFeet: z.number().optional(),
    propertyType: z.string().optional(),
  }),

  metadata: z.record(z.unknown()).optional(),
});

export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const QuoteResponseSchema = z.object({
  quoteId: z.string(),
  provider: PartnerProviderSchema,
  productType: PartnerProductTypeSchema,
  status: z.enum(['success', 'declined', 'pending_review', 'error']),

  // Pricing
  premium: z.number().optional(), // Monthly or one-time
  premiumFrequency: z.enum(['one_time', 'monthly', 'annual']).optional(),
  coverageAmount: z.number().optional(),
  deductible: z.number().optional(),

  // Commission
  commissionRate: z.number().optional(), // Percentage
  commissionAmount: z.number().optional(),

  // Validity
  validUntil: z.date().optional(),

  // Provider-specific
  providerQuoteId: z.string().optional(),
  providerData: z.record(z.unknown()).optional(),

  // Decline info
  declineReason: z.string().optional(),
  declineCode: z.string().optional(),

  error: z.string().optional(),
});

export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

// Bind request/response
export const BindRequestSchema = z.object({
  quoteId: z.string(),
  provider: PartnerProviderSchema,
  providerQuoteId: z.string().optional(),

  // Payment
  paymentMethodId: z.string().optional(),
  payNow: z.boolean().default(false),

  // Additional required info
  additionalInfo: z.record(z.unknown()).optional(),

  // Consent
  termsAccepted: z.boolean(),
  termsAcceptedAt: z.date(),

  idempotencyKey: z.string(),
});

export type BindRequest = z.infer<typeof BindRequestSchema>;

export const PolicyArtifactSchema = z.object({
  policyId: z.string(),
  provider: PartnerProviderSchema,
  productType: PartnerProductTypeSchema,
  status: ContractStatusSchema,

  // Policy details
  policyNumber: z.string(),
  effectiveDate: z.date(),
  expirationDate: z.date(),
  coverageAmount: z.number(),
  premium: z.number(),
  premiumFrequency: z.enum(['one_time', 'monthly', 'annual']),

  // Documents
  policyDocumentUrl: z.string().optional(),
  certificateUrl: z.string().optional(),

  // Commission tracking
  commissionRate: z.number(),
  commissionAmount: z.number(),
  commissionPaidAt: z.date().optional(),

  // References
  quoteId: z.string(),
  applicantId: z.string(),
  leaseId: z.string().optional(),
  propertyId: z.string(),

  // Provider-specific
  providerPolicyId: z.string(),
  providerData: z.record(z.unknown()).optional(),

  // Renewal
  autoRenew: z.boolean().default(false).optional(),
  renewalQuoteId: z.string().optional(),

  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PolicyArtifact = z.infer<typeof PolicyArtifactSchema>;

// Cancel/Renew
export const CancelRequestSchema = z.object({
  policyId: z.string(),
  provider: PartnerProviderSchema,
  providerPolicyId: z.string(),
  reason: z.string(),
  effectiveDate: z.date().optional(), // Defaults to immediate
  refundRequested: z.boolean().default(false),
  idempotencyKey: z.string(),
});

export type CancelRequest = z.infer<typeof CancelRequestSchema>;

export const CancelResponseSchema = z.object({
  success: z.boolean(),
  policyId: z.string(),
  cancelledAt: z.date().optional(),
  refundAmount: z.number().optional(),
  commissionClawbackAmount: z.number().optional(),
  error: z.string().optional(),
});

export type CancelResponse = z.infer<typeof CancelResponseSchema>;

export const RenewRequestSchema = z.object({
  policyId: z.string(),
  provider: PartnerProviderSchema,
  providerPolicyId: z.string(),
  newTerm: z.number().optional(), // Months, defaults to same
  idempotencyKey: z.string(),
});

export type RenewRequest = z.infer<typeof RenewRequestSchema>;

// =============================================================================
// Referral Types
// =============================================================================

export const ReferralSourceSchema = z.enum([
  'partner_link',
  'agent_referral',
  'property_manager',
  'tenant_referral',
  'marketing_campaign',
  'organic',
]);

export type ReferralSource = z.infer<typeof ReferralSourceSchema>;

export const ReferralSchema = z.object({
  id: z.string(),
  source: ReferralSourceSchema,
  partnerId: z.string().optional(),
  partnerName: z.string().optional(),
  campaignId: z.string().optional(),

  // Attribution
  referrerId: z.string().optional(), // User who made referral
  referredUserId: z.string(),

  // Product
  productType: PartnerProductTypeSchema,
  provider: PartnerProviderSchema.optional(),
  policyId: z.string().optional(),

  // Revenue
  transactionAmount: z.number().optional(),
  commissionAmount: z.number().optional(),
  revShareAmount: z.number().optional(),
  revSharePercentage: z.number().optional(),

  // Status
  status: z.enum(['pending', 'qualified', 'converted', 'paid', 'expired', 'rejected']),
  qualifiedAt: z.date().optional(),
  convertedAt: z.date().optional(),
  paidAt: z.date().optional(),

  // Ledger
  ledgerTransactionId: z.string().optional(),

  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Referral = z.infer<typeof ReferralSchema>;

export const PartnerAgreementSchema = z.object({
  id: z.string(),
  partnerId: z.string(),
  partnerName: z.string(),
  productTypes: z.array(PartnerProductTypeSchema),

  // Rev-share terms
  revSharePercentage: z.number(), // 0-100
  minimumPayout: z.number().default(50),
  payoutFrequency: z.enum(['immediate', 'weekly', 'monthly']),

  // Status
  isActive: z.boolean().default(true),
  effectiveDate: z.date(),
  expirationDate: z.date().optional(),

  // Banking
  payoutMethod: z.enum(['ach', 'check', 'wire']).optional(),
  payoutAccountId: z.string().optional(),

  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PartnerAgreement = z.infer<typeof PartnerAgreementSchema>;

// =============================================================================
// Stripe Types
// =============================================================================

export const StripeEventTypeSchema = z.enum([
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'transfer.created',
  'payout.paid',
  'payout.failed',
]);

export type StripeEventType = z.infer<typeof StripeEventTypeSchema>;

export const WebhookEventSchema = z.object({
  id: z.string(),
  type: StripeEventTypeSchema,
  data: z.record(z.unknown()),
  created: z.number(),
  livemode: z.boolean(),

  // Processing
  processedAt: z.date().optional(),
  ledgerTransactionId: z.string().optional(),
  error: z.string().optional(),
  retryCount: z.number().default(0),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

// =============================================================================
// Module Configuration
// =============================================================================

export const RevenueModuleSchema = z.enum([
  'deposit_alternatives',
  'renters_insurance',
  'guarantor_products',
  'utilities_concierge',
  'moving_services',
  'vendor_marketplace',
]);

export type RevenueModule = z.infer<typeof RevenueModuleSchema>;

export const ModuleConfigSchema = z.object({
  module: RevenueModuleSchema,
  featureFlagKey: z.string(),
  providers: z.array(PartnerProviderSchema),
  defaultProvider: PartnerProviderSchema.optional(),
  commissionRates: z.record(z.number()), // Provider -> rate
  isActive: z.boolean().default(true),
});

export type ModuleConfig = z.infer<typeof ModuleConfigSchema>;
