/**
 * Listing Schemas
 * Zod validation schemas with market-aware compliance rules
 */

import { z } from 'zod';
import { ListingType, PropertyType, ListingStatus } from '@prisma/client';

// =============================================================================
// ENUMS
// =============================================================================

export const ListingTypeEnum = z.nativeEnum(ListingType);
export const PropertyTypeEnum = z.nativeEnum(PropertyType);
export const ListingStatusEnum = z.nativeEnum(ListingStatus);

// =============================================================================
// BASE SCHEMAS
// =============================================================================

export const AddressSchema = z.object({
  address: z.string().min(5).max(200),
  unit: z.string().max(20).optional(),
  city: z.string().min(2).max(100),
  state: z.string().length(2).default('NY'),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format'),
  neighborhood: z.string().max(100).optional(),
  borough: z.string().max(50).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const PropertyDetailsSchema = z.object({
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().min(0.5).max(20).multipleOf(0.5),
  squareFeet: z.number().int().min(100).max(50000).optional(),
  floor: z.number().int().min(-2).max(200).optional(),
  totalFloors: z.number().int().min(1).max(200).optional(),
  yearBuilt: z.number().int().min(1800).max(new Date().getFullYear() + 2).optional(),
});

export const PricingSchema = z.object({
  rentPrice: z.number().min(0).max(1000000).optional(),
  salePrice: z.number().min(0).max(100000000).optional(),
  securityDeposit: z.number().min(0).max(100000).optional(),
  brokerFee: z.number().min(0).max(100000).optional(),
  brokerFeePercent: z.number().min(0).max(20).optional(),
  applicationFee: z.number().min(0).max(20).default(20), // NY state max
});

export const LeaseTermsSchema = z.object({
  availableDate: z.coerce.date().optional(),
  leaseTermMonths: z.number().int().min(1).max(36).default(12),
});

export const AmenitiesSchema = z.object({
  amenities: z.array(z.string().max(50)).max(50).default([]),
  utilitiesIncluded: z.array(z.string().max(50)).max(20).default([]),
  petPolicy: z.string().max(500).optional(),
});

export const MediaSchema = z.object({
  photos: z.array(z.object({
    url: z.string().url(),
    caption: z.string().max(200).optional(),
    order: z.number().int().min(0).optional(),
    isPrimary: z.boolean().optional(),
  })).max(50).default([]),
  virtualTourUrl: z.string().url().optional(),
  floorPlanUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
});

// =============================================================================
// FARE ACT SCHEMAS (NYC Only)
// =============================================================================

export const FareActDisclosureSchema = z.object({
  brokerFeePaidBy: z.enum(['tenant', 'landlord', 'split']),
  brokerFeeAmount: z.number().min(0),
  brokerFeeDisclosure: z.string(),
  totalMoveInCost: z.number().min(0),
  disclosureAcknowledged: z.boolean().default(false),
  disclosureAcknowledgedAt: z.coerce.date().optional(),
});

// =============================================================================
// CREATE LISTING
// =============================================================================

export const CreateListingSchema = z.object({
  ownerId: z.string().cuid(),
  agentId: z.string().cuid().optional(),
  type: ListingTypeEnum,
  propertyType: PropertyTypeEnum,
  title: z.string().min(10).max(200),
  description: z.string().min(50).max(5000),
})
  .merge(AddressSchema)
  .merge(PropertyDetailsSchema)
  .merge(PricingSchema)
  .merge(LeaseTermsSchema)
  .merge(AmenitiesSchema)
  .merge(MediaSchema)
  .refine(
    (data) => {
      // Must have rent price for rental listings
      if (data.type === ListingType.RENTAL || data.type === ListingType.RENTAL_OR_SALE) {
        return data.rentPrice !== undefined && data.rentPrice > 0;
      }
      return true;
    },
    { message: 'Rental listings must have a rent price', path: ['rentPrice'] }
  )
  .refine(
    (data) => {
      // Must have sale price for sale listings
      if (data.type === ListingType.SALE || data.type === ListingType.RENTAL_OR_SALE) {
        return data.salePrice !== undefined && data.salePrice > 0;
      }
      return true;
    },
    { message: 'Sale listings must have a sale price', path: ['salePrice'] }
  )
  .refine(
    (data) => {
      // Security deposit cannot exceed one month rent (NY law)
      if (data.rentPrice && data.securityDeposit) {
        return data.securityDeposit <= data.rentPrice;
      }
      return true;
    },
    { message: 'Security deposit cannot exceed one month rent per NY law', path: ['securityDeposit'] }
  )
  .refine(
    (data) => {
      // Application fee cannot exceed $20 (NY law)
      return data.applicationFee <= 20;
    },
    { message: 'Application fee cannot exceed $20 per NY law', path: ['applicationFee'] }
  );

export type CreateListingInput = z.infer<typeof CreateListingSchema>;

// =============================================================================
// UPDATE LISTING
// =============================================================================

export const UpdateListingSchema = z.object({
  title: z.string().min(10).max(200).optional(),
  description: z.string().min(50).max(5000).optional(),
  rentPrice: z.number().min(0).max(1000000).optional(),
  salePrice: z.number().min(0).max(100000000).optional(),
  securityDeposit: z.number().min(0).max(100000).optional(),
  brokerFee: z.number().min(0).max(100000).optional(),
  brokerFeePercent: z.number().min(0).max(20).optional(),
  availableDate: z.coerce.date().optional(),
  leaseTermMonths: z.number().int().min(1).max(36).optional(),
  amenities: z.array(z.string().max(50)).max(50).optional(),
  utilitiesIncluded: z.array(z.string().max(50)).max(20).optional(),
  petPolicy: z.string().max(500).optional(),
  photos: z.array(z.object({
    url: z.string().url(),
    caption: z.string().max(200).optional(),
    order: z.number().int().min(0).optional(),
    isPrimary: z.boolean().optional(),
  })).max(50).optional(),
  virtualTourUrl: z.string().url().optional().nullable(),
  floorPlanUrl: z.string().url().optional().nullable(),
  videoUrl: z.string().url().optional().nullable(),
});

export type UpdateListingInput = z.infer<typeof UpdateListingSchema>;

// =============================================================================
// SEARCH LISTINGS
// =============================================================================

export const SearchListingsSchema = z.object({
  // Market filters
  marketId: z.enum(['nyc', 'long-island']).optional(),
  submarketId: z.string().optional(),
  zipCodes: z.array(z.string().regex(/^\d{5}$/)).optional(),
  
  // Property filters
  type: ListingTypeEnum.optional(),
  propertyType: PropertyTypeEnum.optional(),
  status: ListingStatusEnum.optional(),
  
  // Price filters
  minRent: z.number().min(0).optional(),
  maxRent: z.number().min(0).optional(),
  
  // Property details filters
  bedrooms: z.number().int().min(0).optional(),
  minBedrooms: z.number().int().min(0).optional(),
  maxBedrooms: z.number().int().min(0).optional(),
  minBathrooms: z.number().min(0).optional(),
  minSquareFeet: z.number().int().min(0).optional(),
  maxSquareFeet: z.number().int().min(0).optional(),
  
  // Amenities filters
  amenities: z.array(z.string()).optional(),
  petFriendly: z.boolean().optional(),
  
  // Availability
  availableBefore: z.coerce.date().optional(),
  availableAfter: z.coerce.date().optional(),
  
  // Pagination
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  
  // Sorting
  sortBy: z.enum(['rentPrice', 'createdAt', 'availableDate', 'squareFeet']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type SearchListingsInput = z.infer<typeof SearchListingsSchema>;

// =============================================================================
// PUBLISH LISTING
// =============================================================================

export const PublishListingSchema = z.object({
  listingId: z.string().cuid(),
  // FARE Act disclosure (required for NYC)
  fareActDisclosure: FareActDisclosureSchema.optional(),
  // Confirm compliance acknowledgment
  complianceAcknowledged: z.boolean().refine(val => val === true, {
    message: 'You must acknowledge compliance with all applicable regulations',
  }),
});

export type PublishListingInput = z.infer<typeof PublishListingSchema>;

// =============================================================================
// MARKET ANALYTICS
// =============================================================================

export const MarketAnalyticsSchema = z.object({
  marketId: z.enum(['nyc', 'long-island']),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('month'),
});

export type MarketAnalyticsInput = z.infer<typeof MarketAnalyticsSchema>;

// =============================================================================
// COMMON AMENITIES (for UI suggestions)
// =============================================================================

export const COMMON_AMENITIES = [
  'Doorman',
  'Elevator',
  'Laundry in Building',
  'Laundry in Unit',
  'Dishwasher',
  'Air Conditioning',
  'Central Air',
  'Hardwood Floors',
  'Stainless Steel Appliances',
  'Granite Countertops',
  'Walk-in Closet',
  'Balcony',
  'Terrace',
  'Roof Deck',
  'Gym',
  'Pool',
  'Concierge',
  'Package Room',
  'Bike Storage',
  'Storage Unit',
  'Parking',
  'Garage',
  'Pet Friendly',
  'No Fee',
  'Furnished',
  'Fireplace',
  'Exposed Brick',
  'High Ceilings',
  'Natural Light',
  'City Views',
  'Water Views',
] as const;

export const COMMON_UTILITIES = [
  'Heat',
  'Hot Water',
  'Electricity',
  'Gas',
  'Water',
  'Cable',
  'Internet',
  'Trash',
] as const;

export const PET_POLICIES = [
  'No Pets',
  'Cats Only',
  'Dogs Only',
  'Cats and Dogs',
  'Small Pets Only',
  'Case by Case',
] as const;
