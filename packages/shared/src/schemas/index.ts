/**
 * RealRiches Zod Validation Schemas
 * Comprehensive validation for all API inputs
 */

import { z } from 'zod';

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

export const emailSchema = z.string().email('Invalid email address');

export const phoneSchema = z.string().regex(
  /^\+?1?\d{10,14}$/,
  'Invalid phone number format'
);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const uuidSchema = z.string().uuid('Invalid ID format');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  data => !data.startDate || !data.endDate || data.startDate <= data.endDate,
  { message: 'Start date must be before end date' }
);

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  phone: phoneSchema.optional(),
  role: z.enum(['TENANT', 'LANDLORD', 'AGENT']).default('TENANT'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

// ============================================================================
// USER SCHEMAS
// ============================================================================

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  phone: phoneSchema.optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// ============================================================================
// LISTING SCHEMAS
// ============================================================================

export const propertyTypeSchema = z.enum([
  'APARTMENT', 'CONDO', 'TOWNHOUSE', 'HOUSE', 'STUDIO', 'LOFT', 'PENTHOUSE'
]);

export const listingStatusSchema = z.enum([
  'DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'RENTED', 'EXPIRED', 'ARCHIVED'
]);

export const brokerFeeResponsibilitySchema = z.enum([
  'TENANT', 'LANDLORD', 'SPLIT', 'NO_FEE'
]);

export const createListingSchema = z.object({
  title: z.string().min(10, 'Title must be at least 10 characters').max(200),
  description: z.string().min(50, 'Description must be at least 50 characters').max(5000),
  propertyType: propertyTypeSchema,
  
  // Location
  address: z.string().min(5, 'Address is required'),
  unit: z.string().max(20).optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().length(2, 'State must be 2 characters'),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code'),
  neighborhood: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  
  // Details
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().min(0).max(20),
  squareFeet: z.number().int().min(100).max(50000).optional(),
  floorNumber: z.number().int().min(0).max(200).optional(),
  totalFloors: z.number().int().min(1).max(200).optional(),
  
  // Pricing (FARE Act Compliant)
  monthlyRent: z.number().min(100, 'Monthly rent must be at least $100'),
  securityDeposit: z.number().min(0),
  brokerFee: z.number().min(0).optional(),
  brokerFeeResponsibility: brokerFeeResponsibilitySchema.default('LANDLORD'),
  applicationFee: z.number().min(0).max(20, 'Application fee cannot exceed $20 per FARE Act'),
  
  // Features
  amenities: z.array(z.string()).default([]),
  images: z.array(z.string().url()).min(1, 'At least one image is required'),
  virtualTourUrl: z.string().url().optional(),
  
  // Availability
  availableDate: z.coerce.date(),
  leaseTermMonths: z.number().int().min(1).max(36).default(12),
  
  // Agent
  agentId: uuidSchema.optional(),
  
  // Market
  marketId: uuidSchema,
});

export const updateListingSchema = createListingSchema.partial();

export const searchListingsSchema = z.object({
  ...paginationSchema.shape,
  
  // Location
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  neighborhood: z.string().optional(),
  marketId: uuidSchema.optional(),
  
  // Bounds
  minLat: z.coerce.number().optional(),
  maxLat: z.coerce.number().optional(),
  minLng: z.coerce.number().optional(),
  maxLng: z.coerce.number().optional(),
  
  // Filters
  propertyType: propertyTypeSchema.optional(),
  minBedrooms: z.coerce.number().int().min(0).optional(),
  maxBedrooms: z.coerce.number().int().optional(),
  minBathrooms: z.coerce.number().min(0).optional(),
  maxBathrooms: z.coerce.number().optional(),
  minRent: z.coerce.number().min(0).optional(),
  maxRent: z.coerce.number().optional(),
  minSquareFeet: z.coerce.number().int().optional(),
  maxSquareFeet: z.coerce.number().int().optional(),
  
  // Features
  amenities: z.array(z.string()).optional(),
  noFee: z.coerce.boolean().optional(),
  
  // Availability
  availableBefore: z.coerce.date().optional(),
  availableAfter: z.coerce.date().optional(),
  
  // Status
  status: listingStatusSchema.optional(),
  
  // Search
  query: z.string().optional(),
});

// ============================================================================
// APPLICATION SCHEMAS
// ============================================================================

export const applicationStatusSchema = z.enum([
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'PENDING_DOCUMENTS',
  'CONDITIONALLY_APPROVED', 'FCHA_PENDING', 'FCHA_REVIEW',
  'APPROVED', 'DENIED', 'WITHDRAWN', 'EXPIRED'
]);

export const createApplicationSchema = z.object({
  listingId: uuidSchema,
  
  // Personal Info
  dateOfBirth: z.coerce.date().optional(),
  ssn: z.string().regex(/^\d{4}$/, 'Enter last 4 digits of SSN').optional(),
  
  // Employment
  employerName: z.string().max(200).optional(),
  jobTitle: z.string().max(100).optional(),
  annualIncome: z.number().min(0).optional(),
  employmentStartDate: z.coerce.date().optional(),
  
  // Financial
  monthlyDebt: z.number().min(0).optional(),
  
  // References
  references: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
    phone: phoneSchema,
    email: emailSchema.optional(),
  })).max(3).optional(),
  
  // Emergency Contact
  emergencyContact: z.object({
    name: z.string(),
    relationship: z.string(),
    phone: phoneSchema,
  }).optional(),
});

