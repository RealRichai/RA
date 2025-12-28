/**
 * RealRiches Shared Types
 * Core type definitions used across all applications
 */

// ============================================================================
// RESULT TYPE - Functional Error Handling
// ============================================================================

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export const Ok = <T>(data: T): Result<T, never> => ({ success: true, data });
export const Err = <E>(error: E): Result<never, E> => ({ success: false, error });

// ============================================================================
// ERROR CODES
// ============================================================================

export const ErrorCode = {
  // Authentication (1xxx)
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  INVALID_TOKEN: 'INVALID_TOKEN',
  CREDENTIALS_INVALID: 'CREDENTIALS_INVALID',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  MFA_REQUIRED: 'MFA_REQUIRED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  EMAIL_EXISTS: 'EMAIL_EXISTS',

  // Authorization (2xxx)
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  ROLE_REQUIRED: 'ROLE_REQUIRED',
  FEATURE_DISABLED: 'FEATURE_DISABLED',

  // Validation (3xxx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',

  // Resource (4xxx)
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  GONE: 'GONE',
  DUPLICATE: 'DUPLICATE',

  // Business Logic (5xxx)
  FARE_ACT_VIOLATION: 'FARE_ACT_VIOLATION',
  FCHA_VIOLATION: 'FCHA_VIOLATION',
  APPLICATION_CLOSED: 'APPLICATION_CLOSED',
  LEASE_NOT_SIGNABLE: 'LEASE_NOT_SIGNABLE',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',

  // External Services (6xxx)
  STRIPE_ERROR: 'STRIPE_ERROR',
  DOCUSIGN_ERROR: 'DOCUSIGN_ERROR',
  PLAID_ERROR: 'PLAID_ERROR',
  SEAM_ERROR: 'SEAM_ERROR',
  SENDGRID_ERROR: 'SENDGRID_ERROR',

  // System (9xxx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  MAINTENANCE_MODE: 'MAINTENANCE_MODE',
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
    totalPages: number;
  };
}

// ============================================================================
// USER & AUTH TYPES
// ============================================================================

export const UserRole = {
  TENANT: 'TENANT',
  LANDLORD: 'LANDLORD',
  AGENT: 'AGENT',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];

export const UserStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DEACTIVATED: 'DEACTIVATED',
} as const;

export type UserStatus = typeof UserStatus[keyof typeof UserStatus];

export interface User {
  id: string;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JWTPayload {
  /**
   * App-level user id. This is what our auth plugin signs into tokens and
   * what route handlers should use for authorization.
   */
  userId: string;

  /**
   * Optional JWT subject (kept for interoperability / legacy).
   * Prefer `userId` in application code.
   */
  sub?: string;

  email: string;
  role: UserRole;
  sessionId?: string;

  // Standard JWT timestamps (populated by the JWT library)
  iat: number;
  exp: number;
}
// ============================================================================
// LISTING TYPES
// ============================================================================

export const ListingStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  ACTIVE: 'ACTIVE',
  RENTED: 'RENTED',
  EXPIRED: 'EXPIRED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type ListingStatus = typeof ListingStatus[keyof typeof ListingStatus];

export const PropertyType = {
  APARTMENT: 'APARTMENT',
  CONDO: 'CONDO',
  TOWNHOUSE: 'TOWNHOUSE',
  HOUSE: 'HOUSE',
  STUDIO: 'STUDIO',
  LOFT: 'LOFT',
  PENTHOUSE: 'PENTHOUSE',
} as const;

export type PropertyType = typeof PropertyType[keyof typeof PropertyType];

export const BrokerFeeResponsibility = {
  TENANT: 'TENANT',
  LANDLORD: 'LANDLORD',
  SPLIT: 'SPLIT',
  NO_FEE: 'NO_FEE',
} as const;

export type BrokerFeeResponsibility = typeof BrokerFeeResponsibility[keyof typeof BrokerFeeResponsibility];

export interface Listing {
  id: string;
  title: string;
  description: string;
  propertyType: PropertyType;
  status: ListingStatus;
  
  // Location
  address: string;
  unit?: string;
  city: string;
  state: string;
  zipCode: string;
  neighborhood?: string;
  latitude?: number;
  longitude?: number;
  
  // Details
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number;
  floorNumber?: number;
  totalFloors?: number;
  
  // Pricing (FARE Act Compliant)
  monthlyRent: number;
  securityDeposit: number;
  brokerFee?: number;
  brokerFeeResponsibility: BrokerFeeResponsibility;
  applicationFee: number; // Max $20 per FARE Act
  
  // Features
  amenities: string[];
  images: string[];
  virtualTourUrl?: string;
  
  // Availability
  availableDate: Date;
  leaseTermMonths: number;
  
  // Relationships
  landlordId: string;
  agentId?: string;
  marketId: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// APPLICATION TYPES
// ============================================================================

export const ApplicationStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  PENDING_DOCUMENTS: 'PENDING_DOCUMENTS',
  CONDITIONALLY_APPROVED: 'CONDITIONALLY_APPROVED',
  FCHA_PENDING: 'FCHA_PENDING',
  FCHA_REVIEW: 'FCHA_REVIEW',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
  WITHDRAWN: 'WITHDRAWN',
  EXPIRED: 'EXPIRED',
} as const;

export type ApplicationStatus = typeof ApplicationStatus[keyof typeof ApplicationStatus];

export interface Application {
  id: string;
  listingId: string;
  tenantId: string;
  status: ApplicationStatus;
  
  // Employment
  employerName?: string;
  jobTitle?: string;
  annualIncome?: number;
  employmentStartDate?: Date;
  
  // Financial
  creditScore?: number;
  monthlyDebt?: number;
  bankBalance?: number;
  
