/**
 * Ledger Allocation Unit Tests
 *
 * Tests for revenue waterfall allocations, partner rev-share calculations,
 * and ledger entry generation.
 */

import { describe, it, expect } from 'vitest';

import type { AllocationRule, AccountCode } from '../types';

import {
  DEFAULT_ALLOCATION_RULES,
  sortRulesByPriority,
  ruleApplies,
  calculateRuleAllocation,
  runAllocationWaterfall,
  calculatePartnerRevShare,
  buildPartnerAllocationRules,
  allocationResultsToEntries,
  calculateCommissionSplit,
  createAllocationBatchId,
  calculateStripeFee,
  buildRentPaymentWaterfall,
  buildRentPaymentEntries,
  buildDisputeHoldEntries,
  buildDisputeResolutionEntries,
  RENT_PLATFORM_FEE_PERCENT,
  STRIPE_FEE_PERCENT,
  STRIPE_FEE_FIXED_CENTS,
  type AllocationInput,
  type PartnerAllocationConfig,
} from './allocations';

// =============================================================================
// Default Allocation Rules Tests
// =============================================================================

describe('Default Allocation Rules', () => {
  it('should have three default rules', () => {
    expect(DEFAULT_ALLOCATION_RULES).toHaveLength(3);
  });

  it('should have processing fee as first priority', () => {
    const sorted = sortRulesByPriority(DEFAULT_ALLOCATION_RULES);
    expect(sorted[0]?.name).toBe('Payment Processing Fee');
    expect(sorted[0]?.priority).toBe(1);
  });

  it('should have partner rev-share as second priority', () => {
    const sorted = sortRulesByPriority(DEFAULT_ALLOCATION_RULES);
    expect(sorted[1]?.name).toBe('Partner Rev-Share');
    expect(sorted[1]?.priority).toBe(2);
  });

  it('should have platform fee as remainder', () => {
    const sorted = sortRulesByPriority(DEFAULT_ALLOCATION_RULES);
    expect(sorted[2]?.name).toBe('Platform Fee');
    expect(sorted[2]?.type).toBe('remainder');
    expect(sorted[2]?.priority).toBe(100);
  });

  it('should have correct fee percentages', () => {
    const processingRule = DEFAULT_ALLOCATION_RULES.find((r) => r.id === 'rule_processing_fee');
    const partnerRule = DEFAULT_ALLOCATION_RULES.find((r) => r.id === 'rule_partner_revshare');

    expect(processingRule?.value).toBe(2.9);
    expect(partnerRule?.value).toBe(30);
  });
});

// =============================================================================
// Sort Rules By Priority Tests
// =============================================================================

describe('sortRulesByPriority', () => {
  it('should sort rules in ascending priority order', () => {
    const rules: AllocationRule[] = [
      { id: 'c', name: 'C', priority: 100, type: 'remainder', value: 0, targetAccountCode: 'PLATFORM_FEE_REVENUE', isActive: true },
      { id: 'a', name: 'A', priority: 1, type: 'percentage', value: 10, targetAccountCode: 'PAYMENT_PROCESSING_FEE', isActive: true },
      { id: 'b', name: 'B', priority: 50, type: 'fixed', value: 100, targetAccountCode: 'PARTNER_PAYABLE', isActive: true },
    ];

    const sorted = sortRulesByPriority(rules);

    expect(sorted[0]?.id).toBe('a');
    expect(sorted[1]?.id).toBe('b');
    expect(sorted[2]?.id).toBe('c');
  });

  it('should not mutate original array', () => {
    const rules = [...DEFAULT_ALLOCATION_RULES];
    const originalOrder = rules.map((r) => r.id);

    sortRulesByPriority(rules);

    expect(rules.map((r) => r.id)).toEqual(originalOrder);
  });
});

// =============================================================================
// Rule Applies Tests
// =============================================================================

