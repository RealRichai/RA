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
// UK_GDPR v1.0.0 - United Kingdom GDPR Compliance Pack
// ============================================================================

export const UK_GDPR_V1: MarketPack = {
  id: 'UK_GDPR',
  name: 'UK GDPR Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'UK GDPR compliance with privacy defaults and redaction policies for rental operations',
  jurisdiction: 'United Kingdom',
  rules: {
    brokerFee: {
      enabled: false, // UK allows letting agent fees with tenant fee ban caveats
      paidBy: 'landlord', // Tenant Fee Act 2019
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 5, // UK allows up to 5 weeks for annual rent < £50k
      interestRequired: false,
      separateAccountRequired: true, // Deposit protection scheme required
    },
    rentIncrease: {
      enabled: true,
      noticeRequired: true,
      noticeDays: 30, // Minimum 1 month notice
      goodCauseRequired: false,
    },
    disclosures: [
      {
        type: 'privacy_notice',
        requiredBefore: 'application',
        signatureRequired: false,
      },
      {
        type: 'data_processing_agreement',
        requiredBefore: 'application',
        signatureRequired: true,
      },
      {
        type: 'how_to_rent_guide',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'epc_certificate',
        requiredBefore: 'listing_publish',
        signatureRequired: false,
      },
      {
        type: 'gas_safety_certificate',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'deposit_protection_info',
        requiredBefore: 'move_in',
        signatureRequired: true,
        expirationDays: 30, // Must provide within 30 days of deposit
      },
    ],
    gdpr: {
      enabled: true,
      dataRetentionDays: 2555, // ~7 years for tax/legal purposes
      consentRequired: true,
      lawfulBases: ['contract', 'legal_obligation', 'legitimate_interests'],
      dataSubjectRequestDays: 30,
      privacyNoticeRequired: true,
      redactionPolicies: {
        enabled: true,
        autoRedactAfterDays: 2920, // 8 years
        fieldsToRedact: [
          'nationalInsuranceNumber',
          'bankAccountDetails',
          'passportNumber',
          'dateOfBirth',
          'rightToRentCheckDetails',
        ],
      },
    },
  },
  metadata: {
    gdprEffectiveDate: '2018-05-25',
    tenantFeeActEffectiveDate: '2019-06-01',
    legislativeReferences: [
      'UK GDPR (Data Protection Act 2018)',
      'Tenant Fees Act 2019',
      'Housing Act 2004',
      'Deregulation Act 2015',
    ],
  },
};

// ============================================================================
// CA_STANDARD v1.0.0 - California Compliance Pack
// ============================================================================

export const CA_STANDARD_V1: MarketPack = {
  id: 'CA_STANDARD',
  name: 'California Standard Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'California compliance including AB 1482 rent caps, just cause eviction, and state-specific disclosures',
  jurisdiction: 'California',
  rules: {
    brokerFee: {
      enabled: false, // No statewide restrictions
      paidBy: 'either',
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 1, // AB 12 (effective 2024): Max 1 month for most landlords
      interestRequired: false,
      separateAccountRequired: false,
      exemptions: ['small_landlord_pre_2024'], // Small landlords with pre-2024 leases may have 2 months
    },
    rentIncrease: {
      enabled: true,
      cpiPlusPercentage: 5, // AB 1482: 5% + CPI, max 10% total
      maxPercentage: 10, // Hard cap
      noticeRequired: true,
      noticeDays: 30, // 30 days for < 10%, 90 days for >= 10%
      goodCauseRequired: false, // Only for eviction, not rent increases
    },
    disclosures: [
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
        type: 'mold_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'demolition_intent',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'flood_hazard_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'megans_law_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'pest_control_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'military_ordnance_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'shared_utilities_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'ab1482_tenant_protection_notice',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
    ],
    ab1482: {
      enabled: true,
      rentCapFormula: 'cpi_plus_5_max_10',
      justCauseEvictionRequired: true,
      validEvictionReasons: [
        'non_payment',
        'lease_violation',
        'nuisance',
        'illegal_activity',
        'refusal_to_sign_renewal',
        'subletting_without_permission',
        'owner_occupancy',
        'substantial_renovation',
        'building_demolition',
        'withdrawal_from_rental_market',
        'government_order',
      ],
      relocationAssistance: {
        required: true,
        amount: 'one_month_rent',
        noFaultEvictionsOnly: true,
      },
      exemptions: [
        'single_family_home_owner_occupied',
        'duplex_owner_occupied',
        'built_within_15_years',
        'affordable_housing_deed_restricted',
        'college_dormitory',
        'owner_relative_occupant',
      ],
    },
  },
  metadata: {
    ab1482EffectiveDate: '2020-01-01',
    ab12EffectiveDate: '2024-07-01',
    legislativeReferences: [
      'California Civil Code § 1946.2 (AB 1482 - Tenant Protection Act)',
      'California Civil Code § 1950.5 (Security Deposits)',
      'California Civil Code § 1940.8.5 (AB 12 - Security Deposit Limit)',
      'California Health & Safety Code § 17920.3 (Mold)',
      'California Civil Code § 2079.10a (Megan\'s Law)',
    ],
  },
};

// ============================================================================
// TX_STANDARD v1.0.0 - Texas Compliance Pack
// ============================================================================

