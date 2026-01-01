import { z } from 'zod';

import { AuditFieldsSchema, MoneySchema, UUIDSchema } from './common';

// ============================================================================
// Move-in Commerce Types (Utilities, Moving, Vendor Marketplace)
// ============================================================================

export const ServiceCategorySchema = z.enum([
  'utilities',
  'moving',
  'cleaning',
  'insurance',
  'storage',
  'furniture_rental',
  'pet_services',
  'home_services',
  'tv_internet',
  'security',
]);
export type ServiceCategory = z.infer<typeof ServiceCategorySchema>;

export const UtilityTypeSchema = z.enum([
  'electric',
  'gas',
  'water',
  'trash',
  'recycling',
  'internet',
  'cable',
  'phone',
  'security_system',
]);
export type UtilityType = z.infer<typeof UtilityTypeSchema>;

// Utility Provider
export const UtilityProviderSchema = z.object({
  id: UUIDSchema,
  type: UtilityTypeSchema,
  name: z.string(),
  logoUrl: z.string().optional(),
  website: z.string().url().optional(),
  phone: z.string().optional(),

  // Service area
  serviceAreas: z.array(z.string()), // ZIP codes
  states: z.array(z.string()),
  cities: z.array(z.string()).optional(),

  // Setup
  supportsOnlineSignup: z.boolean().default(false),
  signupUrl: z.string().optional(),
  averageSetupTime: z.string().optional(), // e.g., "2-3 business days"
  setupFee: MoneySchema.optional(),
  requiresDeposit: z.boolean().default(false),
  depositAmount: MoneySchema.optional(),

  // Integration
  isPartner: z.boolean().default(false),
  apiIntegrated: z.boolean().default(false),
  referralCode: z.string().optional(),
  commissionRate: z.number().optional(), // Percentage

  isActive: z.boolean().default(true),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type UtilityProvider = z.infer<typeof UtilityProviderSchema>;

// Utility Setup Request
export const UtilitySetupRequestSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  leaseId: UUIDSchema,
  propertyId: UUIDSchema,
  unitId: UUIDSchema.optional(),

  utilityType: UtilityTypeSchema,
  providerId: UUIDSchema.optional(),

  // Request details
  serviceAddress: z.object({
    street1: z.string(),
    street2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
  }),
  desiredStartDate: z.coerce.date(),
  accountHolderName: z.string(),
  phone: z.string(),
  email: z.string().email(),

  // Status
  status: z.enum([
    'pending',
    'submitted',
    'processing',
    'active',
    'failed',
    'cancelled',
  ]),

  // Provider response
  accountNumber: z.string().optional(),
  confirmationNumber: z.string().optional(),
  actualStartDate: z.coerce.date().optional(),
  monthlyEstimate: MoneySchema.optional(),

  // Error handling
  errorMessage: z.string().optional(),
  retryCount: z.number().int().default(0),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type UtilitySetupRequest = z.infer<typeof UtilitySetupRequestSchema>;

// Moving Service
export const MovingServiceSchema = z.object({
  id: UUIDSchema,
  name: z.string(),
  companyName: z.string(),
  logoUrl: z.string().optional(),
  website: z.string().url().optional(),
  phone: z.string(),
  email: z.string().email().optional(),

  // Service type
  serviceTypes: z.array(z.enum([
    'local',
    'long_distance',
    'international',
    'packing',
    'unpacking',
    'storage',
    'specialty_items', // Piano, art, etc.
    'junk_removal',
  ])),

  // Service area
  serviceAreas: z.array(z.string()),
  maxDistance: z.number().optional(), // Miles

  // Pricing
  minimumCharge: MoneySchema.optional(),
  hourlyRate: MoneySchema.optional(),
  perMileRate: MoneySchema.optional(),
  packingRate: MoneySchema.optional(),

  // Credentials
  dotNumber: z.string().optional(),
  mcNumber: z.string().optional(),
  isLicensed: z.boolean().default(false),
  isInsured: z.boolean().default(false),
  insuranceAmount: MoneySchema.optional(),

  // Ratings
  averageRating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().default(0),
  completedMoves: z.number().int().default(0),

  // Partnership
  isPartner: z.boolean().default(false),
  commissionRate: z.number().optional(),
  discountForTenants: z.number().optional(), // Percentage

  isActive: z.boolean().default(true),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type MovingService = z.infer<typeof MovingServiceSchema>;

// Moving Quote Request
export const MovingQuoteRequestSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  leaseId: UUIDSchema.optional(),

  // Move details
  moveType: z.enum(['local', 'long_distance', 'international']),
  moveDate: z.coerce.date(),
  flexibleDates: z.boolean().default(false),

  // Origin
  originAddress: z.object({
    street1: z.string(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    floor: z.number().int().optional(),
    hasElevator: z.boolean().optional(),
    hasStairs: z.boolean().optional(),
    parkingDistance: z.string().optional(),
  }),

  // Destination
  destinationAddress: z.object({
    street1: z.string(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    floor: z.number().int().optional(),
    hasElevator: z.boolean().optional(),
    hasStairs: z.boolean().optional(),
    parkingDistance: z.string().optional(),
  }),

  // Inventory
  homeSize: z.enum(['studio', '1_bedroom', '2_bedroom', '3_bedroom', '4_bedroom', '5+_bedroom', 'house']),
  estimatedItems: z.number().int().optional(),
  specialItems: z.array(z.string()).default([]), // Piano, pool table, etc.

  // Services needed
  packingNeeded: z.boolean().default(false),
  unpackingNeeded: z.boolean().default(false),
  storageNeeded: z.boolean().default(false),
  storageDuration: z.string().optional(),

  // Contact
  contactName: z.string(),
  contactPhone: z.string(),
  contactEmail: z.string().email(),
  preferredContactMethod: z.enum(['email', 'phone', 'text']),

  // Status
  status: z.enum(['submitted', 'quotes_received', 'booked', 'completed', 'cancelled']),

  // Quotes received
  quotes: z.array(z.object({
    providerId: UUIDSchema,
    providerName: z.string(),
    quoteAmount: MoneySchema,
    isBinding: z.boolean(),
    validUntil: z.coerce.date(),
    notes: z.string().optional(),
    selected: z.boolean().default(false),
  })).default([]),

  selectedProviderId: UUIDSchema.optional(),
  bookedAt: z.coerce.date().optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type MovingQuoteRequest = z.infer<typeof MovingQuoteRequestSchema>;

// Vendor Marketplace
export const MarketplaceVendorSchema = z.object({
  id: UUIDSchema,
  organizationId: UUIDSchema.optional(),

  // Business info
  name: z.string(),
  companyName: z.string(),
  description: z.string(),
  logoUrl: z.string().optional(),
  coverImageUrl: z.string().optional(),
  website: z.string().url().optional(),
  phone: z.string(),
  email: z.string().email(),

  // Categories
  categories: z.array(ServiceCategorySchema),
  subcategories: z.array(z.string()).default([]),
  services: z.array(z.object({
    name: z.string(),
    description: z.string(),
    price: MoneySchema.optional(),
    priceType: z.enum(['fixed', 'hourly', 'quote']).optional(),
  })).default([]),

  // Service area
  serviceAreas: z.array(z.string()),
  serviceRadius: z.number().optional(), // Miles

  // Credentials
  isLicensed: z.boolean().default(false),
  licenseNumber: z.string().optional(),
  isInsured: z.boolean().default(false),
  isBonded: z.boolean().default(false),
  backgroundChecked: z.boolean().default(false),

  // Ratings
  averageRating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().default(0),
  completedJobs: z.number().int().default(0),
  responseTime: z.string().optional(), // e.g., "Within 2 hours"

  // Partnership
  isPartner: z.boolean().default(false),
  partnerTier: z.enum(['standard', 'preferred', 'premier']).optional(),
  commissionRate: z.number().optional(),
  tenantDiscount: z.number().optional(),

  // Availability
  availability: z.object({
    monday: z.boolean().default(true),
    tuesday: z.boolean().default(true),
    wednesday: z.boolean().default(true),
    thursday: z.boolean().default(true),
    friday: z.boolean().default(true),
    saturday: z.boolean().default(false),
    sunday: z.boolean().default(false),
    emergency: z.boolean().default(false),
  }),

  // Status
  status: z.enum(['active', 'inactive', 'pending_review', 'suspended']),
  verifiedAt: z.coerce.date().optional(),
  featuredUntil: z.coerce.date().optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type MarketplaceVendor = z.infer<typeof MarketplaceVendorSchema>;

// Service Request (for marketplace)
export const ServiceRequestSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  vendorId: UUIDSchema.optional(),
  propertyId: UUIDSchema.optional(),
  leaseId: UUIDSchema.optional(),

  // Request info
  category: ServiceCategorySchema,
  serviceName: z.string(),
  description: z.string(),

  // Scheduling
  preferredDate: z.coerce.date().optional(),
  preferredTimeSlot: z.string().optional(),
  isFlexible: z.boolean().default(true),
  isUrgent: z.boolean().default(false),

  // Location
  serviceAddress: z.object({
    street1: z.string(),
    street2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    accessInstructions: z.string().optional(),
  }),

  // Contact
  contactName: z.string(),
  contactPhone: z.string(),
  contactEmail: z.string().email(),

  // Status
  status: z.enum([
    'submitted',
    'vendor_assigned',
    'scheduled',
    'in_progress',
    'completed',
    'cancelled',
  ]),

  // Quotes
  quotes: z.array(z.object({
    vendorId: UUIDSchema,
    amount: MoneySchema,
    notes: z.string().optional(),
    validUntil: z.coerce.date(),
    selected: z.boolean().default(false),
  })).default([]),

  // Completion
  scheduledDate: z.coerce.date().optional(),
  completedDate: z.coerce.date().optional(),
  finalAmount: MoneySchema.optional(),
  paymentId: UUIDSchema.optional(),

  // Review
  rating: z.number().int().min(1).max(5).optional(),
  review: z.string().optional(),
  reviewedAt: z.coerce.date().optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type ServiceRequest = z.infer<typeof ServiceRequestSchema>;

// Move-in Checklist
export const MoveInChecklistSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  leaseId: UUIDSchema,

  moveInDate: z.coerce.date(),

  tasks: z.array(z.object({
    id: z.string(),
    category: z.enum(['utilities', 'moving', 'insurance', 'documents', 'keys', 'other']),
    title: z.string(),
    description: z.string().optional(),
    isRequired: z.boolean().default(false),
    isCompleted: z.boolean().default(false),
    completedAt: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    linkedEntityType: z.string().optional(),
    linkedEntityId: UUIDSchema.optional(),
    notes: z.string().optional(),
  })).default([]),

  completionPercentage: z.number().min(0).max(100).default(0),

  // AI recommendations
  aiRecommendations: z.array(z.object({
    type: z.string(),
    title: z.string(),
    description: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    actionUrl: z.string().optional(),
    dismissed: z.boolean().default(false),
  })).default([]),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type MoveInChecklist = z.infer<typeof MoveInChecklistSchema>;

// Referral tracking
export const ReferralSchema = z.object({
  id: UUIDSchema,
  referrerId: UUIDSchema,
  referredId: UUIDSchema.optional(),
  vendorId: UUIDSchema.optional(),

  type: z.enum(['tenant_referral', 'vendor_booking', 'service_signup']),
  code: z.string(),

  // Status
  status: z.enum(['pending', 'qualified', 'completed', 'expired', 'cancelled']),
  qualifiedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),

  // Reward
  rewardType: z.enum(['cash', 'credit', 'points', 'discount']),
  rewardAmount: z.number(),
  rewardClaimed: z.boolean().default(false),
  rewardClaimedAt: z.coerce.date().optional(),

  // Transaction
  relatedServiceId: UUIDSchema.optional(),
  transactionAmount: MoneySchema.optional(),
  commissionAmount: MoneySchema.optional(),

  expiresAt: z.coerce.date().optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type Referral = z.infer<typeof ReferralSchema>;
