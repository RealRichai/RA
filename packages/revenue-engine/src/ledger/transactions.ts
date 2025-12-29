/**
 * Ledger Transactions
 *
 * Double-entry bookkeeping transaction engine with validation.
 */

import { randomUUID } from 'crypto';

import type {
  AccountCode,
  LedgerEntry,
  LedgerTransaction,
  TransactionType,
} from '../types';

import { calculateBalanceChange, CHART_OF_ACCOUNTS } from './accounts';

// =============================================================================
// Transaction Builder
// =============================================================================

export interface TransactionInput {
  type: TransactionType;
  entries: LedgerEntry[];
  description: string;
  idempotencyKey: string;
  externalId?: string;
  referenceType?: string;
  referenceId?: string;
  reconciliationRef?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface TransactionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  totalDebits: number;
  totalCredits: number;
}

/**
 * Validate that a transaction is balanced (debits = credits).
 */
export function validateTransaction(entries: LedgerEntry[]): TransactionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let totalDebits = 0;
  let totalCredits = 0;

  if (entries.length < 2) {
    errors.push('Transaction must have at least 2 entries');
  }

  for (const entry of entries) {
    // Validate account exists
    if (!CHART_OF_ACCOUNTS[entry.accountCode]) {
      errors.push(`Unknown account code: ${entry.accountCode}`);
      continue;
    }

    // Validate amount
    if (entry.amount <= 0) {
      errors.push(`Entry amount must be positive: ${entry.accountCode} = ${entry.amount}`);
    }

    // Tally debits and credits
    if (entry.isDebit) {
      totalDebits += entry.amount;
    } else {
      totalCredits += entry.amount;
    }
  }

  // Check balance (with tolerance for floating point)
  const difference = Math.abs(totalDebits - totalCredits);
  if (difference > 0.01) {
    errors.push(
      `Transaction is not balanced: debits=${totalDebits.toFixed(2)}, credits=${totalCredits.toFixed(2)}`
    );
  }

  // Warnings for unusual patterns
  if (totalDebits === 0 && totalCredits === 0) {
    warnings.push('Transaction has zero amounts');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    totalDebits,
    totalCredits,
  };
}

/**
 * Create a new ledger transaction.
 */
