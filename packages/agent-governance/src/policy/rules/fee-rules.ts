/**
 * Fee Compliance Rules
 *
 * Enforces fee regulations to prevent illegal or excessive fees.
 * Varies by market/state.
 */

import type { PolicyRule, PolicyCheckRequest, PolicyViolationSeverity } from '../../types';

// =============================================================================
// Fee Type Definitions
// =============================================================================

export type FeeType =
  | 'application_fee'
  | 'security_deposit'
  | 'pet_deposit'
  | 'pet_rent'
  | 'move_in_fee'
  | 'administrative_fee'
  | 'late_fee'
  | 'nsf_fee'
  | 'lease_renewal_fee'
  | 'lease_break_fee'
  | 'cleaning_fee'
  | 'key_replacement'
  | 'lock_change'
  | 'parking_fee'
  | 'amenity_fee'
  | 'utility_fee'
  | 'broker_fee';

// =============================================================================
// Market-Specific Fee Limits
// =============================================================================

export interface FeeLimit {
  maxAmount?: number;
  maxMultiplier?: number; // Multiple of monthly rent
  prohibited?: boolean;
  notes?: string;
}

export interface MarketFeeRules {
  applicationFee: FeeLimit;
  securityDeposit: FeeLimit;
  petDeposit: FeeLimit;
  lateFee: FeeLimit;
  brokerFee: FeeLimit;
  moveInFee: FeeLimit;
  additionalRules?: string[];
}

export const MARKET_FEE_RULES: Record<string, MarketFeeRules> = {
  // California
  CA: {
    applicationFee: { maxAmount: 60.26 }, // 2024 limit, adjusted annually
    securityDeposit: { maxMultiplier: 2 }, // 2 months for unfurnished, 3 for furnished
    petDeposit: { prohibited: true, notes: 'Included in security deposit limit' },
    lateFee: { notes: 'Must be reasonable, typically 5-6% or flat fee' },
    brokerFee: { prohibited: false },
    moveInFee: { prohibited: true, notes: 'Cannot charge first and last + deposit > 2 months' },
    additionalRules: [
      'Cannot charge for credit check separately from application fee',
      'Must return unused application fee if no screening performed',
    ],
  },

  // New York
  NY: {
    applicationFee: { maxAmount: 20 },
    securityDeposit: { maxMultiplier: 1 },
    petDeposit: { prohibited: true, notes: 'Included in security deposit' },
    lateFee: { maxAmount: 50, notes: 'Or 5% of monthly rent' },
    brokerFee: { prohibited: true, notes: 'Tenant cannot be charged in most cases' },
    moveInFee: { prohibited: true },
    additionalRules: [
      'No non-refundable fees allowed',
      'Broker fee paid by landlord unless tenant hired broker directly',
    ],
  },

  // Illinois (Chicago has additional rules)
  IL: {
    applicationFee: { notes: 'Must be reasonable cost of screening' },
    securityDeposit: { maxMultiplier: 1.5 },
    petDeposit: { prohibited: false },
    lateFee: { notes: 'Must be reasonable' },
    brokerFee: { prohibited: false },
    moveInFee: { prohibited: false },
    additionalRules: [
      'Chicago RLTO has specific requirements',
      'Interest on security deposits required (Chicago)',
    ],
  },

  // Texas
  TX: {
    applicationFee: { notes: 'No statutory limit but must be reasonable' },
    securityDeposit: { notes: 'No statutory limit' },
    petDeposit: { prohibited: false },
    lateFee: { notes: 'Must be reasonable and in lease' },
    brokerFee: { prohibited: false },
    moveInFee: { prohibited: false },
    additionalRules: [
      'Security deposit must be returned within 30 days',
    ],
  },

  // Washington
  WA: {
    applicationFee: { notes: 'Actual cost of screening only' },
    securityDeposit: { notes: 'No statutory limit' },
    petDeposit: { prohibited: false },
    lateFee: { notes: 'Must be reasonable' },
    brokerFee: { prohibited: false },
    moveInFee: { notes: 'Cannot require last month rent as move-in fee' },
    additionalRules: [
      'Must provide itemized receipt for application fee',
      'Cannot require last month rent at move-in',
    ],
  },

  // Default for unlisted states
  DEFAULT: {
    applicationFee: { notes: 'Must be reasonable' },
    securityDeposit: { notes: 'State law varies' },
    petDeposit: { prohibited: false },
    lateFee: { notes: 'Must be reasonable and in lease' },
    brokerFee: { prohibited: false },
    moveInFee: { prohibited: false },
  },
};

