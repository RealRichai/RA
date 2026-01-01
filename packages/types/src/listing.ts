import { z } from 'zod';

import {
  AddressSchema,
  AuditFieldsSchema,
  MoneySchema,
  UUIDSchema
} from './common';
import { AmenitySchema, PropertyTypeSchema } from './property';

// ============================================================================
// Listing Types
// ============================================================================

export const ListingStatusSchema = z.enum([
  'draft',
  'pending_review',
  'active',
  'paused',
  'rented',
  'expired',
  'archived',
]);
export type ListingStatus = z.infer<typeof ListingStatusSchema>;

export const ListingTypeSchema = z.enum([
  'rental',
  'sale',
  'sublease',
  'roommate',
]);
export type ListingType = z.infer<typeof ListingTypeSchema>;

export const LeaseTermSchema = z.enum([
  'month_to_month',
  '3_months',
  '6_months',
  '1_year',
  '2_years',
  'flexible',
]);
export type LeaseTerm = z.infer<typeof LeaseTermSchema>;

export const ListingSchema = z.object({
  id: UUIDSchema,
  propertyId: UUIDSchema,
  unitId: UUIDSchema.optional(),
  agentId: UUIDSchema.optional(),
  landlordId: UUIDSchema,

  // Basic info
  title: z.string().min(10).max(200),
  description: z.string().min(50).max(5000),
  type: ListingTypeSchema,
  status: ListingStatusSchema,

  // Pricing
  price: MoneySchema,
  securityDeposit: MoneySchema.optional(),
  applicationFee: MoneySchema.optional(),
  brokerFee: MoneySchema.optional(),
  hasBrokerFee: z.boolean().default(false),
  isNoFee: z.boolean().default(false),
  priceNegotiable: z.boolean().default(false),
  concessions: z.string().optional(), // e.g., "1 month free"

  // Property details (denormalized for search)
  address: AddressSchema,
  propertyType: PropertyTypeSchema,
  bedrooms: z.number().int().min(0),
  bathrooms: z.number().min(0),
  squareFeet: z.number().int().positive().optional(),
  floor: z.number().int().optional(),
  totalFloors: z.number().int().optional(),

  // Lease terms
  availableDate: z.coerce.date(),
  leaseTerm: LeaseTermSchema,
  minLeaseTerm: z.number().int().min(1).optional(), // In months
  maxLeaseTerm: z.number().int().optional(),
  moveInCosts: z.object({
    firstMonth: z.boolean().default(true),
    lastMonth: z.boolean().default(false),
    securityDeposit: z.boolean().default(true),
    brokerFee: z.boolean().default(false),
  }),

  // Amenities & features
  amenities: z.array(AmenitySchema).default([]),
  highlights: z.array(z.string()).max(10).default([]),
  includedUtilities: z.array(z.enum([
    'electric',
    'gas',
    'water',
    'heat',
    'hot_water',
    'internet',
    'cable',
    'trash',
  ])).default([]),

  // Pet policy
  petsAllowed: z.boolean().default(false),
  petPolicy: z.object({
    dogsAllowed: z.boolean().default(false),
    catsAllowed: z.boolean().default(false),
    maxPets: z.number().int().min(0).optional(),
    maxWeight: z.number().optional(),
    petDeposit: MoneySchema.optional(),
    monthlyPetRent: MoneySchema.optional(),
    restrictedBreeds: z.array(z.string()).default([]),
  }).optional(),

  // Requirements
  requirements: z.object({
    minCreditScore: z.number().int().min(300).max(850).optional(),
    minIncome: z.number().int().optional(), // Annual income
    incomeMultiplier: z.number().optional(), // e.g., 40x rent
    guarantorAccepted: z.boolean().default(true),
    backgroundCheck: z.boolean().default(true),
    employmentVerification: z.boolean().default(true),
    landlordReferences: z.number().int().min(0).default(0),
    noEvictions: z.boolean().default(true),
  }),

  // Media
  images: z.array(z.object({
    id: UUIDSchema,
    url: z.string().url(),
    caption: z.string().optional(),
    isPrimary: z.boolean().default(false),
    order: z.number().int().min(0),
    roomType: z.string().optional(),
  })).default([]),
  floorPlanUrl: z.string().url().optional(),
  virtualTourUrl: z.string().url().optional(),
  videoTourUrl: z.string().url().optional(),
  model3dUrl: z.string().url().optional(), // 3DGS/VR

  // Visibility & syndication
  isPublished: z.boolean().default(false),
  publishedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  syndicateTo: z.array(z.enum([
    'zillow',
    'trulia',
    'realtor',
    'apartments',
    'streeteasy',
    'hotpads',
    'rentals',
    'facebook',
  ])).default([]),
  syndicationStatus: z.record(z.enum(['pending', 'active', 'error', 'disabled'])).optional(),

  // Analytics
  viewCount: z.number().int().min(0).default(0),
  inquiryCount: z.number().int().min(0).default(0),
  applicationCount: z.number().int().min(0).default(0),
  saveCount: z.number().int().min(0).default(0),
  shareCount: z.number().int().min(0).default(0),

  // Market context
  marketId: z.string(),
  neighborhood: z.string().optional(),
  marketComps: z.array(z.object({
    listingId: UUIDSchema,
    price: MoneySchema,
    daysOnMarket: z.number().int(),
  })).optional(),

  // Compliance
  isCompliant: z.boolean().default(true),
  complianceIssues: z.array(z.string()).default([]),
  fareActCompliant: z.boolean().default(true),

  // Featured/promoted
  isFeatured: z.boolean().default(false),
  featuredUntil: z.coerce.date().optional(),
  promotionLevel: z.enum(['none', 'basic', 'premium', 'spotlight']).default('none'),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type Listing = z.infer<typeof ListingSchema>;

// Listing inquiry
export const ListingInquirySchema = z.object({
  id: UUIDSchema,
  listingId: UUIDSchema,
  userId: UUIDSchema.optional(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().max(2000),
  preferredContactMethod: z.enum(['email', 'phone', 'text']).default('email'),
  moveInDate: z.coerce.date().optional(),
  prequalified: z.boolean().default(false),
  status: z.enum(['new', 'contacted', 'showing_scheduled', 'applied', 'closed']).default('new'),
  source: z.string().optional(),
  assignedTo: UUIDSchema.optional(),
  notes: z.string().optional(),
  scheduledShowingDate: z.coerce.date().optional(),
}).merge(AuditFieldsSchema);
export type ListingInquiry = z.infer<typeof ListingInquirySchema>;

// Showing/tour
export const ShowingSchema = z.object({
  id: UUIDSchema,
  listingId: UUIDSchema,
  inquiryId: UUIDSchema.optional(),
  agentId: UUIDSchema.optional(),
  prospectId: UUIDSchema.optional(),
  prospectName: z.string(),
  prospectEmail: z.string().email(),
  prospectPhone: z.string().optional(),
  scheduledAt: z.coerce.date(),
  duration: z.number().int().min(15).default(30), // Minutes
  type: z.enum(['in_person', 'virtual', 'self_guided']),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']),
  confirmationCode: z.string().optional(),
  accessInstructions: z.string().optional(),
  feedback: z.object({
    rating: z.number().int().min(1).max(5).optional(),
    interested: z.boolean().optional(),
    comments: z.string().optional(),
  }).optional(),
  remindersSent: z.number().int().default(0),
}).merge(AuditFieldsSchema);
export type Showing = z.infer<typeof ShowingSchema>;

// Create/update schemas
export const CreateListingRequestSchema = ListingSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  viewCount: true,
  inquiryCount: true,
  applicationCount: true,
  saveCount: true,
  shareCount: true,
  syndicationStatus: true,
  publishedAt: true,
  isCompliant: true,
  complianceIssues: true,
});
export type CreateListingRequest = z.infer<typeof CreateListingRequestSchema>;

export const UpdateListingRequestSchema = CreateListingRequestSchema.partial();
export type UpdateListingRequest = z.infer<typeof UpdateListingRequestSchema>;

// Listing search/filter
export const ListingFilterSchema = z.object({
  search: z.string().optional(),
  type: ListingTypeSchema.optional(),
  status: ListingStatusSchema.optional(),
  landlordId: UUIDSchema.optional(),
  agentId: UUIDSchema.optional(),
  propertyId: UUIDSchema.optional(),
  marketId: z.string().optional(),
  city: z.string().optional(),
  neighborhood: z.string().optional(),
  postalCode: z.string().optional(),
  propertyTypes: z.array(PropertyTypeSchema).optional(),
  minPrice: z.number().int().min(0).optional(),
  maxPrice: z.number().int().optional(),
  minBedrooms: z.number().int().min(0).optional(),
  maxBedrooms: z.number().int().optional(),
  minBathrooms: z.number().min(0).optional(),
  minSquareFeet: z.number().int().positive().optional(),
  maxSquareFeet: z.number().int().optional(),
  amenities: z.array(AmenitySchema).optional(),
  isNoFee: z.boolean().optional(),
  petsAllowed: z.boolean().optional(),
  availableBefore: z.coerce.date().optional(),
  availableAfter: z.coerce.date().optional(),
  leaseTerm: LeaseTermSchema.optional(),
  bounds: z.object({
    ne: z.object({ lat: z.number(), lng: z.number() }),
    sw: z.object({ lat: z.number(), lng: z.number() }),
  }).optional(),
});
export type ListingFilter = z.infer<typeof ListingFilterSchema>;
