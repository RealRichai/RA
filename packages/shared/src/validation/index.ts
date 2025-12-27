/**
 * RealRiches Shared Validation Schemas
 * 
 * Zod schemas for input validation across the platform.
 * These schemas enforce FARE Act compliance at the validation layer.
 */

import { z } from 'zod';
import {
  FARE_ACT_MAX_APPLICATION_FEE,
  FARE_ACT_MAX_SECURITY_DEPOSIT_MONTHS,
  MARKETS,
  USER_ROLES,
  APPLICATION_STATUS,
  LISTING_STATUS,
  BROKER_FEE_PAID_BY,
  NYC_BOROUGHS,
  LONG_ISLAND_COUNTIES,
  isNYCMarket,
} from '../constants/index.js';

// =============================================================================
// PRIMITIVE SCHEMAS
// =============================================================================

export const emailSchema = z
  .string()
  .email('Invalid email address')
  .min(1, 'Email is required')
  .max(255, 'Email too long');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{9,14}$/, 'Invalid phone number format')
  .optional()
  .nullable();

export const uuidSchema = z.string().uuid('Invalid ID format');

export const moneySchema = z
  .number()
  .nonnegative('Amount cannot be negative')
  .multipleOf(0.01, 'Amount must have at most 2 decimal places');

export const positiveIntSchema = z
  .number()
  .int('Must be a whole number')
  .positive('Must be greater than 0');

// =============================================================================
// ENUM SCHEMAS
// =============================================================================

export const marketSchema = z.enum([MARKETS.NYC, MARKETS.LONG_ISLAND]);

export const userRoleSchema = z.enum([
  USER_ROLES.TENANT,
  USER_ROLES.LANDLORD,
  USER_ROLES.AGENT,
  USER_ROLES.INVESTOR,
  USER_ROLES.ADMIN,
]);

export const applicationStatusSchema = z.enum([
  APPLICATION_STATUS.DRAFT,
  APPLICATION_STATUS.SUBMITTED,
  APPLICATION_STATUS.DOCUMENTS_REQUESTED,
  APPLICATION_STATUS.DOCUMENTS_RECEIVED,
  APPLICATION_STATUS.FINANCIAL_REVIEW,
  APPLICATION_STATUS.FINANCIAL_APPROVED,
  APPLICATION_STATUS.FINANCIAL_DENIED,
  APPLICATION_STATUS.CONDITIONAL_OFFER,
  APPLICATION_STATUS.CRIMINAL_CHECK_PENDING,
  APPLICATION_STATUS.CRIMINAL_CHECK_COMPLETE,
  APPLICATION_STATUS.INDIVIDUAL_ASSESSMENT,
  APPLICATION_STATUS.ASSESSMENT_ADDITIONAL_INFO,
  APPLICATION_STATUS.APPROVED,
  APPLICATION_STATUS.DENIED,
  APPLICATION_STATUS.WITHDRAWN,
  APPLICATION_STATUS.EXPIRED,
]);

export const listingStatusSchema = z.enum([
  LISTING_STATUS.DRAFT,
  LISTING_STATUS.PENDING_REVIEW,
  LISTING_STATUS.PUBLISHED,
  LISTING_STATUS.RENTED,
  LISTING_STATUS.EXPIRED,
  LISTING_STATUS.ARCHIVED,
]);

export const brokerFeePaidBySchema = z.enum([
  BROKER_FEE_PAID_BY.LANDLORD,
  BROKER_FEE_PAID_BY.TENANT,
]);

export const boroughSchema = z.enum([...NYC_BOROUGHS, ...LONG_ISLAND_COUNTIES]);

// =============================================================================
// AUTH SCHEMAS
// =============================================================================

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  role: userRoleSchema,
  phone: phoneSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// =============================================================================
// LISTING SCHEMAS - FARE ACT COMPLIANT
// =============================================================================

/**
 * Base listing schema without market-specific validation
 */
const baseListingSchema = z.object({
  market: marketSchema,
  address: z.string().min(1, 'Address is required').max(500),
  unit: z.string().max(50).optional().nullable(),
  borough: boroughSchema,
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code'),
  
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().min(0).max(20).multipleOf(0.5),
  squareFeet: positiveIntSchema.optional().nullable(),
  propertyType: z.string().min(1).max(50),
  
  price: moneySchema.positive('Rent must be greater than 0'),
  securityDeposit: moneySchema,
  applicationFee: moneySchema,
  brokerFee: moneySchema,
  brokerFeePaidBy: brokerFeePaidBySchema,
  
  amenities: z.array(z.string().max(100)).max(50).default([]),
  petPolicy: z.string().max(500).optional().nullable(),
  laundry: z.string().max(100).optional().nullable(),
  parking: z.string().max(100).optional().nullable(),
  
  virtualTourUrl: z.string().url().optional().nullable(),
  
  title: z.string().min(10, 'Title must be at least 10 characters').max(200),
  description: z.string().min(50, 'Description must be at least 50 characters').max(5000),
  
  availableDate: z.coerce.date(),
});

/**
 * Create listing schema with FARE Act compliance validation
 */
