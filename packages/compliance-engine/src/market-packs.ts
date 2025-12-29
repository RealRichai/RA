/**
 * Market Pack Definitions
 *
 * Versioned compliance rule sets for different jurisdictions.
 * These are the default in-code configurations that can be overridden by DB.
 */

import type { MarketPack, MarketPackId } from './types';

// ============================================================================
// NYC_STRICT v1.0.0 - New York City Compliance Pack
// ============================================================================

export const NYC_STRICT_V1: MarketPack = {
  id: 'NYC_STRICT',
  name: 'NYC Strict Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'Comprehensive NYC compliance including FARE Act, FCHA, Good Cause Eviction, and Rent Stabilization',
  jurisdiction: 'New York City, NY',
  rules: {
    brokerFee: {
      enabled: true,
      paidBy: 'landlord', // FARE Act requires landlord to pay broker fees
      maxMultiplier: 1, // If somehow allowed, max one month
      exemptions: ['owner_initiated_listing'],
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 1, // NYC law: max one month security deposit
      interestRequired: true, // Must pay interest on deposits
      separateAccountRequired: true,
    },
    rentIncrease: {
      enabled: true,
      cpiPlusPercentage: 5, // Good Cause: CPI + 5% max
      noticeRequired: true,
      noticeDays: 30,
      goodCauseRequired: true,
    },
    disclosures: [
      {
        type: 'fare_act_disclosure',
        requiredBefore: 'listing_publish',
        signatureRequired: false,
        expirationDays: 365,
      },
      {
        type: 'lead_paint_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'bedbug_history',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'rent_stabilization_notice',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'flood_zone_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'smoking_policy',
        requiredBefore: 'application',
        signatureRequired: false,
      },
      {
        type: 'tenant_rights_guide',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
    ],
    fareAct: {
      enabled: true,
      maxIncomeRequirementMultiplier: 40, // Cannot require income > 40x rent
      maxCreditScoreThreshold: 650, // Cannot require credit score > 650
    },
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
    goodCause: {
      enabled: true,
      maxRentIncreaseOverCPI: 5, // Max CPI + 5%
      validEvictionReasons: [
        'non_payment',
        'lease_violation',
        'nuisance',
        'illegal_activity',
        'owner_occupancy',
        'substantial_renovation',
        'building_demolition',
        'withdrawal_from_rental_market',
      ],
    },
    rentStabilization: {
      enabled: true,
      rgbBoardUrl: 'https://rentguidelinesboard.cityofnewyork.us/',
    },
  },
  metadata: {
    fareActEffectiveDate: '2024-09-21',
    fchaEffectiveDate: '2020-01-01',
    goodCauseEffectiveDate: '2024-04-20',
    legislativeReferences: [
      'NYC Admin Code § 26-3101 (FARE Act)',
      'NYC Admin Code § 8-107 (FCHA)',
      'Real Property Law § 226-c (Good Cause)',
      'NYC Rent Stabilization Law',
    ],
  },
};

// ============================================================================
// US_STANDARD v1.0.0 - Baseline Federal Compliance
// ============================================================================

export const US_STANDARD_V1: MarketPack = {
  id: 'US_STANDARD',
  name: 'US Standard Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'Baseline federal compliance requirements applicable across all US markets',
  jurisdiction: 'United States',
  rules: {
    brokerFee: {
      enabled: false, // No federal restrictions
      paidBy: 'either',
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 2, // Reasonable default, varies by state
      interestRequired: false,
      separateAccountRequired: false,
    },
    rentIncrease: {
      enabled: false, // No federal rent control
      noticeRequired: true,
      noticeDays: 30,
      goodCauseRequired: false,
    },
    disclosures: [
      {
        type: 'lead_paint_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'fair_housing_notice',
        requiredBefore: 'application',
        signatureRequired: false,
      },
    ],
  },
  metadata: {
    legislativeReferences: [
      'Fair Housing Act (42 U.S.C. §§ 3601-3619)',
      'Lead-Based Paint Disclosure (42 U.S.C. § 4852d)',
    ],
  },
};

// ============================================================================
// Market Pack Registry
// ============================================================================

export const MARKET_PACKS: Record<MarketPackId, MarketPack> = {
  NYC_STRICT: NYC_STRICT_V1,
  US_STANDARD: US_STANDARD_V1,
  CA_STANDARD: US_STANDARD_V1, // TODO: Implement CA-specific pack
  TX_STANDARD: US_STANDARD_V1, // TODO: Implement TX-specific pack
};

/**
 * Get market pack by ID
 */
export function getMarketPack(id: MarketPackId): MarketPack {
  const pack = MARKET_PACKS[id];
  if (!pack) {
    throw new Error(`Unknown market pack: ${id}`);
  }
  return pack;
}

/**
 * Get market pack version string
 */
export function getMarketPackVersion(pack: MarketPack): string {
  return `${pack.version.major}.${pack.version.minor}.${pack.version.patch}`;
}

/**
 * Determine market pack ID from market ID
 */
export function getMarketPackIdFromMarket(marketId: string): MarketPackId {
  const marketToPackMap: Record<string, MarketPackId> = {
    'nyc': 'NYC_STRICT',
    'new_york': 'NYC_STRICT',
    'manhattan': 'NYC_STRICT',
    'brooklyn': 'NYC_STRICT',
    'queens': 'NYC_STRICT',
    'bronx': 'NYC_STRICT',
    'staten_island': 'NYC_STRICT',
    // Add more market mappings as needed
  };

  const normalizedMarketId = marketId.toLowerCase().replace(/[^a-z]/g, '_');
  return marketToPackMap[normalizedMarketId] || 'US_STANDARD';
}

/**
 * Merge database MarketConfig with code defaults
 */
export function mergeMarketPackWithConfig(
  pack: MarketPack,
  dbConfig: Record<string, unknown> | null
): MarketPack {
  if (!dbConfig) {
    return pack;
  }

  // Deep merge, preferring DB config over code defaults
  return {
    ...pack,
    rules: {
      ...pack.rules,
      ...(dbConfig.rules as typeof pack.rules || {}),
    },
    metadata: {
      ...pack.metadata,
      ...(dbConfig.metadata as typeof pack.metadata || {}),
      _mergedFromDb: true,
    },
  };
}
