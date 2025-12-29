import { z } from 'zod';
import {
  AddressSchema,
  AuditFieldsSchema,
  MoneySchema,
  UUIDSchema
} from './common';

// ============================================================================
// Property Types
// ============================================================================

export const PropertyTypeSchema = z.enum([
  'single_family',
  'multi_family',
  'condo',
  'townhouse',
  'apartment',
  'studio',
  'loft',
  'duplex',
  'triplex',
  'fourplex',
  'commercial',
  'mixed_use',
  'land',
  'industrial',
  'retail',
  'office',
  'warehouse',
  'hotel',
  'special_purpose',
]);
export type PropertyType = z.infer<typeof PropertyTypeSchema>;

export const PropertyStatusSchema = z.enum([
  'active',
  'inactive',
  'pending',
  'under_renovation',
  'sold',
  'archived',
]);
export type PropertyStatus = z.infer<typeof PropertyStatusSchema>;

export const AmenitySchema = z.enum([
  'doorman',
  'elevator',
  'gym',
  'pool',
  'laundry_in_unit',
  'laundry_in_building',
  'parking',
  'garage',
  'storage',
  'balcony',
  'terrace',
  'roof_deck',
  'garden',
  'patio',
  'fireplace',
  'central_ac',
  'central_heat',
  'dishwasher',
  'hardwood_floors',
  'high_ceilings',
  'exposed_brick',
  'natural_light',
  'city_view',
  'water_view',
  'park_view',
  'pet_friendly',
  'cats_allowed',
  'dogs_allowed',
  'no_fee',
  'concierge',
  'package_room',
  'bike_room',
  'courtyard',
  'playground',
  'business_center',
  'coworking_space',
  'ev_charging',
  'smart_home',
  'furnished',
  'wheelchair_accessible',
]);
export type Amenity = z.infer<typeof AmenitySchema>;

