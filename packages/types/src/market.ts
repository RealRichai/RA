import { z } from 'zod';

import { AuditFieldsSchema, UUIDSchema } from './common';

// ============================================================================
// Market Types
// ============================================================================

// Supported markets
export const MarketIdSchema = z.enum([
  'NYC', // New York City
  'LA', // Los Angeles
  'SF', // San Francisco
  'CHI', // Chicago
  'MIA', // Miami
  'ATL', // Atlanta
  'BOS', // Boston
  'SEA', // Seattle
  'DEN', // Denver
  'PHX', // Phoenix
  'DAL', // Dallas
  'HOU', // Houston
  'DC', // Washington DC
  'PHI', // Philadelphia
  'AUS', // Austin
]);
export type MarketId = z.infer<typeof MarketIdSchema>;

// Market definition
export const MarketSchema = z.object({
  id: z.string(), // Same as MarketId
  name: z.string(),
  shortName: z.string(),
  state: z.string(),
  stateCode: z.string(),
  city: z.string(),
  county: z.string().optional(),
  timezone: z.string(),
  currency: z.string().default('USD'),

  // Geographic boundaries
  coordinates: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  boundingBox: z.object({
    north: z.number(),
    south: z.number(),
    east: z.number(),
    west: z.number(),
  }).optional(),

  // Market status
  isEnabled: z.boolean().default(true),
  launchDate: z.coerce.date().optional(),
  isBeta: z.boolean().default(false),

  // Neighborhoods/submarkets
  neighborhoods: z.array(z.object({
    id: z.string(),
    name: z.string(),
    zipCodes: z.array(z.string()),
    coordinates: z.object({
      latitude: z.number(),
      longitude: z.number(),
    }).optional(),
  })).default([]),

  // ZIP codes covered
  zipCodes: z.array(z.string()).default([]),

  // Market statistics
  statistics: z.object({
    medianRent: z.number().optional(),
    medianRent1BR: z.number().optional(),
    medianRent2BR: z.number().optional(),
    rentGrowthYoY: z.number().optional(),
    vacancyRate: z.number().optional(),
    medianHomePrice: z.number().optional(),
    population: z.number().optional(),
    populationGrowth: z.number().optional(),
    medianIncome: z.number().optional(),
    costOfLivingIndex: z.number().optional(),
    lastUpdated: z.coerce.date().optional(),
  }).optional(),

  // Regulatory environment
  regulations: z.object({
    // Rent control/stabilization
    hasRentControl: z.boolean().default(false),
    hasRentStabilization: z.boolean().default(false),
    rentGuidelinesBoard: z.string().optional(),
    currentRGBIncrease: z.number().optional(), // Percentage

    // Good Cause Eviction
    hasGoodCause: z.boolean().default(false),
    goodCauseEffectiveDate: z.coerce.date().optional(),
    goodCauseThresholds: z.object({
      rentIncreaseLimit: z.number().optional(),
      exemptUnits: z.number().optional(),
    }).optional(),

    // FARE Act (NY)
    fareActEnabled: z.boolean().default(false),
    fareActEffectiveDate: z.coerce.date().optional(),

    // Security deposit
    maxSecurityDepositMonths: z.number().default(1),
    securityDepositInterest: z.boolean().default(false),

    // Broker fees
    hasBrokerFeeRestrictions: z.boolean().default(false),
    brokerFeePayableBy: z.enum(['tenant', 'landlord', 'either']).optional(),

    // Application fees
    applicationFeeLimit: z.number().optional(),
    applicationFeeRegulated: z.boolean().default(false),

    // Source of income protection
    sourceOfIncomeProtection: z.boolean().default(false),
    protectedSources: z.array(z.string()).default([]),

    // Notice periods
    leaseTerminationNoticeDays: z.number().default(30),
    rentIncreaseNoticeDays: z.number().default(30),
    evictionNoticeDays: z.object({
      nonPayment: z.number().default(14),
      lease_violation: z.number().default(30),
      holdover: z.number().default(30),
    }).optional(),

    // Required disclosures
    requiredDisclosures: z.array(z.string()).default([]),

    // Local ordinances
    localOrdinances: z.array(z.object({
      name: z.string(),
      code: z.string(),
      summary: z.string(),
      effectiveDate: z.coerce.date(),
      url: z.string().optional(),
    })).default([]),
  }),

  // Available integrations
  integrations: z.object({
    // MLS
    mlsAvailable: z.boolean().default(false),
    mlsProvider: z.string().optional(),
    mlsId: z.string().optional(),

    // Utility providers
    electricProviders: z.array(z.string()).default([]),
    gasProviders: z.array(z.string()).default([]),
    waterProviders: z.array(z.string()).default([]),
    internetProviders: z.array(z.string()).default([]),

    // Moving companies
    movingPartnersAvailable: z.boolean().default(false),

    // Local partnerships
    localPartners: z.array(z.object({
      name: z.string(),
      type: z.string(),
      id: UUIDSchema.optional(),
    })).default([]),
  }).optional(),

  // Market features/flags
  features: z.object({
    rebnyLeases: z.boolean().default(false),
    digitalVault: z.boolean().default(true),
    aiConcierge: z.boolean().default(true),
    complianceAutopilot: z.boolean().default(true),
    depositAlternatives: z.boolean().default(true),
    rentersInsurance: z.boolean().default(true),
    utilitiesSetup: z.boolean().default(true),
    movingServices: z.boolean().default(true),
    videoTours: z.boolean().default(true),
    threeDGS: z.boolean().default(false),
    commercialModule: z.boolean().default(false),
  }),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type Market = z.infer<typeof MarketSchema>;

// Market comparables
export const MarketCompSchema = z.object({
  id: UUIDSchema,
  marketId: z.string(),
  propertyId: UUIDSchema.optional(),
  listingId: UUIDSchema.optional(),

  // Address
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    neighborhood: z.string().optional(),
  }),

  // Property details
  propertyType: z.string(),
  bedrooms: z.number().int(),
  bathrooms: z.number(),
  squareFeet: z.number().int().optional(),

  // Pricing
  rent: z.number(),
  rentPerSqFt: z.number().optional(),

  // Listing info
  listingDate: z.coerce.date().optional(),
  leasedDate: z.coerce.date().optional(),
  daysOnMarket: z.number().int().optional(),

  // Amenities
  amenities: z.array(z.string()).default([]),

  // Distance (if calculated from reference point)
  distanceMiles: z.number().optional(),

  // Source
  source: z.enum(['internal', 'mls', 'public', 'scraped']),
  sourceId: z.string().optional(),
  sourceUrl: z.string().optional(),

  // Verification
  isVerified: z.boolean().default(false),
  verifiedAt: z.coerce.date().optional(),

  capturedAt: z.coerce.date(),
}).merge(AuditFieldsSchema);
export type MarketComp = z.infer<typeof MarketCompSchema>;

