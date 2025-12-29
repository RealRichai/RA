/**
 * Chart of Accounts
 *
 * Defines the account structure for double-entry bookkeeping.
 */

import type { AccountCode, AccountType, LedgerAccount } from '../types';

// =============================================================================
// Account Definitions
// =============================================================================

interface AccountDefinition {
  code: AccountCode;
  name: string;
  type: AccountType;
  normalBalance: 'debit' | 'credit';
  description: string;
}

export const CHART_OF_ACCOUNTS: Record<AccountCode, AccountDefinition> = {
  // Assets (Debit normal balance)
  CASH: {
    code: 'CASH',
    name: 'Cash',
    type: 'asset',
    normalBalance: 'debit',
    description: 'Cash received from payments',
  },
  ACCOUNTS_RECEIVABLE: {
    code: 'ACCOUNTS_RECEIVABLE',
    name: 'Accounts Receivable',
    type: 'asset',
    normalBalance: 'debit',
    description: 'Amounts owed by tenants/customers',
  },
  STRIPE_CLEARING: {
    code: 'STRIPE_CLEARING',
    name: 'Stripe Clearing',
    type: 'asset',
    normalBalance: 'debit',
    description: 'Pending Stripe transfers',
  },
  PARTNER_RECEIVABLE: {
    code: 'PARTNER_RECEIVABLE',
    name: 'Partner Receivable',
    type: 'asset',
    normalBalance: 'debit',
    description: 'Commissions owed by partners',
  },

  // Liabilities (Credit normal balance)
  ACCOUNTS_PAYABLE: {
    code: 'ACCOUNTS_PAYABLE',
    name: 'Accounts Payable',
    type: 'liability',
    normalBalance: 'credit',
    description: 'Amounts owed to vendors/partners',
  },
  SECURITY_DEPOSITS_HELD: {
    code: 'SECURITY_DEPOSITS_HELD',
    name: 'Security Deposits Held',
    type: 'liability',
    normalBalance: 'credit',
    description: 'Security deposits held in trust',
  },
  DEFERRED_REVENUE: {
    code: 'DEFERRED_REVENUE',
    name: 'Deferred Revenue',
    type: 'liability',
    normalBalance: 'credit',
    description: 'Prepaid rent and fees',
  },
  PARTNER_PAYABLE: {
    code: 'PARTNER_PAYABLE',
    name: 'Partner Payable',
    type: 'liability',
    normalBalance: 'credit',
    description: 'Rev-share owed to partners',
  },

  // Revenue (Credit normal balance)
  PLATFORM_FEE_REVENUE: {
    code: 'PLATFORM_FEE_REVENUE',
    name: 'Platform Fee Revenue',
    type: 'revenue',
    normalBalance: 'credit',
    description: 'Platform fees from transactions',
  },
  DEPOSIT_ALT_COMMISSION: {
    code: 'DEPOSIT_ALT_COMMISSION',
    name: 'Deposit Alternative Commission',
    type: 'revenue',
    normalBalance: 'credit',
    description: 'Commission from deposit alternative products',
  },
  INSURANCE_COMMISSION: {
    code: 'INSURANCE_COMMISSION',
    name: 'Insurance Commission',
    type: 'revenue',
    normalBalance: 'credit',
    description: 'Commission from renters insurance',
  },
  GUARANTOR_COMMISSION: {
    code: 'GUARANTOR_COMMISSION',
    name: 'Guarantor Commission',
    type: 'revenue',
    normalBalance: 'credit',
    description: 'Commission from guarantor products',
  },
  UTILITIES_REFERRAL_FEE: {
    code: 'UTILITIES_REFERRAL_FEE',
    name: 'Utilities Referral Fee',
    type: 'revenue',
    normalBalance: 'credit',
    description: 'Referral fees from utility setups',
  },
  MOVING_REFERRAL_FEE: {
    code: 'MOVING_REFERRAL_FEE',
    name: 'Moving Referral Fee',
    type: 'revenue',
    normalBalance: 'credit',
    description: 'Referral fees from moving services',
  },
  MARKETPLACE_REFERRAL_FEE: {
    code: 'MARKETPLACE_REFERRAL_FEE',
    name: 'Marketplace Referral Fee',
    type: 'revenue',
    normalBalance: 'credit',
    description: 'Referral fees from vendor marketplace',
  },

  // Expenses (Debit normal balance)
  PAYMENT_PROCESSING_FEE: {
    code: 'PAYMENT_PROCESSING_FEE',
    name: 'Payment Processing Fee',
    type: 'expense',
    normalBalance: 'debit',
    description: 'Stripe/payment processor fees',
  },
  PARTNER_PAYOUT: {
    code: 'PARTNER_PAYOUT',
    name: 'Partner Payout',
    type: 'expense',
    normalBalance: 'debit',
    description: 'Rev-share payments to partners',
  },
  REFUND_EXPENSE: {
    code: 'REFUND_EXPENSE',
    name: 'Refund Expense',
    type: 'expense',
    normalBalance: 'debit',
    description: 'Refunds issued to customers',
  },
};

