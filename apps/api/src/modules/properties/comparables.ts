/**
 * Property Comparables Module
 *
 * Fetch market rent comparables from Zillow, Rentometer, and other data sources.
 * Provides rent estimation, market analysis, and pricing recommendations.
 */

import { prisma } from '@realriches/database';
import { generatePrefixedId, logger, AppError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

export type ComparableProvider = 'zillow' | 'rentometer' | 'apartments_com' | 'mock';

interface PropertyComparable {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  distance: number; // miles
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  rent: number;
  rentPerSqft?: number;
  listingDate?: Date;
  source: ComparableProvider;
  sourceUrl?: string;
  imageUrl?: string;
  amenities?: string[];
  propertyType?: string;
}

interface RentEstimate {
  estimatedRent: number;
  rentRange: { low: number; median: number; high: number };
  confidence: number; // 0-100
  comparablesUsed: number;
  methodology: string;
  factors: Array<{
    name: string;
    impact: number; // positive or negative $
    description: string;
  }>;
  generatedAt: Date;
}

interface MarketAnalysis {
  marketId: string;
  marketName: string;
  period: { start: Date; end: Date };
  metrics: {
    medianRent: number;
    avgRent: number;
    rentGrowthYoY: number;
    vacancyRate: number;
    daysOnMarket: number;
    inventoryCount: number;
  };
  trends: Array<{
    month: string;
    medianRent: number;
    inventoryCount: number;
    vacancyRate: number;
  }>;
  neighborhoods: Array<{
    name: string;
    medianRent: number;
    rentGrowthYoY: number;
  }>;
}

interface ComparableSearch {
  id: string;
  userId: string;
  propertyId?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  radius: number;
  comparables: PropertyComparable[];
  rentEstimate?: RentEstimate;
  searchedAt: Date;
}

// =============================================================================
// Provider Interface
// =============================================================================

interface IComparableProvider {
  name: ComparableProvider;
  searchComparables(params: {
    address: string;
    city: string;
    state: string;
    zip: string;
    bedrooms: number;
    bathrooms: number;
    radius: number;
    limit?: number;
  }): Promise<PropertyComparable[]>;
  getRentEstimate(params: {
    address: string;
    city: string;
    state: string;
    zip: string;
    bedrooms: number;
    bathrooms: number;
    sqft?: number;
  }): Promise<RentEstimate>;
  getMarketAnalysis(params: {
    city: string;
    state: string;
    zip?: string;
  }): Promise<MarketAnalysis>;
}

// =============================================================================
// Mock Provider
// =============================================================================

class MockComparableProvider implements IComparableProvider {
  name: ComparableProvider = 'mock';

  async searchComparables(params: {
    address: string;
    city: string;
    state: string;
    zip: string;
    bedrooms: number;
    bathrooms: number;
    radius: number;
    limit?: number;
  }): Promise<PropertyComparable[]> {
    const { bedrooms, bathrooms, city, state, zip, limit = 10 } = params;

    // Generate mock comparables
    const baseRent = 1500 + bedrooms * 500 + bathrooms * 200;
    const comparables: PropertyComparable[] = [];

    for (let i = 0; i < limit; i++) {
      const variance = 0.8 + Math.random() * 0.4; // 80-120% of base
      const rent = Math.round(baseRent * variance);
      const sqft = 600 + bedrooms * 300 + Math.floor(Math.random() * 200);

      comparables.push({
        id: generatePrefixedId('cmp'),
        address: `${100 + i * 10} ${['Main', 'Oak', 'Maple', 'Park', 'Lake'][i % 5]} St`,
        city,
        state,
        zip,
        distance: 0.1 + Math.random() * 2,
        bedrooms,
        bathrooms,
        sqft,
        rent,
        rentPerSqft: Math.round((rent / sqft) * 100) / 100,
        listingDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        source: 'mock',
        propertyType: ['Apartment', 'Condo', 'Townhouse'][i % 3],
        amenities: ['Dishwasher', 'Laundry', 'Parking', 'AC'].slice(0, 2 + (i % 3)),
      });
    }

    return comparables.sort((a, b) => a.distance - b.distance);
  }

  async getRentEstimate(params: {
    address: string;
    city: string;
    state: string;
    zip: string;
    bedrooms: number;
    bathrooms: number;
    sqft?: number;
  }): Promise<RentEstimate> {
    const { bedrooms, bathrooms, sqft } = params;
    const baseRent = 1500 + bedrooms * 500 + bathrooms * 200;
    const sqftAdjustment = sqft ? (sqft - 1000) * 0.5 : 0;
    const estimatedRent = Math.round(baseRent + sqftAdjustment);

    return {
      estimatedRent,
      rentRange: {
        low: Math.round(estimatedRent * 0.85),
        median: estimatedRent,
        high: Math.round(estimatedRent * 1.15),
      },
      confidence: 75 + Math.floor(Math.random() * 20),
      comparablesUsed: 8 + Math.floor(Math.random() * 5),
      methodology: 'Comparable rent analysis using nearby similar properties',
      factors: [
        { name: 'Bedrooms', impact: bedrooms * 400, description: `${bedrooms} bedroom unit` },
        { name: 'Bathrooms', impact: bathrooms * 150, description: `${bathrooms} bathroom` },
        { name: 'Location', impact: 100, description: 'Desirable neighborhood' },
        { name: 'Market Conditions', impact: 50, description: 'Strong rental demand' },
      ],
      generatedAt: new Date(),
    };
  }

  async getMarketAnalysis(params: {
    city: string;
    state: string;
    zip?: string;
  }): Promise<MarketAnalysis> {
    const { city, state } = params;

    const trends = [];
    let baseRent = 2000;
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      baseRent *= 1 + (Math.random() * 0.02 - 0.005); // Small monthly variation
      trends.push({
        month: date.toISOString().slice(0, 7),
        medianRent: Math.round(baseRent),
        inventoryCount: 500 + Math.floor(Math.random() * 200),
        vacancyRate: 4 + Math.random() * 3,
      });
    }

    return {
      marketId: `${city.toLowerCase()}-${state.toLowerCase()}`,
      marketName: `${city}, ${state}`,
      period: {
        start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        end: new Date(),
      },
      metrics: {
        medianRent: Math.round(baseRent),
        avgRent: Math.round(baseRent * 1.05),
        rentGrowthYoY: 3.5 + Math.random() * 4,
        vacancyRate: 5 + Math.random() * 2,
        daysOnMarket: 25 + Math.floor(Math.random() * 15),
        inventoryCount: 1200 + Math.floor(Math.random() * 500),
      },
      trends,
      neighborhoods: [
        { name: 'Downtown', medianRent: Math.round(baseRent * 1.3), rentGrowthYoY: 5.2 },
        { name: 'Midtown', medianRent: Math.round(baseRent * 1.1), rentGrowthYoY: 4.1 },
        { name: 'Uptown', medianRent: Math.round(baseRent * 0.95), rentGrowthYoY: 3.8 },
        { name: 'Suburbs', medianRent: Math.round(baseRent * 0.85), rentGrowthYoY: 2.5 },
      ],
    };
  }
}

