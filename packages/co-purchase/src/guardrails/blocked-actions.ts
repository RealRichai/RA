/**
 * Co-Purchase Guardrails
 *
 * Blocks all funds/escrow/investment actions.
 * This is a NON-CUSTODIAL collaboration platform ONLY.
 *
 * IMPORTANT: Any attempt to add custodial functionality requires
 * explicit human review and implementation.
 */

// ============================================================================
// Blocked Action Types
// ============================================================================

export type BlockedActionType =
  | 'ESCROW_CREATION'
  | 'ESCROW_RELEASE'
  | 'ESCROW_MANAGEMENT'
  | 'FUNDS_DEPOSIT'
  | 'FUNDS_WITHDRAWAL'
  | 'FUNDS_TRANSFER'
  | 'FUNDS_HOLDING'
  | 'FUNDS_HANDLING'
  | 'INVESTMENT_OFFERING'
  | 'INVESTMENT_ACCEPTANCE'
  | 'INVESTMENT_MARKETPLACE'
  | 'INVESTMENT_SOLICITATION'
  | 'PROPERTY_PURCHASE'
  | 'PROPERTY_SALE'
  | 'PROPERTY_TRANSFER'
  | 'CONTRACT_EXECUTION'
  | 'CONTRACT_SIGNING'
  | 'PAYMENT_PROCESSING'
  | 'PAYMENT_COLLECTION'
  | 'LOAN_ORIGINATION'
  | 'MORTGAGE_PROCESSING'
  | 'SECURITIES_ISSUANCE'
  | 'SYNDICATION_MANAGEMENT';

// ============================================================================
// Blocked Action Error
// ============================================================================

export class BlockedActionError extends Error {
  public readonly actionType: BlockedActionType;
  public readonly groupId?: string;
  public readonly userId?: string;
  public readonly httpStatusCode: number = 403;

  constructor(actionType: BlockedActionType, groupId?: string, userId?: string) {
    super(getBlockedActionMessage(actionType));
    this.name = 'BlockedActionError';
    this.actionType = actionType;
    this.groupId = groupId;
    this.userId = userId;
    Object.setPrototypeOf(this, BlockedActionError.prototype);
  }

  toJSON() {
    return {
      error: 'BLOCKED_ACTION',
      code: this.actionType,
      message: this.message,
      disclaimer: UI_DISCLAIMER_SHORT,
    };
  }
}

// ============================================================================
// Blocked Action Messages
// ============================================================================

function getBlockedActionMessage(actionType: BlockedActionType): string {
  const messages: Record<BlockedActionType, string> = {
    ESCROW_CREATION:
      'Escrow services are not available. Please use a licensed escrow provider.',
    ESCROW_RELEASE:
      'Escrow release is not available. This is a non-custodial platform.',
    ESCROW_MANAGEMENT:
      'Escrow management is not available. This is a non-custodial platform.',
    FUNDS_DEPOSIT:
      'Funds deposit is not available. RealRiches does not hold funds.',
    FUNDS_WITHDRAWAL:
      'Funds withdrawal is not available. RealRiches does not hold funds.',
    FUNDS_TRANSFER:
      'Funds transfer is not available. Please use your bank or payment provider.',
    FUNDS_HOLDING:
      'Funds holding is not available. This is a non-custodial platform.',
    FUNDS_HANDLING:
      'Funds handling is not available. This is a non-custodial platform.',
    INVESTMENT_OFFERING:
      'Investment offerings are not available. This is a collaboration platform only.',
    INVESTMENT_ACCEPTANCE:
      'Investment acceptance is not available. This is a collaboration platform only.',
    INVESTMENT_MARKETPLACE:
      'Investment marketplace is not available. This is a collaboration platform only.',
    INVESTMENT_SOLICITATION:
      'Investment solicitation is not available. This is a collaboration platform only.',
    PROPERTY_PURCHASE:
      'Property purchase execution is not available. Please work with a licensed real estate attorney.',
    PROPERTY_SALE:
      'Property sale execution is not available. Please work with a licensed real estate attorney.',
    PROPERTY_TRANSFER:
      'Property transfer is not available. Please work with a licensed title company.',
    CONTRACT_EXECUTION:
      'Contract execution is not available. Please work with a licensed attorney.',
    CONTRACT_SIGNING:
      'Contract signing is not available. Please work with a licensed attorney.',
    PAYMENT_PROCESSING:
      'Payment processing is not available for group purchases. This is a collaboration platform only.',
    PAYMENT_COLLECTION:
      'Payment collection is not available. This is a non-custodial platform.',
    LOAN_ORIGINATION:
      'Loan origination is not available. Please work with a licensed lender.',
    MORTGAGE_PROCESSING:
      'Mortgage processing is not available. Please work with a licensed mortgage broker.',
    SECURITIES_ISSUANCE:
      'Securities issuance is not available. This would require SEC registration.',
    SYNDICATION_MANAGEMENT:
      'Investment syndication is not available. This is a collaboration platform only.',
  };
  return messages[actionType];
}

