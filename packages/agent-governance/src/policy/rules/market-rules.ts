/**
 * Market-Specific Rules
 *
 * Additional rules that vary by state/region.
 */

import type { PolicyRule, PolicyCheckRequest, PolicyViolationSeverity } from '../../types';

// =============================================================================
// Market Rule Configuration
// =============================================================================

export interface MarketRuleConfig {
  code: string;
  name: string;
  timezone: string;
  rentersInsuranceAllowed: boolean;
  maxOccupancyPerBedroom?: number;
  smokingBanAllowed: boolean;
  evictionMoratoriumActive?: boolean;
  rentControlActive?: boolean;
  additionalProtectedClasses: string[];
  requiredDisclosures: string[];
  moveInCostLimits?: string;
}

export const MARKET_CONFIGS: Record<string, MarketRuleConfig> = {
  CA: {
    code: 'CA',
    name: 'California',
    timezone: 'America/Los_Angeles',
    rentersInsuranceAllowed: true,
    maxOccupancyPerBedroom: 2,
    smokingBanAllowed: true,
    rentControlActive: true,
    additionalProtectedClasses: ['source_of_income', 'sexual_orientation', 'gender_identity'],
    requiredDisclosures: [
      'Megan\'s Law database notice',
      'Lead-based paint disclosure (pre-1978)',
      'Bed bug disclosure',
      'Demolition intent disclosure',
      'Pest control disclosure',
      'Mold disclosure',
      'Military ordnance disclosure',
      'Flood zone disclosure',
    ],
    moveInCostLimits: 'First month rent + security deposit (max 2 months)',
  },
  NY: {
    code: 'NY',
    name: 'New York',
    timezone: 'America/New_York',
    rentersInsuranceAllowed: true,
    maxOccupancyPerBedroom: 2,
    smokingBanAllowed: true,
    rentControlActive: true,
    additionalProtectedClasses: ['source_of_income', 'sexual_orientation', 'gender_identity', 'marital_status'],
    requiredDisclosures: [
      'Lead-based paint disclosure (pre-1978)',
      'Window guard notice',
      'Bedbug history disclosure',
      'Flood zone disclosure',
      'Smoke detector notice',
      'Sprinkler disclosure',
    ],
    moveInCostLimits: 'First month rent + one month security deposit only',
  },
  TX: {
    code: 'TX',
    name: 'Texas',
    timezone: 'America/Chicago',
    rentersInsuranceAllowed: true,
    smokingBanAllowed: true,
    rentControlActive: false,
    additionalProtectedClasses: [],
    requiredDisclosures: [
      'Lead-based paint disclosure (pre-1978)',
      'Flood zone disclosure',
      'Property condition report',
    ],
  },
  FL: {
    code: 'FL',
    name: 'Florida',
    timezone: 'America/New_York',
    rentersInsuranceAllowed: true,
    smokingBanAllowed: true,
    rentControlActive: false,
    additionalProtectedClasses: [],
    requiredDisclosures: [
      'Lead-based paint disclosure (pre-1978)',
      'Radon disclosure',
      'Building code violations disclosure',
    ],
  },
  IL: {
    code: 'IL',
    name: 'Illinois',
    timezone: 'America/Chicago',
    rentersInsuranceAllowed: true,
    maxOccupancyPerBedroom: 2,
    smokingBanAllowed: true,
    rentControlActive: false, // Preempted at state level but Chicago has RLTO
    additionalProtectedClasses: ['source_of_income', 'sexual_orientation', 'marital_status'],
    requiredDisclosures: [
      'Lead-based paint disclosure (pre-1978)',
      'Radon disclosure',
      'Code violation disclosure (Chicago)',
    ],
  },
  WA: {
    code: 'WA',
    name: 'Washington',
    timezone: 'America/Los_Angeles',
    rentersInsuranceAllowed: true,
    smokingBanAllowed: true,
    rentControlActive: false,
    additionalProtectedClasses: ['source_of_income', 'sexual_orientation', 'gender_identity'],
    requiredDisclosures: [
      'Lead-based paint disclosure (pre-1978)',
      'Mold disclosure',
      'Move-in checklist required',
    ],
    moveInCostLimits: 'Cannot require last month rent at move-in',
  },
};

// =============================================================================
// Market Rule Validation
// =============================================================================

