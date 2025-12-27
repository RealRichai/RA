/**
 * RealRiches Shared Constants
 * 
 * Centralized constants for compliance, markets, and business rules.
 * These values are enforced across the entire platform.
 */

// =============================================================================
// FARE ACT COMPLIANCE (NYC Local Law 18 of 2024)
// Effective: June 11, 2025
// =============================================================================

/**
 * Maximum application fee allowed under FARE Act
 * @see https://www.nyc.gov/site/dca/about/fare-act.page
 */
export const FARE_ACT_MAX_APPLICATION_FEE = 20 as const;

/**
 * Maximum security deposit in months of rent under FARE Act
 */
export const FARE_ACT_MAX_SECURITY_DEPOSIT_MONTHS = 1 as const;

/**
 * FARE Act effective date
 */
export const FARE_ACT_EFFECTIVE_DATE = new Date('2025-06-11T00:00:00Z');

// =============================================================================
// FAIR CHANCE HOUSING ACT (NYC Local Law 24 of 2024)
// Effective: January 1, 2025
// =============================================================================

/**
 * Number of business days landlord has to complete individual assessment
 * after receiving criminal background check results
 */
export const FAIR_CHANCE_ASSESSMENT_BUSINESS_DAYS = 5 as const;

/**
 * Fair Chance Housing Act effective date
 */
export const FAIR_CHANCE_EFFECTIVE_DATE = new Date('2025-01-01T00:00:00Z');

// =============================================================================
// MARKETS
// =============================================================================

export const MARKETS = {
  NYC: 'nyc',
  LONG_ISLAND: 'long_island',
} as const;

export type Market = (typeof MARKETS)[keyof typeof MARKETS];

export const NYC_BOROUGHS = [
  'manhattan',
  'brooklyn',
  'queens',
  'bronx',
  'staten_island',
] as const;

export type NYCBorough = (typeof NYC_BOROUGHS)[number];

export const LONG_ISLAND_COUNTIES = [
  'nassau',
  'suffolk',
] as const;

export type LongIslandCounty = (typeof LONG_ISLAND_COUNTIES)[number];

/**
 * Check if a market is subject to FARE Act regulations
 */
export function isNYCMarket(market: Market): boolean {
  return market === MARKETS.NYC;
}

/**
 * Check if a market allows traditional broker fee practices
 */
export function allowsTraditionalBrokerFees(market: Market): boolean {
  return market === MARKETS.LONG_ISLAND;
}

// =============================================================================
// USER ROLES
// =============================================================================

export const USER_ROLES = {
  TENANT: 'tenant',
  LANDLORD: 'landlord',
  AGENT: 'agent',
  INVESTOR: 'investor',
  ADMIN: 'admin',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// =============================================================================
// APPLICATION STATUS - Fair Chance Housing Act State Machine
// =============================================================================

export const APPLICATION_STATUS = {
  // Initial states
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  
  // Document collection (no criminal check allowed)
  DOCUMENTS_REQUESTED: 'documents_requested',
  DOCUMENTS_RECEIVED: 'documents_received',
  
  // Financial review (no criminal check allowed)
  FINANCIAL_REVIEW: 'financial_review',
  FINANCIAL_APPROVED: 'financial_approved',
  FINANCIAL_DENIED: 'financial_denied',
  
  // === COMPLIANCE BOUNDARY ===
  // Criminal check ONLY permitted AFTER this state
  CONDITIONAL_OFFER: 'conditional_offer',
  
  // Post-conditional states (criminal check permitted)
  CRIMINAL_CHECK_PENDING: 'criminal_check_pending',
  CRIMINAL_CHECK_COMPLETE: 'criminal_check_complete',
  
  // Individual assessment (if adverse history)
  INDIVIDUAL_ASSESSMENT: 'individual_assessment',
  ASSESSMENT_ADDITIONAL_INFO: 'assessment_additional_info',
  
  // Terminal states
  APPROVED: 'approved',
  DENIED: 'denied',
  WITHDRAWN: 'withdrawn',
  EXPIRED: 'expired',
} as const;

export type ApplicationStatus = (typeof APPLICATION_STATUS)[keyof typeof APPLICATION_STATUS];

/**
 * States where criminal background check is PROHIBITED
 */
export const PRE_CONDITIONAL_STATES: readonly ApplicationStatus[] = [
  APPLICATION_STATUS.DRAFT,
  APPLICATION_STATUS.SUBMITTED,
  APPLICATION_STATUS.DOCUMENTS_REQUESTED,
  APPLICATION_STATUS.DOCUMENTS_RECEIVED,
  APPLICATION_STATUS.FINANCIAL_REVIEW,
  APPLICATION_STATUS.FINANCIAL_APPROVED,
  APPLICATION_STATUS.FINANCIAL_DENIED,
] as const;

/**
 * States where criminal background check is PERMITTED
 */
export const POST_CONDITIONAL_STATES: readonly ApplicationStatus[] = [
  APPLICATION_STATUS.CONDITIONAL_OFFER,
  APPLICATION_STATUS.CRIMINAL_CHECK_PENDING,
  APPLICATION_STATUS.CRIMINAL_CHECK_COMPLETE,
  APPLICATION_STATUS.INDIVIDUAL_ASSESSMENT,
  APPLICATION_STATUS.ASSESSMENT_ADDITIONAL_INFO,
  APPLICATION_STATUS.APPROVED,
  APPLICATION_STATUS.DENIED,
] as const;

/**
 * Check if criminal background check can be initiated for given status
 * @throws Error with compliance message if check is prohibited
 */
export function canInitiateCriminalCheck(status: ApplicationStatus): boolean {
  return POST_CONDITIONAL_STATES.includes(status);
}

/**
 * Validate that a criminal check can be initiated
 * @throws Error if check is prohibited
 */
export function assertCanInitiateCriminalCheck(status: ApplicationStatus): void {
  if (!canInitiateCriminalCheck(status)) {
    throw new Error(
      `Fair Chance Housing Act Violation: Criminal background check cannot be initiated ` +
      `before conditional offer. Current status: ${status}. ` +
      `Application must reach '${APPLICATION_STATUS.CONDITIONAL_OFFER}' status first.`
    );
  }
}

// =============================================================================
// LISTING STATUS
// =============================================================================

export const LISTING_STATUS = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  PUBLISHED: 'published',
  RENTED: 'rented',
  EXPIRED: 'expired',
  ARCHIVED: 'archived',
} as const;