export const updateApplicationSchema = createApplicationSchema.partial();

export const submitApplicationSchema = z.object({
  applicationId: uuidSchema,
  agreesToTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the terms' }),
  }),
  agreesToFareAct: z.literal(true, {
    errorMap: () => ({ message: 'You must acknowledge FARE Act disclosures' }),
  }),
});

// ============================================================================
// FCHA (Fair Chance Housing Act) SCHEMAS
// ============================================================================

export const fchaDisclosureSchema = z.object({
  applicationId: uuidSchema,
  hasConviction: z.boolean(),
  convictionDetails: z.string().max(5000).optional(),
  rehabilitationEvidence: z.string().max(5000).optional(),
  mitigatingFactors: z.string().max(5000).optional(),
});

export const fchaAssessmentSchema = z.object({
  applicationId: uuidSchema,
  decision: z.enum(['APPROVED', 'DENIED']),
  
  // Article 23-A Factors
  factors: z.object({
    publicPolicyConcern: z.number().int().min(1).max(5),
    jobRelatedness: z.number().int().min(1).max(5),
    timeSinceConviction: z.number().int().min(1).max(5),
    ageDuringOffense: z.number().int().min(1).max(5),
    offenseSeverity: z.number().int().min(1).max(5),
    rehabilitationEvidence: z.number().int().min(1).max(5),
    employerInterest: z.number().int().min(1).max(5),
    certificateOfRelief: z.boolean(),
  }),
  
  rationale: z.string().min(100, 'Detailed rationale required').max(10000),
});

// ============================================================================
// LEASE SCHEMAS
// ============================================================================

export const leaseStatusSchema = z.enum([
  'DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'RENEWED', 'EXPIRED', 'TERMINATED'
]);

export const createLeaseSchema = z.object({
  applicationId: uuidSchema,
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  monthlyRent: z.number().min(0),
  securityDeposit: z.number().min(0),
  specialTerms: z.string().max(10000).optional(),
}).refine(data => data.startDate < data.endDate, {
  message: 'Start date must be before end date',
  path: ['endDate'],
});

export const signLeaseSchema = z.object({
  leaseId: uuidSchema,
  signature: z.string().min(1, 'Signature is required'),
  signedAt: z.coerce.date().default(() => new Date()),
});

export const renewLeaseSchema = z.object({
  leaseId: uuidSchema,
  newEndDate: z.coerce.date(),
  newMonthlyRent: z.number().min(0).optional(),
});

// ============================================================================
// PAYMENT SCHEMAS
// ============================================================================

export const paymentTypeSchema = z.enum([
  'RENT', 'SECURITY_DEPOSIT', 'APPLICATION_FEE', 'BROKER_FEE', 'LATE_FEE', 'UTILITY', 'OTHER'
]);

export const paymentStatusSchema = z.enum([
  'PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED'
]);

