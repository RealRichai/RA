/**
 * Policy Rules
 *
 * Rule checkers for AI output compliance.
 */

import type {
  AIViolation,
  RecommendedFix,
  AIOutputCheckInput,
  MarketRules,
} from './types';

// =============================================================================
// Fee Structure Rules
// =============================================================================

/**
 * Check for illegal fee structures in AI output.
 */
export function checkAIFeeStructures(
  input: AIOutputCheckInput,
  marketRules: Pick<MarketRules, 'brokerFeeTenantProhibited' | 'maxSecurityDepositMonths'>
): { violations: AIViolation[]; fixes: RecommendedFix[] } {
  const violations: AIViolation[] = [];
  const fixes: RecommendedFix[] = [];
  const content = input.content;

  // Check for broker fee suggestions to tenant in restricted markets
  if (marketRules.brokerFeeTenantProhibited) {
    const brokerFeePatterns = [
      /tenant\s+(?:is\s+)?(?:pays?|responsible\s+for|must\s+pay|will\s+pay|needs?\s+to\s+pay)\s+(?:paying\s+)?(?:the\s+)?(?:a\s+)?broker(?:'s)?\s+fee/i,
      /broker(?:'s)?\s+fee\s+(?:is\s+)?(?:to\s+be\s+)?(?:paid\s+)?by\s+(?:the\s+)?tenant/i,
      /you(?:'ll)?\s+(?:need\s+to|will\s+need\s+to|have\s+to|must)\s+pay\s+(?:a\s+)?(?:the\s+)?broker(?:'s)?\s+fee/i,
      /tenant\s+(?:must\s+)?pay(?:s)?\s+(?:the\s+)?broker\s+fee/i,
      /fee\s+(?:of\s+)?(?:one|1|two|2)\s+month(?:'s)?\s+rent\s+(?:to\s+)?(?:the\s+)?broker/i,
    ];

    for (const pattern of brokerFeePatterns) {
      const match = pattern.exec(content);
      if (match) {
        violations.push({
          code: 'AI_SUGGESTED_ILLEGAL_BROKER_FEE',
          message:
            'AI output suggests tenant pay broker fee, which is prohibited in this market',
          severity: 'critical',
          sourceText: match[0],
          evidence: {
            marketId: input.marketId,
            pattern: pattern.source,
            matchedText: match[0],
          },
          ruleReference: 'FARE Act - Broker Fee Prohibition',
        });
        fixes.push({
          action: 'remove_broker_fee_suggestion',
          description:
            'Remove or modify text suggesting tenant pays broker fee',
          autoFixAvailable: true,
          autoFixAction: 'sanitize_output',
          priority: 'critical',
        });
        break; // One violation per type is enough
      }
    }
  }

  // Check for excessive security deposit suggestions
  const depositPatterns = [
    /(?:security\s+)?deposit\s+(?:is\s+)?(?:of\s+)?(\d+)\s+months?(?:\s+rent)?/gi,
    /(\d+)\s+months?(?:\s+rent)?\s+(?:security\s+)?deposit/gi,
    /(?:require|need|must\s+pay)\s+(?:a\s+)?(\d+)\s+months?\s+(?:security\s+)?deposit/gi,
  ];

  for (const pattern of depositPatterns) {
    let match;
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      const months = parseInt(match[1]!, 10);
      if (!isNaN(months) && months > marketRules.maxSecurityDepositMonths) {
        violations.push({
          code: 'AI_SUGGESTED_EXCESSIVE_SECURITY_DEPOSIT',
          message: `AI output suggests ${months}-month deposit, exceeding ${marketRules.maxSecurityDepositMonths}-month limit`,
          severity: 'critical',
          sourceText: match[0],
          evidence: {
            suggestedMonths: months,
            maxAllowed: marketRules.maxSecurityDepositMonths,
            marketId: input.marketId,
          },
          ruleReference: 'Security Deposit Limits',
        });
        fixes.push({
          action: 'correct_deposit_amount',
          description: `Modify output to suggest maximum ${marketRules.maxSecurityDepositMonths} month(s) security deposit`,
          autoFixAvailable: true,
          autoFixAction: 'sanitize_output',
          priority: 'critical',
        });
      }
    }
  }

  return { violations, fixes };
}

// =============================================================================
// FCHA Compliance Rules
// =============================================================================

/**
 * Check for FCHA stage violations in AI output.
 */
export function checkAIFCHACompliance(
  input: AIOutputCheckInput,
  fchaRules: MarketRules['fcha'] & { currentStage?: string }
): { violations: AIViolation[]; fixes: RecommendedFix[] } {
  const violations: AIViolation[] = [];
  const fixes: RecommendedFix[] = [];

  if (!fchaRules.enabled) {
    return { violations, fixes };
  }

  const content = input.content.toLowerCase();
  const currentStage = input.context?.applicationStage || fchaRules.currentStage;

  // Define pre-offer stages
  const preOfferStages = [
    'initial_inquiry',
    'application_submitted',
    'application_review',
  ];
  const isPreOffer = currentStage && preOfferStages.includes(currentStage);

  if (!isPreOffer) {
    // After conditional offer, these checks are allowed
    return { violations, fixes };
  }

  // Patterns that indicate suggesting to run a check (action language)
  const actionPatterns = [
    /we\s+(?:will|can|need\s+to|should|must)\s+(?:run|perform|conduct|do|check)/i,
    /let(?:'s|us)\s+(?:run|perform|check|look\s+at)/i,
    /(?:running|performing|conducting)\s+(?:a\s+)?/i,
    /(?:i'll|we'll)\s+(?:run|perform|check|pull)/i,
    /need\s+(?:to\s+)?(?:run|check|pull|get)/i,
    /require(?:s|d)?\s+(?:a\s+)?/i,
  ];

  // Check types and their patterns
  const prohibitedChecks = [
    {
      check: 'criminal_background_check',
      patterns: [
        /criminal\s+(?:background\s+)?(?:check|history|record)/i,
        /background\s+(?:check|screening)/i,
        /run\s+(?:a\s+)?background/i,
      ],
    },
    {
      check: 'credit_check',
      patterns: [
        /credit\s+(?:check|score|report|history)/i,
        /run\s+(?:your\s+)?credit/i,
        /check\s+(?:your\s+)?credit/i,
        /pull\s+(?:your\s+)?credit/i,
      ],
    },
    {
      check: 'eviction_history',
      patterns: [
        /eviction\s+(?:history|record|check|search)/i,
        /check\s+(?:for\s+)?(?:prior\s+)?evictions?/i,
      ],
    },
  ];

  for (const { check, patterns } of prohibitedChecks) {
    if (!fchaRules.prohibitedBeforeConditionalOffer.includes(check)) {
      continue;
    }

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        // Check if it's an action suggestion vs informational
        const isActionSuggestion = actionPatterns.some((ap) =>
          ap.test(content)
        );

        if (isActionSuggestion) {
          const match = pattern.exec(input.content);
          violations.push({
            code: 'AI_SUGGESTED_PREMATURE_BACKGROUND_CHECK',
            message: `AI output suggests ${check.replace(/_/g, ' ')} before conditional offer, violating FCHA`,
            severity: 'critical',
            sourceText: match?.[0],
            evidence: {
              checkType: check,
              currentStage,
              prohibitedBeforeOffer: true,
            },
            ruleReference: 'Fair Chance Housing Act',
          });
          fixes.push({
            action: 'defer_check_suggestion',
            description: `Remove suggestion to perform ${check.replace(/_/g, ' ')} until after conditional offer`,
            autoFixAvailable: true,
            autoFixAction: 'sanitize_output',
            priority: 'critical',
          });
          break; // One violation per check type
        }
      }
    }
  }

  return { violations, fixes };
}

// =============================================================================
// Combined Rule Checker
// =============================================================================

/**
 * Run all policy rules against AI output.
 */
export function checkAllPolicyRules(
  input: AIOutputCheckInput,
  marketRules: MarketRules
): { violations: AIViolation[]; fixes: RecommendedFix[] } {
  const violations: AIViolation[] = [];
  const fixes: RecommendedFix[] = [];

  // Fee structure checks
  const feeResult = checkAIFeeStructures(input, marketRules);
  violations.push(...feeResult.violations);
  fixes.push(...feeResult.fixes);

  // FCHA checks
  if (marketRules.fcha.enabled) {
    const fchaResult = checkAIFCHACompliance(input, {
      ...marketRules.fcha,
      currentStage: input.context?.applicationStage,
    });
    violations.push(...fchaResult.violations);
    fixes.push(...fchaResult.fixes);
  }

  return { violations, fixes };
}