export interface MarketRuleCheckResult {
  passed: boolean;
  violations: Array<{
    ruleId: string;
    severity: PolicyViolationSeverity;
    message: string;
    suggestedFix?: string;
  }>;
  warnings: string[];
  requiredDisclosures: string[];
}

/**
 * Get market configuration.
 */
export function getMarketConfig(market: string): MarketRuleConfig | null {
  return MARKET_CONFIGS[market] || null;
}

/**
 * Check for required disclosures that should be provided.
 */
export function checkRequiredDisclosures(
  market: string,
  providedDisclosures: string[]
): { missing: string[]; provided: string[] } {
  const config = getMarketConfig(market);
  if (!config) {
    return { missing: [], provided: providedDisclosures };
  }

  const missing = config.requiredDisclosures.filter(
    (d) => !providedDisclosures.some((p) => p.toLowerCase().includes(d.toLowerCase()))
  );

  return { missing, provided: providedDisclosures };
}

/**
 * Check occupancy limits.
 */
export function checkOccupancyLimit(
  market: string,
  bedrooms: number,
  occupants: number
): { valid: boolean; message?: string } {
  const config = getMarketConfig(market);
  if (!config || !config.maxOccupancyPerBedroom) {
    return { valid: true };
  }

  const maxOccupants = bedrooms * config.maxOccupancyPerBedroom + 1; // +1 for common area
  if (occupants > maxOccupants) {
    return {
      valid: false,
      message: `Occupancy of ${occupants} exceeds ${market} limit of ${maxOccupants} for a ${bedrooms} bedroom unit`,
    };
  }

  return { valid: true };
}

/**
 * Check rent control implications.
 */
export function checkRentControlCompliance(
  market: string,
  currentRent: number,
  proposedRent: number,
  _context: { isRenewal?: boolean; yearsSinceLastIncrease?: number }
): { compliant: boolean; message?: string; maxAllowedIncrease?: number } {
  const config = getMarketConfig(market);
  if (!config || !config.rentControlActive) {
    return { compliant: true };
  }

  const increase = ((proposedRent - currentRent) / currentRent) * 100;

  // Simplified rent control check - actual limits vary by jurisdiction and year
  const maxAnnualIncrease = market === 'CA' ? 10 : market === 'NY' ? 5 : 10;

  if (increase > maxAnnualIncrease) {
    return {
      compliant: false,
      message: `Rent increase of ${increase.toFixed(1)}% exceeds ${market} rent control limit of ${maxAnnualIncrease}%`,
      maxAllowedIncrease: maxAnnualIncrease,
    };
  }

  return { compliant: true };
}

// =============================================================================
// Market Rules
// =============================================================================

export const MARKET_RULES: PolicyRule[] = [
  {
    id: 'market_required_disclosures',
    name: 'Required Disclosures',
    description: 'Ensure all market-required disclosures are provided',
    category: 'market_rules',
    severity: 'error',
    enabled: true,
    conditions: {
      checkType: 'required_disclosures',
    },
    version: '1.0.0',
  },
  {
    id: 'market_occupancy_limits',
    name: 'Occupancy Limits',
    description: 'Occupancy must comply with market-specific limits',
    category: 'market_rules',
    severity: 'warning',
    enabled: true,
    conditions: {
      checkType: 'occupancy',
    },
    version: '1.0.0',
  },
  {
    id: 'market_rent_control',
    name: 'Rent Control Compliance',
    description: 'Rent increases must comply with rent control limits',
    category: 'market_rules',
    severity: 'error',
    enabled: true,
    markets: ['CA', 'NY'],
    conditions: {
      checkType: 'rent_control',
    },
    version: '1.0.0',
  },
];

/**
 * Check market-specific rules.
 */