// =============================================================================
// Account Helpers
// =============================================================================

export function getAccountDefinition(code: AccountCode): AccountDefinition {
  return CHART_OF_ACCOUNTS[code];
}

export function getAccountsByType(type: AccountType): AccountDefinition[] {
  return Object.values(CHART_OF_ACCOUNTS).filter((acc) => acc.type === type);
}

export function isDebitNormalBalance(code: AccountCode): boolean {
  return CHART_OF_ACCOUNTS[code].normalBalance === 'debit';
}

export function isCreditNormalBalance(code: AccountCode): boolean {
  return CHART_OF_ACCOUNTS[code].normalBalance === 'credit';
}

/**
 * Calculate the effect of a debit/credit on an account balance.
 * - Debit increases assets/expenses, decreases liabilities/equity/revenue
 * - Credit increases liabilities/equity/revenue, decreases assets/expenses
 */
export function calculateBalanceChange(
  code: AccountCode,
  amount: number,
  isDebit: boolean
): number {
  const account = CHART_OF_ACCOUNTS[code];
  const isNormalDebit = account.normalBalance === 'debit';

  // If the transaction matches the normal balance, increase; otherwise, decrease
  if (isDebit === isNormalDebit) {
    return amount;
  } else {
    return -amount;
  }
}

/**
 * Create a ledger account from a definition.
 */
export function createAccountFromDefinition(
  definition: AccountDefinition,
  id: string
): LedgerAccount {
  const now = new Date();
  return {
    id,
    code: definition.code,
    name: definition.name,
    type: definition.type,
    balance: 0,
    currency: 'USD',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Initialize all accounts in the chart.
 */
export function initializeChartOfAccounts(): Map<AccountCode, LedgerAccount> {
  const accounts = new Map<AccountCode, LedgerAccount>();
  let idCounter = 1;

  for (const [code, definition] of Object.entries(CHART_OF_ACCOUNTS)) {
    const account = createAccountFromDefinition(
      definition,
      `acc_${String(idCounter++).padStart(6, '0')}`
    );
    accounts.set(code as AccountCode, account);
  }

  return accounts;
}

/**
 * Revenue account codes for commission tracking.
 */
export const COMMISSION_ACCOUNTS: AccountCode[] = [
  'DEPOSIT_ALT_COMMISSION',
  'INSURANCE_COMMISSION',
  'GUARANTOR_COMMISSION',
  'UTILITIES_REFERRAL_FEE',
  'MOVING_REFERRAL_FEE',
  'MARKETPLACE_REFERRAL_FEE',
];

/**
 * Get the appropriate commission account for a product type.
 */
export function getCommissionAccountForProduct(
  productType: 'deposit_alternative' | 'renters_insurance' | 'guarantor' | 'utility_setup' | 'moving_service' | 'vendor_referral'
): AccountCode {
  const mapping: Record<string, AccountCode> = {
    deposit_alternative: 'DEPOSIT_ALT_COMMISSION',
    renters_insurance: 'INSURANCE_COMMISSION',
    guarantor: 'GUARANTOR_COMMISSION',
    utility_setup: 'UTILITIES_REFERRAL_FEE',
    moving_service: 'MOVING_REFERRAL_FEE',
    vendor_referral: 'MARKETPLACE_REFERRAL_FEE',
  };

  return mapping[productType] || 'PLATFORM_FEE_REVENUE';
}