export const createPaymentSchema = z.object({
  leaseId: uuidSchema.optional(),
  applicationId: uuidSchema.optional(),
  type: paymentTypeSchema,
  amount: z.number().min(0.5, 'Minimum payment is $0.50'),
  currency: z.string().length(3).default('usd'),
  description: z.string().max(500).optional(),
}).refine(data => data.leaseId || data.applicationId, {
  message: 'Either leaseId or applicationId is required',
});

export const createPaymentIntentSchema = z.object({
  paymentId: uuidSchema,
  paymentMethodId: z.string().optional(),
  savePaymentMethod: z.boolean().default(false),
});

export const refundPaymentSchema = z.object({
  paymentId: uuidSchema,
  amount: z.number().min(0.5).optional(), // Partial refund
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
});

// ============================================================================
// AGENT SCHEMAS
// ============================================================================

export const agentStatusSchema = z.enum([
  'PENDING_VETTING', 'ACTIVE', 'SUSPENDED', 'INACTIVE'
]);

export const createAgentProfileSchema = z.object({
  licenseNumber: z.string().min(1, 'License number is required'),
  licenseState: z.string().length(2, 'License state must be 2 characters'),
  licenseExpiry: z.coerce.date(),
  bio: z.string().max(2000).optional(),
  specialties: z.array(z.string()).max(10).default([]),
  serviceAreas: z.array(z.string()).max(20).default([]),
  languages: z.array(z.string()).max(10).default([]),
});

export const updateAgentProfileSchema = createAgentProfileSchema.partial();

export const agentReviewSchema = z.object({
  agentId: uuidSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  transactionId: uuidSchema.optional(), // Lease or application ID
});

// ============================================================================
// MESSAGE SCHEMAS
// ============================================================================

export const createMessageSchema = z.object({
  conversationId: uuidSchema.optional(),
  recipientId: uuidSchema,
  content: z.string().min(1, 'Message cannot be empty').max(5000),
  listingId: uuidSchema.optional(),
  applicationId: uuidSchema.optional(),
});

export const createConversationSchema = z.object({
  participantIds: z.array(uuidSchema).min(1).max(10),
  listingId: uuidSchema.optional(),
  applicationId: uuidSchema.optional(),
  initialMessage: z.string().min(1).max(5000).optional(),
});

// ============================================================================
// COMPLIANCE SCHEMAS
// ============================================================================

export const fareActDisclosureSchema = z.object({
  listingId: uuidSchema,
  brokerFeeAmount: z.number().min(0),
  brokerFeeResponsibility: brokerFeeResponsibilitySchema,
  applicationFeeAmount: z.number().min(0).max(20),
  moveInCosts: z.object({
    firstMonthRent: z.number(),
    securityDeposit: z.number(),
    brokerFee: z.number(),
    applicationFee: z.number(),
    otherFees: z.array(z.object({
      name: z.string(),
      amount: z.number(),
    })).default([]),
    total: z.number(),
  }),
});

// ============================================================================
// ADMIN SCHEMAS
// ============================================================================

export const adminUserSearchSchema = z.object({
  ...paginationSchema.shape,
  query: z.string().optional(),
  role: z.enum(['TENANT', 'LANDLORD', 'AGENT', 'ADMIN', 'SUPER_ADMIN']).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
});

export const adminUpdateUserSchema = z.object({
  userId: uuidSchema,
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
  role: z.enum(['TENANT', 'LANDLORD', 'AGENT', 'ADMIN', 'SUPER_ADMIN']).optional(),
  emailVerified: z.boolean().optional(),
});

export const adminSystemConfigSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  description: z.string().optional(),
});

// ============================================================================
// EXPORT TYPE INFERENCE
// ============================================================================

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
export type SearchListingsInput = z.infer<typeof searchListingsSchema>;
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type FCHADisclosureInput = z.infer<typeof fchaDisclosureSchema>;
export type FCHAAssessmentInput = z.infer<typeof fchaAssessmentSchema>;
export type CreateLeaseInput = z.infer<typeof createLeaseSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreateAgentProfileInput = z.infer<typeof createAgentProfileSchema>;
export type AgentReviewInput = z.infer<typeof agentReviewSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type FAREActDisclosureInput = z.infer<typeof fareActDisclosureSchema>;
