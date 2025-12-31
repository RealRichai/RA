/**
 * Search Infrastructure
 *
 * Full-text search across properties, listings, leases, and users.
 * Uses PostgreSQL full-text search with optional Redis caching.
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

const CACHE_PREFIX = 'search:';
const CACHE_TTL = 300; // 5 minutes

// =============================================================================
// Types
// =============================================================================

type SearchableEntity = 'properties' | 'listings' | 'leases' | 'users' | 'documents';

interface SearchResult {
  entity: SearchableEntity;
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  score?: number;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  took: number;
  facets?: Record<string, Record<string, number>>;
}

// =============================================================================
// Schemas
// =============================================================================

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  entities: z.array(z.enum(['properties', 'listings', 'leases', 'users', 'documents'])).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  filters: z.record(z.unknown()).optional(),
});

const PropertySearchSchema = z.object({
  q: z.string().min(1).max(200),
  city: z.string().optional(),
  state: z.string().optional(),
  minBedrooms: z.coerce.number().int().min(0).optional(),
  maxBedrooms: z.coerce.number().int().min(0).optional(),
  minRent: z.coerce.number().min(0).optional(),
  maxRent: z.coerce.number().min(0).optional(),
  propertyType: z.string().optional(),
  amenities: z.array(z.string()).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// =============================================================================
// Helper Functions
// =============================================================================

function getRedis(app: FastifyInstance): Redis | null {
  return (app as unknown as { redis?: Redis }).redis || null;
}

function generateCacheKey(query: string, entities: string[], filters?: Record<string, unknown>): string {
  const parts = [query, entities.sort().join(',')];
  if (filters) {
    parts.push(JSON.stringify(filters));
  }
  return `${CACHE_PREFIX}${Buffer.from(parts.join('|')).toString('base64').slice(0, 64)}`;
}

async function getCachedResults(redis: Redis | null, cacheKey: string): Promise<SearchResponse | null> {
  if (!redis) return null;
  const cached = await redis.get(cacheKey);
  return cached ? JSON.parse(cached) : null;
}

async function setCachedResults(redis: Redis | null, cacheKey: string, results: SearchResponse): Promise<void> {
  if (!redis) return;
  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(results));
}

// =============================================================================
// Search Functions
// =============================================================================

async function searchProperties(query: string, filters: Record<string, unknown>, limit: number, offset: number): Promise<SearchResult[]> {
  const where: Record<string, unknown> = {};

  // Build filters
  if (filters.city) where.city = { contains: filters.city as string, mode: 'insensitive' };
  if (filters.state) where.state = filters.state;
  if (filters.propertyType) where.propertyType = filters.propertyType;

  const properties = await prisma.property.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { address: { contains: query, mode: 'insensitive' } },
        { city: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
      ...where,
    },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      type: true,
      totalUnits: true,
    },
    take: limit,
    skip: offset,
    orderBy: { createdAt: 'desc' },
  });

  return properties.map((p) => ({
    entity: 'properties' as const,
    id: p.id,
    title: p.name || p.address,
    subtitle: `${p.city}, ${p.state}`,
    description: `${p.type} - ${p.totalUnits} units`,
    metadata: {
      propertyType: p.type,
      totalUnits: p.totalUnits,
    },
  }));
}

async function searchListings(query: string, filters: Record<string, unknown>, limit: number, offset: number): Promise<SearchResult[]> {
  const where: Record<string, unknown> = {
    status: 'active', // Only search active listings
  };

  if (filters.minRent || filters.maxRent) {
    where.priceAmount = {};
    if (filters.minRent) (where.priceAmount as Record<string, number>).gte = filters.minRent as number;
    if (filters.maxRent) (where.priceAmount as Record<string, number>).lte = filters.maxRent as number;
  }

  const listings = await prisma.listing.findMany({
    where: {
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { city: { contains: query, mode: 'insensitive' } },
        { street1: { contains: query, mode: 'insensitive' } },
      ],
      ...where,
    },
    select: {
      id: true,
      title: true,
      priceAmount: true,
      rent: true,
      availableDate: true,
      bedrooms: true,
      bathrooms: true,
      city: true,
      state: true,
    },
    take: limit,
    skip: offset,
    orderBy: { publishedAt: 'desc' },
  });

  return listings.map((l) => ({
    entity: 'listings' as const,
    id: l.id,
    title: l.title,
    subtitle: `${l.city}, ${l.state}`,
    description: `$${l.rent || l.priceAmount}/mo - ${l.bedrooms}BR/${l.bathrooms}BA`,
    metadata: {
      monthlyRent: l.rent || l.priceAmount,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      availableDate: l.availableDate,
    },
  }));
}

async function searchLeases(query: string, _filters: Record<string, unknown>, limit: number, offset: number): Promise<SearchResult[]> {
  const leases = await prisma.lease.findMany({
    where: {
      OR: [
        { unit: { property: { address: { contains: query, mode: 'insensitive' } } } },
        { unit: { property: { name: { contains: query, mode: 'insensitive' } } } },
        { primaryTenant: { email: { contains: query, mode: 'insensitive' } } },
        { primaryTenant: { firstName: { contains: query, mode: 'insensitive' } } },
        { primaryTenant: { lastName: { contains: query, mode: 'insensitive' } } },
      ],
    },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      monthlyRent: true,
      unit: {
        select: {
          unitNumber: true,
          property: {
            select: {
              name: true,
              address: true,
            },
          },
        },
      },
      primaryTenant: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
    take: limit,
    skip: offset,
    orderBy: { createdAt: 'desc' },
  });

  return leases.map((l) => ({
    entity: 'leases' as const,
    id: l.id,
    title: `${l.unit?.property?.name || l.unit?.property?.address || 'Unknown'} - Unit ${l.unit?.unitNumber || 'N/A'}`,
    subtitle: l.primaryTenant ? `${l.primaryTenant.firstName} ${l.primaryTenant.lastName}` : undefined,
    description: `${l.status} - $${l.monthlyRent}/mo`,
    metadata: {
      status: l.status,
      startDate: l.startDate,
      endDate: l.endDate,
      monthlyRent: l.monthlyRent,
    },
  }));
}

async function searchUsers(query: string, _filters: Record<string, unknown>, limit: number, offset: number): Promise<SearchResult[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: query, mode: 'insensitive' } },
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
    },
    take: limit,
    skip: offset,
    orderBy: { createdAt: 'desc' },
  });

  return users.map((u) => ({
    entity: 'users' as const,
    id: u.id,
    title: `${u.firstName} ${u.lastName}`,
    subtitle: u.email,
    description: `${u.role} - ${u.status}`,
    metadata: {
      role: u.role,
      status: u.status,
    },
  }));
}

async function searchDocuments(query: string, _filters: Record<string, unknown>, limit: number, offset: number): Promise<SearchResult[]> {
  const documents = await prisma.document.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { type: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
      createdAt: true,
    },
    take: limit,
    skip: offset,
    orderBy: { createdAt: 'desc' },
  });

  return documents.map((d) => ({
    entity: 'documents' as const,
    id: d.id,
    title: d.name,
    subtitle: d.type || undefined,
    description: d.description || d.type,
    metadata: {
      type: d.type,
      createdAt: d.createdAt,
    },
  }));
}

// =============================================================================
// Routes
// =============================================================================

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================================================
  // GET /search - Global search across entities
  // ===========================================================================
  app.get(
    '/',
    {
      schema: {
        description: 'Search across all entities',
        tags: ['Search'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 1, maxLength: 200 },
            entities: { type: 'array', items: { type: 'string' } },
            limit: { type: 'integer', default: 20 },
            offset: { type: 'integer', default: 0 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const startTime = Date.now();
        const params = SearchQuerySchema.parse(request.query);
        const entities = params.entities || ['properties', 'listings', 'users'];
        const redis = getRedis(app);

        // Check cache
        const cacheKey = generateCacheKey(params.q, entities, params.filters);
        const cached = await getCachedResults(redis, cacheKey);
        if (cached) {
          return reply.send({
            success: true,
            data: { ...cached, fromCache: true },
          });
        }

        // Search each entity type
        const results: SearchResult[] = [];
        const limitPerEntity = Math.ceil(params.limit / entities.length);

        const searchPromises = entities.map(async (entity) => {
          switch (entity) {
            case 'properties':
              return searchProperties(params.q, params.filters || {}, limitPerEntity, 0);
            case 'listings':
              return searchListings(params.q, params.filters || {}, limitPerEntity, 0);
            case 'leases':
              return searchLeases(params.q, params.filters || {}, limitPerEntity, 0);
            case 'users':
              return searchUsers(params.q, params.filters || {}, limitPerEntity, 0);
            case 'documents':
              return searchDocuments(params.q, params.filters || {}, limitPerEntity, 0);
            default:
              return [];
          }
        });

        const searchResults = await Promise.all(searchPromises);
        for (const entityResults of searchResults) {
          results.push(...entityResults);
        }

        // Sort by relevance (simple scoring for now)
        const queryLower = params.q.toLowerCase();
        results.sort((a, b) => {
          const aScore = (a.title.toLowerCase().includes(queryLower) ? 2 : 0) +
                        (a.subtitle?.toLowerCase().includes(queryLower) ? 1 : 0);
          const bScore = (b.title.toLowerCase().includes(queryLower) ? 2 : 0) +
                        (b.subtitle?.toLowerCase().includes(queryLower) ? 1 : 0);
          return bScore - aScore;
        });

        // Apply pagination
        const paginatedResults = results.slice(params.offset, params.offset + params.limit);
        const took = Date.now() - startTime;

        const response: SearchResponse = {
          query: params.q,
          results: paginatedResults,
          total: results.length,
          took,
        };

        // Cache results
        await setCachedResults(redis, cacheKey, response);

        return reply.send({
          success: true,
          data: response,
        });
      } catch (error) {
        logger.error({ error }, 'Search failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'SEARCH_ERROR', message: 'Search failed' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /search/properties - Search properties with filters
  // ===========================================================================
  app.get(
    '/properties',
    {
      schema: {
        description: 'Search properties with advanced filters',
        tags: ['Search'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            minBedrooms: { type: 'integer' },
            maxBedrooms: { type: 'integer' },
            minRent: { type: 'number' },
            maxRent: { type: 'number' },
            propertyType: { type: 'string' },
            limit: { type: 'integer', default: 20 },
            offset: { type: 'integer', default: 0 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const startTime = Date.now();
        const params = PropertySearchSchema.parse(request.query);

        const results = await searchProperties(
          params.q,
          {
            city: params.city,
            state: params.state,
            propertyType: params.propertyType,
          },
          params.limit,
          params.offset
        );

        return reply.send({
          success: true,
          data: {
            query: params.q,
            results,
            total: results.length,
            took: Date.now() - startTime,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Property search failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'SEARCH_ERROR', message: 'Property search failed' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /search/listings - Search listings with filters
  // ===========================================================================
  app.get(
    '/listings',
    {
      schema: {
        description: 'Search listings with advanced filters',
        tags: ['Search'],
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string' },
            minRent: { type: 'number' },
            maxRent: { type: 'number' },
            minBedrooms: { type: 'integer' },
            maxBedrooms: { type: 'integer' },
            city: { type: 'string' },
            limit: { type: 'integer', default: 20 },
            offset: { type: 'integer', default: 0 },
          },
        },
      },
      // No auth required for public listing search
    },
    async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const startTime = Date.now();
        const { q, minRent, maxRent, limit = 20, offset = 0 } = request.query as {
          q: string;
          minRent?: number;
          maxRent?: number;
          limit?: number;
          offset?: number;
        };

        const results = await searchListings(
          q,
          { minRent, maxRent },
          limit as number,
          offset as number
        );

        return reply.send({
          success: true,
          data: {
            query: q,
            results,
            total: results.length,
            took: Date.now() - startTime,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Listing search failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'SEARCH_ERROR', message: 'Listing search failed' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /search/suggestions - Get search suggestions
  // ===========================================================================
  app.get(
    '/suggestions',
    {
      schema: {
        description: 'Get search suggestions based on partial query',
        tags: ['Search'],
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 2 },
            limit: { type: 'integer', default: 10 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: { q: string; limit?: number } }>, reply: FastifyReply) => {
      try {
        const { q, limit = 10 } = request.query;

        // Get suggestions from properties and listings
        const [properties, listings] = await Promise.all([
          prisma.property.findMany({
            where: {
              OR: [
                { name: { startsWith: q, mode: 'insensitive' } },
                { city: { startsWith: q, mode: 'insensitive' } },
                { address: { contains: q, mode: 'insensitive' } },
              ],
            },
            select: { name: true, city: true, state: true },
            take: limit,
          }),
          prisma.listing.findMany({
            where: {
              status: 'active',
              title: { contains: q, mode: 'insensitive' },
            },
            select: { title: true },
            take: limit,
          }),
        ]);

        const suggestions = new Set<string>();

        for (const p of properties) {
          if (p.name) suggestions.add(p.name);
          suggestions.add(`${p.city}, ${p.state}`);
        }

        for (const l of listings) {
          suggestions.add(l.title);
        }

        return reply.send({
          success: true,
          data: {
            query: q,
            suggestions: Array.from(suggestions).slice(0, limit),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Suggestions failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'SUGGESTIONS_ERROR', message: 'Failed to get suggestions' },
        });
      }
    }
  );

  // ===========================================================================
  // DELETE /search/cache - Clear search cache (admin only)
  // ===========================================================================
  app.delete(
    '/cache',
    {
      schema: {
        description: 'Clear search cache',
        tags: ['Search', 'Admin'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const redis = getRedis(app);
        if (!redis) {
          return reply.send({
            success: true,
            message: 'No cache to clear (Redis not available)',
          });
        }

        const keys = await redis.keys(`${CACHE_PREFIX}*`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }

        logger.info({
          msg: 'search_cache_cleared',
          adminId: request.user?.id,
          keysCleared: keys.length,
        });

        return reply.send({
          success: true,
          message: `Cleared ${keys.length} cached search results`,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to clear search cache');
        return reply.status(500).send({
          success: false,
          error: { code: 'CACHE_ERROR', message: 'Failed to clear cache' },
        });
      }
    }
  );
}