  // FCHA Fields (Fair Chance Housing Act)
  fchaDisclosureRequired: boolean;
  fchaDisclosureProvided: boolean;
  fchaAssessmentStatus?: 'PENDING' | 'APPROVED' | 'DENIED';
  fchaAssessmentDate?: Date;
  
  // Documents
  documents: ApplicationDocument[];
  
  // FARE Act
  applicationFeeAmount: number;
  applicationFeePaid: boolean;
  applicationFeePaymentId?: string;
  
  submittedAt?: Date;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationDocument {
  id: string;
  applicationId: string;
  type: 'ID' | 'INCOME' | 'EMPLOYMENT' | 'BANK_STATEMENT' | 'TAX_RETURN' | 'OTHER';
  name: string;
  url: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  uploadedAt: Date;
}

// ============================================================================
// LEASE TYPES
// ============================================================================

export const LeaseStatus = {
  DRAFT: 'DRAFT',
  PENDING_SIGNATURE: 'PENDING_SIGNATURE',
  ACTIVE: 'ACTIVE',
  RENEWED: 'RENEWED',
  EXPIRED: 'EXPIRED',
  TERMINATED: 'TERMINATED',
} as const;

export type LeaseStatus = typeof LeaseStatus[keyof typeof LeaseStatus];

export interface Lease {
  id: string;
  listingId: string;
  applicationId: string;
  tenantId: string;
  landlordId: string;
  
  status: LeaseStatus;
  
  // Terms
  startDate: Date;
  endDate: Date;
  monthlyRent: number;
  securityDeposit: number;
  
  // Signatures
  tenantSignedAt?: Date;
  landlordSignedAt?: Date;
  docuSignEnvelopeId?: string;
  signedDocumentUrl?: string;
  
  // Renewal
  renewalOffered: boolean;
  renewalOfferDate?: Date;
  renewalAccepted?: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// PAYMENT TYPES
// ============================================================================

export const PaymentStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;

export type PaymentStatus = typeof PaymentStatus[keyof typeof PaymentStatus];

export const PaymentType = {
  RENT: 'RENT',
  SECURITY_DEPOSIT: 'SECURITY_DEPOSIT',
  APPLICATION_FEE: 'APPLICATION_FEE',
  BROKER_FEE: 'BROKER_FEE',
  LATE_FEE: 'LATE_FEE',
  UTILITY: 'UTILITY',
  OTHER: 'OTHER',
} as const;

export type PaymentType = typeof PaymentType[keyof typeof PaymentType];

export interface Payment {
  id: string;
  leaseId?: string;
  applicationId?: string;
  payerId: string;
  recipientId: string;
  
  type: PaymentType;
  status: PaymentStatus;
  
  amount: number;
  currency: string;
  platformFee: number;
  netAmount: number;
  
  stripePaymentIntentId?: string;
  stripeTransferId?: string;
  
  dueDate?: Date;
  paidAt?: Date;
  
  description?: string;
  metadata?: Record<string, unknown>;
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// AGENT TYPES
// ============================================================================

export const AgentStatus = {
  PENDING_VETTING: 'PENDING_VETTING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  INACTIVE: 'INACTIVE',
} as const;

export type AgentStatus = typeof AgentStatus[keyof typeof AgentStatus];

export interface Agent {
  id: string;
  userId: string;
  
  // License
  licenseNumber: string;
  licenseState: string;
  licenseExpiry: Date;
  licenseVerified: boolean;
  
  // Profile
  bio?: string;
  specialties: string[];
  serviceAreas: string[];
  languages: string[];
  
  // Ratings
  averageRating: number;
  totalReviews: number;
  
  // Commission
  commissionRate: number;
  totalCommissionsEarned: number;
  pendingCommissions: number;
  
  // Status
  status: AgentStatus;
  fareActCertified: boolean;
  fchaCertified: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  attachments?: MessageAttachment[];
  readAt?: Date;
  createdAt: Date;
}

export interface MessageAttachment {
  id: string;
  type: 'IMAGE' | 'DOCUMENT' | 'LINK';
  url: string;
  name?: string;
}

export interface Conversation {
  id: string;
  participants: string[];
  listingId?: string;
  applicationId?: string;
  lastMessageAt: Date;
  createdAt: Date;
}

// ============================================================================
// MARKET TYPES
// ============================================================================

export interface Market {
  id: string;
  name: string;
  state: string;
  timezone: string;
  enabled: boolean;
  
  // Regulations
  fareActApplies: boolean;
  fchaApplies: boolean;
  maxApplicationFee: number;
  maxSecurityDepositMonths: number;
  
  // Stats
  totalListings: number;
  averageRent: number;
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export const NotificationType = {
  APPLICATION_SUBMITTED: 'APPLICATION_SUBMITTED',
  APPLICATION_APPROVED: 'APPLICATION_APPROVED',
  APPLICATION_DENIED: 'APPLICATION_DENIED',
  APPLICATION_UPDATE: 'APPLICATION_UPDATE',
  NEW_APPLICATION: 'NEW_APPLICATION',
  LEASE_READY: 'LEASE_READY',
  LEASE_SIGNED: 'LEASE_SIGNED',
  PAYMENT_DUE: 'PAYMENT_DUE',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
  LISTING_FAVORITED: 'LISTING_FAVORITED',
  FCHA_ASSESSMENT_REQUIRED: 'FCHA_ASSESSMENT_REQUIRED',
  FCHA_ASSESSMENT_COMPLETE: 'FCHA_ASSESSMENT_COMPLETE',
  LICENSE_VERIFICATION: 'LICENSE_VERIFICATION',
} as const;

export type NotificationType = typeof NotificationType[keyof typeof NotificationType];

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}