describe('ruleApplies', () => {
  it('should return false for inactive rules', () => {
    const rule: AllocationRule = {
      id: 'inactive',
      name: 'Inactive',
      priority: 1,
      type: 'percentage',
      value: 10,
      targetAccountCode: 'PLATFORM_FEE_REVENUE',
      isActive: false,
    };
    const input: AllocationInput = { amount: 1000, transactionType: 'payment_received' };

    expect(ruleApplies(rule, input)).toBe(false);
  });

  it('should return true for rules without conditions', () => {
    const rule: AllocationRule = {
      id: 'no_condition',
      name: 'No Condition',
      priority: 1,
      type: 'percentage',
      value: 10,
      targetAccountCode: 'PLATFORM_FEE_REVENUE',
      isActive: true,
    };
    const input: AllocationInput = { amount: 1000, transactionType: 'payment_received' };

    expect(ruleApplies(rule, input)).toBe(true);
  });

  it('should check transaction type condition', () => {
    const rule: AllocationRule = {
      id: 'payment_only',
      name: 'Payment Only',
      priority: 1,
      type: 'percentage',
      value: 10,
      targetAccountCode: 'PLATFORM_FEE_REVENUE',
      isActive: true,
      condition: {
        transactionTypes: ['payment_received'],
      },
    };

    expect(ruleApplies(rule, { amount: 1000, transactionType: 'payment_received' })).toBe(true);
    expect(ruleApplies(rule, { amount: 1000, transactionType: 'partner_commission' })).toBe(false);
  });

  it('should check min/max amount conditions', () => {
    const rule: AllocationRule = {
      id: 'amount_range',
      name: 'Amount Range',
      priority: 1,
      type: 'percentage',
      value: 10,
      targetAccountCode: 'PLATFORM_FEE_REVENUE',
      isActive: true,
      condition: {
        minAmount: 100,
        maxAmount: 1000,
      },
    };

    expect(ruleApplies(rule, { amount: 500, transactionType: 'payment_received' })).toBe(true);
    expect(ruleApplies(rule, { amount: 50, transactionType: 'payment_received' })).toBe(false);
    expect(ruleApplies(rule, { amount: 1500, transactionType: 'payment_received' })).toBe(false);
  });

  it('should check partner ID condition', () => {
    const rule: AllocationRule = {
      id: 'specific_partner',
      name: 'Specific Partner',
      priority: 1,
      type: 'percentage',
      value: 10,
      targetAccountCode: 'PARTNER_PAYABLE',
      isActive: true,
      condition: {
        partnerIds: ['partner_123', 'partner_456'],
      },
    };

    expect(ruleApplies(rule, { amount: 1000, transactionType: 'payment_received', partnerId: 'partner_123' })).toBe(true);
    expect(ruleApplies(rule, { amount: 1000, transactionType: 'payment_received', partnerId: 'partner_789' })).toBe(false);
  });
});

// =============================================================================
// Calculate Rule Allocation Tests
// =============================================================================

describe('calculateRuleAllocation', () => {
  it('should calculate percentage allocation', () => {
    const rule: AllocationRule = {
      id: 'pct',
      name: 'Percentage',
      priority: 1,
      type: 'percentage',
      value: 10,
      targetAccountCode: 'PLATFORM_FEE_REVENUE',
      isActive: true,
    };

    expect(calculateRuleAllocation(rule, 1000)).toBe(100);
    expect(calculateRuleAllocation(rule, 500)).toBe(50);
    expect(calculateRuleAllocation(rule, 0)).toBe(0);
  });

  it('should calculate fixed allocation', () => {
    const rule: AllocationRule = {
      id: 'fixed',
      name: 'Fixed',
      priority: 1,
      type: 'fixed',
      value: 50,
      targetAccountCode: 'PARTNER_PAYABLE',
      isActive: true,
    };

    expect(calculateRuleAllocation(rule, 1000)).toBe(50);
    expect(calculateRuleAllocation(rule, 30)).toBe(30); // Capped at remaining
  });

  it('should calculate remainder allocation', () => {
    const rule: AllocationRule = {
      id: 'remainder',
      name: 'Remainder',
      priority: 100,
      type: 'remainder',
      value: 0,
      targetAccountCode: 'CASH',
      isActive: true,
    };

    expect(calculateRuleAllocation(rule, 1000)).toBe(1000);
    expect(calculateRuleAllocation(rule, 123.45)).toBe(123.45);
  });

  it('should return 0 for unknown allocation type', () => {
    const rule = {
      id: 'unknown',
      name: 'Unknown',
      priority: 1,
      type: 'unknown' as const,
      value: 10,
      targetAccountCode: 'PLATFORM_FEE_REVENUE',
      isActive: true,
    };

    // @ts-expect-error Testing unknown type
    expect(calculateRuleAllocation(rule, 1000)).toBe(0);
  });
});

