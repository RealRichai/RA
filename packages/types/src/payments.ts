import { z } from 'zod';
import { AuditFieldsSchema, MoneySchema, UUIDSchema } from './common';

// ============================================================================
// Payments & Fintech Types
// ============================================================================

export const PaymentStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'refunded',
  'partially_refunded',
  'disputed',
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const PaymentMethodTypeSchema = z.enum([
  'card',
  'bank_account',
  'ach',
  'wire',
  'check',
  'cash',
  'apple_pay',
  'google_pay',
]);
export type PaymentMethodType = z.infer<typeof PaymentMethodTypeSchema>;

export const PaymentTypeSchema = z.enum([
  'rent',
  'security_deposit',
  'application_fee',
  'broker_fee',
  'late_fee',
  'pet_deposit',
  'pet_rent',
  'parking',
  'utility',
  'maintenance',
  'move_in',
  'move_out',
  'other',
]);
export type PaymentType = z.infer<typeof PaymentTypeSchema>;

// Payment method (Stripe/Plaid)
export const PaymentMethodSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  type: PaymentMethodTypeSchema,
  isDefault: z.boolean().default(false),
  isVerified: z.boolean().default(false),

  // External provider references
  stripePaymentMethodId: z.string().optional(),
  plaidAccountId: z.string().optional(),

  // Card details (masked)
  card: z.object({
    brand: z.string(),
    last4: z.string(),
    expMonth: z.number().int(),
    expYear: z.number().int(),
    funding: z.enum(['credit', 'debit', 'prepaid', 'unknown']),
  }).optional(),

  // Bank account details (masked)
  bankAccount: z.object({
    bankName: z.string(),
    last4: z.string(),
    accountType: z.enum(['checking', 'savings']),
    routingNumber: z.string().optional(), // First 4 digits only
  }).optional(),

  // Billing address
  billingAddress: z.object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    country: z.string(),
  }).optional(),

  status: z.enum(['active', 'expired', 'invalid', 'removed']),
}).merge(AuditFieldsSchema);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

