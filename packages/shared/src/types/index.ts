/**
 * RealRiches Shared Types
 * 
 * Type definitions shared across all packages.
 * These types ensure consistency between frontend and backend.
 */

import type {
  Market,
  UserRole,
  ApplicationStatus,
  ListingStatus,
  PaymentType,
  BrokerFeePaidBy,
  NYCBorough,
  LongIslandCounty,
} from '../constants/index.js';

// =============================================================================
// USER TYPES
// =============================================================================

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  phone: string | null;
  phoneVerified: boolean;
  avatarUrl: string | null;
  role: UserRole;
  status: 'pending_verification' | 'active' | 'suspended' | 'deactivated';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface LandlordProfile {
  id: string;
  userId: string;
  companyName: string | null;
  licenseNumber: string | null;
  licenseVerified: boolean;
  stripeAccountId: string | null;
  stripeOnboarded: boolean;
  totalUnits: number;
  activeListings: number;
}

export interface TenantProfile {
  id: string;
  userId: string;
  identityVerified: boolean;
  identityVerifiedAt: Date | null;
  incomeVerified: boolean;
  incomeVerifiedAt: Date | null;
  preferredBoroughs: NYCBorough[];
  minBudget: number | null;
  maxBudget: number | null;
  minBedrooms: number | null;
}

export interface AgentProfile {
  id: string;
  userId: string;
  licenseNumber: string;
  licenseState: string;
  licenseVerified: boolean;
  licenseExpiry: Date | null;
  brokerageName: string | null;
  brokerageAddress: string | null;
  totalDeals: number;
  rating: number | null;
}

// =============================================================================
// LISTING TYPES
// =============================================================================

export interface Listing {
  id: string;
  landlordId: string;
  agentId: string | null;
  status: ListingStatus;
  market: Market;
  
  // Location
  address: string;
  unit: string | null;
  borough: NYCBorough | LongIslandCounty;
  zipCode: string;
  latitude: number | null;
  longitude: number | null;
  
  // Property details
  bedrooms: number;
  bathrooms: number;
  squareFeet: number | null;
  propertyType: string;
  
  // Pricing - FARE Act compliant
  price: number;
  securityDeposit: number;
  applicationFee: number;
  brokerFee: number;
  brokerFeePaidBy: BrokerFeePaidBy;
  
  // FARE Act compliance
  fareActCompliant: boolean;
  fareActValidatedAt: Date | null;
  fareActViolations: FareActViolation[] | null;
  
  // Features
  amenities: string[];
  petPolicy: string | null;
  laundry: string | null;
  parking: string | null;
  
  // Media
  photos: ListingPhoto[];
  virtualTourUrl: string | null;
  
  // Content
  title: string;
  description: string;
  
  // Dates
  availableDate: Date;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface ListingPhoto {
  id: string;
  listingId: string;
  url: string;
  caption: string | null;
  order: number;
  isPrimary: boolean;
}

// =============================================================================
// FARE ACT COMPLIANCE TYPES
// =============================================================================

export interface FareActViolation {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface FareActComplianceResult {
  isCompliant: boolean;
  violations: FareActViolation[];
  isNYC: boolean;
  moveInCosts: MoveInCosts;
  landlordBrokerFee: number;
}

export interface MoveInCosts {
  firstMonth: number;
  securityDeposit: number;
  brokerFee: number;
  applicationFee: number;
  total: number;
}

export interface FareActInput {
  market: Market;
  price: number;
  securityDeposit: number;
  applicationFee: number;
  brokerFee: number;
  brokerFeePaidBy: BrokerFeePaidBy;
}

// =============================================================================
// APPLICATION TYPES
// =============================================================================

export interface Application {
  id: string;
  tenantId: string;
  listingId: string;
  status: ApplicationStatus;
  
  // Fair Chance Housing Act compliance timestamps
  submittedAt: Date | null;
  financialReviewAt: Date | null;
  financialDecisionAt: Date | null;
  
  // Critical: Conditional offer MUST be timestamped BEFORE criminal check
  conditionalOfferAt: Date | null;
  conditionalOfferBy: string | null;
  
  // Criminal check (ONLY after conditionalOfferAt)
  criminalCheckInitAt: Date | null;
  criminalCheckCompleteAt: Date | null;
  
  // Individual assessment
  assessmentStartedAt: Date | null;
  assessmentDeadline: Date | null;
  assessmentCompletedAt: Date | null;
  
  // Final decision
  finalDecisionAt: Date | null;
  denialReason: DenialReason | null;
  denialExplanation: string | null;
  
  // Application data
  annualIncome: number | null;
  employerName: string | null;
  employmentLength: number | null;
  hasPets: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export type DenialReason =
  | 'insufficient_income'
  | 'poor_credit_history'
  | 'negative_rental_history'
  | 'incomplete_application'
  | 'failed_identity_verification'
  | 'criminal_history_direct_relationship'
  | 'criminal_history_safety_risk'
  | 'landlord_withdrew_listing'
  | 'other';

export interface ApplicationStatusChange {
  id: string;
  applicationId: string;
  fromStatus: ApplicationStatus;
  toStatus: ApplicationStatus;
  changedBy: string;
  changedAt: Date;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

// =============================================================================
// INDIVIDUAL ASSESSMENT TYPES (Fair Chance Housing Act)
// =============================================================================

export type AssessmentFactor =
  | 'time_since_offense'
  | 'age_at_time_of_offense'
  | 'nature_of_offense'
  | 'evidence_of_rehabilitation'
  | 'employment_history'
  | 'personal_references'
  | 'mitigating_circumstances';

export interface IndividualAssessment {
  id: string;
  applicationId: string;
  factorsConsidered: AssessmentFactor[];
  evidenceProvided: unknown;
  analysisNotes: string;
  directRelationship: string | null;
  decision: 'approve' | 'deny';
  decisionReason: string;
  createdAt: Date;
  completedAt: Date | null;
  completedBy: string | null;
}

// =============================================================================
// LEASE TYPES
// =============================================================================

export interface Lease {
  id: string;
  listingId: string;
  landlordId: string;
  tenantId: string;
  status: 'draft' | 'pending_signatures' | 'partially_signed' | 'fully_executed' | 'active' | 'expired' | 'terminated' | 'renewed';
  
  // Terms
  startDate: Date;
  endDate: Date;
  monthlyRent: number;
  securityDeposit: number;
  
  // FARE Act fields
  applicationFeeCharged: number;
  brokerFeeAmount: number;
  brokerFeePaidBy: BrokerFeePaidBy;
  
  // DocuSign
  docusignEnvelopeId: string | null;
  docusignStatus: string | null;
  
  // Signatures
  landlordSignedAt: Date | null;
  tenantSignedAt: Date | null;
  fullyExecutedAt: Date | null;
  
  // Document
  documentUrl: string | null;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// PAYMENT TYPES
// =============================================================================

export interface Payment {
  id: string;
  applicationId: string | null;
  leaseId: string | null;
  type: PaymentType;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'disputed';
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  stripeRefundId: string | null;
  description: string | null;
  createdAt: Date;
  processedAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: never;
}

export interface ApiError {
  success: false;
  data?: never;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

// =============================================================================
// AUTH TYPES
// =============================================================================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phone?: string;
}