// =============================================================================
// Zillow Provider
// =============================================================================

class ZillowProvider implements IComparableProvider {
  name: ComparableProvider = 'zillow';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.ZILLOW_API_KEY || '';
  }

  async searchComparables(params: {
    address: string;
    city: string;
    state: string;
    zip: string;
    bedrooms: number;
    bathrooms: number;
    radius: number;
    limit?: number;
  }): Promise<PropertyComparable[]> {
    // In production: Call Zillow API
    // GET https://api.bridgedataoutput.com/api/v2/zestimates_v2/zestimates
    logger.info({ address: params.address }, 'Zillow: Searching comparables');

    // Placeholder - would make actual API call
    const mock = new MockComparableProvider();
    const results = await mock.searchComparables(params);
    return results.map(r => ({ ...r, source: 'zillow' as ComparableProvider }));
  }

  async getRentEstimate(params: {
    address: string;
    city: string;
    state: string;
    zip: string;
    bedrooms: number;
    bathrooms: number;
    sqft?: number;
  }): Promise<RentEstimate> {
    // GET https://api.bridgedataoutput.com/api/v2/zestimates_v2/rent_zestimates
    logger.info({ address: params.address }, 'Zillow: Getting rent estimate');

    const mock = new MockComparableProvider();
    return mock.getRentEstimate(params);
  }

  async getMarketAnalysis(params: {
    city: string;
    state: string;
    zip?: string;
  }): Promise<MarketAnalysis> {
    logger.info({ city: params.city }, 'Zillow: Getting market analysis');

    const mock = new MockComparableProvider();
    return mock.getMarketAnalysis(params);
  }
}

