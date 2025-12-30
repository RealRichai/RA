/**
 * Allocation Engine (Waterfall)
 *
 * Revenue splitting and allocation rules for partner rev-share.
 */

import { randomUUID } from 'crypto';

import type {
  AccountCode,
  AllocationResult,
  AllocationRule,
  LedgerEntry,
  TransactionType,
} from '../types';

// =============================================================================
// Allocation Rules Engine
// =============================================================================

export interface AllocationInput {
  amount: number;
  transactionType: TransactionType;
  partnerId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Default allocation rules for the platform.
 */
export const DEFAULT_ALLOCATION_RULES: AllocationRule[] = [
  // 1. Payment processing fees (first priority)
  {
    id: 'rule_processing_fee',
    name: 'Payment Processing Fee',
    priority: 1,
    type: 'percentage',
    value: 2.9, // 2.9% Stripe fee
    targetAccountCode: 'PAYMENT_PROCESSING_FEE',
    condition: {
      transactionTypes: ['payment_received'],
    },
    isActive: true,
  },

  // 2. Partner rev-share (second priority)
  {
    id: 'rule_partner_revshare',
    name: 'Partner Rev-Share',
    priority: 2,
    type: 'percentage',
    value: 30, // 30% to partners
    targetAccountCode: 'PARTNER_PAYABLE',
    condition: {
      transactionTypes: ['partner_commission'],
    },
    isActive: true,
  },

  // 3. Platform fee (remainder)
  {
    id: 'rule_platform_fee',
    name: 'Platform Fee',
    priority: 100,
    type: 'remainder',
    value: 0,
    targetAccountCode: 'PLATFORM_FEE_REVENUE',
    isActive: true,
  },
];

/**
 * Sort rules by priority (ascending).
 */
export function sortRulesByPriority(rules: AllocationRule[]): AllocationRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority);
}

/**
 * Check if a rule applies to the given input.
 */
export function ruleApplies(rule: AllocationRule, input: AllocationInput): boolean {
  if (!rule.isActive) return false;

  const condition = rule.condition;
  if (!condition) return true;

  // Check transaction type
  if (
    condition.transactionTypes &&
    !condition.transactionTypes.includes(input.transactionType)
  ) {
    return false;
  }

  // Check amount bounds
  if (condition.minAmount !== undefined && input.amount < condition.minAmount) {
    return false;
  }
  if (condition.maxAmount !== undefined && input.amount > condition.maxAmount) {
    return false;
  }

  // Check partner ID
  if (condition.partnerIds && input.partnerId) {
    if (!condition.partnerIds.includes(input.partnerId)) {
      return false;
    }
  }

  return true;
}

/**
 * Calculate allocation for a single rule.
 */
export function calculateRuleAllocation(
  rule: AllocationRule,
  remainingAmount: number
): number {
  switch (rule.type) {
    case 'percentage':
      return (remainingAmount * rule.value) / 100;

    case 'fixed':
      return Math.min(rule.value, remainingAmount);

    case 'remainder':
      return remainingAmount;

    default:
      return 0;
  }
}

/**
 * Run the allocation waterfall on an amount.
 */
export function runAllocationWaterfall(
  amount: number,
  rules: AllocationRule[],
  input: AllocationInput
): AllocationResult[] {
  const results: AllocationResult[] = [];
  let remainingAmount = amount;

  const sortedRules = sortRulesByPriority(rules);

  for (const rule of sortedRules) {
    if (remainingAmount <= 0) break;
    if (!ruleApplies(rule, input)) continue;

    const allocatedAmount = calculateRuleAllocation(rule, remainingAmount);

    if (allocatedAmount > 0) {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        accountCode: rule.targetAccountCode,
        amount: Math.round(allocatedAmount * 100) / 100, // Round to cents
        percentage: rule.type === 'percentage' ? rule.value : undefined,
      });

      // Only deduct from remaining if not remainder type
      if (rule.type !== 'remainder') {
        remainingAmount -= allocatedAmount;
      } else {
        remainingAmount = 0;
      }
    }
  }

  return results;
}

// =============================================================================
// Partner-Specific Allocation
// =============================================================================

export interface PartnerAllocationConfig {
  partnerId: string;
  partnerName: string;
  revSharePercentage: number;
  minimumPayout: number;
  isActive: boolean;
}

/**
 * Calculate partner rev-share from a commission.
 */
