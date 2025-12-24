/**
 * Shared Types
 * TypeScript interfaces matching the API
 */

// =============================================================================
// ENUMS
// =============================================================================

export type UserRole = 'TENANT' | 'LANDLORD' | 'AGENT' | 'INVESTOR' | 'ADMIN' | 'SUPER_ADMIN';
export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
export type SubscriptionTier = 'FREE' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';

export type ListingType = 'RENTAL' | 'SALE' | 'RENTAL_OR_SALE';
export type ListingStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'RENTED' | 'SOLD' | 'ARCHIVED' | 'EXPIRED';
export type PropertyType = 'STUDIO' | 'ONE_BEDROOM' | 'TWO_BEDROOM' | 'THREE_BEDROOM' | 'FOUR_PLUS_BEDROOM' | 'TOWNHOUSE' | 'PENTHOUSE' | 'LOFT' | 'DUPLEX' | 'HOUSE' | 'MULTI_FAMILY';

export type ApplicationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'SCREENING' | 'CONDITIONAL_OFFER' | 'APPROVED' | 'DENIED' | 'WITHDRAWN' | 'LEASE_SENT' | 'LEASE_SIGNED';
export type LeaseStatus = 'DRAFT' | 'PENDING_SIGNATURE' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'RENEWED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';
export type PaymentType = 'RENT' | 'SECURITY_DEPOSIT' | 'BROKER_FEE' | 'APPLICATION_FEE' | 'LATE_FEE' | 'UTILITY' | 'MAINTENANCE' | 'OTHER';

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'SHOWING_SCHEDULED' | 'APPLICATION_STARTED' | 'CONVERTED' | 'LOST';
export type TourStatus = 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export type NotificationChannel = 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP' | 'IMESSAGE';
export type NotificationType = 'LEASE_EXPIRING' | 'PAYMENT_DUE' | 'PAYMENT_RECEIVED' | 'NEW_APPLICATION' | 'APPLICATION_UPDATE' | 'TOUR_SCHEDULED' | 'TOUR_REMINDER' | 'NEW_MESSAGE' | 'SYSTEM';

// =============================================================================
// USER
// =============================================================================

export interface User {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: string;
  avatarUrl?: string;
  timezone: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  licenseNumber?: string;
  licenseState?: string;
  licenseExpiry?: string;
  brokerageName?: string;
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

// =============================================================================
// LISTINGS
// =============================================================================

export interface ListingPhoto {
  url: string;
  caption?: string;
  isPrimary?: boolean;
  order: number;
}

export interface Listing {
  id: string;
  ownerId: string;
  agentId?: string;
  type: ListingType;
  status: ListingStatus;
  propertyType: PropertyType;
  title: string;
  description: string;
  address: string;
  unit?: string;
  city: string;
  state: string;
  zipCode: string;
  neighborhood?: string;
  borough?: string;
  latitude?: number;
  longitude?: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number;
  floor?: number;
  totalFloors?: number;
  yearBuilt?: number;
  rentPrice?: number;
  salePrice?: number;
  securityDeposit?: number;
  brokerFee?: number;
  brokerFeePercent?: number;
  applicationFee?: number;
  fareActCompliant: boolean;
  availableDate?: string;
  leaseTermMonths?: number;
  amenities: string[];
  utilitiesIncluded: string[];
  petPolicy?: string;
  photos: ListingPhoto[];
  virtualTourUrl?: string;
  floorPlanUrl?: string;
  videoUrl?: string;
  aiDescription?: string;
  aiHighlights?: string[];
  viewCount: number;
  inquiryCount: number;
  applicationCount: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  owner?: User;
  agent?: User;
}

// =============================================================================
// APPLICATIONS
// =============================================================================

export interface Application {
  id: string;
  applicantId: string;
  listingId: string;
  status: ApplicationStatus;
  employmentStatus: string;
  employerName?: string;
  jobTitle?: string;
  monthlyIncome: number;
  employmentStartDate?: string;
  creditScore?: number;
  hasBankruptcy: boolean;
  hasEvictions: boolean;
  currentAddress?: string;
  currentLandlordName?: string;
  currentLandlordPhone?: string;
  currentRent?: number;
  moveInDate?: string;
  reasonForMoving?: string;
  numberOfOccupants: number;
  hasPets: boolean;
  petDetails?: string;
  backgroundCheckStatus?: string;
  creditCheckStatus?: string;
  incomeVerified?: boolean;
  employmentVerified?: boolean;
  landlordReferenceStatus?: string;
  criminalHistoryDeferred: boolean;
  guarantorRequired?: boolean;
  applicationFee: number;
  applicationFeePaidAt?: string;
  decisionNotes?: string;
  decisionDate?: string;
  additionalNotes?: string;
  createdAt: string;
  updatedAt: string;
  applicant?: User;
  listing?: Listing;
}

// =============================================================================
// LEASES
// =============================================================================

export interface Lease {
  id: string;
  listingId: string;
  applicationId?: string;
  tenantId: string;
  landlordId: string;
  agentId?: string;
  status: LeaseStatus;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  securityDeposit: number;
  brokerFee?: number;
  terms?: string;
  specialConditions?: string;
  signedAt?: string;
  signedByTenant?: string;
  signedByLandlord?: string;
  renewalDecision?: string;
  renewalDecisionDate?: string;
  createdAt: string;
  updatedAt: string;
  listing?: Listing;
  tenant?: User;
  landlord?: User;
  agent?: User;
}

// =============================================================================
// PAYMENTS
// =============================================================================

export interface Payment {
  id: string;
  leaseId: string;
  payerId: string;
  type: PaymentType;
  amount: number;
  status: PaymentStatus;
  dueDate: string;
  paidAt?: string;
  description?: string;
  processorId?: string;
  processorFee?: number;
  failureReason?: string;
  refundedAt?: string;
  refundReason?: string;
  createdAt: string;
  updatedAt: string;
  lease?: Lease;
  payer?: User;
}

// =============================================================================
// LEADS & TOURS
// =============================================================================

export interface Lead {
  id: string;
  listingId?: string;
  agentId?: string;
  status: LeadStatus;
  source?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  preferredContactMethod?: string;
  propertyPreferences?: Record<string, unknown>;
  budget?: number;
  moveInTimeline?: string;
  notes?: string;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  createdAt: string;
  updatedAt: string;
  listing?: Listing;
  agent?: User;
}

export interface Tour {
  id: string;
  listingId: string;
  leadId?: string;
  agentId?: string;
  status: TourStatus;
  scheduledAt: string;
  duration: number;
  accessCode?: string;
  notes?: string;
  feedback?: string;
  createdAt: string;
  updatedAt: string;
  listing?: Listing;
  lead?: Lead;
  agent?: User;
}

// =============================================================================
// NOTIFICATIONS
// =============================================================================

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  channels: NotificationChannel[];
  data?: Record<string, unknown>;
  actionUrl?: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  readAt?: string;
  sentAt?: string;
  createdAt: string;
  isNew?: boolean;
}

// =============================================================================
// FEEDBACK
// =============================================================================

export interface AgentFeedback {
  id: string;
  agentId: string;
  providerId: string;
  leaseId?: string;
  providerType: 'TENANT' | 'LANDLORD';
  isAnonymous: boolean;
  category: string;
  reasonCode: string;
  rating: number;
  strengths?: string;
  areasForImprovement: string;
  additionalComments?: string;
  acknowledgedAt?: string;
  agentResponse?: string;
  createdAt: string;
  agent?: User;
  provider?: User;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}