// =============================================================================
// Run Allocation Waterfall Tests
// =============================================================================

describe('runAllocationWaterfall', () => {
  it('should run waterfall in priority order', () => {
    const rules: AllocationRule[] = [
      { id: 'first', name: 'First', priority: 1, type: 'percentage', value: 10, targetAccountCode: 'PAYMENT_PROCESSING_FEE', isActive: true },
      { id: 'second', name: 'Second', priority: 2, type: 'percentage', value: 20, targetAccountCode: 'PARTNER_PAYABLE', isActive: true },
      { id: 'last', name: 'Last', priority: 100, type: 'remainder', value: 0, targetAccountCode: 'PLATFORM_FEE_REVENUE', isActive: true },
    ];

    const input: AllocationInput = { amount: 1000, transactionType: 'payment_received' };
    const results = runAllocationWaterfall(1000, rules, input);

    expect(results).toHaveLength(3);
    expect(results[0]?.ruleName).toBe('First');
    expect(results[0]?.amount).toBe(100); // 10% of 1000
    expect(results[1]?.ruleName).toBe('Second');
    expect(results[1]?.amount).toBe(180); // 20% of 900 (remaining)
    expect(results[2]?.ruleName).toBe('Last');
    expect(results[2]?.amount).toBe(720); // Remainder: 1000 - 100 - 180
  });

  it('should skip inactive rules', () => {
    const rules: AllocationRule[] = [
      { id: 'active', name: 'Active', priority: 1, type: 'percentage', value: 10, targetAccountCode: 'PAYMENT_PROCESSING_FEE', isActive: true },
      { id: 'inactive', name: 'Inactive', priority: 2, type: 'percentage', value: 50, targetAccountCode: 'PARTNER_PAYABLE', isActive: false },
      { id: 'remainder', name: 'Remainder', priority: 100, type: 'remainder', value: 0, targetAccountCode: 'PLATFORM_FEE_REVENUE', isActive: true },
    ];

    const input: AllocationInput = { amount: 1000, transactionType: 'payment_received' };
    const results = runAllocationWaterfall(1000, rules, input);

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.ruleName === 'Inactive')).toBeUndefined();
  });

  it('should stop when remaining amount is zero', () => {
    const rules: AllocationRule[] = [
      { id: 'all', name: 'All', priority: 1, type: 'percentage', value: 100, targetAccountCode: 'PLATFORM_FEE_REVENUE', isActive: true },
      { id: 'never', name: 'Never', priority: 2, type: 'percentage', value: 10, targetAccountCode: 'PARTNER_PAYABLE', isActive: true },
    ];

    const input: AllocationInput = { amount: 1000, transactionType: 'payment_received' };
    const results = runAllocationWaterfall(1000, rules, input);

    expect(results).toHaveLength(1);
    expect(results[0]?.amount).toBe(1000);
  });

  it('should round amounts to cents', () => {
    const rules: AllocationRule[] = [
      { id: 'third', name: 'Third', priority: 1, type: 'percentage', value: 33.33, targetAccountCode: 'PLATFORM_FEE_REVENUE', isActive: true },
    ];

    const input: AllocationInput = { amount: 100, transactionType: 'payment_received' };
    const results = runAllocationWaterfall(100, rules, input);

    expect(results[0]?.amount).toBe(33.33);
  });

  it('should include percentage in results for percentage rules', () => {
    const rules: AllocationRule[] = [
      { id: 'pct', name: 'Pct', priority: 1, type: 'percentage', value: 15, targetAccountCode: 'PLATFORM_FEE_REVENUE', isActive: true },
      { id: 'fixed', name: 'Fixed', priority: 2, type: 'fixed', value: 100, targetAccountCode: 'PARTNER_PAYABLE', isActive: true },
    ];

    const input: AllocationInput = { amount: 1000, transactionType: 'payment_received' };
    const results = runAllocationWaterfall(1000, rules, input);

    expect(results[0]?.percentage).toBe(15);
    expect(results[1]?.percentage).toBeUndefined();
  });
});