export function calculatePartnerRevShare(
  commissionAmount: number,
  config: PartnerAllocationConfig
): { partnerAmount: number; platformAmount: number } {
  if (!config.isActive) {
    return { partnerAmount: 0, platformAmount: commissionAmount };
  }

  const partnerAmount = (commissionAmount * config.revSharePercentage) / 100;
  const platformAmount = commissionAmount - partnerAmount;

  return {
    partnerAmount: Math.round(partnerAmount * 100) / 100,
    platformAmount: Math.round(platformAmount * 100) / 100,
  };
}

/**
 * Build allocation rules for a specific partner.
 */
export function buildPartnerAllocationRules(
  config: PartnerAllocationConfig
): AllocationRule[] {
  return [
    {
      id: `rule_partner_${config.partnerId}`,
      name: `${config.partnerName} Rev-Share`,
      priority: 2,
      type: 'percentage',
      value: config.revSharePercentage,
      targetAccountCode: 'PARTNER_PAYABLE',
      condition: {
        partnerIds: [config.partnerId],
      },
      isActive: config.isActive,
    },
    {
      id: `rule_platform_after_${config.partnerId}`,
      name: 'Platform Share',
      priority: 100,
      type: 'remainder',
      value: 0,
      targetAccountCode: 'PLATFORM_FEE_REVENUE',
      isActive: true,
    },
  ];
}

// =============================================================================
// Allocation to Ledger Entries
// =============================================================================

/**
 * Convert allocation results to ledger entries.
 */
export function allocationResultsToEntries(
  results: AllocationResult[],
  sourceAccountCode: AccountCode
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  let totalAllocated = 0;

  for (const result of results) {
    if (result.amount <= 0) continue;

    entries.push({
      accountCode: result.accountCode,
      amount: result.amount,
      isDebit: false, // Credit the target accounts
    });

    totalAllocated += result.amount;
  }

  // Add the balancing debit entry
  if (totalAllocated > 0) {
    entries.push({
      accountCode: sourceAccountCode,
      amount: totalAllocated,
      isDebit: true,
    });
  }

  return entries;
}

// =============================================================================
// Commission Split Calculator
// =============================================================================

export interface CommissionSplit {
  grossCommission: number;
  platformShare: number;
  partnerShare: number;
  processingFee: number;
  netToPartner: number;
  netToPlatform: number;
}

/**
 * Calculate commission split between platform and partner.
 */
export function calculateCommissionSplit(
  grossCommission: number,
  partnerRevSharePercent: number,
  processingFeePercent: number = 0
): CommissionSplit {
  const processingFee = (grossCommission * processingFeePercent) / 100;
  const netAfterFees = grossCommission - processingFee;

  const partnerShare = (netAfterFees * partnerRevSharePercent) / 100;
  const platformShare = netAfterFees - partnerShare;

  return {
    grossCommission: Math.round(grossCommission * 100) / 100,
    platformShare: Math.round(platformShare * 100) / 100,
    partnerShare: Math.round(partnerShare * 100) / 100,
    processingFee: Math.round(processingFee * 100) / 100,
    netToPartner: Math.round(partnerShare * 100) / 100,
    netToPlatform: Math.round((platformShare - processingFee) * 100) / 100,
  };
}

/**
 * Create a unique allocation batch ID.
 */
export function createAllocationBatchId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomUUID().substring(0, 8);
  return `alloc_${timestamp}_${random}`;
}

// =============================================================================
// Rent Payment Waterfall
// =============================================================================

export interface RentPaymentAllocation {
  grossAmount: number;
  processingFee: number;
  platformFee: number;
  netToLandlord: number;
  entries: LedgerEntry[];
}

/**
 * Platform fee percentage for rent payments.
 */
export const RENT_PLATFORM_FEE_PERCENT = 1.5; // 1.5% platform fee
export const STRIPE_FEE_PERCENT = 2.9;
export const STRIPE_FEE_FIXED_CENTS = 30;

/**
 * Calculate Stripe processing fee for an amount.
 */
export function calculateStripeFee(amountCents: number): number {
  return Math.round(amountCents * (STRIPE_FEE_PERCENT / 100) + STRIPE_FEE_FIXED_CENTS);
}

/**
 * Build rent payment waterfall allocation.
 * Waterfall order:
 * 1. Stripe processing fee (deducted by Stripe)
 * 2. Platform fee (percentage of gross)
 * 3. Landlord payout (remainder)
 */