// Rent estimate
export const RentEstimateSchema = z.object({
  propertyId: UUIDSchema.optional(),
  unitId: UUIDSchema.optional(),

  // Input
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
  }),
  bedrooms: z.number().int(),
  bathrooms: z.number(),
  squareFeet: z.number().int().optional(),
  amenities: z.array(z.string()).default([]),
  condition: z.enum(['poor', 'fair', 'good', 'excellent']).optional(),
  yearBuilt: z.number().int().optional(),

  // Estimate
  estimatedRent: z.number(),
  rentRange: z.object({
    low: z.number(),
    high: z.number(),
  }),
  confidence: z.number().min(0).max(100),

  // Per square foot
  rentPerSqFt: z.number().optional(),
  marketRentPerSqFt: z.number().optional(),

  // Comparables used
  comparableCount: z.number().int(),
  comparables: z.array(z.object({
    id: UUIDSchema,
    address: z.string(),
    rent: z.number(),
    bedrooms: z.number().int(),
    squareFeet: z.number().int().optional(),
    distanceMiles: z.number(),
    similarity: z.number(), // 0-1
  })).optional(),

  // Factors
  factors: z.array(z.object({
    factor: z.string(),
    impact: z.number(), // Positive or negative adjustment
    description: z.string(),
  })).optional(),

  // Market context
  marketTrend: z.enum(['rising', 'stable', 'declining']).optional(),
  marketGrowth: z.number().optional(), // YoY percentage

  calculatedAt: z.coerce.date(),
  validUntil: z.coerce.date(),
});
export type RentEstimate = z.infer<typeof RentEstimateSchema>;

// NYC-specific types (example of market-specific extensions)
export const NYCBoroughSchema = z.enum([
  'manhattan',
  'brooklyn',
  'queens',
  'bronx',
  'staten_island',
]);
export type NYCBorough = z.infer<typeof NYCBoroughSchema>;

export const NYCRentStabilizedInfoSchema = z.object({
  isRentStabilized: z.boolean(),
  registrationNumber: z.string().optional(),
  legalRent: z.number().optional(),
  preferentialRent: z.number().optional(),
  lastRGBIncreaseDate: z.coerce.date().optional(),
  lastRGBIncreasePercentage: z.number().optional(),
  majorCapitalImprovements: z.array(z.object({
    description: z.string(),
    amount: z.number(),
    effectiveDate: z.coerce.date(),
    expirationDate: z.coerce.date().optional(),
    monthlyIncrease: z.number(),
  })).default([]),
  individualApartmentImprovements: z.array(z.object({
    description: z.string(),
    amount: z.number(),
    effectiveDate: z.coerce.date(),
    monthlyIncrease: z.number(),
  })).default([]),
  overchargeHistory: z.array(z.object({
    date: z.coerce.date(),
    amount: z.number(),
    resolved: z.boolean(),
  })).default([]),
});
export type NYCRentStabilizedInfo = z.infer<typeof NYCRentStabilizedInfoSchema>;