// =============================================================================
// Partner Rev-Share Tests
// =============================================================================

describe('calculatePartnerRevShare', () => {
  const activePartner: PartnerAllocationConfig = {
    partnerId: 'partner_123',
    partnerName: 'Test Partner',
    revSharePercentage: 30,
    minimumPayout: 100,
    isActive: true,
  };

  const inactivePartner: PartnerAllocationConfig = {
    ...activePartner,
    isActive: false,
  };

  it('should calculate rev-share for active partner', () => {
    const result = calculatePartnerRevShare(1000, activePartner);

    expect(result.partnerAmount).toBe(300); // 30% of 1000
    expect(result.platformAmount).toBe(700); // Remaining
  });

  it('should return 0 for inactive partner', () => {
    const result = calculatePartnerRevShare(1000, inactivePartner);

    expect(result.partnerAmount).toBe(0);
    expect(result.platformAmount).toBe(1000);
  });

  it('should round amounts to cents', () => {
    const result = calculatePartnerRevShare(333.33, activePartner);

    expect(result.partnerAmount).toBe(100); // 333.33 * 0.3 = 99.999 → 100
    expect(result.platformAmount).toBe(233.33); // Rounded
  });
});

describe('buildPartnerAllocationRules', () => {
  const config: PartnerAllocationConfig = {
    partnerId: 'partner_123',
    partnerName: 'Test Partner',
    revSharePercentage: 25,
    minimumPayout: 50,
    isActive: true,
  };

  it('should create partner-specific rules', () => {
    const rules = buildPartnerAllocationRules(config);

    expect(rules).toHaveLength(2);
    expect(rules[0]?.id).toBe('rule_partner_partner_123');
    expect(rules[0]?.name).toBe('Test Partner Rev-Share');
    expect(rules[0]?.value).toBe(25);
  });

  it('should include partner ID condition', () => {
    const rules = buildPartnerAllocationRules(config);

    expect(rules[0]?.condition?.partnerIds).toContain('partner_123');
  });

  it('should include platform remainder rule', () => {
    const rules = buildPartnerAllocationRules(config);

    expect(rules[1]?.type).toBe('remainder');
    expect(rules[1]?.targetAccountCode).toBe('PLATFORM_FEE_REVENUE');
  });
});

// =============================================================================
// Allocation to Ledger Entries Tests
// =============================================================================

describe('allocationResultsToEntries', () => {
  it('should create balanced ledger entries', () => {
    const results = [
      { ruleId: 'r1', ruleName: 'Rule 1', accountCode: 'PLATFORM_FEE_REVENUE' as AccountCode, amount: 100 },
      { ruleId: 'r2', ruleName: 'Rule 2', accountCode: 'PARTNER_PAYABLE' as AccountCode, amount: 50 },
    ];

    const entries = allocationResultsToEntries(results, 'STRIPE_CLEARING');

    expect(entries).toHaveLength(3);

    // Credits to target accounts
    expect(entries[0]?.accountCode).toBe('PLATFORM_FEE_REVENUE');
    expect(entries[0]?.amount).toBe(100);
    expect(entries[0]?.isDebit).toBe(false);

    expect(entries[1]?.accountCode).toBe('PARTNER_PAYABLE');
    expect(entries[1]?.amount).toBe(50);
    expect(entries[1]?.isDebit).toBe(false);

    // Balancing debit
    expect(entries[2]?.accountCode).toBe('STRIPE_CLEARING');
    expect(entries[2]?.amount).toBe(150);
    expect(entries[2]?.isDebit).toBe(true);
  });

  it('should skip zero-amount results', () => {
    const results = [
      { ruleId: 'r1', ruleName: 'Rule 1', accountCode: 'PLATFORM_FEE_REVENUE' as AccountCode, amount: 100 },
      { ruleId: 'r2', ruleName: 'Rule 2', accountCode: 'PARTNER_PAYABLE' as AccountCode, amount: 0 },
    ];

    const entries = allocationResultsToEntries(results, 'STRIPE_CLEARING');

    expect(entries).toHaveLength(2); // Only PLATFORM_FEE_REVENUE credit + balancing debit
  });

  it('should return empty array for no allocations', () => {
    const entries = allocationResultsToEntries([], 'STRIPE_CLEARING');
    expect(entries).toHaveLength(0);
  });
});