export const PropertySchema = z.object({
  id: UUIDSchema,
  ownerId: UUIDSchema,
  managerId: UUIDSchema.optional(),
  name: z.string().min(1).max(200),
  address: AddressSchema,
  type: PropertyTypeSchema,
  status: PropertyStatusSchema,
  yearBuilt: z.number().int().min(1800).max(2100).optional(),
  totalUnits: z.number().int().min(1).default(1),
  totalSquareFeet: z.number().int().positive().optional(),
  lotSize: z.number().positive().optional(), // In acres
  stories: z.number().int().min(1).optional(),
  parkingSpaces: z.number().int().min(0).default(0),
  amenities: z.array(AmenitySchema).default([]),
  description: z.string().max(5000).optional(),
  notes: z.string().max(2000).optional(), // Internal notes
  taxParcelId: z.string().optional(),
  zoningCode: z.string().optional(),
  insurancePolicy: z.string().optional(),
  insuranceExpiry: z.coerce.date().optional(),
  lastInspectionDate: z.coerce.date().optional(),
  nextInspectionDate: z.coerce.date().optional(),
  acquisitionDate: z.coerce.date().optional(),
  acquisitionPrice: MoneySchema.optional(),
  currentValue: MoneySchema.optional(),
  mortgageBalance: MoneySchema.optional(),
  annualPropertyTax: MoneySchema.optional(),
  annualInsurance: MoneySchema.optional(),
  images: z.array(z.object({
    id: UUIDSchema,
    url: z.string().url(),
    caption: z.string().optional(),
    isPrimary: z.boolean().default(false),
    order: z.number().int().min(0),
  })).default([]),
  documents: z.array(UUIDSchema).default([]),
  complianceStatus: z.enum(['compliant', 'non_compliant', 'pending_review']).default('pending_review'),
  marketId: z.string(), // Market code (NYC, LA, etc.)
  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type Property = z.infer<typeof PropertySchema>;

// Unit within a property
export const UnitSchema = z.object({
  id: UUIDSchema,
  propertyId: UUIDSchema,
  unitNumber: z.string().min(1).max(20),
  floor: z.number().int().optional(),
  type: z.enum(['studio', '1br', '2br', '3br', '4br', '5br+', 'commercial', 'retail', 'office']),
  bedrooms: z.number().int().min(0),
  bathrooms: z.number().min(0),
  squareFeet: z.number().int().positive().optional(),
  marketRent: MoneySchema,
  currentRent: MoneySchema.optional(),
  status: z.enum(['vacant', 'occupied', 'pending', 'off_market', 'under_renovation']),
  leaseId: UUIDSchema.optional(),
  tenantId: UUIDSchema.optional(),
  amenities: z.array(AmenitySchema).default([]),
  features: z.array(z.string()).default([]),
  description: z.string().max(2000).optional(),
  images: z.array(z.object({
    id: UUIDSchema,
    url: z.string().url(),
    caption: z.string().optional(),
    isPrimary: z.boolean().default(false),
    order: z.number().int().min(0),
  })).default([]),
  floorPlanUrl: z.string().url().optional(),
  virtualTourUrl: z.string().url().optional(),
  lastRenovationDate: z.coerce.date().optional(),
  moveInReady: z.boolean().default(true),
  availableDate: z.coerce.date().optional(),
  isRentStabilized: z.boolean().default(false),
  legalRent: MoneySchema.optional(), // For rent-stabilized units
  preferentialRent: MoneySchema.optional(),
  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type Unit = z.infer<typeof UnitSchema>;

// Property creation/update
export const CreatePropertyRequestSchema = PropertySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  complianceStatus: true,
});
export type CreatePropertyRequest = z.infer<typeof CreatePropertyRequestSchema>;

export const UpdatePropertyRequestSchema = CreatePropertyRequestSchema.partial();
export type UpdatePropertyRequest = z.infer<typeof UpdatePropertyRequestSchema>;

export const CreateUnitRequestSchema = UnitSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  leaseId: true,
  tenantId: true,
  status: true,
});
export type CreateUnitRequest = z.infer<typeof CreateUnitRequestSchema>;

export const UpdateUnitRequestSchema = CreateUnitRequestSchema.partial();
export type UpdateUnitRequest = z.infer<typeof UpdateUnitRequestSchema>;

// Property search/filter
export const PropertyFilterSchema = z.object({
  search: z.string().optional(),
  ownerId: UUIDSchema.optional(),
  managerId: UUIDSchema.optional(),
  type: PropertyTypeSchema.optional(),
  types: z.array(PropertyTypeSchema).optional(),
  status: PropertyStatusSchema.optional(),
  marketId: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  minUnits: z.number().int().min(1).optional(),
  maxUnits: z.number().int().optional(),
  amenities: z.array(AmenitySchema).optional(),
  complianceStatus: z.enum(['compliant', 'non_compliant', 'pending_review']).optional(),
  bounds: z.object({
    ne: z.object({ lat: z.number(), lng: z.number() }),
    sw: z.object({ lat: z.number(), lng: z.number() }),
  }).optional(),
});
export type PropertyFilter = z.infer<typeof PropertyFilterSchema>;

export const UnitFilterSchema = z.object({
  propertyId: UUIDSchema.optional(),
  type: z.enum(['studio', '1br', '2br', '3br', '4br', '5br+', 'commercial', 'retail', 'office']).optional(),
  status: z.enum(['vacant', 'occupied', 'pending', 'off_market', 'under_renovation']).optional(),
  minRent: z.number().int().min(0).optional(),
  maxRent: z.number().int().optional(),
  bedrooms: z.number().int().min(0).optional(),
  minSquareFeet: z.number().int().positive().optional(),
  maxSquareFeet: z.number().int().optional(),
  isRentStabilized: z.boolean().optional(),
  availableBefore: z.coerce.date().optional(),
});
export type UnitFilter = z.infer<typeof UnitFilterSchema>;
