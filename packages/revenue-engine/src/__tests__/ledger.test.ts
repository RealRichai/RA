/**
 * Ledger Unit Tests
 *
 * Tests for accounts, transactions, and allocations.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  CHART_OF_ACCOUNTS,
  getAccountDefinition,
  getAccountsByType,
  isDebitNormalBalance,
  isCreditNormalBalance,
  calculateBalanceChange,
  initializeChartOfAccounts,
  getCommissionAccountForProduct,
} from '../ledger/accounts';
import {
  DEFAULT_ALLOCATION_RULES,
  sortRulesByPriority,
  ruleApplies,
  calculateRuleAllocation,
  runAllocationWaterfall,
  calculatePartnerRevShare,
  calculateCommissionSplit,
} from '../ledger/allocations';
import {
  validateTransaction,
  createTransaction,
  postTransaction,
  voidTransaction,
  createReversalTransaction,
  buildPaymentReceivedEntries,
  buildRefundEntries,
  buildCommissionEntries,
  buildPartnerPayoutEntries,
  calculateAccountBalances,
  generateReconciliationRef,
} from '../ledger/transactions';
import type { LedgerEntry, LedgerTransaction } from '../types';

// =============================================================================
// Account Tests
// =============================================================================

describe('Chart of Accounts', () => {
  it('should have all required account codes', () => {
    expect(CHART_OF_ACCOUNTS.CASH).toBeDefined();
    expect(CHART_OF_ACCOUNTS.ACCOUNTS_RECEIVABLE).toBeDefined();
    expect(CHART_OF_ACCOUNTS.STRIPE_CLEARING).toBeDefined();
    expect(CHART_OF_ACCOUNTS.PLATFORM_FEE_REVENUE).toBeDefined();
    expect(CHART_OF_ACCOUNTS.PARTNER_PAYABLE).toBeDefined();
  });

  it('should get account definition by code', () => {
    const cash = getAccountDefinition('CASH');
    expect(cash.code).toBe('CASH');
    expect(cash.type).toBe('asset');
    expect(cash.normalBalance).toBe('debit');
  });

  it('should get accounts by type', () => {
    const assets = getAccountsByType('asset');
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.every((a) => a.type === 'asset')).toBe(true);

    const revenue = getAccountsByType('revenue');
    expect(revenue.length).toBeGreaterThan(0);
    expect(revenue.every((a) => a.type === 'revenue')).toBe(true);
  });

  it('should correctly identify normal balance', () => {
    expect(isDebitNormalBalance('CASH')).toBe(true);
    expect(isDebitNormalBalance('ACCOUNTS_PAYABLE')).toBe(false);
    expect(isCreditNormalBalance('PLATFORM_FEE_REVENUE')).toBe(true);
    expect(isCreditNormalBalance('PAYMENT_PROCESSING_FEE')).toBe(false);
  });

  it('should calculate balance change correctly', () => {
    // Debit to asset account (normal) = increase
    expect(calculateBalanceChange('CASH', 100, true)).toBe(100);

    // Credit to asset account (abnormal) = decrease
    expect(calculateBalanceChange('CASH', 100, false)).toBe(-100);

    // Credit to revenue account (normal) = increase
    expect(calculateBalanceChange('PLATFORM_FEE_REVENUE', 100, false)).toBe(100);

    // Debit to revenue account (abnormal) = decrease
    expect(calculateBalanceChange('PLATFORM_FEE_REVENUE', 100, true)).toBe(-100);
  });

  it('should initialize chart of accounts', () => {
    const accounts = initializeChartOfAccounts();
    expect(accounts.size).toBe(Object.keys(CHART_OF_ACCOUNTS).length);

    const cash = accounts.get('CASH');
    expect(cash).toBeDefined();
    expect(cash?.balance).toBe(0);
    expect(cash?.isActive).toBe(true);
  });

  it('should get commission account for product type', () => {
    expect(getCommissionAccountForProduct('deposit_alternative')).toBe('DEPOSIT_ALT_COMMISSION');
    expect(getCommissionAccountForProduct('renters_insurance')).toBe('INSURANCE_COMMISSION');
    expect(getCommissionAccountForProduct('guarantor')).toBe('GUARANTOR_COMMISSION');
    expect(getCommissionAccountForProduct('utility_setup')).toBe('UTILITIES_REFERRAL_FEE');
  });
});

// =============================================================================
// Transaction Tests
// =============================================================================

describe('Transaction Validation', () => {
  it('should validate balanced transaction', () => {
    const entries: LedgerEntry[] = [
      { accountCode: 'CASH', amount: 100, isDebit: true },
      { accountCode: 'ACCOUNTS_RECEIVABLE', amount: 100, isDebit: false },
    ];

    const result = validateTransaction(entries);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.totalDebits).toBe(100);
    expect(result.totalCredits).toBe(100);
  });

  it('should reject unbalanced transaction', () => {
    const entries: LedgerEntry[] = [
      { accountCode: 'CASH', amount: 100, isDebit: true },
      { accountCode: 'ACCOUNTS_RECEIVABLE', amount: 50, isDebit: false },
    ];

    const result = validateTransaction(entries);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not balanced'))).toBe(true);
  });

  it('should reject transaction with less than 2 entries', () => {
    const entries: LedgerEntry[] = [
      { accountCode: 'CASH', amount: 100, isDebit: true },
    ];

    const result = validateTransaction(entries);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least 2'))).toBe(true);
  });

  it('should reject zero or negative amounts', () => {
    const entries: LedgerEntry[] = [
      { accountCode: 'CASH', amount: 0, isDebit: true },
      { accountCode: 'ACCOUNTS_RECEIVABLE', amount: 0, isDebit: false },
    ];

    const result = validateTransaction(entries);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must be positive'))).toBe(true);
  });
});

describe('Transaction Creation', () => {
  it('should create a valid transaction', () => {
    const entries: LedgerEntry[] = [
      { accountCode: 'CASH', amount: 100, isDebit: true },
      { accountCode: 'PLATFORM_FEE_REVENUE', amount: 100, isDebit: false },
    ];

    const transaction = createTransaction({
      type: 'platform_fee',
      entries,
      description: 'Test platform fee',
      idempotencyKey: 'test_123',
    });

    expect(transaction.id).toMatch(/^txn_/);
    expect(transaction.status).toBe('pending');
    expect(transaction.amount).toBe(100);
    expect(transaction.entries.length).toBe(2);
  });

  it('should throw on invalid transaction', () => {
    const entries: LedgerEntry[] = [
      { accountCode: 'CASH', amount: 100, isDebit: true },
    ];

    expect(() =>
      createTransaction({
        type: 'platform_fee',
        entries,
        description: 'Invalid',
        idempotencyKey: 'test_123',
      })
    ).toThrow();
  });
});

describe('Transaction State Transitions', () => {
  let pendingTransaction: LedgerTransaction;

  beforeEach(() => {
    const entries: LedgerEntry[] = [
      { accountCode: 'CASH', amount: 100, isDebit: true },
      { accountCode: 'PLATFORM_FEE_REVENUE', amount: 100, isDebit: false },
    ];

    pendingTransaction = createTransaction({
      type: 'platform_fee',
      entries,
      description: 'Test',
      idempotencyKey: 'test_post',
    });
  });

  it('should post a pending transaction', () => {
    const posted = postTransaction(pendingTransaction);
    expect(posted.status).toBe('posted');
    expect(posted.postedAt).toBeInstanceOf(Date);
  });

  it('should not post an already posted transaction', () => {
    const posted = postTransaction(pendingTransaction);
    expect(() => postTransaction(posted)).toThrow();
  });

  it('should void a transaction', () => {
    const voided = voidTransaction(pendingTransaction, 'Test void');
    expect(voided.status).toBe('voided');
    expect(voided.voidedAt).toBeInstanceOf(Date);
    expect(voided.voidReason).toBe('Test void');
  });

  it('should create reversal for posted transaction', () => {
    const posted = postTransaction(pendingTransaction);
    const reversal = createReversalTransaction(posted, 'Test reversal', 'rev_123');

    expect(reversal.type).toBe('reversal');
    expect(reversal.status).toBe('pending');
    expect(reversal.entries[0]!.isDebit).toBe(!posted.entries[0]!.isDebit);
    expect(reversal.entries[1]!.isDebit).toBe(!posted.entries[1]!.isDebit);
  });
});

describe('Transaction Entry Builders', () => {
  it('should build payment received entries', () => {
    const entries = buildPaymentReceivedEntries(1000, 29);

    expect(entries.length).toBe(4);

    // Should have debit to Stripe Clearing
    const stripeDebit = entries.find(
      (e) => e.accountCode === 'STRIPE_CLEARING' && e.isDebit
    );
    expect(stripeDebit?.amount).toBe(1000);

    // Should have processing fee debit
    const feeDebit = entries.find(
      (e) => e.accountCode === 'PAYMENT_PROCESSING_FEE' && e.isDebit
    );
    expect(feeDebit?.amount).toBe(29);
  });

  it('should build refund entries', () => {
    const entries = buildRefundEntries(100);

    expect(entries.length).toBe(2);
    expect(entries.find((e) => e.accountCode === 'REFUND_EXPENSE')?.isDebit).toBe(true);
    expect(entries.find((e) => e.accountCode === 'STRIPE_CLEARING')?.isDebit).toBe(false);
  });

  it('should build commission entries with rev-share', () => {
    const entries = buildCommissionEntries('DEPOSIT_ALT_COMMISSION', 100, true, 30);

    expect(entries.length).toBe(4);

    // Commission revenue credit
    const commissionCredit = entries.find(
      (e) => e.accountCode === 'DEPOSIT_ALT_COMMISSION' && !e.isDebit
    );
    expect(commissionCredit?.amount).toBe(100);

    // Partner payable credit
    const payableCredit = entries.find(
      (e) => e.accountCode === 'PARTNER_PAYABLE' && !e.isDebit
    );
    expect(payableCredit?.amount).toBe(30);
  });

  it('should build partner payout entries', () => {
    const entries = buildPartnerPayoutEntries(100);

    expect(entries.length).toBe(2);
    expect(entries.find((e) => e.accountCode === 'PARTNER_PAYABLE')?.isDebit).toBe(true);
    expect(entries.find((e) => e.accountCode === 'CASH')?.isDebit).toBe(false);
  });
});

describe('Balance Calculations', () => {
  it('should calculate account balances from transactions', () => {
    const transactions: LedgerTransaction[] = [
      {
        id: 'txn_1',
        idempotencyKey: 'idem_1',
        type: 'payment_received',
        status: 'posted',
        entries: [
          { accountCode: 'CASH', amount: 1000, isDebit: true },
          { accountCode: 'PLATFORM_FEE_REVENUE', amount: 1000, isDebit: false },
        ],
        amount: 1000,
        currency: 'USD',
        description: 'Test payment',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'txn_2',
        idempotencyKey: 'idem_2',
        type: 'payment_received',
        status: 'posted',
        entries: [
          { accountCode: 'CASH', amount: 500, isDebit: true },
          { accountCode: 'PLATFORM_FEE_REVENUE', amount: 500, isDebit: false },
        ],
        amount: 500,
        currency: 'USD',
        description: 'Test payment 2',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const balances = calculateAccountBalances(transactions);

    expect(balances.get('CASH')?.balance).toBe(1500);
    expect(balances.get('PLATFORM_FEE_REVENUE')?.balance).toBe(1500);
  });

  it('should ignore non-posted transactions', () => {
    const transactions: LedgerTransaction[] = [
      {
        id: 'txn_1',
        idempotencyKey: 'idem_1',
        type: 'payment_received',
        status: 'pending', // Not posted
        entries: [
          { accountCode: 'CASH', amount: 1000, isDebit: true },
          { accountCode: 'PLATFORM_FEE_REVENUE', amount: 1000, isDebit: false },
        ],
        amount: 1000,
        currency: 'USD',
        description: 'Pending payment',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const balances = calculateAccountBalances(transactions);

    expect(balances.get('CASH')?.balance).toBe(0);
  });
});

describe('Reconciliation Reference', () => {
  it('should generate valid reconciliation reference', () => {
    const ref = generateReconciliationRef('PAY');
    expect(ref).toMatch(/^PAY-\d{8}-[A-Z0-9]{6}$/);
  });

  it('should include date in reference', () => {
    const date = new Date(2024, 2, 15); // March 15, 2024 (month is 0-indexed)
    const ref = generateReconciliationRef('INV', date);
    expect(ref).toContain('20240315');
  });
});

// =============================================================================
// Allocation Tests
// =============================================================================

describe('Allocation Rules', () => {
  it('should sort rules by priority', () => {
    const sorted = sortRulesByPriority(DEFAULT_ALLOCATION_RULES);
    expect(sorted[0]!.priority).toBeLessThanOrEqual(sorted[1]!.priority);
  });

  it('should check if rule applies', () => {
    const rule = DEFAULT_ALLOCATION_RULES.find((r) => r.id === 'rule_processing_fee')!;

    expect(
      ruleApplies(rule, {
        amount: 100,
        transactionType: 'payment_received',
      })
    ).toBe(true);

    expect(
      ruleApplies(rule, {
        amount: 100,
        transactionType: 'partner_commission',
      })
    ).toBe(false);
  });

  it('should calculate percentage allocation', () => {
    const rule = {
      id: 'test',
      name: 'Test',
      priority: 1,
      type: 'percentage' as const,
      value: 10,
      targetAccountCode: 'CASH' as const,
      isActive: true,
    };

    expect(calculateRuleAllocation(rule, 100)).toBe(10);
    expect(calculateRuleAllocation(rule, 250)).toBe(25);
  });

  it('should calculate fixed allocation', () => {
    const rule = {
      id: 'test',
      name: 'Test',
      priority: 1,
      type: 'fixed' as const,
      value: 50,
      targetAccountCode: 'CASH' as const,
      isActive: true,
    };

    expect(calculateRuleAllocation(rule, 100)).toBe(50);
    expect(calculateRuleAllocation(rule, 30)).toBe(30); // Capped at remaining
  });

  it('should calculate remainder allocation', () => {
    const rule = {
      id: 'test',
      name: 'Test',
      priority: 100,
      type: 'remainder' as const,
      value: 0,
      targetAccountCode: 'PLATFORM_FEE_REVENUE' as const,
      isActive: true,
    };

    expect(calculateRuleAllocation(rule, 75)).toBe(75);
  });
});

describe('Allocation Waterfall', () => {
  it('should run allocation waterfall', () => {
    const results = runAllocationWaterfall(
      100,
      DEFAULT_ALLOCATION_RULES,
      { amount: 100, transactionType: 'payment_received' }
    );

    expect(results.length).toBeGreaterThan(0);

    // Should have processing fee
    const processingFee = results.find((r) => r.ruleId === 'rule_processing_fee');
    expect(processingFee?.amount).toBe(2.9); // 2.9% of 100

    // Should have platform fee (remainder)
    const platformFee = results.find((r) => r.ruleId === 'rule_platform_fee');
    expect(platformFee).toBeDefined();
  });
});

describe('Partner Rev-Share', () => {
  it('should calculate partner rev-share', () => {
    const result = calculatePartnerRevShare(100, {
      partnerId: 'partner_1',
      partnerName: 'Test Partner',
      revSharePercentage: 30,
      minimumPayout: 50,
      isActive: true,
    });

    expect(result.partnerAmount).toBe(30);
    expect(result.platformAmount).toBe(70);
  });

  it('should return zero for inactive partner', () => {
    const result = calculatePartnerRevShare(100, {
      partnerId: 'partner_1',
      partnerName: 'Test Partner',
      revSharePercentage: 30,
      minimumPayout: 50,
      isActive: false,
    });

    expect(result.partnerAmount).toBe(0);
    expect(result.platformAmount).toBe(100);
  });
});

describe('Commission Split', () => {
  it('should calculate commission split', () => {
    const split = calculateCommissionSplit(100, 30, 2.9);

    expect(split.grossCommission).toBe(100);
    expect(split.processingFee).toBe(2.9);
    expect(split.partnerShare).toBeCloseTo(29.13, 1);
    expect(split.platformShare).toBeCloseTo(67.97, 1);
  });

  it('should handle zero rev-share', () => {
    const split = calculateCommissionSplit(100, 0, 2.9);

    expect(split.partnerShare).toBe(0);
    expect(split.platformShare).toBeCloseTo(97.1, 1);
  });
});
