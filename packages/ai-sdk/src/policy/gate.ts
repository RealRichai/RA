/**
 * Policy Gate
 *
 * Gate for checking AI outputs against compliance rules.
 */

import { checkAIFeeStructures, checkAIFCHACompliance } from './rules';
import type {
  AIViolation,
  RecommendedFix,
  PolicyCheckResult,
  AIGateResult,
  AIOutputCheckInput,
  MarketRules,
} from './types';

// =============================================================================
// Default Market Rules
// =============================================================================

// NYC Strict rules (FARE Act + FCHA)
const NYC_STRICT_RULES: MarketRules = {
  brokerFeeTenantProhibited: true,
  maxSecurityDepositMonths: 1,
  fcha: {
    enabled: true,
    prohibitedBeforeConditionalOffer: [
      'criminal_background_check',
      'credit_check',
      'eviction_history',
    ],
    stageOrder: [
      'initial_inquiry',
      'application_submitted',
      'application_review',
      'conditional_offer',
      'background_check',
      'final_approval',
      'lease_signing',
    ],
  },
};

// US Standard rules (less restrictive)
const US_STANDARD_RULES: MarketRules = {
  brokerFeeTenantProhibited: false,
  maxSecurityDepositMonths: 2,
  fcha: {
    enabled: false,
    prohibitedBeforeConditionalOffer: [],
    stageOrder: [],
  },
};

// California rules
const CA_STANDARD_RULES: MarketRules = {
  brokerFeeTenantProhibited: false,
  maxSecurityDepositMonths: 2, // 2 months for unfurnished, 3 for furnished
  fcha: {
    enabled: true,
    prohibitedBeforeConditionalOffer: ['criminal_background_check'],
    stageOrder: [
      'initial_inquiry',
      'application_submitted',
      'application_review',
      'conditional_offer',
      'background_check',
      'final_approval',
      'lease_signing',
    ],
  },
};

// Market rules by market ID
const MARKET_RULES: Record<string, MarketRules> = {
  nyc: NYC_STRICT_RULES,
  new_york: NYC_STRICT_RULES,
  new_york_city: NYC_STRICT_RULES,
  california: CA_STANDARD_RULES,
  ca: CA_STANDARD_RULES,
  los_angeles: CA_STANDARD_RULES,
  san_francisco: CA_STANDARD_RULES,
  us_standard: US_STANDARD_RULES,
  texas: US_STANDARD_RULES,
  tx: US_STANDARD_RULES,
  florida: US_STANDARD_RULES,
  fl: US_STANDARD_RULES,
};

// =============================================================================
// Get Market Rules
// =============================================================================

/**
 * Get market rules for a given market ID.
 */
export function getMarketRules(marketId: string): MarketRules {
  const normalized = marketId.toLowerCase().replace(/[^a-z_]/g, '_');
  return MARKET_RULES[normalized] || US_STANDARD_RULES;
}

// =============================================================================
// Gate AI Output
// =============================================================================

/**
 * Gate AI output for compliance violations.
 */
export function gateAIOutput(input: AIOutputCheckInput): AIGateResult {
  const marketRules = getMarketRules(input.marketId);
  const violations: AIViolation[] = [];
  const fixes: RecommendedFix[] = [];
  const checksPerformed: string[] = [];

  // Check fee structure compliance
  checksPerformed.push('fee_structures');
  const feeResult = checkAIFeeStructures(input, {
    brokerFeeTenantProhibited: marketRules.brokerFeeTenantProhibited,
    maxSecurityDepositMonths: marketRules.maxSecurityDepositMonths,
  });
  violations.push(...feeResult.violations);
  fixes.push(...feeResult.fixes);

  // Check FCHA compliance
  if (marketRules.fcha.enabled) {
    checksPerformed.push('fcha_compliance');
    const fchaResult = checkAIFCHACompliance(input, {
      ...marketRules.fcha,
      currentStage: input.context?.applicationStage,
    });
    violations.push(...fchaResult.violations);
    fixes.push(...fchaResult.fixes);
  }

  // Determine if passed (no critical violations)
  const criticalViolations = violations.filter((v) => v.severity === 'critical');
  const passed = criticalViolations.length === 0;

  const checkResult: PolicyCheckResult = {
    passed,
    violations,
    fixes,
    checkedAt: new Date().toISOString(),
    checksPerformed,
    metadata: {
      marketId: input.marketId,
      marketRules: {
        brokerFeeTenantProhibited: marketRules.brokerFeeTenantProhibited,
        maxSecurityDepositMonths: marketRules.maxSecurityDepositMonths,
        fchaEnabled: marketRules.fcha.enabled,
      },
      context: input.context,
    },
  };

  let sanitizedOutput: string | undefined;
  if (!passed) {
    sanitizedOutput = sanitizeOutput(input.content, violations);
  }

  return {
    allowed: passed,
    checkResult,
    blockedReason: passed
      ? undefined
      : `AI output blocked: ${criticalViolations.map((v) => v.message).join('; ')}`,
    sanitizedOutput,
  };
}

// =============================================================================
// Sanitize Output
// =============================================================================

/**
 * Sanitize output by removing/modifying violating content.
 */
function sanitizeOutput(content: string, violations: AIViolation[]): string {
  let result = content;

  for (const violation of violations) {
    if (violation.sourceText) {
      // Replace violating text with a placeholder message
      const replacement = getReplacementText(violation.code);
      result = result.replace(violation.sourceText, replacement);
    }
  }

  return result;
}

/**
 * Get replacement text for a violation type.
 */
function getReplacementText(code: string): string {
  switch (code) {
    case 'AI_SUGGESTED_ILLEGAL_BROKER_FEE':
      return '[This listing has no broker fee for tenants]';
    case 'AI_SUGGESTED_EXCESSIVE_SECURITY_DEPOSIT':
      return '[Security deposit is limited as per local regulations]';
    case 'AI_SUGGESTED_PREMATURE_BACKGROUND_CHECK':
      return '[Background checks will be conducted after conditional offer]';
    default:
      return '[Content removed due to compliance policy]';
  }
}

// =============================================================================
// Exports for Testing
// =============================================================================

export { NYC_STRICT_RULES, US_STANDARD_RULES, CA_STANDARD_RULES };
