/**
 * Copilot API Schemas
 *
 * Zod schemas for copilot API request/response validation.
 */

import { z } from 'zod';

// =============================================================================
// Request Schemas
// =============================================================================

export const ListingDraftSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  propertyType: z.enum(['apartment', 'house', 'condo', 'townhouse', 'commercial']),
  bedrooms: z.number().int().min(0),
  bathrooms: z.number().min(0),
  squareFeet: z.number().positive().optional(),
  monthlyRent: z.number().positive(),
  address: z.object({
    street: z.string(),
    unit: z.string().optional(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
  }),
  amenities: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
  hasBrokerFee: z.boolean().default(false),
  brokerFeeAmount: z.number().optional(),
  brokerFeePaidBy: z.enum(['tenant', 'landlord']).optional(),
  agentRepresentation: z.enum(['landlord', 'tenant', 'dual', 'none']).optional(),
});

export const PropertyFactsSchema = z.object({
  yearBuilt: z.number().int().optional(),
  lotSize: z.number().positive().optional(),
  parkingSpaces: z.number().int().min(0).optional(),
  heatingType: z.string().optional(),
  coolingType: z.string().optional(),
  laundryType: z.enum(['in_unit', 'building', 'none']).optional(),
  petPolicy: z.enum(['allowed', 'cats_only', 'dogs_only', 'no_pets', 'case_by_case']).optional(),
  utilities: z.object({
    electricIncluded: z.boolean().default(false),
    gasIncluded: z.boolean().default(false),
    waterIncluded: z.boolean().default(false),
    internetIncluded: z.boolean().default(false),
  }).optional(),
  nearbyTransit: z.array(z.string()).default([]),
  neighborhoodHighlights: z.array(z.string()).default([]),
  securityDeposit: z.number().optional(),
  leaseTermMonths: z.number().int().positive().optional(),
  availableDate: z.string().optional(),
  isRentStabilized: z.boolean().optional(),
  legalRentAmount: z.number().optional(),
});

export const ChannelTargetSchema = z.enum([
  'zillow',
  'streeteasy',
  'mls_reso',
  'apartments_com',
  'realtor_com',
  'trulia',
]);

export const CopilotOptionsSchema = z.object({
  dryRun: z.boolean().default(true),
  skipCompliance: z.boolean().default(false),
  channels: z.array(ChannelTargetSchema).default([]),
});

export const TemplateOverridesSchema = z.object({
  flyerTemplateId: z.string().uuid().optional(),
  brochureTemplateId: z.string().uuid().optional(),
  deckTemplateId: z.string().uuid().optional(),
});

export const ExecuteCopilotRequestSchema = z.object({
  listingDraft: ListingDraftSchema,
  propertyFacts: PropertyFactsSchema,
  marketId: z.string(),
  templateOverrides: TemplateOverridesSchema.optional(),
  options: CopilotOptionsSchema.optional(),
});

export const UploadTemplateRequestSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['flyer', 'brochure', 'broker_deck']),
  content: z.string(),
});

// =============================================================================
// Response Types
// =============================================================================

export type ExecuteCopilotRequest = z.infer<typeof ExecuteCopilotRequestSchema>;
export type UploadTemplateRequest = z.infer<typeof UploadTemplateRequestSchema>;