export function buildRentPaymentWaterfall(
  grossAmountCents: number,
  options: {
    platformFeePercent?: number;
    landlordAccountId?: string;
    propertyId?: string;
    leaseId?: string;
  } = {}
): RentPaymentAllocation {
  const platformFeePercent = options.platformFeePercent ?? RENT_PLATFORM_FEE_PERCENT;

  // Convert to dollars for ledger entries
  const grossAmount = grossAmountCents / 100;

  // Calculate fees
  const processingFeeCents = calculateStripeFee(grossAmountCents);
  const platformFeeCents = Math.round(grossAmountCents * (platformFeePercent / 100));
  const netToLandlordCents = grossAmountCents - processingFeeCents - platformFeeCents;

  const processingFee = processingFeeCents / 100;
  const platformFee = platformFeeCents / 100;
  const netToLandlord = netToLandlordCents / 100;

  // Build ledger entries
  const entries: LedgerEntry[] = [
    // Debit Stripe Clearing (asset: money received)
    { accountCode: 'STRIPE_CLEARING', amount: grossAmount, isDebit: true },

    // Credit Accounts Receivable (asset decrease: payment received)
    { accountCode: 'ACCOUNTS_RECEIVABLE', amount: grossAmount, isDebit: false },

    // Debit Processing Fee Expense
    { accountCode: 'PAYMENT_PROCESSING_FEE', amount: processingFee, isDebit: true },

    // Credit Stripe Clearing (reduce by fee retained by Stripe)
    { accountCode: 'STRIPE_CLEARING', amount: processingFee, isDebit: false },

    // Debit Stripe Clearing (move platform fee out)
    // Credit Platform Fee Revenue
    { accountCode: 'PLATFORM_FEE_REVENUE', amount: platformFee, isDebit: false },
    { accountCode: 'STRIPE_CLEARING', amount: platformFee, isDebit: false },
    { accountCode: 'CASH', amount: platformFee, isDebit: true },

    // Credit Accounts Payable (landlord payout liability)
    { accountCode: 'ACCOUNTS_PAYABLE', amount: netToLandlord, isDebit: false },
    { accountCode: 'STRIPE_CLEARING', amount: netToLandlord, isDebit: false },
    { accountCode: 'CASH', amount: netToLandlord, isDebit: true },
  ];

  return {
    grossAmount,
    processingFee,
    platformFee,
    netToLandlord,
    entries,
  };
}

/**
 * Build simplified rent payment entries (for webhook processing).
 * Creates balanced double-entry for rent payment received.
 */
export function buildRentPaymentEntries(
  amount: number,
  processingFee: number,
  platformFee: number
): LedgerEntry[] {
  const netToLandlord = amount - processingFee - platformFee;

  return [
    // Money received from tenant
    { accountCode: 'STRIPE_CLEARING', amount, isDebit: true },
    { accountCode: 'ACCOUNTS_RECEIVABLE', amount, isDebit: false },

    // Processing fee expense
    { accountCode: 'PAYMENT_PROCESSING_FEE', amount: processingFee, isDebit: true },
    { accountCode: 'STRIPE_CLEARING', amount: processingFee, isDebit: false },

    // Platform revenue
    { accountCode: 'CASH', amount: platformFee, isDebit: true },
    { accountCode: 'PLATFORM_FEE_REVENUE', amount: platformFee, isDebit: false },

    // Landlord payout liability
    { accountCode: 'CASH', amount: netToLandlord, isDebit: true },
    { accountCode: 'ACCOUNTS_PAYABLE', amount: netToLandlord, isDebit: false },
  ];
}

/**
 * Build dispute hold entries.
 * When a dispute is opened, we hold funds until resolution.
 */
export function buildDisputeHoldEntries(amount: number): LedgerEntry[] {
  return [
    // Move funds to held/disputed account
    { accountCode: 'CASH', amount, isDebit: false },
    { accountCode: 'SECURITY_DEPOSITS_HELD', amount, isDebit: true },
  ];
}

/**
 * Build dispute resolution entries.
 * Won: release hold, Lost: record expense
 */
export function buildDisputeResolutionEntries(
  amount: number,
  won: boolean
): LedgerEntry[] {
  if (won) {
    // Release hold back to cash
    return [
      { accountCode: 'SECURITY_DEPOSITS_HELD', amount, isDebit: false },
      { accountCode: 'CASH', amount, isDebit: true },
    ];
  } else {
    // Dispute lost - expense the amount
    return [
      { accountCode: 'SECURITY_DEPOSITS_HELD', amount, isDebit: false },
      { accountCode: 'REFUND_EXPENSE', amount, isDebit: true },
    ];
  }
}
