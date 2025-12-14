/**
 * Listing Routes
 * REST API endpoints with market-aware functionality
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { listingsRepository } from './listings.service.js';
import {
  CreateListingSchema,
  UpdateListingSchema,
  SearchListingsSchema,
  PublishListingSchema,
  MarketAnalyticsSchema,
} from './listings.schemas.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { UserRole } from '@prisma/client';
import {
  MARKETS,
  ENABLED_MARKETS,
  getMarketById,
  getSubmarketsByPriority,
  calculateMarketOpportunityMetrics,
  getCombinedMarketOpportunity,
  compareMarketRegulations,
} from '../../config/markets/index.js';

export async function listingRoutes(app: FastifyInstance): Promise<void> {
  
  // ===========================================================================
  // MARKET INFORMATION ENDPOINTS
  // ===========================================================================
  
  /**
   * Get all enabled markets
   */
  app.get(
    '/markets',
    {
      schema: {
        description: 'Get all enabled markets with summary data',
        tags: ['Markets'],
        response: {
          200: {
            type: 'object',
            properties: {
              markets: { type: 'array' },
              totalTAM: { type: 'number' },
              totalLandlords: { type: 'number' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const opportunity = getCombinedMarketOpportunity();
      
      return reply.send({
        markets: ENABLED_MARKETS.map(m => ({
          id: m.id,
          name: m.name,
          state: m.state,
          counties: m.counties,
          submarketCount: m.submarkets.length,
          regulations: {
            maxApplicationFee: m.regulations.maxApplicationFee,
            maxSecurityDepositMonths: m.regulations.maxSecurityDepositMonths,
            fareActApplies: m.featureFlags.fareActCompliance || false,
            fairChanceHousingApplies: m.regulations.fairChanceHousingApplies,
          },
          pricing: m.pricing,
          demographics: {
            totalRentalUnits: m.demographics.totalRentalUnits,
            selfManagingLandlords: m.demographics.selfManagingLandlords,
          },
        })),
        totalTAM: opportunity.totalTAM,
        totalLandlords: opportunity.totalLandlords,
      });
    }
  );
  
  /**
   * Get market details by ID
   */
  app.get(
    '/markets/:marketId',
    {
      schema: {
        description: 'Get detailed market information including submarkets',
        tags: ['Markets'],
        params: {
          type: 'object',
          properties: {
            marketId: { type: 'string' },
          },
          required: ['marketId'],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { marketId: string } }>, reply: FastifyReply) => {
      const market = getMarketById(request.params.marketId);
      
      if (!market) {
        return reply.status(404).send({ error: 'Market not found' });
      }
      
      const metrics = calculateMarketOpportunityMetrics(market.id);
      const submarkets = getSubmarketsByPriority(market.id);
      
      return reply.send({
        ...market,
        metrics,
        submarketsByPriority: submarkets,
      });
    }
  );
  
  /**
   * Compare regulations between markets (useful for agents working both markets)
   */
  app.get(
    '/markets/compare/:market1/:market2',
    {
      schema: {
        description: 'Compare regulatory differences between two markets',
        tags: ['Markets'],
        params: {
          type: 'object',
          properties: {
            market1: { type: 'string' },
            market2: { type: 'string' },
          },
          required: ['market1', 'market2'],
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { market1: string; market2: string } }>,
      reply: FastifyReply
    ) => {
      const { market1, market2 } = request.params;
      
      const m1 = getMarketById(market1);
      const m2 = getMarketById(market2);
      
      if (!m1 || !m2) {
        return reply.status(404).send({ error: 'One or both markets not found' });
      }
      
      const differences = compareMarketRegulations(market1, market2);
      
      return reply.send({
        market1: { id: m1.id, name: m1.name },
        market2: { id: m2.id, name: m2.name },
        differences,
        summary: {
          totalDifferences: differences.length,
          keyDifferences: differences.filter(d => 
            ['fareActApplies', 'fairChanceHousingApplies', 'rentStabilizationApplies', 'goodCauseEvictionApplies']
              .some(key => d.field.toLowerCase().includes(key.toLowerCase()))
          ),
        },
      });
    }
  );
  
  // ===========================================================================
  // LISTING CRUD ENDPOINTS
  // ===========================================================================
  
  /**
   * Create a new listing
   */
  app.post(
    '/',
    {
      preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])],
      schema: {
        description: 'Create a new listing with market compliance validation',
        tags: ['Listings'],
        body: CreateListingSchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = CreateListingSchema.parse(request.body);
      
      const result = await listingsRepository.create(input);
      
      if (result.isErr()) {
        return reply.status(400).send({ error: result.error.message });
      }
      
      return reply.status(201).send({
        listing: result.value,
        complianceStatus: result.value.complianceStatus,
        market: result.value.market ? {
          id: result.value.market.id,
          name: result.value.market.name,
        } : null,
        submarket: result.value.submarket ? {
          id: result.value.submarket.id,
          name: result.value.submarket.name,
        } : null,
      });
    }
  );
  
  /**
   * Get listing by ID
   */
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get listing details with market and compliance information',
        tags: ['Listings'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const result = await listingsRepository.findById(request.params.id);
      
      if (result.isErr()) {
        return reply.status(500).send({ error: result.error.message });
      }
      
      if (!result.value) {
        return reply.status(404).send({ error: 'Listing not found' });
      }
      
      return reply.send({
        listing: result.value,
        complianceStatus: result.value.complianceStatus,
        market: result.value.market,
        submarket: result.value.submarket,
      });
    }
  );
  
  /**
   * Search listings
   */
  app.get(
    '/',
    {
      schema: {
        description: 'Search listings with market, price, and property filters',
        tags: ['Listings'],
        querystring: SearchListingsSchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = SearchListingsSchema.parse(request.query);
      
      const result = await listingsRepository.search(params);
      
      if (result.isErr()) {
        return reply.status(500).send({ error: result.error.message });
      }
      
      return reply.send(result.value);
    }
  );
  
  /**
   * Publish a listing
   */
  app.post(
    '/:id/publish',
    {
      preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])],
      schema: {
        description: 'Publish a listing after compliance verification',
        tags: ['Listings'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const result = await listingsRepository.publish(request.params.id);
      
      if (result.isErr()) {
        return reply.status(400).send({ error: result.error.message });
      }
      
      return reply.send({
        message: 'Listing published successfully',
        listing: result.value,
      });
    }
  );
  
  // ===========================================================================
  // MARKET ANALYTICS ENDPOINTS
  // ===========================================================================
  
  /**
   * Get market statistics
   */
  app.get(
    '/analytics/market/:marketId',
    {
      preHandler: [requireAuth],
      schema: {
        description: 'Get listing statistics for a market',
        tags: ['Analytics'],
        params: {
          type: 'object',
          properties: {
            marketId: { type: 'string' },
          },
          required: ['marketId'],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { marketId: string } }>, reply: FastifyReply) => {
      const result = await listingsRepository.getMarketStats(request.params.marketId);
      
      if (result.isErr()) {
        return reply.status(400).send({ error: result.error.message });
      }
      
      return reply.send(result.value);
    }
  );
  
  /**
   * Get investor opportunity metrics (for investor dashboard)
   */
  app.get(
    '/analytics/opportunity',
    {
      preHandler: [requireAuth, requireRole([UserRole.INVESTOR, UserRole.ADMIN])],
      schema: {
        description: 'Get market opportunity metrics for investors',
        tags: ['Analytics'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const opportunity = getCombinedMarketOpportunity();
      
      return reply.send({
        summary: {
          totalTAM: opportunity.totalTAM,
          totalLandlords: opportunity.totalLandlords,
          enabledMarkets: ENABLED_MARKETS.length,
        },
        markets: opportunity.markets,
        investorNotes: [
          'NYC market has high regulatory complexity but proven demand',
          'Long Island market has lower competition and faster eviction timelines',
          'Both markets share NY state application fee ($20) and security deposit (1 month) limits',
          'FARE Act and Fair Chance Housing apply only to NYC',
          'Seasonal submarkets (Hamptons, Long Beach) offer premium pricing opportunities',
        ],
      });
    }
  );
}