export type ListingStatus = (typeof LISTING_STATUS)[keyof typeof LISTING_STATUS];

// =============================================================================
// PAYMENT TYPES
// =============================================================================

export const PAYMENT_TYPES = {
  APPLICATION_FEE: 'application_fee',
  SECURITY_DEPOSIT: 'security_deposit',
  FIRST_MONTH_RENT: 'first_month_rent',
  MONTHLY_RENT: 'monthly_rent',
  BROKER_FEE: 'broker_fee',
  LATE_FEE: 'late_fee',
  PET_DEPOSIT: 'pet_deposit',
} as const;

export type PaymentType = (typeof PAYMENT_TYPES)[keyof typeof PAYMENT_TYPES];

// =============================================================================
// BROKER FEE PAYER
// =============================================================================

export const BROKER_FEE_PAID_BY = {
  LANDLORD: 'landlord',
  TENANT: 'tenant',
} as const;

export type BrokerFeePaidBy = (typeof BROKER_FEE_PAID_BY)[keyof typeof BROKER_FEE_PAID_BY];

// =============================================================================
// NYC HOLIDAYS (for Fair Chance Act business day calculations)
// =============================================================================

export const NYC_HOLIDAYS_2025 = [
  new Date('2025-01-01'), // New Year's Day
  new Date('2025-01-20'), // MLK Day
  new Date('2025-02-17'), // Presidents Day
  new Date('2025-05-26'), // Memorial Day
  new Date('2025-06-19'), // Juneteenth
  new Date('2025-07-04'), // Independence Day
  new Date('2025-09-01'), // Labor Day
  new Date('2025-10-13'), // Columbus Day
  new Date('2025-11-11'), // Veterans Day
  new Date('2025-11-27'), // Thanksgiving
  new Date('2025-12-25'), // Christmas
] as const;

/**
 * Calculate deadline date adding business days (excludes weekends and NYC holidays)
 */
export function addBusinessDays(startDate: Date, businessDays: number): Date {
  const result = new Date(startDate);
  let addedDays = 0;
  
  while (addedDays < businessDays) {
    result.setDate(result.getDate() + 1);
    
    const dayOfWeek = result.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = NYC_HOLIDAYS_2025.some(
      holiday => holiday.toDateString() === result.toDateString()
    );
    
    if (!isWeekend && !isHoliday) {
      addedDays++;
    }
  }
  
  return result;
}

/**
 * Calculate Fair Chance Act individual assessment deadline
 */
export function calculateAssessmentDeadline(criminalCheckCompleteDate: Date): Date {
  return addBusinessDays(criminalCheckCompleteDate, FAIR_CHANCE_ASSESSMENT_BUSINESS_DAYS);
}