export const TX_STANDARD_V1: MarketPack = {
  id: 'TX_STANDARD',
  name: 'Texas Standard Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'Texas compliance with Property Code requirements, no rent control, and required disclosures',
  jurisdiction: 'Texas',
  rules: {
    brokerFee: {
      enabled: false, // No restrictions
      paidBy: 'either',
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 0, // No statutory limit in Texas
      interestRequired: false,
      separateAccountRequired: false,
      returnDays: 30, // Must return within 30 days of move-out
    },
    rentIncrease: {
      enabled: false, // No rent control - preempted by Texas law
      noticeRequired: true,
      noticeDays: 30, // Reasonable notice per lease terms
      goodCauseRequired: false,
    },
    disclosures: [
      {
        type: 'lead_paint_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'flood_zone_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'smoke_detector_notice',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'right_to_repair_notice',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'landlord_agent_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'parking_rules_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'late_fee_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
    ],
    texasPropertyCode: {
      enabled: true,
      repairRemedies: {
        enabled: true,
        noticeRequired: true,
        noticeDays: 7, // Tenant must give 7 days notice for repairs
        landlordResponseDays: 7, // Landlord has 7 days to respond
        tenantRemedies: [
          'repair_and_deduct',
          'rent_reduction',
          'terminate_lease',
          'judicial_remedies',
        ],
      },
      lockoutProhibited: true,
      utilityShutoffProhibited: true,
      retaliationProhibited: true,
      retaliationPeriodDays: 6, // 6 months presumption period
      securityDevices: {
        required: true,
        types: ['door_locks', 'window_latches', 'peephole', 'deadbolt'],
        landlordMustProvide: true,
        tenantCanRequest: true,
      },
    },
    noRentControl: {
      enabled: true,
      statePreemption: true,
      citiesCannotEnact: true,
      reference: 'Texas Local Government Code § 214.902',
    },
  },
  metadata: {
    propertyCodeEffectiveDate: '1984-01-01',
    floodDisclosureEffectiveDate: '2019-09-01',
    legislativeReferences: [
      'Texas Property Code Chapter 92 (Residential Tenancies)',
      'Texas Property Code § 92.056 (Landlord\'s Duty to Repair)',
      'Texas Property Code § 92.104 (Security Deposit Return)',
      'Texas Property Code § 92.153 (Security Devices)',
      'Texas Local Government Code § 214.902 (Rent Control Preemption)',
      'Texas Property Code § 5.008 (Flood Disclosure)',
    ],
  },
};

// ============================================================================
// Market Pack Registry
// ============================================================================

export const MARKET_PACKS: Record<MarketPackId, MarketPack> = {
  NYC_STRICT: NYC_STRICT_V1,
  US_STANDARD: US_STANDARD_V1,
  CA_STANDARD: CA_STANDARD_V1,
  TX_STANDARD: TX_STANDARD_V1,
  UK_GDPR: UK_GDPR_V1,
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
    // NYC markets
    'nyc': 'NYC_STRICT',
    'new_york': 'NYC_STRICT',
    'manhattan': 'NYC_STRICT',
    'brooklyn': 'NYC_STRICT',
    'queens': 'NYC_STRICT',
    'bronx': 'NYC_STRICT',
    'staten_island': 'NYC_STRICT',
    // California markets
    'ca': 'CA_STANDARD',
    'california': 'CA_STANDARD',
    'los_angeles': 'CA_STANDARD',
    'san_francisco': 'CA_STANDARD',
    'san_diego': 'CA_STANDARD',
    'san_jose': 'CA_STANDARD',
    'oakland': 'CA_STANDARD',
    'sacramento': 'CA_STANDARD',
    'fresno': 'CA_STANDARD',
    'long_beach': 'CA_STANDARD',
    'anaheim': 'CA_STANDARD',
    'santa_ana': 'CA_STANDARD',
    'riverside': 'CA_STANDARD',
    'irvine': 'CA_STANDARD',
    'berkeley': 'CA_STANDARD',
    'pasadena': 'CA_STANDARD',
    // Texas markets
    'tx': 'TX_STANDARD',
    'texas': 'TX_STANDARD',
    'houston': 'TX_STANDARD',
    'dallas': 'TX_STANDARD',
    'san_antonio': 'TX_STANDARD',
    'austin': 'TX_STANDARD',
    'fort_worth': 'TX_STANDARD',
    'el_paso': 'TX_STANDARD',
    'arlington': 'TX_STANDARD',
    'plano': 'TX_STANDARD',
    'irving': 'TX_STANDARD',
    'frisco': 'TX_STANDARD',
    'mckinney': 'TX_STANDARD',
    'denton': 'TX_STANDARD',
    // UK markets
    'uk': 'UK_GDPR',
    'united_kingdom': 'UK_GDPR',
    'london': 'UK_GDPR',
    'manchester': 'UK_GDPR',
    'birmingham': 'UK_GDPR',
    'leeds': 'UK_GDPR',
    'glasgow': 'UK_GDPR',
    'edinburgh': 'UK_GDPR',
    'bristol': 'UK_GDPR',
    'liverpool': 'UK_GDPR',
    'england': 'UK_GDPR',
    'scotland': 'UK_GDPR',
    'wales': 'UK_GDPR',
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