// =============================================================================
// Rentometer Provider
// =============================================================================

class RentometerProvider implements IComparableProvider {
  name: ComparableProvider = 'rentometer';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.RENTOMETER_API_KEY || '';
  }

  async searchComparables(params: {
    address: string;
    city: string;
    state: string;
    zip: string;
    bedrooms: number;
    bathrooms: number;
    radius: number;
    limit?: number;
  }): Promise<PropertyComparable[]> {
    // GET https://www.rentometer.com/api/v2/summary
    logger.info({ address: params.address }, 'Rentometer: Searching comparables');

    const mock = new MockComparableProvider();
    const results = await mock.searchComparables(params);
    return results.map(r => ({ ...r, source: 'rentometer' as ComparableProvider }));
  }

  async getRentEstimate(params: {
    address: string;
    city: string;
    state: string;
    zip: string;
    bedrooms: number;
    bathrooms: number;
    sqft?: number;
  }): Promise<RentEstimate> {
    // GET https://www.rentometer.com/api/v2/summary
    logger.info({ address: params.address }, 'Rentometer: Getting rent estimate');

    const mock = new MockComparableProvider();
    return mock.getRentEstimate(params);
  }

  async getMarketAnalysis(params: {
    city: string;
    state: string;
    zip?: string;
  }): Promise<MarketAnalysis> {
    logger.info({ city: params.city }, 'Rentometer: Getting market analysis');

    const mock = new MockComparableProvider();
    return mock.getMarketAnalysis(params);
  }
}

// =============================================================================
// Provider Factory
// =============================================================================

const providers = new Map<ComparableProvider, IComparableProvider>();

function getProvider(provider: ComparableProvider): IComparableProvider {
  if (!providers.has(provider)) {
    switch (provider) {
      case 'zillow':
        providers.set(provider, new ZillowProvider());
        break;
      case 'rentometer':
        providers.set(provider, new RentometerProvider());
        break;
      default:
        providers.set(provider, new MockComparableProvider());
    }
  }
  return providers.get(provider)!;
}

// =============================================================================
// In-Memory Storage
// =============================================================================

const comparableSearches = new Map<string, ComparableSearch>();

// =============================================================================
// Schemas
// =============================================================================

const SearchComparablesSchema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().min(5).max(10),
  bedrooms: z.number().min(0).max(10),
  bathrooms: z.number().min(0).max(10),
  sqft: z.number().min(100).max(10000).optional(),
  radius: z.number().min(0.1).max(10).default(1),
  providers: z.array(z.enum(['zillow', 'rentometer', 'apartments_com', 'mock'])).default(['mock']),
  limit: z.number().min(1).max(50).default(20),
});

const GetRentEstimateSchema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().min(5).max(10),
  bedrooms: z.number().min(0).max(10),
  bathrooms: z.number().min(0).max(10),
  sqft: z.number().min(100).max(10000).optional(),
  provider: z.enum(['zillow', 'rentometer', 'mock']).default('mock'),
});

// =============================================================================
// Routes
// =============================================================================

