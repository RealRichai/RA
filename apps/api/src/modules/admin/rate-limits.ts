/**
 * Rate Limit Admin API
 *
 * Provides admin endpoints for monitoring and managing rate limits.
 */

import { prisma } from '@realriches/database';
import type { RateLimitCategory, RateLimitTier } from '@realriches/types';
import { DEFAULT_TIER_LIMITS, getTierFromRole } from '@realriches/types';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { getRateLimitService } from '../../plugins/rate-limit';

// =============================================================================
// Schemas
// =============================================================================

const UserRateLimitQuerySchema = z.object({
  userId: z.string().uuid(),
  category: z.enum(['default', 'ai', 'auth', 'write', 'upload', 'webhook', 'public']).optional(),
});

const ResetRateLimitSchema = z.object({
  userId: z.string().uuid(),
  category: z.enum(['default', 'ai', 'auth', 'write', 'upload', 'webhook', 'public']).optional(),
});

// =============================================================================
// Routes
// =============================================================================

export async function rateLimitAdminRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================================================
  // GET /admin/rate-limits/tiers - Get tier configurations
  // ===========================================================================
  app.get(
    '/tiers',
    {
      schema: {
        description: 'Get rate limit tier configurations',
        tags: ['Admin', 'Rate Limits'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        return reply.send({
          success: true,
          data: {
            tiers: DEFAULT_TIER_LIMITS,
            categories: ['default', 'ai', 'auth', 'write', 'upload', 'webhook', 'public'],
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get tier configurations');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get tier configurations' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/rate-limits/user/:userId - Get rate limit status for a user
  // ===========================================================================
  app.get(
    '/user/:userId',
    {
      schema: {
        description: 'Get rate limit status for a specific user',
        tags: ['Admin', 'Rate Limits'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: ['default', 'ai', 'auth', 'write', 'upload', 'webhook', 'public'] },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (
      request: FastifyRequest<{ Params: { userId: string }; Querystring: { category?: RateLimitCategory } }>,
      reply: FastifyReply
    ) => {
      try {
        const { userId } = request.params;
        const category = request.query.category;

        // Get user info
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, role: true, firstName: true, lastName: true },
        });

        if (!user) {
          return reply.status(404).send({
            success: false,
            error: { code: 'USER_NOT_FOUND', message: 'User not found' },
          });
        }

        const tier = getTierFromRole(user.role);
        const rateLimitService = getRateLimitService();

        if (!rateLimitService) {
          return reply.status(503).send({
            success: false,
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Rate limit service not available' },
          });
        }

        // Get status for requested category or all categories
        const categories: RateLimitCategory[] = category
          ? [category]
          : ['default', 'ai', 'auth', 'write', 'upload', 'webhook', 'public'];

        const states: Record<string, unknown> = {};
        for (const cat of categories) {
          const state = await rateLimitService.getState(userId, cat, tier);
          states[cat] = state;
        }

        return reply.send({
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              name: `${user.firstName} ${user.lastName}`,
              role: user.role,
              tier,
            },
            tierLimits: DEFAULT_TIER_LIMITS[tier],
            states,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get user rate limit status');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get rate limit status' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/rate-limits/reset - Reset rate limit for a user
  // ===========================================================================
  app.post(
    '/reset',
    {
      schema: {
        description: 'Reset rate limit counters for a user',
        tags: ['Admin', 'Rate Limits'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
            category: { type: 'string', enum: ['default', 'ai', 'auth', 'write', 'upload', 'webhook', 'public'] },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const params = ResetRateLimitSchema.parse(request.body);
        const rateLimitService = getRateLimitService();

        if (!rateLimitService) {
          return reply.status(503).send({
            success: false,
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Rate limit service not available' },
          });
        }

        await rateLimitService.reset(params.userId, params.category);

        logger.info({
          msg: 'rate_limit_reset',
          adminUserId: request.user?.id,
          targetUserId: params.userId,
          category: params.category || 'all',
        });

        return reply.send({
          success: true,
          message: `Rate limit reset for user ${params.userId}${params.category ? ` (${params.category})` : ' (all categories)'}`,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to reset rate limit');
        return reply.status(500).send({
          success: false,
          error: { code: 'RESET_ERROR', message: 'Failed to reset rate limit' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/rate-limits/exceeded - Get users who have hit rate limits recently
  // ===========================================================================
  app.get(
    '/exceeded',
    {
      schema: {
        description: 'Get users who have recently exceeded rate limits',
        tags: ['Admin', 'Rate Limits'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            hours: { type: 'integer', default: 24 },
            limit: { type: 'integer', default: 50 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Querystring: { hours?: number; limit?: number } }>, reply: FastifyReply) => {
      try {
        const hours = request.query.hours || 24;
        const limit = request.query.limit || 50;

        // Query audit logs for rate limit events
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);

        const rateLimitEvents = await prisma.auditLog.findMany({
          where: {
            action: 'rate_limit_exceeded',
            timestamp: { gte: since },
          },
          orderBy: { timestamp: 'desc' },
          take: limit,
          include: {
            actor: {
              select: { id: true, email: true, firstName: true, lastName: true, role: true },
            },
          },
        });

        // Aggregate by user
        const userCounts: Record<string, { count: number; categories: string[]; lastExceeded: Date }> = {};
        for (const event of rateLimitEvents) {
          const userId = event.actorId || 'anonymous';
          if (!userCounts[userId]) {
            userCounts[userId] = { count: 0, categories: [], lastExceeded: event.timestamp };
          }
          userCounts[userId].count++;
          const category = (event.metadata as Record<string, unknown>)?.category as string;
          if (category && !userCounts[userId].categories.includes(category)) {
            userCounts[userId].categories.push(category);
          }
        }

        return reply.send({
          success: true,
          data: {
            events: rateLimitEvents,
            summary: {
              totalEvents: rateLimitEvents.length,
              uniqueUsers: Object.keys(userCounts).length,
              byUser: userCounts,
            },
            period: { hours, since: since.toISOString() },
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get exceeded rate limits');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get exceeded rate limits' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/rate-limits/stats - Get overall rate limit statistics
  // ===========================================================================
  app.get(
    '/stats',
    {
      schema: {
        description: 'Get overall rate limit statistics',
        tags: ['Admin', 'Rate Limits'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get user distribution by role/tier
        const usersByRole = await prisma.user.groupBy({
          by: ['role'],
          where: { status: 'active' },
          _count: true,
        });

        const tierDistribution: Record<string, number> = {};
        for (const { role, _count } of usersByRole) {
          const tier = getTierFromRole(role);
          tierDistribution[tier] = (tierDistribution[tier] || 0) + _count;
        }

        // Get rate limit exceeded events in last 24h
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const exceededCount = await prisma.auditLog.count({
          where: {
            action: 'rate_limit_exceeded',
            timestamp: { gte: last24h },
          },
        });

        return reply.send({
          success: true,
          data: {
            tiers: DEFAULT_TIER_LIMITS,
            usersByTier: tierDistribution,
            last24Hours: {
              exceededCount,
            },
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get rate limit stats');
        return reply.status(500).send({
          success: false,
          error: { code: 'STATS_ERROR', message: 'Failed to get rate limit statistics' },
        });
      }
    }
  );
}