// =============================================================================
// Illegal Fee Detection
// =============================================================================

const ILLEGAL_FEE_PATTERNS = [
  {
    pattern: /mandatory\s+(?:renters?|liability)\s+insurance\s+(?:fee|charge)/i,
    message: 'Cannot charge fee for mandatory insurance programs (steering to specific provider)',
    severity: 'error' as PolicyViolationSeverity,
  },
  {
    pattern: /credit\s+(?:repair|improvement)\s+fee/i,
    message: 'Credit repair fees are prohibited',
    severity: 'fatal' as PolicyViolationSeverity,
  },
  {
    pattern: /background\s+check\s+(?:fee|charge).*(?:per\s+month|monthly|recurring)/i,
    message: 'Recurring background check fees are not allowed',
    severity: 'error' as PolicyViolationSeverity,
  },
  {
    pattern: /(?:lease|rental)\s+(?:processing|preparation)\s+fee/i,
    message: 'Lease processing fees may be prohibited in some jurisdictions',
    severity: 'warning' as PolicyViolationSeverity,
  },
  {
    pattern: /(?:air\s+filter|hvac\s+filter)\s+(?:subscription|program)\s+fee/i,
    message: 'Mandatory filter subscription programs may be prohibited',
    severity: 'warning' as PolicyViolationSeverity,
  },
  {
    pattern: /trash\s+(?:valet|concierge)\s+(?:fee|charge).*mandatory/i,
    message: 'Mandatory trash valet fees may be challenged',
    severity: 'warning' as PolicyViolationSeverity,
  },
  {
    pattern: /(?:smart\s+home|technology|iot)\s+(?:fee|charge).*mandatory/i,
    message: 'Mandatory technology fees may not be enforceable',
    severity: 'warning' as PolicyViolationSeverity,
  },
];

// =============================================================================
// Fee Validation Functions
// =============================================================================

export interface FeeValidationResult {
  valid: boolean;
  violations: Array<{
    ruleId: string;
    severity: PolicyViolationSeverity;
    message: string;
    suggestedFix?: string;
  }>;
}

/**
 * Get fee rules for a market.
 */
export function getMarketFeeRules(market?: string): MarketFeeRules {
  return MARKET_FEE_RULES[market || 'DEFAULT'] || MARKET_FEE_RULES['DEFAULT']!;
}

/**
 * Validate an application fee.
 */