export async function comparableRoutes(app: FastifyInstance): Promise<void> {
  // Search comparables
  app.post(
    '/comparables/search',
    {
      schema: {
        description: 'Search for comparable rental properties',
        tags: ['Property Comparables'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof SearchComparablesSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = SearchComparablesSchema.parse(request.body);
      const allComparables: PropertyComparable[] = [];

      // Fetch from all requested providers
      for (const providerName of data.providers) {
        try {
          const provider = getProvider(providerName);
          const results = await provider.searchComparables({
            address: data.address,
            city: data.city,
            state: data.state,
            zip: data.zip,
            bedrooms: data.bedrooms,
            bathrooms: data.bathrooms,
            radius: data.radius,
            limit: Math.ceil(data.limit / data.providers.length),
          });
          allComparables.push(...results);
        } catch (error) {
          logger.error({ provider: providerName, error }, 'Failed to fetch comparables');
        }
      }

      // Deduplicate and sort
      const uniqueComparables = allComparables
        .filter((c, i, arr) => arr.findIndex(x => x.address === c.address) === i)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, data.limit);

      // Store search
      const search: ComparableSearch = {
        id: generatePrefixedId('csr'),
        userId: request.user.id,
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        sqft: data.sqft,
        radius: data.radius,
        comparables: uniqueComparables,
        searchedAt: new Date(),
      };

      comparableSearches.set(search.id, search);

      logger.info({
        searchId: search.id,
        address: data.address,
        comparablesFound: uniqueComparables.length,
      }, 'Comparables search completed');

      return reply.send({
        success: true,
        data: {
          searchId: search.id,
          comparables: uniqueComparables,
          summary: {
            count: uniqueComparables.length,
            avgRent: uniqueComparables.length > 0
              ? Math.round(uniqueComparables.reduce((sum, c) => sum + c.rent, 0) / uniqueComparables.length)
              : 0,
            minRent: uniqueComparables.length > 0
              ? Math.min(...uniqueComparables.map(c => c.rent))
              : 0,
            maxRent: uniqueComparables.length > 0
              ? Math.max(...uniqueComparables.map(c => c.rent))
              : 0,
          },
        },
      });
    }
  );

  // Get rent estimate
  app.post(
    '/comparables/estimate',
    {
      schema: {
        description: 'Get rent estimate for a property',
        tags: ['Property Comparables'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof GetRentEstimateSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = GetRentEstimateSchema.parse(request.body);
      const provider = getProvider(data.provider);

      const estimate = await provider.getRentEstimate({
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        sqft: data.sqft,
      });

      logger.info({
        address: data.address,
        estimatedRent: estimate.estimatedRent,
        confidence: estimate.confidence,
      }, 'Rent estimate generated');

      return reply.send({
        success: true,
        data: { estimate },
      });
    }
  );

  // Get market analysis
  app.get(
    '/comparables/market',
    {
      schema: {
        description: 'Get market analysis for an area',
        tags: ['Property Comparables'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['city', 'state'],
          properties: {
            city: { type: 'string' },
            state: { type: 'string' },
            zip: { type: 'string' },
            provider: { type: 'string', default: 'mock' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { city: string; state: string; zip?: string; provider?: ComparableProvider };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { city, state, zip, provider: providerName = 'mock' } = request.query;
      const provider = getProvider(providerName);

      const analysis = await provider.getMarketAnalysis({ city, state, zip });

      return reply.send({
        success: true,
        data: { analysis },
      });
    }
  );

  // Get comparables for existing property
  app.get(
    '/properties/:propertyId/comparables',
    {
      schema: {
        description: 'Get comparables for an existing property',
        tags: ['Property Comparables'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            radius: { type: 'number', default: 1 },
            bedrooms: { type: 'integer' },
            limit: { type: 'integer', default: 20 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Params: { propertyId: string };
        Querystring: { radius?: number; bedrooms?: number; limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { propertyId } = request.params;
      const { radius = 1, bedrooms, limit = 20 } = request.query;

      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        include: {
          units: {
            take: 1,
          },
        },
      });

      if (!property) {
        throw new AppError('NOT_FOUND', 'Property not found', 404);
      }

      if (property.ownerId !== request.user.id) {
        throw new AppError('FORBIDDEN', 'Not authorized', 403);
      }

      const unit = property.units[0];
      const searchBedrooms = bedrooms ?? unit?.bedrooms ?? 2;
      const searchBathrooms = unit?.bathrooms ?? 1;

      const provider = getProvider('mock');
      const comparables = await provider.searchComparables({
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
        bedrooms: searchBedrooms,
        bathrooms: searchBathrooms,
        radius,
        limit,
      });

      // Get rent estimate
      const estimate = await provider.getRentEstimate({
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
        bedrooms: searchBedrooms,
        bathrooms: searchBathrooms,
        sqft: unit?.sqft || undefined,
      });

      return reply.send({
        success: true,
        data: {
          property: {
            id: property.id,
            name: property.name,
            address: property.address,
          },
          comparables,
          rentEstimate: estimate,
          summary: {
            count: comparables.length,
            avgRent: Math.round(comparables.reduce((sum, c) => sum + c.rent, 0) / comparables.length),
            avgRentPerSqft: comparables.filter(c => c.rentPerSqft).length > 0
              ? Math.round(comparables.filter(c => c.rentPerSqft).reduce((sum, c) => sum + (c.rentPerSqft || 0), 0) / comparables.filter(c => c.rentPerSqft).length * 100) / 100
              : null,
          },
        },
      });
    }
  );

  // Get search history
  app.get(
    '/comparables/history',
    {
      schema: {
        description: 'Get comparable search history',
        tags: ['Property Comparables'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', default: 10 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { limit?: number } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { limit = 10 } = request.query;

      const searches = Array.from(comparableSearches.values())
        .filter(s => s.userId === request.user!.id)
        .sort((a, b) => b.searchedAt.getTime() - a.searchedAt.getTime())
        .slice(0, limit)
        .map(s => ({
          id: s.id,
          address: s.address,
          city: s.city,
          state: s.state,
          bedrooms: s.bedrooms,
          bathrooms: s.bathrooms,
          comparablesFound: s.comparables.length,
          searchedAt: s.searchedAt.toISOString(),
        }));

      return reply.send({
        success: true,
        data: { searches },
      });
    }
  );

  // Get previous search details
  app.get(
    '/comparables/searches/:searchId',
    {
      schema: {
        description: 'Get details of a previous comparable search',
        tags: ['Property Comparables'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { searchId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { searchId } = request.params;
      const search = comparableSearches.get(searchId);

      if (!search || search.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Search not found', 404);
      }

      return reply.send({
        success: true,
        data: { search },
      });
    }
  );

  // Pricing recommendation
  app.post(
    '/comparables/recommend-price',
    {
      schema: {
        description: 'Get pricing recommendation based on comparables',
        tags: ['Property Comparables'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          address: string;
          city: string;
          state: string;
          zip: string;
          bedrooms: number;
          bathrooms: number;
          sqft?: number;
          amenities?: string[];
          condition?: 'excellent' | 'good' | 'average' | 'fair';
          targetVacancy?: number; // days
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { address, city, state, zip, bedrooms, bathrooms, sqft, amenities = [], condition = 'good', targetVacancy = 30 } = request.body;

      const provider = getProvider('mock');

      // Get base estimate
      const estimate = await provider.getRentEstimate({
        address,
        city,
        state,
        zip,
        bedrooms,
        bathrooms,
        sqft,
      });

      // Apply adjustments
      let adjustedRent = estimate.estimatedRent;
      const adjustments: Array<{ factor: string; amount: number; description: string }> = [];

      // Condition adjustment
      const conditionMultipliers: Record<string, number> = {
        excellent: 1.1,
        good: 1.0,
        average: 0.95,
        fair: 0.9,
      };
      const conditionAdj = Math.round(estimate.estimatedRent * (conditionMultipliers[condition] - 1));
      if (conditionAdj !== 0) {
        adjustedRent += conditionAdj;
        adjustments.push({
          factor: 'Condition',
          amount: conditionAdj,
          description: `${condition.charAt(0).toUpperCase() + condition.slice(1)} condition`,
        });
      }

      // Amenities adjustment
      const premiumAmenities = ['in-unit laundry', 'dishwasher', 'parking', 'gym', 'pool', 'doorman'];
      const matchedAmenities = amenities.filter(a => premiumAmenities.some(pa => a.toLowerCase().includes(pa)));
      const amenityAdj = matchedAmenities.length * 50;
      if (amenityAdj > 0) {
        adjustedRent += amenityAdj;
        adjustments.push({
          factor: 'Amenities',
          amount: amenityAdj,
          description: `${matchedAmenities.length} premium amenities`,
        });
      }

      // Vacancy target adjustment
      if (targetVacancy < 14) {
        const quickRentAdj = -Math.round(adjustedRent * 0.05);
        adjustedRent += quickRentAdj;
        adjustments.push({
          factor: 'Quick Rent',
          amount: quickRentAdj,
          description: 'Price for faster occupancy',
        });
      }

      const recommendation = {
        recommendedRent: adjustedRent,
        baseEstimate: estimate.estimatedRent,
        adjustments,
        priceRange: {
          aggressive: Math.round(adjustedRent * 1.05),
          recommended: adjustedRent,
          conservative: Math.round(adjustedRent * 0.95),
        },
        expectedDaysOnMarket: {
          aggressive: 45 + Math.floor(Math.random() * 20),
          recommended: 25 + Math.floor(Math.random() * 15),
          conservative: 10 + Math.floor(Math.random() * 10),
        },
        confidence: estimate.confidence,
      };

      return reply.send({
        success: true,
        data: { recommendation },
      });
    }
  );
}

// =============================================================================
// Exports
// =============================================================================

export {
  comparableSearches,
  getProvider,
  MockComparableProvider,
  ZillowProvider,
  RentometerProvider,
};
