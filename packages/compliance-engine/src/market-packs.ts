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
        type: 'fare_fee_disclosure',
        requiredBefore: 'listing_publish',
        signatureRequired: false,
      },
      {
        type: 'fare_fee_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
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
      listingAgentTenantFeeProhibited: true, // When broker represents landlord, tenant cannot pay
      feeDisclosureRequired: true, // All tenant-paid fees must be disclosed
      disclosableFeeTypes: [
        'broker_fee',
        'application_fee',
        'move_in_fee',
        'amenity_fee',
        'pet_fee',
        'parking_fee',
        'administrative_fee',
        'credit_check_fee',
        'background_check_fee',
      ],
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
// FL_STANDARD v1.0.0 - Florida Compliance Pack
// ============================================================================

export const FL_STANDARD_V1: MarketPack = {
  id: 'FL_STANDARD',
  name: 'Florida Standard Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'Florida compliance with Landlord Tenant Act, radon disclosure, and security deposit rules',
  jurisdiction: 'Florida',
  rules: {
    brokerFee: {
      enabled: false,
      paidBy: 'either',
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 0, // No statutory limit in Florida
      interestRequired: false, // Optional but must notify tenant if interest-bearing
      separateAccountRequired: true, // Must be in Florida banking institution or surety bond
      returnDays: 15, // 15 days if no deductions, 30 days with itemized deductions
    },
    rentIncrease: {
      enabled: false, // No rent control in Florida
      noticeRequired: true,
      noticeDays: 15, // 15 days for month-to-month
      goodCauseRequired: false,
    },
    disclosures: [
      {
        type: 'lead_paint_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'radon_gas_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'landlord_identity_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'security_deposit_terms',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'fire_protection_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
    ],
    noRentControl: {
      enabled: true,
      statePreemption: true,
      citiesCannotEnact: true,
      reference: 'Florida Statute § 166.043',
    },
  },
  metadata: {
    landlordTenantActReference: 'Florida Statutes Chapter 83 Part II',
    legislativeReferences: [
      'Florida Statutes § 83.49 (Security Deposits)',
      'Florida Statutes § 83.50 (Disclosure)',
      'Florida Statutes § 404.056 (Radon Gas Protection)',
      'Florida Statutes § 166.043 (Rent Control Preemption)',
    ],
  },
};

// ============================================================================
// IL_STANDARD v1.0.0 - Illinois Compliance Pack
// ============================================================================

export const IL_STANDARD_V1: MarketPack = {
  id: 'IL_STANDARD',
  name: 'Illinois Standard Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'Illinois compliance with RLTO (Chicago), security deposit interest, and state disclosures',
  jurisdiction: 'Illinois',
  rules: {
    brokerFee: {
      enabled: false,
      paidBy: 'either',
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 1.5, // Chicago RLTO: 1.5 months max
      interestRequired: true, // Chicago requires interest on deposits held > 6 months
      separateAccountRequired: true, // Chicago requires federally insured interest-bearing account
      returnDays: 30, // 30 days in Chicago, 45 days under state law
    },
    rentIncrease: {
      enabled: false, // No statewide rent control
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
        type: 'radon_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'bedbug_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'code_violations_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'utility_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'smoke_detector_notice',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'carbon_monoxide_detector_notice',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
    ],
    chicagoRLTO: {
      enabled: true,
      securityDepositInterestRate: 'passbook_rate',
      interestPaymentFrequency: 'annual',
      summaryOfRightsRequired: true,
      moveInMoveOutInspection: true,
      tenantRemedies: [
        'withhold_rent',
        'repair_and_deduct',
        'terminate_lease',
        'sue_for_damages',
      ],
    },
  },
  metadata: {
    rltoEffectiveDate: '1986-01-01',
    legislativeReferences: [
      'Chicago Municipal Code 5-12 (RLTO)',
      '765 ILCS 705 (Security Deposit Return Act)',
      '765 ILCS 715 (Security Deposit Interest Act)',
      '420 ILCS 44 (Radon Awareness Act)',
      '765 ILCS 735 (Bed Bug Disclosure Act)',
    ],
  },
};

// ============================================================================
// WA_STANDARD v1.0.0 - Washington Compliance Pack
// ============================================================================

export const WA_STANDARD_V1: MarketPack = {
  id: 'WA_STANDARD',
  name: 'Washington Standard Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'Washington compliance with Residential Landlord-Tenant Act, just cause eviction, and tenant protections',
  jurisdiction: 'Washington',
  rules: {
    brokerFee: {
      enabled: false,
      paidBy: 'either',
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 0, // No statutory limit
      interestRequired: false,
      separateAccountRequired: false,
      returnDays: 21, // Must return within 21 days
    },
    rentIncrease: {
      enabled: true,
      noticeRequired: true,
      noticeDays: 60, // 60 days written notice for month-to-month
      goodCauseRequired: false, // Statewide, but Seattle has just cause
    },
    disclosures: [
      {
        type: 'lead_paint_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'mold_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'move_in_checklist',
        requiredBefore: 'move_in',
        signatureRequired: true,
      },
      {
        type: 'deposit_location_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'fire_safety_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'landlord_contact_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
    ],
    washingtonRCW: {
      enabled: true,
      moveInChecklist: {
        required: true,
        tenantSignatureRequired: true,
        landlordMustProvide: true,
      },
      depositDeductionRules: {
        itemizedStatementRequired: true,
        photoDocumentationRecommended: true,
        normalWearExcluded: true,
      },
      retaliationProtection: {
        enabled: true,
        protectedActivities: [
          'complaint_to_government',
          'tenant_organization',
          'legal_action',
        ],
        presumptionPeriodDays: 90,
      },
    },
    seattleJustCause: {
      enabled: true, // Applies in Seattle
      validEvictionReasons: [
        'non_payment',
        'lease_violation',
        'waste_or_nuisance',
        'illegal_activity',
        'owner_occupancy',
        'substantial_rehabilitation',
        'demolition',
        'change_of_use',
      ],
      relocationAssistance: {
        required: true,
        conditions: ['no_fault_eviction', 'substantial_rent_increase'],
      },
    },
  },
  metadata: {
    rcwEffectiveDate: '1973-01-01',
    seattleJustCauseEffectiveDate: '2020-01-01',
    legislativeReferences: [
      'RCW 59.18 (Residential Landlord-Tenant Act)',
      'RCW 59.18.260 (Deposit Return)',
      'RCW 59.18.230 (Checklist Requirement)',
      'RCW 59.18.240 (Rent Increase Notice)',
      'Seattle Municipal Code 22.206 (Just Cause Eviction)',
    ],
  },
};

// ============================================================================
// CO_STANDARD v1.0.0 - Colorado Compliance Pack
// ============================================================================

export const CO_STANDARD_V1: MarketPack = {
  id: 'CO_STANDARD',
  name: 'Colorado Standard Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'Colorado compliance with security deposit limits, warranty of habitability, and required disclosures',
  jurisdiction: 'Colorado',
  rules: {
    brokerFee: {
      enabled: false,
      paidBy: 'either',
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 0, // No statutory limit
      interestRequired: false,
      separateAccountRequired: false,
      returnDays: 30, // 30 days standard, up to 60 if specified in lease
    },
    rentIncrease: {
      enabled: false, // No rent control in Colorado
      noticeRequired: true,
      noticeDays: 21, // 21 days for month-to-month (10 days if week-to-week)
      goodCauseRequired: false,
    },
    disclosures: [
      {
        type: 'lead_paint_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'meth_contamination_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'bed_bug_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'gas_appliance_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'security_deposit_terms',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
    ],
    coloradoWarrantyOfHabitability: {
      enabled: true,
      landlordObligations: [
        'waterproofing_and_weather_protection',
        'plumbing_in_good_working_order',
        'heating_facilities',
        'electrical_lighting',
        'common_areas_clean_and_safe',
        'adequate_trash_receptacles',
        'running_water_and_hot_water',
        'locks_on_doors_and_windows',
        'compliance_with_codes',
      ],
      tenantRemedies: [
        'repair_and_deduct',
        'rent_withholding',
        'lease_termination',
        'damages',
      ],
      noticeRequired: true,
      noticeDays: 10, // Written notice before remedies
    },
    noRentControl: {
      enabled: true,
      statePreemption: true,
      citiesCannotEnact: true,
      reference: 'Colorado Revised Statutes § 38-12-301',
    },
  },
  metadata: {
    habitabilityActEffectiveDate: '2008-01-01',
    legislativeReferences: [
      'Colorado Revised Statutes § 38-12-101 to 38-12-104 (Security Deposits)',
      'Colorado Revised Statutes § 38-12-503 (Warranty of Habitability)',
      'Colorado Revised Statutes § 38-12-301 (Rent Control Preemption)',
      'Colorado Revised Statutes § 25-18.5-101 (Methamphetamine Disclosure)',
      'Colorado Revised Statutes § 38-12-1001 (Bed Bug Disclosure)',
    ],
  },
};

// ============================================================================
// MA_STANDARD v1.0.0 - Massachusetts Compliance Pack
// ============================================================================

export const MA_STANDARD_V1: MarketPack = {
  id: 'MA_STANDARD',
  name: 'Massachusetts Standard Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'Massachusetts compliance with security deposit interest, last month rent rules, and tenant protections',
  jurisdiction: 'Massachusetts',
  rules: {
    brokerFee: {
      enabled: false,
      paidBy: 'either',
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 1, // Max one month security deposit
      interestRequired: true, // Must pay 5% annual interest or actual bank rate
      separateAccountRequired: true, // Must be in separate interest-bearing account
      returnDays: 30,
    },
    rentIncrease: {
      enabled: false,
      noticeRequired: true,
      noticeDays: 30, // 30 days or one rental period, whichever is longer
      goodCauseRequired: false,
    },
    disclosures: [
      {
        type: 'lead_paint_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'security_deposit_receipt',
        requiredBefore: 'move_in',
        signatureRequired: true,
      },
      {
        type: 'statement_of_condition',
        requiredBefore: 'move_in',
        signatureRequired: true,
      },
      {
        type: 'insurance_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'landlord_manager_identity',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'smoke_detector_compliance',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
    ],
    massachusettsRules: {
      enabled: true,
      lastMonthRent: {
        canCollect: true,
        interestRequired: true,
      },
      statementOfCondition: {
        required: true,
        withinDays: 10, // Must provide within 10 days of tenancy
        tenantResponseDays: 15,
      },
      securityDepositInterest: {
        rate: 'five_percent_or_bank_rate',
        paymentFrequency: 'annual',
      },
    },
  },
  metadata: {
    legislativeReferences: [
      'Massachusetts General Laws Chapter 186 (Tenancy)',
      'MGL c. 186, § 15B (Security Deposits)',
      'MGL c. 111, § 127L (Lead Paint)',
      '105 CMR 410 (Minimum Standards of Fitness)',
    ],
  },
};

// ============================================================================
// NJ_STANDARD v1.0.0 - New Jersey Compliance Pack
// ============================================================================

export const NJ_STANDARD_V1: MarketPack = {
  id: 'NJ_STANDARD',
  name: 'New Jersey Standard Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'New Jersey compliance with security deposit limits, interest requirements, and Truth in Renting Act',
  jurisdiction: 'New Jersey',
  rules: {
    brokerFee: {
      enabled: false,
      paidBy: 'either',
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 1.5, // Max 1.5 months rent
      interestRequired: true, // Must pay interest annually
      separateAccountRequired: true, // Must be in NJ bank or savings institution
      returnDays: 30, // 30 days, or 5 days for domestic violence
    },
    rentIncrease: {
      enabled: false, // Some municipalities have rent control
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
        type: 'truth_in_renting_statement',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'flood_zone_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'window_guard_notice',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'landlord_identity_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
    ],
    newJerseyRules: {
      enabled: true,
      truthInRenting: {
        required: true,
        dgcaApproved: true, // Must use DCA-approved statement
      },
      securityDepositInterest: {
        annualPayment: true,
        bankMustBeInNJ: true,
      },
      antiEvictionAct: {
        enabled: true, // NJ Anti-Eviction Act protections
        goodCauseRequired: true,
      },
    },
  },
  metadata: {
    antiEvictionActEffectiveDate: '1974-01-01',
    legislativeReferences: [
      'N.J.S.A. 46:8-19 to 46:8-26 (Security Deposits)',
      'N.J.S.A. 46:8-43 to 46:8-50 (Truth in Renting)',
      'N.J.S.A. 2A:18-61.1 (Anti-Eviction Act)',
      'N.J.A.C. 5:10 (Hotel and Multiple Dwelling Code)',
    ],
  },
};

// ============================================================================
// PA_STANDARD v1.0.0 - Pennsylvania Compliance Pack
// ============================================================================

export const PA_STANDARD_V1: MarketPack = {
  id: 'PA_STANDARD',
  name: 'Pennsylvania Standard Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'Pennsylvania compliance with Landlord Tenant Act, security deposit limits, and escrow requirements',
  jurisdiction: 'Pennsylvania',
  rules: {
    brokerFee: {
      enabled: false,
      paidBy: 'either',
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 2, // First year: 2 months max; After first year: 1 month max
      interestRequired: true, // After 2 years, must pay interest or put in escrow
      separateAccountRequired: true, // After 2 years, must be in escrow
      returnDays: 30,
    },
    rentIncrease: {
      enabled: false,
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
        type: 'landlord_identity_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'radon_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'security_deposit_location',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
    ],
    pennsylvaniaRules: {
      enabled: true,
      securityDepositTiers: {
        firstYear: 2, // Max 2 months first year
        afterFirstYear: 1, // Max 1 month after first year
      },
      escrowAfterTwoYears: {
        required: true,
        interestRate: 'market_rate',
      },
      philadelphiaRules: {
        fairHousingOrdinance: true,
        goodCauseEviction: true, // Philadelphia has additional protections
      },
    },
  },
  metadata: {
    legislativeReferences: [
      '68 P.S. § 250.101 et seq. (Landlord and Tenant Act)',
      '68 P.S. § 250.511a-512 (Security Deposits)',
      '35 P.S. § 7210.101 (Radon Certification Act)',
      'Philadelphia Code § 9-804 (Good Cause Eviction)',
    ],
  },
};

// ============================================================================
// GA_STANDARD v1.0.0 - Georgia Compliance Pack
// ============================================================================

export const GA_STANDARD_V1: MarketPack = {
  id: 'GA_STANDARD',
  name: 'Georgia Standard Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'Georgia compliance with Landlord Tenant Act, security deposit handling, and disclosure requirements',
  jurisdiction: 'Georgia',
  rules: {
    brokerFee: {
      enabled: false,
      paidBy: 'either',
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 0, // No statutory limit
      interestRequired: false,
      separateAccountRequired: true, // Must be in escrow account if > 10 units
      returnDays: 30, // One month from termination
    },
    rentIncrease: {
      enabled: false,
      noticeRequired: true,
      noticeDays: 60, // 60 days for lease changes
      goodCauseRequired: false,
    },
    disclosures: [
      {
        type: 'lead_paint_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'flooding_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'authorized_agent_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'move_in_inspection_list',
        requiredBefore: 'move_in',
        signatureRequired: true,
      },
      {
        type: 'mold_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
    ],
    georgiaRules: {
      enabled: true,
      escrowRequirement: {
        unitsThreshold: 10, // Escrow required for landlords with 10+ units
        bankingInstitutionRequired: true,
      },
      moveInInspection: {
        required: true,
        tenantSignatureRequired: true,
        listMustBeComprehensive: true,
      },
      securityDepositDeductions: {
        itemizedStatementRequired: true,
        withinThreeDays: true, // Must provide list within 3 days of inspection
      },
    },
    noRentControl: {
      enabled: true,
      statePreemption: true,
      citiesCannotEnact: true,
      reference: 'O.C.G.A. § 44-7-19',
    },
  },
  metadata: {
    legislativeReferences: [
      'O.C.G.A. § 44-7-30 to 44-7-37 (Security Deposits)',
      'O.C.G.A. § 44-7-33 (Move-in Inspection)',
      'O.C.G.A. § 44-7-20 (Flooding Disclosure)',
      'O.C.G.A. § 44-7-19 (Rent Control Preemption)',
    ],
  },
};

// ============================================================================
// AZ_STANDARD v1.0.0 - Arizona Compliance Pack
// ============================================================================

export const AZ_STANDARD_V1: MarketPack = {
  id: 'AZ_STANDARD',
  name: 'Arizona Standard Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'Arizona compliance with Residential Landlord Tenant Act, security deposit limits, and disclosure requirements',
  jurisdiction: 'Arizona',
  rules: {
    brokerFee: {
      enabled: false,
      paidBy: 'either',
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 1.5, // Max 1.5 months rent
      interestRequired: false,
      separateAccountRequired: false,
      returnDays: 14, // Must return within 14 business days
    },
    rentIncrease: {
      enabled: false,
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
        type: 'move_in_inspection_statement',
        requiredBefore: 'move_in',
        signatureRequired: true,
      },
      {
        type: 'bedbug_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'pool_safety_notice',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'landlord_contact_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'nonrefundable_fees_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
    ],
    arizonaRules: {
      enabled: true,
      moveInInspection: {
        required: true,
        landlordMustProvide: true,
        tenantHas5DaysToComplete: true,
      },
      nonrefundableFees: {
        mustBeDisclosed: true,
        separateFromDeposit: true,
      },
      poolSafety: {
        noticeRequired: true,
        fencingRequirements: true,
      },
      remedies: {
        repairAndDeduct: true,
        maxDeductAmount: 'half_month_rent',
        rentWithholding: true,
      },
    },
    noRentControl: {
      enabled: true,
      statePreemption: true,
      citiesCannotEnact: true,
      reference: 'A.R.S. § 33-1329',
    },
  },
  metadata: {
    legislativeReferences: [
      'A.R.S. § 33-1301 to 33-1381 (Residential Landlord Tenant Act)',
      'A.R.S. § 33-1321 (Security Deposits)',
      'A.R.S. § 33-1319 (Move-in Inspection)',
      'A.R.S. § 33-1329 (Rent Control Preemption)',
      'A.R.S. § 36-1681 (Pool Safety)',
    ],
  },
};

// ============================================================================
// NV_STANDARD v1.0.0 - Nevada Compliance Pack
// ============================================================================

export const NV_STANDARD_V1: MarketPack = {
  id: 'NV_STANDARD',
  name: 'Nevada Standard Compliance',
  version: { major: 1, minor: 0, patch: 0 },
  effectiveDate: '2024-01-01T00:00:00Z',
  description: 'Nevada compliance with landlord tenant laws, security deposit limits, and disclosure requirements',
  jurisdiction: 'Nevada',
  rules: {
    brokerFee: {
      enabled: false,
      paidBy: 'either',
    },
    securityDeposit: {
      enabled: true,
      maxMonths: 3, // Max 3 months rent
      interestRequired: false,
      separateAccountRequired: false,
      returnDays: 30,
    },
    rentIncrease: {
      enabled: false,
      noticeRequired: true,
      noticeDays: 45, // 45 days written notice
      goodCauseRequired: false,
    },
    disclosures: [
      {
        type: 'lead_paint_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'foreclosure_status_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: true,
      },
      {
        type: 'move_in_checklist',
        requiredBefore: 'move_in',
        signatureRequired: true,
      },
      {
        type: 'landlord_contact_disclosure',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
      {
        type: 'nuisance_and_noise_policy',
        requiredBefore: 'lease_signing',
        signatureRequired: false,
      },
    ],
    nevadaRules: {
      enabled: true,
      foreclosureDisclosure: {
        required: true,
        mustDiscloseIfInForeclosure: true,
      },
      moveInChecklist: {
        recommended: true,
        helpfulForDepositDisputes: true,
      },
      landlordRemedies: {
        summaryEviction: true,
        noticePeriods: {
          nonPayment: 7, // 7 days for non-payment
          leaseViolation: 5, // 5 days to cure
          unlawfulDetainer: 5,
        },
      },
      tenantRemedies: {
        repairAndDeduct: true,
        rentWithholding: false, // Not explicitly allowed in NV
        habitabilityStandards: true,
      },
    },
    noRentControl: {
      enabled: true,
      statePreemption: true,
      citiesCannotEnact: true,
      reference: 'NRS 268.4159 and NRS 278.0215',
    },
  },
  metadata: {
    legislativeReferences: [
      'NRS Chapter 118A (Residential Landlord Tenant Act)',
      'NRS 118A.242 (Security Deposits)',
      'NRS 118A.275 (Foreclosure Disclosure)',
      'NRS 268.4159 (Rent Control Preemption - Cities)',
      'NRS 278.0215 (Rent Control Preemption - Counties)',
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
  FL_STANDARD: FL_STANDARD_V1,
  IL_STANDARD: IL_STANDARD_V1,
  WA_STANDARD: WA_STANDARD_V1,
  CO_STANDARD: CO_STANDARD_V1,
  MA_STANDARD: MA_STANDARD_V1,
  NJ_STANDARD: NJ_STANDARD_V1,
  PA_STANDARD: PA_STANDARD_V1,
  GA_STANDARD: GA_STANDARD_V1,
  AZ_STANDARD: AZ_STANDARD_V1,
  NV_STANDARD: NV_STANDARD_V1,
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
    // Florida markets
    'fl': 'FL_STANDARD',
    'florida': 'FL_STANDARD',
    'miami': 'FL_STANDARD',
    'orlando': 'FL_STANDARD',
    'tampa': 'FL_STANDARD',
    'jacksonville': 'FL_STANDARD',
    'fort_lauderdale': 'FL_STANDARD',
    'st_petersburg': 'FL_STANDARD',
    'hialeah': 'FL_STANDARD',
    'tallahassee': 'FL_STANDARD',
    'cape_coral': 'FL_STANDARD',
    'fort_myers': 'FL_STANDARD',
    'pembroke_pines': 'FL_STANDARD',
    'hollywood': 'FL_STANDARD',
    'gainesville': 'FL_STANDARD',
    // Illinois markets
    'il': 'IL_STANDARD',
    'illinois': 'IL_STANDARD',
    'chicago': 'IL_STANDARD',
    'aurora': 'IL_STANDARD',
    'naperville': 'IL_STANDARD',
    'joliet': 'IL_STANDARD',
    'rockford': 'IL_STANDARD',
    'springfield': 'IL_STANDARD',
    'elgin': 'IL_STANDARD',
    'peoria': 'IL_STANDARD',
    'champaign': 'IL_STANDARD',
    'waukegan': 'IL_STANDARD',
    'cicero': 'IL_STANDARD',
    'evanston': 'IL_STANDARD',
    // Washington markets
    'wa': 'WA_STANDARD',
    'washington': 'WA_STANDARD',
    'seattle': 'WA_STANDARD',
    'spokane': 'WA_STANDARD',
    'tacoma': 'WA_STANDARD',
    'vancouver': 'WA_STANDARD',
    'bellevue': 'WA_STANDARD',
    'kent': 'WA_STANDARD',
    'everett': 'WA_STANDARD',
    'renton': 'WA_STANDARD',
    'spokane_valley': 'WA_STANDARD',
    'federal_way': 'WA_STANDARD',
    'kirkland': 'WA_STANDARD',
    'bellingham': 'WA_STANDARD',
    'olympia': 'WA_STANDARD',
    // Colorado markets
    'co': 'CO_STANDARD',
    'colorado': 'CO_STANDARD',
    'denver': 'CO_STANDARD',
    'colorado_springs': 'CO_STANDARD',
    'aurora_co': 'CO_STANDARD',
    'fort_collins': 'CO_STANDARD',
    'lakewood': 'CO_STANDARD',
    'thornton': 'CO_STANDARD',
    'arvada': 'CO_STANDARD',
    'westminster': 'CO_STANDARD',
    'pueblo': 'CO_STANDARD',
    'centennial': 'CO_STANDARD',
    'boulder': 'CO_STANDARD',
    'greeley': 'CO_STANDARD',
    'longmont': 'CO_STANDARD',
    // Massachusetts markets
    'ma': 'MA_STANDARD',
    'massachusetts': 'MA_STANDARD',
    'boston': 'MA_STANDARD',
    'worcester': 'MA_STANDARD',
    'springfield_ma': 'MA_STANDARD',
    'cambridge': 'MA_STANDARD',
    'lowell': 'MA_STANDARD',
    'brockton': 'MA_STANDARD',
    'new_bedford': 'MA_STANDARD',
    'quincy': 'MA_STANDARD',
    'lynn': 'MA_STANDARD',
    'fall_river': 'MA_STANDARD',
    'newton': 'MA_STANDARD',
    'somerville': 'MA_STANDARD',
    // New Jersey markets
    'nj': 'NJ_STANDARD',
    'new_jersey': 'NJ_STANDARD',
    'newark': 'NJ_STANDARD',
    'jersey_city': 'NJ_STANDARD',
    'paterson': 'NJ_STANDARD',
    'elizabeth': 'NJ_STANDARD',
    'edison': 'NJ_STANDARD',
    'woodbridge': 'NJ_STANDARD',
    'lakewood_nj': 'NJ_STANDARD',
    'toms_river': 'NJ_STANDARD',
    'hamilton': 'NJ_STANDARD',
    'trenton': 'NJ_STANDARD',
    'clifton': 'NJ_STANDARD',
    'camden': 'NJ_STANDARD',
    'brick': 'NJ_STANDARD',
    'cherry_hill': 'NJ_STANDARD',
    'passaic': 'NJ_STANDARD',
    'hoboken': 'NJ_STANDARD',
    // Pennsylvania markets
    'pa': 'PA_STANDARD',
    'pennsylvania': 'PA_STANDARD',
    'philadelphia': 'PA_STANDARD',
    'pittsburgh': 'PA_STANDARD',
    'allentown': 'PA_STANDARD',
    'reading': 'PA_STANDARD',
    'scranton': 'PA_STANDARD',
    'bethlehem': 'PA_STANDARD',
    'lancaster': 'PA_STANDARD',
    'harrisburg': 'PA_STANDARD',
    'altoona': 'PA_STANDARD',
    'erie': 'PA_STANDARD',
    'wilkes_barre': 'PA_STANDARD',
    'york': 'PA_STANDARD',
    'state_college': 'PA_STANDARD',
    // Georgia markets
    'ga': 'GA_STANDARD',
    'georgia': 'GA_STANDARD',
    'atlanta': 'GA_STANDARD',
    'augusta': 'GA_STANDARD',
    'columbus_ga': 'GA_STANDARD',
    'macon': 'GA_STANDARD',
    'savannah': 'GA_STANDARD',
    'athens': 'GA_STANDARD',
    'sandy_springs': 'GA_STANDARD',
    'roswell': 'GA_STANDARD',
    'johns_creek': 'GA_STANDARD',
    'albany_ga': 'GA_STANDARD',
    'warner_robins': 'GA_STANDARD',
    'alpharetta': 'GA_STANDARD',
    'marietta': 'GA_STANDARD',
    'smyrna': 'GA_STANDARD',
    // Arizona markets
    'az': 'AZ_STANDARD',
    'arizona': 'AZ_STANDARD',
    'phoenix': 'AZ_STANDARD',
    'tucson': 'AZ_STANDARD',
    'mesa': 'AZ_STANDARD',
    'chandler': 'AZ_STANDARD',
    'scottsdale': 'AZ_STANDARD',
    'gilbert': 'AZ_STANDARD',
    'glendale_az': 'AZ_STANDARD',
    'tempe': 'AZ_STANDARD',
    'peoria_az': 'AZ_STANDARD',
    'surprise': 'AZ_STANDARD',
    'yuma': 'AZ_STANDARD',
    'avondale': 'AZ_STANDARD',
    'goodyear': 'AZ_STANDARD',
    'flagstaff': 'AZ_STANDARD',
    // Nevada markets
    'nv': 'NV_STANDARD',
    'nevada': 'NV_STANDARD',
    'las_vegas': 'NV_STANDARD',
    'henderson': 'NV_STANDARD',
    'reno': 'NV_STANDARD',
    'north_las_vegas': 'NV_STANDARD',
    'sparks': 'NV_STANDARD',
    'carson_city': 'NV_STANDARD',
    'fernley': 'NV_STANDARD',
    'elko': 'NV_STANDARD',
    'mesquite': 'NV_STANDARD',
    'boulder_city': 'NV_STANDARD',
    'pahrump': 'NV_STANDARD',
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