// =============================================================================
// Commission Split Tests
// =============================================================================

describe('calculateCommissionSplit', () => {
  it('should calculate commission split without processing fee', () => {
    const result = calculateCommissionSplit(1000, 30);

    expect(result.grossCommission).toBe(1000);
    expect(result.processingFee).toBe(0);
    expect(result.partnerShare).toBe(300);
    expect(result.platformShare).toBe(700);
    expect(result.netToPartner).toBe(300);
    expect(result.netToPlatform).toBe(700);
  });

  it('should calculate commission split with processing fee', () => {
    const result = calculateCommissionSplit(1000, 30, 2.9);

    expect(result.grossCommission).toBe(1000);
    expect(result.processingFee).toBe(29); // 2.9% of 1000
    expect(result.partnerShare).toBe(291.3); // 30% of (1000 - 29)
    expect(result.platformShare).toBe(679.7); // 70% of (1000 - 29)
  });

  it('should round all values to cents', () => {
    const result = calculateCommissionSplit(333.33, 33.33);

    expect(result.grossCommission).toBe(333.33);
    expect(Number.isInteger(result.partnerShare * 100)).toBe(true);
    expect(Number.isInteger(result.platformShare * 100)).toBe(true);
  });
});

describe('createAllocationBatchId', () => {
  it('should create unique batch IDs', () => {
    const id1 = createAllocationBatchId();
    const id2 = createAllocationBatchId();

    expect(id1).not.toBe(id2);
  });

  it('should have alloc_ prefix', () => {
    const id = createAllocationBatchId();
    expect(id.startsWith('alloc_')).toBe(true);
  });
});

// =============================================================================
// Rent Payment Waterfall Tests
// =============================================================================

describe('Rent Payment Constants', () => {
  it('should have correct fee constants', () => {
    expect(RENT_PLATFORM_FEE_PERCENT).toBe(1.5);
    expect(STRIPE_FEE_PERCENT).toBe(2.9);
    expect(STRIPE_FEE_FIXED_CENTS).toBe(30);
  });
});

describe('calculateStripeFee', () => {
  it('should calculate Stripe fee correctly', () => {
    // $100.00 = 10000 cents
    // Fee = 10000 * 0.029 + 30 = 290 + 30 = 320 cents
    expect(calculateStripeFee(10000)).toBe(320);
  });

  it('should include fixed fee component', () => {
    // $0 still has $0.30 fixed fee
    expect(calculateStripeFee(0)).toBe(30);
  });

  it('should handle large amounts', () => {
    // $10,000.00 = 1000000 cents
    // Fee = 1000000 * 0.029 + 30 = 29000 + 30 = 29030 cents
    expect(calculateStripeFee(1000000)).toBe(29030);
  });
});