export function validateApplicationFee(
  amount: number,
  market?: string
): FeeValidationResult {
  const violations: FeeValidationResult['violations'] = [];
  const rules = getMarketFeeRules(market);

  if (rules.applicationFee.maxAmount && amount > rules.applicationFee.maxAmount) {
    violations.push({
      ruleId: 'fee_application_max',
      severity: 'error',
      message: `Application fee ($${amount}) exceeds maximum of $${rules.applicationFee.maxAmount} for ${market || 'this market'}`,
      suggestedFix: `Reduce application fee to $${rules.applicationFee.maxAmount} or less`,
    });
  }

  if (amount > 100) {
    violations.push({
      ruleId: 'fee_application_reasonableness',
      severity: 'warning',
      message: `Application fee ($${amount}) appears high and may be challenged`,
      suggestedFix: 'Consider reducing to actual cost of screening',
    });
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Validate a security deposit.
 */
export function validateSecurityDeposit(
  amount: number,
  monthlyRent: number,
  market?: string,
  furnished: boolean = false
): FeeValidationResult {
  const violations: FeeValidationResult['violations'] = [];
  const rules = getMarketFeeRules(market);

  if (rules.securityDeposit.maxMultiplier) {
    // California has different limits for furnished vs unfurnished
    const maxMultiplier = market === 'CA' && furnished ? 3 : rules.securityDeposit.maxMultiplier;
    const maxAmount = monthlyRent * maxMultiplier;

    if (amount > maxAmount) {
      violations.push({
        ruleId: 'fee_security_deposit_max',
        severity: 'error',
        message: `Security deposit ($${amount}) exceeds maximum of ${maxMultiplier}x monthly rent ($${maxAmount}) for ${market || 'this market'}`,
        suggestedFix: `Reduce security deposit to $${maxAmount} or less`,
      });
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Validate a late fee.
 */
export function validateLateFee(
  amount: number,
  monthlyRent: number,
  market?: string
): FeeValidationResult {
  const violations: FeeValidationResult['violations'] = [];
  const rules = getMarketFeeRules(market);

  if (rules.lateFee.maxAmount && amount > rules.lateFee.maxAmount) {
    violations.push({
      ruleId: 'fee_late_fee_max',
      severity: 'error',
      message: `Late fee ($${amount}) exceeds maximum of $${rules.lateFee.maxAmount} for ${market || 'this market'}`,
      suggestedFix: `Reduce late fee to $${rules.lateFee.maxAmount} or less`,
    });
  }

  // General reasonableness check (typically 5-10% is considered reasonable)
  const percentOfRent = (amount / monthlyRent) * 100;
  if (percentOfRent > 10) {
    violations.push({
      ruleId: 'fee_late_fee_reasonableness',
      severity: 'warning',
      message: `Late fee ($${amount}) is ${percentOfRent.toFixed(1)}% of rent, which may be considered excessive`,
      suggestedFix: 'Late fees are typically 5-6% of monthly rent or a flat $50',
    });
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Validate broker fee.
 */
export function validateBrokerFee(
  _amount: number,
  market?: string,
  tenantHiredBroker: boolean = false
): FeeValidationResult {
  const violations: FeeValidationResult['violations'] = [];
  const rules = getMarketFeeRules(market);

  if (rules.brokerFee.prohibited && !tenantHiredBroker) {
    violations.push({
      ruleId: 'fee_broker_prohibited',
      severity: 'fatal',
      message: `Broker fees charged to tenants are prohibited in ${market}`,
      suggestedFix: 'Broker fee must be paid by landlord in this market',
    });
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Check text for illegal fee patterns.
 */
export function checkForIllegalFees(text: string, market?: string): FeeValidationResult {
  const violations: FeeValidationResult['violations'] = [];

  for (const { pattern, message, severity } of ILLEGAL_FEE_PATTERNS) {
    if (pattern.test(text)) {
      violations.push({
        ruleId: 'fee_illegal_pattern',
        severity,
        message,
      });
    }
  }

  // Check for prohibited fees in specific markets
  const rules = getMarketFeeRules(market);

  if (rules.moveInFee.prohibited && /move[\s-]?in\s+fee/i.test(text)) {
    violations.push({
      ruleId: 'fee_move_in_prohibited',
      severity: 'error',
      message: `Move-in fees are prohibited or restricted in ${market}`,
      suggestedFix: rules.moveInFee.notes,
    });
  }

  if (rules.petDeposit.prohibited && /pet\s+deposit/i.test(text)) {
    violations.push({
      ruleId: 'fee_pet_deposit_prohibited',
      severity: 'warning',
      message: `Separate pet deposits may not be allowed in ${market}`,
      suggestedFix: rules.petDeposit.notes,
    });
  }

  return { valid: violations.length === 0, violations };
}

// =============================================================================
// Fee Compliance Rules
// =============================================================================

export const FEE_RULES: PolicyRule[] = [
  {
    id: 'fee_no_illegal_fees',
    name: 'No Illegal Fees',
    description: 'AI cannot suggest fees that are prohibited by law',
    category: 'fee_compliance',
    severity: 'fatal',
    enabled: true,
    conditions: {
      checkType: 'illegal_fee_patterns',
    },
    version: '1.0.0',
  },
  {
    id: 'fee_application_limits',
    name: 'Application Fee Limits',
    description: 'Application fees must not exceed market-specific limits',
    category: 'fee_compliance',
    severity: 'error',
    enabled: true,
    conditions: {
      checkType: 'application_fee',
    },
    version: '1.0.0',
  },
  {
    id: 'fee_security_deposit_limits',
    name: 'Security Deposit Limits',
    description: 'Security deposits must not exceed market-specific limits',
    category: 'fee_compliance',
    severity: 'error',
    enabled: true,
    conditions: {
      checkType: 'security_deposit',
    },
    version: '1.0.0',
  },
  {
    id: 'fee_late_fee_reasonableness',
    name: 'Late Fee Reasonableness',
    description: 'Late fees must be reasonable and within market limits',
    category: 'fee_compliance',
    severity: 'warning',
    enabled: true,
    conditions: {
      checkType: 'late_fee',
    },
    version: '1.0.0',
  },
  {
    id: 'fee_broker_fee_compliance',
    name: 'Broker Fee Compliance',
    description: 'Broker fees must comply with market-specific rules',
    category: 'fee_compliance',
    severity: 'error',
    enabled: true,
    markets: ['NY'],
    conditions: {
      checkType: 'broker_fee',
    },
    version: '1.0.0',
  },
];

// =============================================================================
// Fee Rule Checker
// =============================================================================

export interface FeeCheckResult {
  passed: boolean;
  violations: Array<{
    ruleId: string;
    severity: PolicyViolationSeverity;
    message: string;
    suggestedFix?: string;
  }>;
}

/**
 * Check a request against fee rules.
 */
export function checkFeeRules(request: PolicyCheckRequest): FeeCheckResult {
  const violations: FeeCheckResult['violations'] = [];
  const market = request.market;
  const inputs = request.toolInputs;

  // Check for illegal fee patterns in text content
  const textContent = extractTextContent(inputs);
  const illegalCheck = checkForIllegalFees(textContent, market);
  violations.push(...illegalCheck.violations);

  // Check specific fee amounts if present
  const monthlyRent = (inputs['monthlyRent'] as number) || (request.context?.monthlyRent as number) || 0;

  if (typeof inputs['applicationFee'] === 'number') {
    const appFeeCheck = validateApplicationFee(inputs['applicationFee'], market);
    violations.push(...appFeeCheck.violations);
  }

  if (typeof inputs['securityDeposit'] === 'number' && monthlyRent > 0) {
    const depositCheck = validateSecurityDeposit(
      inputs['securityDeposit'],
      monthlyRent,
      market,
      inputs['furnished'] as boolean
    );
    violations.push(...depositCheck.violations);
  }

  if (typeof inputs['lateFee'] === 'number' && monthlyRent > 0) {
    const lateFeeCheck = validateLateFee(inputs['lateFee'], monthlyRent, market);
    violations.push(...lateFeeCheck.violations);
  }

  if (typeof inputs['brokerFee'] === 'number') {
    const brokerCheck = validateBrokerFee(
      inputs['brokerFee'],
      market,
      inputs['tenantHiredBroker'] as boolean
    );
    violations.push(...brokerCheck.violations);
  }

  return {
    passed: violations.filter((v) => v.severity === 'fatal' || v.severity === 'error').length === 0,
    violations,
  };
}

/**
 * Extract all text content from inputs.
 */
function extractTextContent(inputs: Record<string, unknown>): string {
  const texts: string[] = [];

  function extract(value: unknown): void {
    if (typeof value === 'string') {
      texts.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(extract);
    } else if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(extract);
    }
  }

  extract(inputs);
  return texts.join(' ');
}

// =============================================================================
// Factory Function for Policy Gate
// =============================================================================

export interface FeePolicyRule {
  id: string;
  name: string;
  description: string;
  category: 'compliance' | 'fee_compliance';
  severity: PolicyViolationSeverity;
  enabled: boolean;
  check: (context: FeeCheckContext) => Promise<{ passed: boolean; violations: FeeCheckResult['violations'] }>;
}

interface FeeCheckContext {
  agentType?: string;
  tenantId?: string;
  market?: string;
  toolName?: string;
  inputs?: Record<string, unknown>;
  feeContext?: {
    feeType?: string;
    amount?: number;
    currency?: string;
  };
}

/**
 * Create fee compliance rules for policy gate.
 */
export function createFeeComplianceRules(): FeePolicyRule[] {
  return [
    {
      id: 'fee_application_limit',
      name: 'Application Fee Limits',
      description: 'Application fees must not exceed market-specific limits',
      category: 'compliance',
      severity: 'error',
      enabled: true,
      check: (context: FeeCheckContext) => {
        const violations: FeeCheckResult['violations'] = [];
        const feeContext = context.feeContext;

        if (feeContext?.feeType === 'application' && typeof feeContext.amount === 'number') {
          const result = validateApplicationFee(feeContext.amount, context.market);
          violations.push(...result.violations);
        }

        return Promise.resolve({ passed: violations.length === 0, violations });
      },
    },
    {
      id: 'fee_security_deposit_limit',
      name: 'Security Deposit Limits',
      description: 'Security deposits must not exceed market-specific limits',
      category: 'compliance',
      severity: 'error',
      enabled: true,
      check: (context: FeeCheckContext) => {
        const violations: FeeCheckResult['violations'] = [];
        const feeContext = context.feeContext;

        if (feeContext?.feeType === 'security_deposit' && typeof feeContext.amount === 'number') {
          const monthlyRent = (context.inputs?.['monthlyRent'] as number) || 2000;
          const result = validateSecurityDeposit(feeContext.amount, monthlyRent, context.market);
          violations.push(...result.violations);
        }

        return Promise.resolve({ passed: violations.length === 0, violations });
      },
    },
    {
      id: 'fee_broker_prohibition',
      name: 'Broker Fee Compliance',
      description: 'Broker fees must comply with market-specific rules',
      category: 'compliance',
      severity: 'fatal',
      enabled: true,
      check: (context: FeeCheckContext) => {
        const violations: FeeCheckResult['violations'] = [];
        const feeContext = context.feeContext;

        if (feeContext?.feeType === 'broker' && typeof feeContext.amount === 'number') {
          const result = validateBrokerFee(feeContext.amount, context.market);
          violations.push(...result.violations);
        }

        return Promise.resolve({ passed: violations.length === 0, violations });
      },
    },
    {
      id: 'fee_patterns',
      name: 'Illegal Fee Patterns',
      description: 'AI cannot suggest fees that are prohibited by law',
      category: 'compliance',
      severity: 'error',
      enabled: true,
      check: (context: FeeCheckContext) => {
        const violations: FeeCheckResult['violations'] = [];

        if (context.inputs) {
          const textContent = extractTextContent(context.inputs);

          // Check for illegal fee terms
          const illegalPatterns = [
            { pattern: /key\s*deposit/i, message: 'Key deposits may be prohibited in some markets', ruleId: 'fee_patterns' },
            { pattern: /pet\s*interview\s*fee/i, message: 'Pet interview fees are not typically allowed', ruleId: 'fee_patterns' },
          ];

          for (const { pattern, message, ruleId } of illegalPatterns) {
            if (pattern.test(textContent)) {
              violations.push({
                ruleId,
                severity: 'warning',
                message,
              });
            }
          }
        }

        // Return passed=false if we found violations (even warnings count for this rule)
        return Promise.resolve({ passed: violations.length === 0, violations });
      },
    },
  ];
}