export function checkMarketRules(request: PolicyCheckRequest): MarketRuleCheckResult {
  const violations: MarketRuleCheckResult['violations'] = [];
  const warnings: string[] = [];
  const market = request.market;

  if (!market) {
    return {
      passed: true,
      violations: [],
      warnings: ['No market specified - market-specific rules not applied'],
      requiredDisclosures: [],
    };
  }

  const config = getMarketConfig(market);
  if (!config) {
    return {
      passed: true,
      violations: [],
      warnings: [`Market ${market} not configured - using default rules`],
      requiredDisclosures: [],
    };
  }

  const inputs = request.toolInputs;

  // Check occupancy if applicable
  if (typeof inputs['bedrooms'] === 'number' && typeof inputs['occupants'] === 'number') {
    const occupancyCheck = checkOccupancyLimit(market, inputs['bedrooms'], inputs['occupants']);
    if (!occupancyCheck.valid) {
      violations.push({
        ruleId: 'market_occupancy_limits',
        severity: 'warning',
        message: occupancyCheck.message || 'Occupancy limit exceeded',
      });
    }
  }

  // Check rent control if applicable
  if (
    typeof inputs['currentRent'] === 'number' &&
    typeof inputs['proposedRent'] === 'number'
  ) {
    const rentCheck = checkRentControlCompliance(
      market,
      inputs['currentRent'],
      inputs['proposedRent'],
      {
        isRenewal: inputs['isRenewal'] as boolean,
      }
    );
    if (!rentCheck.compliant) {
      violations.push({
        ruleId: 'market_rent_control',
        severity: 'error',
        message: rentCheck.message || 'Rent increase exceeds limit',
        suggestedFix: `Maximum allowed increase is ${rentCheck.maxAllowedIncrease}%`,
      });
    }
  }

  return {
    passed: violations.filter((v) => v.severity === 'fatal' || v.severity === 'error').length === 0,
    violations,
    warnings,
    requiredDisclosures: config.requiredDisclosures,
  };
}

// =============================================================================
// Factory Function for Policy Gate
// =============================================================================

export interface MarketPolicyRule {
  id: string;
  name: string;
  description: string;
  category: 'compliance' | 'market_rules';
  severity: PolicyViolationSeverity;
  enabled: boolean;
  check: (context: MarketRuleContext) => Promise<{ passed: boolean; violations: MarketRuleCheckResult['violations'] }>;
}

interface MarketRuleContext {
  agentType?: string;
  tenantId?: string;
  market?: string;
  toolName?: string;
  inputs?: Record<string, unknown>;
}

/**
 * Create market rules for policy gate.
 */
export function createMarketRules(): MarketPolicyRule[] {
  return [
    {
      id: 'market_required_disclosures',
      name: 'Required Disclosures',
      description: 'Ensure all market-required disclosures are provided',
      category: 'compliance',
      severity: 'warning',
      enabled: true,
      check: (context: MarketRuleContext) => {
        const violations: MarketRuleCheckResult['violations'] = [];
        const market = context.market;

        if (market) {
          const config = getMarketConfig(market);
          if (config && config.requiredDisclosures.length > 0) {
            // Just a reminder check - actual enforcement would depend on specific tool
            // This is a placeholder that passes but reminds about disclosures
          }
        }

        return Promise.resolve({ passed: true, violations });
      },
    },
    {
      id: 'market_occupancy_limits',
      name: 'Occupancy Limits',
      description: 'Occupancy must comply with market-specific limits',
      category: 'compliance',
      severity: 'warning',
      enabled: true,
      check: (context: MarketRuleContext) => {
        const violations: MarketRuleCheckResult['violations'] = [];
        const market = context.market;
        const inputs = context.inputs || {};

        if (market && typeof inputs['bedrooms'] === 'number' && typeof inputs['occupants'] === 'number') {
          const result = checkOccupancyLimit(market, inputs['bedrooms'], inputs['occupants']);
          if (!result.valid) {
            violations.push({
              ruleId: 'market_occupancy_limits',
              severity: 'warning',
              message: result.message || 'Occupancy limit exceeded',
            });
          }
        }

        return Promise.resolve({ passed: violations.length === 0, violations });
      },
    },
    {
      id: 'market_rent_control',
      name: 'Rent Control Compliance',
      description: 'Rent increases must comply with rent control limits',
      category: 'compliance',
      severity: 'error',
      enabled: true,
      check: (context: MarketRuleContext) => {
        const violations: MarketRuleCheckResult['violations'] = [];
        const market = context.market;
        const inputs = context.inputs || {};

        if (
          market &&
          typeof inputs['currentRent'] === 'number' &&
          typeof inputs['proposedRent'] === 'number'
        ) {
          const result = checkRentControlCompliance(
            market,
            inputs['currentRent'],
            inputs['proposedRent'],
            { isRenewal: inputs['isRenewal'] as boolean }
          );
          if (!result.compliant) {
            violations.push({
              ruleId: 'market_rent_control',
              severity: 'error',
              message: result.message || 'Rent increase exceeds limit',
              suggestedFix: `Maximum allowed increase is ${result.maxAllowedIncrease}%`,
            });
          }
        }

        return Promise.resolve({ passed: violations.length === 0, violations });
      },
    },
  ];
}