describe('buildRentPaymentWaterfall', () => {
  it('should calculate waterfall with default platform fee', () => {
    const result = buildRentPaymentWaterfall(150000); // $1500

    expect(result.grossAmount).toBe(1500);
    expect(result.processingFee).toBeGreaterThan(0);
    expect(result.platformFee).toBeGreaterThan(0);
    expect(result.netToLandlord).toBeGreaterThan(0);

    // Verify waterfall adds up
    const total = result.processingFee + result.platformFee + result.netToLandlord;
    expect(total).toBeCloseTo(result.grossAmount, 2);
  });

  it('should accept custom platform fee percentage', () => {
    const defaultResult = buildRentPaymentWaterfall(100000);
    const customResult = buildRentPaymentWaterfall(100000, { platformFeePercent: 2.5 });

    expect(customResult.platformFee).toBeGreaterThan(defaultResult.platformFee);
  });

  it('should generate ledger entries', () => {
    const result = buildRentPaymentWaterfall(150000);

    expect(result.entries.length).toBeGreaterThan(0);

    // Check for key account codes
    const accountCodes = result.entries.map((e) => e.accountCode);
    expect(accountCodes).toContain('STRIPE_CLEARING');
    expect(accountCodes).toContain('PLATFORM_FEE_REVENUE');
    expect(accountCodes).toContain('ACCOUNTS_PAYABLE');
  });
});

describe('buildRentPaymentEntries', () => {
  it('should create balanced ledger entries', () => {
    const entries = buildRentPaymentEntries(1500, 43.80, 22.50);

    // Calculate totals
    let debits = 0;
    let credits = 0;
    for (const entry of entries) {
      if (entry.isDebit) {
        debits += entry.amount;
      } else {
        credits += entry.amount;
      }
    }

    // Should balance (within rounding tolerance)
    expect(Math.abs(debits - credits)).toBeLessThan(0.01);
  });

  it('should include all required accounts', () => {
    const entries = buildRentPaymentEntries(1500, 43.80, 22.50);
    const accountCodes = entries.map((e) => e.accountCode);

    expect(accountCodes).toContain('STRIPE_CLEARING');
    expect(accountCodes).toContain('ACCOUNTS_RECEIVABLE');
    expect(accountCodes).toContain('PAYMENT_PROCESSING_FEE');
    expect(accountCodes).toContain('PLATFORM_FEE_REVENUE');
    expect(accountCodes).toContain('CASH');
    expect(accountCodes).toContain('ACCOUNTS_PAYABLE');
  });
});

describe('buildDisputeHoldEntries', () => {
  it('should move funds to held account', () => {
    const entries = buildDisputeHoldEntries(1500);

    expect(entries).toHaveLength(2);

    // Credit CASH (reduce available cash)
    const cashEntry = entries.find((e) => e.accountCode === 'CASH');
    expect(cashEntry?.isDebit).toBe(false);
    expect(cashEntry?.amount).toBe(1500);

    // Debit SECURITY_DEPOSITS_HELD (increase held amount)
    const heldEntry = entries.find((e) => e.accountCode === 'SECURITY_DEPOSITS_HELD');
    expect(heldEntry?.isDebit).toBe(true);
    expect(heldEntry?.amount).toBe(1500);
  });
});

describe('buildDisputeResolutionEntries', () => {
  it('should release funds when dispute is won', () => {
    const entries = buildDisputeResolutionEntries(1500, true);

    expect(entries).toHaveLength(2);

    // Credit SECURITY_DEPOSITS_HELD (release hold)
    const heldEntry = entries.find((e) => e.accountCode === 'SECURITY_DEPOSITS_HELD');
    expect(heldEntry?.isDebit).toBe(false);

    // Debit CASH (return to available)
    const cashEntry = entries.find((e) => e.accountCode === 'CASH');
    expect(cashEntry?.isDebit).toBe(true);
  });

  it('should expense funds when dispute is lost', () => {
    const entries = buildDisputeResolutionEntries(1500, false);

    expect(entries).toHaveLength(2);

    // Credit SECURITY_DEPOSITS_HELD (release hold)
    const heldEntry = entries.find((e) => e.accountCode === 'SECURITY_DEPOSITS_HELD');
    expect(heldEntry?.isDebit).toBe(false);

    // Debit REFUND_EXPENSE (record loss)
    const expenseEntry = entries.find((e) => e.accountCode === 'REFUND_EXPENSE');
    expect(expenseEntry?.isDebit).toBe(true);
    expect(expenseEntry?.amount).toBe(1500);
  });
});