// Payment transaction
export const PaymentSchema = z.object({
  id: UUIDSchema,
  organizationId: UUIDSchema.optional(),
  payerId: UUIDSchema,
  payeeId: UUIDSchema,
  leaseId: UUIDSchema.optional(),
  propertyId: UUIDSchema.optional(),

  // Amount
  amount: MoneySchema,
  fee: MoneySchema.optional(), // Processing fee
  netAmount: MoneySchema.optional(), // Amount after fees

  // Type and status
  type: PaymentTypeSchema,
  status: PaymentStatusSchema,

  // Payment method
  paymentMethodId: UUIDSchema.optional(),
  paymentMethodType: PaymentMethodTypeSchema,

  // External references
  stripePaymentIntentId: z.string().optional(),
  stripeChargeId: z.string().optional(),
  stripeTransferId: z.string().optional(),
  plaidTransferId: z.string().optional(),

  // Scheduling
  scheduledDate: z.coerce.date().optional(),
  processedAt: z.coerce.date().optional(),

  // Billing period
  billingPeriodStart: z.coerce.date().optional(),
  billingPeriodEnd: z.coerce.date().optional(),

  // Description
  description: z.string().optional(),
  internalNotes: z.string().optional(),

  // Receipt
  receiptUrl: z.string().optional(),
  receiptNumber: z.string().optional(),

  // Retry info
  retryCount: z.number().int().default(0),
  maxRetries: z.number().int().default(3),
  nextRetryAt: z.coerce.date().optional(),
  lastError: z.string().optional(),

  // Refund info
  refundedAmount: MoneySchema.optional(),
  refundedAt: z.coerce.date().optional(),
  refundReason: z.string().optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type Payment = z.infer<typeof PaymentSchema>;

// Recurring payment/subscription
export const RecurringPaymentSchema = z.object({
  id: UUIDSchema,
  payerId: UUIDSchema,
  payeeId: UUIDSchema,
  leaseId: UUIDSchema,
  paymentMethodId: UUIDSchema,

  amount: MoneySchema,
  type: PaymentTypeSchema,

  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'annually']),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),

  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  nextPaymentDate: z.coerce.date(),

  status: z.enum(['active', 'paused', 'cancelled', 'completed', 'failed']),

  totalPayments: z.number().int().default(0),
  successfulPayments: z.number().int().default(0),
  failedPayments: z.number().int().default(0),

  // Auto-pay settings
  autoPayEnabled: z.boolean().default(true),
  reminderDays: z.number().int().default(3), // Days before payment

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type RecurringPayment = z.infer<typeof RecurringPaymentSchema>;

// Invoice
export const InvoiceSchema = z.object({
  id: UUIDSchema,
  invoiceNumber: z.string(),
  payerId: UUIDSchema,
  payeeId: UUIDSchema,
  leaseId: UUIDSchema.optional(),
  propertyId: UUIDSchema.optional(),

  status: z.enum(['draft', 'sent', 'viewed', 'paid', 'partial', 'overdue', 'cancelled', 'voided']),

  // Dates
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  paidDate: z.coerce.date().optional(),

  // Line items
  lineItems: z.array(z.object({
    id: UUIDSchema,
    description: z.string(),
    quantity: z.number().default(1),
    unitPrice: MoneySchema,
    amount: MoneySchema,
    type: PaymentTypeSchema,
  })),

  // Totals
  subtotal: MoneySchema,
  tax: MoneySchema.optional(),
  discount: MoneySchema.optional(),
  total: MoneySchema,
  amountPaid: MoneySchema.default({ amount: 0, currency: 'USD' }),
  amountDue: MoneySchema,

  // Late fees
  lateFeeApplied: z.boolean().default(false),
  lateFeeAmount: MoneySchema.optional(),
  lateFeeAppliedAt: z.coerce.date().optional(),

  // Payment tracking
  payments: z.array(UUIDSchema).default([]),

  // Document
  pdfUrl: z.string().optional(),

  notes: z.string().optional(),
  memo: z.string().optional(), // Customer-facing notes

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type Invoice = z.infer<typeof InvoiceSchema>;

// Payout (to landlord)
export const PayoutSchema = z.object({
  id: UUIDSchema,
  recipientId: UUIDSchema,
  bankAccountId: UUIDSchema,

  amount: MoneySchema,
  fee: MoneySchema.optional(),
  netAmount: MoneySchema,

  status: z.enum(['pending', 'processing', 'in_transit', 'paid', 'failed', 'cancelled']),

  // Source payments
  sourcePayments: z.array(UUIDSchema),
  sourcePropertyIds: z.array(UUIDSchema),

  // Period
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),

  // External references
  stripePayoutId: z.string().optional(),
  stripeTransferId: z.string().optional(),

  expectedArrivalDate: z.coerce.date().optional(),
  arrivedAt: z.coerce.date().optional(),

  statementDescriptor: z.string().optional(),
  description: z.string().optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type Payout = z.infer<typeof PayoutSchema>;

// Deposit Alternative Products (LeaseLock, Rhino)
export const DepositAlternativeSchema = z.object({
  id: UUIDSchema,
  leaseId: UUIDSchema,
  tenantId: UUIDSchema,
  provider: z.enum(['leaselock', 'rhino', 'the_guarantors', 'jetty']),

  // Policy details
  policyNumber: z.string().optional(),
  coverageAmount: MoneySchema,
  monthlyPremium: MoneySchema,
  annualPremium: MoneySchema.optional(),

  // Status
  status: z.enum([
    'quote_requested',
    'quoted',
    'application_pending',
    'approved',
    'active',
    'cancelled',
    'expired',
    'claim_filed',
  ]),

  // Dates
  applicationDate: z.coerce.date().optional(),
  approvalDate: z.coerce.date().optional(),
  effectiveDate: z.coerce.date().optional(),
  expirationDate: z.coerce.date().optional(),

  // Provider-specific data
  providerApplicationId: z.string().optional(),
  providerPolicyId: z.string().optional(),
  providerData: z.record(z.unknown()).optional(),

  // Claims
  claimCount: z.number().int().default(0),
  totalClaimedAmount: MoneySchema.optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type DepositAlternative = z.infer<typeof DepositAlternativeSchema>;

// Renters Insurance
export const RentersInsuranceSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  leaseId: UUIDSchema.optional(),
  provider: z.string(),

  policyNumber: z.string(),
  coverageAmount: MoneySchema, // Personal property
  liabilityCoverage: MoneySchema,
  deductible: MoneySchema,

  monthlyPremium: MoneySchema,
  annualPremium: MoneySchema,

  status: z.enum(['active', 'lapsed', 'cancelled', 'expired']),

  effectiveDate: z.coerce.date(),
  expirationDate: z.coerce.date(),

  // Proof of insurance
  certificateUrl: z.string().optional(),
  landlordAddedAsInterested: z.boolean().default(false),

  // Renewal
  autoRenew: z.boolean().default(true),
  renewalNotificationSent: z.boolean().default(false),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type RentersInsurance = z.infer<typeof RentersInsuranceSchema>;

// Guarantor Product
export const GuarantorProductSchema = z.object({
  id: UUIDSchema,
  leaseId: UUIDSchema,
  tenantId: UUIDSchema,
  provider: z.enum(['the_guarantors', 'insurent', 'leap', 'rhino_guarantor']),

  // Coverage
  guaranteeAmount: MoneySchema, // Usually 12-24 months rent
  monthlyPremium: MoneySchema,
  oneTimeFee: MoneySchema.optional(),

  status: z.enum([
    'application_pending',
    'approved',
    'active',
    'cancelled',
    'claim_filed',
    'claim_paid',
  ]),

  // Dates
  applicationDate: z.coerce.date().optional(),
  approvalDate: z.coerce.date().optional(),
  effectiveDate: z.coerce.date().optional(),
  expirationDate: z.coerce.date().optional(),

  // Provider data
  providerApplicationId: z.string().optional(),
  providerContractId: z.string().optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type GuarantorProduct = z.infer<typeof GuarantorProductSchema>;

// Rent Rewards
export const RentRewardsAccountSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,

  // Points
  pointsBalance: z.number().int().default(0),
  lifetimePoints: z.number().int().default(0),
  pointsExpiringSoon: z.number().int().default(0),
  pointsExpirationDate: z.coerce.date().optional(),

  // Status
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum']).default('bronze'),
  tierProgress: z.number().min(0).max(100).default(0),

  // Linked cards (for rent reporting)
  linkedCards: z.array(z.object({
    last4: z.string(),
    brand: z.string(),
    expiresAt: z.coerce.date(),
  })).default([]),

  // Credit reporting
  creditReportingEnabled: z.boolean().default(false),
  creditReportingProvider: z.string().optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type RentRewardsAccount = z.infer<typeof RentRewardsAccountSchema>;

export const RentRewardsTransactionSchema = z.object({
  id: UUIDSchema,
  accountId: UUIDSchema,
  type: z.enum(['earn', 'redeem', 'expire', 'adjustment']),
  points: z.number().int(),
  description: z.string(),
  sourceType: z.enum(['rent_payment', 'referral', 'signup_bonus', 'promotion', 'redemption', 'expiration']),
  sourceId: UUIDSchema.optional(),
  expiresAt: z.coerce.date().optional(),
}).merge(AuditFieldsSchema);
export type RentRewardsTransaction = z.infer<typeof RentRewardsTransactionSchema>;

// Payment filter/search
export const PaymentFilterSchema = z.object({
  payerId: UUIDSchema.optional(),
  payeeId: UUIDSchema.optional(),
  leaseId: UUIDSchema.optional(),
  propertyId: UUIDSchema.optional(),
  status: PaymentStatusSchema.optional(),
  statuses: z.array(PaymentStatusSchema).optional(),
  type: PaymentTypeSchema.optional(),
  types: z.array(PaymentTypeSchema).optional(),
  minAmount: z.number().int().min(0).optional(),
  maxAmount: z.number().int().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
export type PaymentFilter = z.infer<typeof PaymentFilterSchema>;