export const createListingSchema = baseListingSchema.superRefine((data, ctx) => {
  // FARE Act compliance for NYC listings
  if (isNYCMarket(data.market)) {
    // Application fee cap: $20
    if (data.applicationFee > FARE_ACT_MAX_APPLICATION_FEE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `FARE Act Violation: Application fee cannot exceed $${FARE_ACT_MAX_APPLICATION_FEE} in NYC`,
        path: ['applicationFee'],
      });
    }
    
    // Security deposit cap: 1 month's rent
    const maxSecurityDeposit = data.price * FARE_ACT_MAX_SECURITY_DEPOSIT_MONTHS;
    if (data.securityDeposit > maxSecurityDeposit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `FARE Act Violation: Security deposit cannot exceed 1 month's rent ($${maxSecurityDeposit.toFixed(2)}) in NYC`,
        path: ['securityDeposit'],
      });
    }
    
    // Broker fee warning (not error, but tracked)
    if (data.brokerFeePaidBy === BROKER_FEE_PAID_BY.TENANT && data.brokerFee > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'FARE Act Warning: Under FARE Act, broker fees are typically paid by landlord. Tenant payment requires explicit agreement.',
        path: ['brokerFeePaidBy'],
      });
    }
  }
  
  // Validate borough matches market
  const nycBoroughs: readonly string[] = NYC_BOROUGHS;
  const liBoroughs: readonly string[] = LONG_ISLAND_COUNTIES;
  
  if (isNYCMarket(data.market) && !nycBoroughs.includes(data.borough)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Borough must be a NYC borough for NYC market listings',
      path: ['borough'],
    });
  }
  
  if (!isNYCMarket(data.market) && !liBoroughs.includes(data.borough)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'County must be Nassau or Suffolk for Long Island market listings',
      path: ['borough'],
    });
  }
});

export const updateListingSchema = baseListingSchema.partial();

// =============================================================================
// APPLICATION SCHEMAS
// =============================================================================

export const createApplicationSchema = z.object({
  listingId: uuidSchema,
  annualIncome: moneySchema.optional().nullable(),
  employerName: z.string().max(200).optional().nullable(),
  employmentLength: z.number().int().min(0).optional().nullable(),
  hasPets: z.boolean().default(false),
  petDetails: z.object({
    type: z.string(),
    breed: z.string().optional(),
    weight: z.number().optional(),
  }).optional().nullable(),
  emergencyContact: z.object({
    name: z.string(),
    phone: z.string(),
    relationship: z.string(),
  }).optional().nullable(),
});

/**
 * Schema for initiating criminal background check
 * Enforces Fair Chance Housing Act timing requirements
 */
export const initiateCriminalCheckSchema = z.object({
  applicationId: uuidSchema,
  conditionalOfferAt: z.coerce.date({
    required_error: 'Conditional offer timestamp is required before criminal check',
  }),
}).refine(
  (data) => data.conditionalOfferAt <= new Date(),
  {
    message: 'Conditional offer must be made before initiating criminal check',
    path: ['conditionalOfferAt'],
  }
);

/**
 * Schema for individual assessment (Fair Chance Housing Act)
 */
export const individualAssessmentSchema = z.object({
  applicationId: uuidSchema,
  factorsConsidered: z.array(z.enum([
    'time_since_offense',
    'age_at_time_of_offense',
    'nature_of_offense',
    'evidence_of_rehabilitation',
    'employment_history',
    'personal_references',
    'mitigating_circumstances',
  ])).min(1, 'At least one assessment factor must be considered'),
  analysisNotes: z.string().min(50, 'Analysis notes must be at least 50 characters'),
  directRelationship: z.string().optional().nullable(),
  decision: z.enum(['approve', 'deny']),
  decisionReason: z.string().min(20, 'Decision reason is required'),
});

// =============================================================================
// SEARCH & FILTER SCHEMAS
// =============================================================================

export const listingSearchSchema = z.object({
  market: marketSchema.optional(),
  boroughs: z.array(boroughSchema).optional(),
  minPrice: moneySchema.optional(),
  maxPrice: moneySchema.optional(),
  minBedrooms: z.number().int().min(0).optional(),
  maxBedrooms: z.number().int().min(0).optional(),
  minBathrooms: z.number().min(0).optional(),
  maxBathrooms: z.number().min(0).optional(),
  amenities: z.array(z.string()).optional(),
  petFriendly: z.boolean().optional(),
  availableFrom: z.coerce.date().optional(),
  availableTo: z.coerce.date().optional(),
  sortBy: z.enum(['price', 'bedrooms', 'createdAt', 'availableDate']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

// =============================================================================
// PAYMENT SCHEMAS
// =============================================================================

export const createPaymentSchema = z.object({
  applicationId: uuidSchema.optional(),
  leaseId: uuidSchema.optional(),
  type: z.enum([
    'application_fee',
    'security_deposit',
    'first_month_rent',
    'monthly_rent',
    'broker_fee',
    'late_fee',
    'pet_deposit',
  ]),
  amount: moneySchema.positive('Payment amount must be greater than 0'),
  description: z.string().max(500).optional(),
}).refine(
  (data) => data.applicationId || data.leaseId,
  {
    message: 'Either applicationId or leaseId is required',
  }
);

// =============================================================================
// EXPORT SCHEMA TYPES
// =============================================================================

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type InitiateCriminalCheckInput = z.infer<typeof initiateCriminalCheckSchema>;
export type IndividualAssessmentInput = z.infer<typeof individualAssessmentSchema>;
export type ListingSearchInput = z.infer<typeof listingSearchSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