// ============================================================================
// All Blocked Actions Set
// ============================================================================

const BLOCKED_ACTIONS: Set<BlockedActionType> = new Set([
  'ESCROW_CREATION',
  'ESCROW_RELEASE',
  'ESCROW_MANAGEMENT',
  'FUNDS_DEPOSIT',
  'FUNDS_WITHDRAWAL',
  'FUNDS_TRANSFER',
  'FUNDS_HOLDING',
  'FUNDS_HANDLING',
  'INVESTMENT_OFFERING',
  'INVESTMENT_ACCEPTANCE',
  'INVESTMENT_MARKETPLACE',
  'INVESTMENT_SOLICITATION',
  'PROPERTY_PURCHASE',
  'PROPERTY_SALE',
  'PROPERTY_TRANSFER',
  'CONTRACT_EXECUTION',
  'CONTRACT_SIGNING',
  'PAYMENT_PROCESSING',
  'PAYMENT_COLLECTION',
  'LOAN_ORIGINATION',
  'MORTGAGE_PROCESSING',
  'SECURITIES_ISSUANCE',
  'SYNDICATION_MANAGEMENT',
]);

// ============================================================================
// Guardrail Functions
// ============================================================================

/**
 * Assert that an action is non-custodial.
 * Throws BlockedActionError for any custodial action.
 *
 * @throws {BlockedActionError} Always throws - this function never returns
 */
export function assertNonCustodial(
  actionType: BlockedActionType,
  context?: { groupId?: string; userId?: string }
): never {
  // TODO: HUMAN_IMPLEMENTATION_REQUIRED
  // Any custodial functionality (escrow, funds, investments, property execution)
  // requires explicit human review, legal compliance verification, and
  // appropriate licensing before implementation.

  throw new BlockedActionError(actionType, context?.groupId, context?.userId);
}

/**
 * Check if an action would be blocked
 */
export function isActionBlocked(actionType: BlockedActionType): boolean {
  return BLOCKED_ACTIONS.has(actionType);
}

/**
 * Get list of all blocked action types
 */
export function getAllBlockedActions(): BlockedActionType[] {
  return Array.from(BLOCKED_ACTIONS);
}

// ============================================================================
// Disclaimer Text
// ============================================================================

export const BLOCKED_ACTION_DISCLAIMER = `
RealRiches Co-Purchase Groups is a NON-CUSTODIAL collaboration platform.

We provide:
- Group organization and member management
- Identity verification coordination
- Document collection and sharing
- Progress tracking via checklists
- Communication and collaboration tools

We DO NOT provide:
- Escrow services or funds holding
- Payment processing or collection
- Investment offerings or securities
- Property purchase or sale execution
- Contract execution or signing
- Loan origination or mortgage processing
- Investment syndication or marketplace functionality

All financial transactions, legal agreements, and property transfers must be
handled through your own licensed professionals:
- Real estate attorneys for contracts and closings
- Title companies for property transfers
- Banks or mortgage brokers for financing
- Licensed escrow companies for fund management
- Certified public accountants for tax matters

This platform is for COLLABORATION and ORGANIZATION only.
`.trim();

export const UI_DISCLAIMER_SHORT =
  'This is a non-custodial collaboration platform. RealRiches does not hold funds, manage escrow, or execute property purchases.';

export const UI_DISCLAIMER_BANNER = {
  title: 'Non-Custodial Collaboration Platform',
  message:
    'RealRiches does not hold funds, manage escrow, or execute purchases. All financial transactions must be handled through licensed professionals.',
  learnMoreUrl: '/help/co-purchase-disclaimer',
};

// ============================================================================
// Keyword Detection (for content scanning)
// ============================================================================

const CUSTODIAL_KEYWORDS = [
  'escrow',
  'deposit funds',
  'transfer funds',
  'send money',
  'receive money',
  'payment',
  'invest',
  'investment',
  'securities',
  'syndicate',
  'syndication',
  'shares',
  'equity stake',
  'ownership percentage',
  'buy property',
  'purchase property',
  'close deal',
  'execute contract',
  'sign contract',
  'mortgage',
  'loan',
  'financing',
];

/**
 * Check if text contains custodial keywords
 * Used for content moderation and user guidance
 */
export function containsCustodialKeywords(text: string): string[] {
  const lowerText = text.toLowerCase();
  return CUSTODIAL_KEYWORDS.filter((keyword) => lowerText.includes(keyword));
}

/**
 * Get warning message if text contains custodial keywords
 */
export function getCustodialWarning(text: string): string | null {
  const matches = containsCustodialKeywords(text);
  if (matches.length === 0) return null;

  return `This message contains terms related to financial transactions (${matches.join(', ')}). ` +
    `Remember: RealRiches is a collaboration platform only. ` +
    `Financial transactions must be handled through licensed professionals.`;
}