export function createTransaction(input: TransactionInput): LedgerTransaction {
  const validation = validateTransaction(input.entries);
  if (!validation.valid) {
    throw new Error(`Invalid transaction: ${validation.errors.join(', ')}`);
  }

  const now = new Date();

  return {
    id: `txn_${randomUUID().replace(/-/g, '')}`,
    idempotencyKey: input.idempotencyKey,
    type: input.type,
    status: 'pending',
    entries: input.entries,
    amount: validation.totalDebits, // Total amount (debits = credits)
    currency: 'USD',
    description: input.description,
    externalId: input.externalId,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    reconciliationRef: input.reconciliationRef,
    createdBy: input.createdBy,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Post a transaction (move from pending to posted).
 */
export function postTransaction(transaction: LedgerTransaction): LedgerTransaction {
  if (transaction.status !== 'pending') {
    throw new Error(`Cannot post transaction in status: ${transaction.status}`);
  }

  return {
    ...transaction,
    status: 'posted',
    postedAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Void a transaction.
 */
export function voidTransaction(
  transaction: LedgerTransaction,
  reason: string
): LedgerTransaction {
  if (transaction.status === 'voided') {
    throw new Error('Transaction is already voided');
  }

  if (transaction.status === 'reversed') {
    throw new Error('Cannot void a reversed transaction');
  }

  return {
    ...transaction,
    status: 'voided',
    voidedAt: new Date(),
    voidReason: reason,
    updatedAt: new Date(),
  };
}

/**
 * Create a reversal transaction for a posted transaction.
 */
export function createReversalTransaction(
  original: LedgerTransaction,
  reason: string,
  idempotencyKey: string
): LedgerTransaction {
  if (original.status !== 'posted') {
    throw new Error('Can only reverse posted transactions');
  }

  // Reverse all entries (swap debit/credit)
  const reversedEntries: LedgerEntry[] = original.entries.map((entry) => ({
    ...entry,
    isDebit: !entry.isDebit,
  }));

  const now = new Date();

  return {
    id: `txn_${randomUUID().replace(/-/g, '')}`,
    idempotencyKey,
    type: 'reversal',
    status: 'pending',
    entries: reversedEntries,
    amount: original.amount,
    currency: original.currency,
    description: `Reversal: ${reason}`,
    referenceType: 'transaction',
    referenceId: original.id,
    metadata: {
      originalTransactionId: original.id,
      reversalReason: reason,
    },
    createdAt: now,
    updatedAt: now,
  };
}

// =============================================================================
// Common Transaction Builders
// =============================================================================

/**
 * Build entries for receiving a payment.
 */
export function buildPaymentReceivedEntries(
  amount: number,
  processingFee: number = 0
): LedgerEntry[] {
  const entries: LedgerEntry[] = [
    // Debit Stripe Clearing (asset increases)
    { accountCode: 'STRIPE_CLEARING', amount, isDebit: true },
    // Credit Accounts Receivable (asset decreases)
    { accountCode: 'ACCOUNTS_RECEIVABLE', amount, isDebit: false },
  ];

  if (processingFee > 0) {
    // Adjust for processing fee
    entries.push(
      // Debit Processing Fee Expense
      { accountCode: 'PAYMENT_PROCESSING_FEE', amount: processingFee, isDebit: true },
      // Credit Stripe Clearing (reduce the asset)
      { accountCode: 'STRIPE_CLEARING', amount: processingFee, isDebit: false }
    );
  }

  return entries;
}

/**
 * Build entries for a refund.
 */
export function buildRefundEntries(amount: number): LedgerEntry[] {
  return [
    // Debit Refund Expense
    { accountCode: 'REFUND_EXPENSE', amount, isDebit: true },
    // Credit Cash/Stripe Clearing
    { accountCode: 'STRIPE_CLEARING', amount, isDebit: false },
  ];
}

/**
 * Build entries for partner commission.
 */
export function buildCommissionEntries(
  commissionAccountCode: AccountCode,
  amount: number,
  withRevShare: boolean = false,
  revShareAmount: number = 0
): LedgerEntry[] {
  const entries: LedgerEntry[] = [
    // Debit Partner Receivable (asset increases)
    { accountCode: 'PARTNER_RECEIVABLE', amount, isDebit: true },
    // Credit Commission Revenue
    { accountCode: commissionAccountCode, amount, isDebit: false },
  ];

  if (withRevShare && revShareAmount > 0) {
    entries.push(
      // Debit Partner Payout Expense
      { accountCode: 'PARTNER_PAYOUT', amount: revShareAmount, isDebit: true },
      // Credit Partner Payable (liability increases)
      { accountCode: 'PARTNER_PAYABLE', amount: revShareAmount, isDebit: false }
    );
  }

  return entries;
}

/**
 * Build entries for partner payout (settling rev-share).
 */
export function buildPartnerPayoutEntries(amount: number): LedgerEntry[] {
  return [
    // Debit Partner Payable (liability decreases)
    { accountCode: 'PARTNER_PAYABLE', amount, isDebit: true },
    // Credit Cash
    { accountCode: 'CASH', amount, isDebit: false },
  ];
}

/**
 * Build entries for platform fee collection.
 */
export function buildPlatformFeeEntries(amount: number): LedgerEntry[] {
  return [
    // Debit Cash
    { accountCode: 'CASH', amount, isDebit: true },
    // Credit Platform Fee Revenue
    { accountCode: 'PLATFORM_FEE_REVENUE', amount, isDebit: false },
  ];
}

// =============================================================================
// Balance Calculator
// =============================================================================

export interface AccountBalance {
  code: AccountCode;
  balance: number;
  debitTotal: number;
  creditTotal: number;
}

/**
 * Calculate account balances from a list of transactions.
 */
export function calculateAccountBalances(
  transactions: LedgerTransaction[]
): Map<AccountCode, AccountBalance> {
  const balances = new Map<AccountCode, AccountBalance>();

  // Initialize all accounts
  for (const code of Object.keys(CHART_OF_ACCOUNTS) as AccountCode[]) {
    balances.set(code, {
      code,
      balance: 0,
      debitTotal: 0,
      creditTotal: 0,
    });
  }

  // Process only posted transactions
  for (const txn of transactions) {
    if (txn.status !== 'posted') continue;

    for (const entry of txn.entries) {
      const balance = balances.get(entry.accountCode);
      if (!balance) continue;

      if (entry.isDebit) {
        balance.debitTotal += entry.amount;
      } else {
        balance.creditTotal += entry.amount;
      }

      // Calculate running balance
      const change = calculateBalanceChange(
        entry.accountCode,
        entry.amount,
        entry.isDebit
      );
      balance.balance += change;
    }
  }

  return balances;
}

/**
 * Generate a reconciliation reference.
 */
export function generateReconciliationRef(
  prefix: string,
  date: Date = new Date()
): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();

  return `${prefix}-${year}${month}${day}-${random}`;
}
