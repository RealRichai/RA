/**
 * Activity Feed API
 *
 * Provides a unified activity timeline for users showing:
 * - Property changes
 * - Lease events
 * - Payment activities
 * - Document actions
 * - Maintenance updates
 * - System notifications
 *
 * Uses Prisma for persistence with optional Redis caching.
 */

import {
  prisma,
  Prisma,
  type ActivityCategory,
} from '@realriches/database';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

const ACTIVITY_FEED_PREFIX = 'activity:';
const ACTIVITY_CACHE_TTL = 300; // 5 minutes
const DEFAULT_PAGE_SIZE = 20;

// =============================================================================
// Types
// =============================================================================

type ActivityType =
  | 'property_created'
  | 'property_updated'
  | 'property_deleted'
  | 'unit_created'
  | 'unit_updated'
  | 'listing_published'
  | 'listing_unpublished'
  | 'lease_created'
  | 'lease_signed'
  | 'lease_renewed'
  | 'lease_terminated'
  | 'payment_received'
  | 'payment_failed'
  | 'payment_refunded'
  | 'document_uploaded'
  | 'document_signed'
  | 'maintenance_created'
  | 'maintenance_assigned'
  | 'maintenance_completed'
  | 'inquiry_received'
  | 'showing_scheduled'
  | 'user_invited'
  | 'user_joined'
  | 'comment_added'
  | 'system_notification';

// =============================================================================
// Schemas
// =============================================================================

const CreateActivitySchema = z.object({
  type: z.string(),
  category: z.enum(['property', 'lease', 'payment', 'document', 'maintenance', 'marketing', 'user', 'system']),
  entityType: z.string(),
  entityId: z.string(),
  entityName: z.string().optional(),
  title: z.string().max(200),
  description: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
  targetUserIds: z.array(z.string()).optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function getRedis(app: FastifyInstance): Redis | null {
  return (app as unknown as { redis?: Redis }).redis || null;
}

function getActivityCategory(type: ActivityType): ActivityCategory {
  if (type.startsWith('property_') || type.startsWith('unit_') || type.startsWith('listing_')) {
    return 'property';
  }
  if (type.startsWith('lease_')) return 'lease';
  if (type.startsWith('payment_')) return 'payment';
  if (type.startsWith('document_')) return 'document';
  if (type.startsWith('maintenance_')) return 'maintenance';
  if (type.startsWith('inquiry_') || type.startsWith('showing_')) return 'marketing';
  if (type.startsWith('user_')) return 'user';
  return 'system';
}

function generateActivityTitle(type: ActivityType, entityName?: string): string {
  const titles: Record<ActivityType, string> = {
    property_created: `New property "${entityName || 'property'}" was created`,
    property_updated: `Property "${entityName || 'property'}" was updated`,
    property_deleted: `Property "${entityName || 'property'}" was deleted`,
    unit_created: `New unit added to "${entityName || 'property'}"`,
    unit_updated: `Unit "${entityName || 'unit'}" was updated`,
    listing_published: `Listing for "${entityName || 'property'}" is now live`,
    listing_unpublished: `Listing for "${entityName || 'property'}" was unpublished`,
    lease_created: `New lease drafted for "${entityName || 'unit'}"`,
    lease_signed: `Lease for "${entityName || 'unit'}" was signed`,
    lease_renewed: `Lease for "${entityName || 'unit'}" was renewed`,
    lease_terminated: `Lease for "${entityName || 'unit'}" was terminated`,
    payment_received: `Payment received for "${entityName || 'lease'}"`,
    payment_failed: `Payment failed for "${entityName || 'lease'}"`,
    payment_refunded: `Payment refunded for "${entityName || 'lease'}"`,
    document_uploaded: `Document "${entityName || 'document'}" was uploaded`,
    document_signed: `Document "${entityName || 'document'}" was signed`,
    maintenance_created: `New maintenance request: "${entityName || 'request'}"`,
    maintenance_assigned: `Maintenance request assigned: "${entityName || 'request'}"`,
    maintenance_completed: `Maintenance completed: "${entityName || 'request'}"`,
    inquiry_received: `New inquiry for "${entityName || 'listing'}"`,
    showing_scheduled: `Showing scheduled for "${entityName || 'listing'}"`,
    user_invited: `${entityName || 'User'} was invited`,
    user_joined: `${entityName || 'User'} joined the platform`,
    comment_added: `New comment on "${entityName || 'item'}"`,
    system_notification: entityName || 'System notification',
  };

  return titles[type] || 'Activity recorded';
}

async function invalidateCache(redis: Redis | null, userId: string): Promise<void> {
  if (redis) {
    await redis.del(`${ACTIVITY_FEED_PREFIX}${userId}`);
  }
}

// =============================================================================
// Activity Feed Service
// =============================================================================

export async function createActivity(
  redis: Redis | null,
  params: {
    type: ActivityType;
    actorId?: string;
    actorName?: string;
    entityType: string;
    entityId: string;
    entityName?: string;
    description?: string;
    metadata?: Record<string, unknown>;
    targetUserIds: string[];
  }
): Promise<{ id: string; type: string; category: ActivityCategory }> {
  const category = getActivityCategory(params.type);
  const title = generateActivityTitle(params.type, params.entityName);

  // Create activities for each target user
  const activities = await Promise.all(
    params.targetUserIds.map(async (userId) => {
      const activity = await prisma.activity.create({
        data: {
          type: params.type,
          category,
          userId,
          actorId: params.actorId,
          actorName: params.actorName,
          entityType: params.entityType,
          entityId: params.entityId,
          entityName: params.entityName,
          title,
          description: params.description,
          metadata: params.metadata as Prisma.InputJsonValue ?? undefined,
          isRead: false,
        },
      });

      // Invalidate cache for this user
      await invalidateCache(redis, userId);

      return activity;
    })
  );

  const firstActivity = activities[0];
  return {
    id: firstActivity?.id ?? '',
    type: params.type,
    category,
  };
}

// =============================================================================
// Routes
// =============================================================================

export async function activityRoutes(app: FastifyInstance): Promise<void> {
  const redis = getRedis(app);

  // ===========================================================================
  // GET /activity - Get activity feed for current user
  // ===========================================================================
  app.get(
    '/',
    {
      schema: {
        description: 'Get activity feed for current user',
        tags: ['Activity'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['property', 'lease', 'payment', 'document', 'maintenance', 'marketing', 'user', 'system'],
            },
            entityType: { type: 'string' },
            entityId: { type: 'string' },
            unreadOnly: { type: 'boolean' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 },
            since: { type: 'string', format: 'date-time' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          category?: ActivityCategory;
          entityType?: string;
          entityId?: string;
          unreadOnly?: boolean;
          limit?: number;
          offset?: number;
          since?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.user?.id;
        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        const { category, entityType, entityId, unreadOnly, limit = DEFAULT_PAGE_SIZE, offset = 0, since } = request.query;

        // Build where clause
        const where: Record<string, unknown> = { userId };
        if (category) where.category = category;
        if (entityType) where.entityType = entityType;
        if (entityId) where.entityId = entityId;
        if (unreadOnly) where.isRead = false;
        if (since) where.createdAt = { gt: new Date(since) };

        // Fetch from database
        const [activities, total, unreadCount] = await Promise.all([
          prisma.activity.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit,
          }),
          prisma.activity.count({ where }),
          prisma.activity.count({ where: { userId, isRead: false } }),
        ]);

        return reply.send({
          success: true,
          data: {
            activities,
            pagination: {
              total,
              limit,
              offset,
              hasMore: offset + limit < total,
            },
            unreadCount,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get activity feed');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_FAILED', message: 'Failed to get activity feed' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /activity/unread-count - Get unread activity count
  // ===========================================================================
  app.get(
    '/unread-count',
    {
      schema: {
        description: 'Get count of unread activities',
        tags: ['Activity'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user?.id;
        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        // Get counts by category
        const counts = await prisma.activity.groupBy({
          by: ['category'],
          where: { userId, isRead: false },
          _count: true,
        });

        const byCategory: Record<string, number> = {};
        let total = 0;
        for (const count of counts) {
          byCategory[count.category] = count._count;
          total += count._count;
        }

        return reply.send({
          success: true,
          data: {
            total,
            byCategory,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get unread count');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_FAILED', message: 'Failed to get unread count' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /activity/:activityId/read - Mark activity as read
  // ===========================================================================
  app.post(
    '/:activityId/read',
    {
      schema: {
        description: 'Mark an activity as read',
        tags: ['Activity'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['activityId'],
          properties: { activityId: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { activityId: string } }>, reply: FastifyReply) => {
      try {
        const userId = request.user?.id;
        const { activityId } = request.params;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        const activity = await prisma.activity.findFirst({
          where: { id: activityId, userId },
        });

        if (!activity) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Activity not found' },
          });
        }

        await prisma.activity.update({
          where: { id: activityId },
          data: { isRead: true },
        });

        await invalidateCache(redis, userId);

        return reply.send({
          success: true,
          message: 'Activity marked as read',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to mark activity as read');
        return reply.status(500).send({
          success: false,
          error: { code: 'UPDATE_FAILED', message: 'Failed to mark activity as read' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /activity/read-all - Mark all activities as read
  // ===========================================================================
  app.post(
    '/read-all',
    {
      schema: {
        description: 'Mark all activities as read',
        tags: ['Activity'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            before: { type: 'string', format: 'date-time' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: { category?: string; before?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.user?.id;
        const { category, before } = request.body || {};

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        const where: Record<string, unknown> = { userId, isRead: false };
        if (category) where.category = category as ActivityCategory;
        if (before) where.createdAt = { lte: new Date(before) };

        const result = await prisma.activity.updateMany({
          where,
          data: { isRead: true },
        });

        await invalidateCache(redis, userId);

        return reply.send({
          success: true,
          message: `${result.count} activities marked as read`,
          data: { markedCount: result.count },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to mark all activities as read');
        return reply.status(500).send({
          success: false,
          error: { code: 'UPDATE_FAILED', message: 'Failed to mark activities as read' },
        });
      }
    }
  );

  // ===========================================================================
  // DELETE /activity/:activityId - Delete an activity
  // ===========================================================================
  app.delete(
    '/:activityId',
    {
      schema: {
        description: 'Delete an activity from feed',
        tags: ['Activity'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['activityId'],
          properties: { activityId: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { activityId: string } }>, reply: FastifyReply) => {
      try {
        const userId = request.user?.id;
        const { activityId } = request.params;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          });
        }

        const activity = await prisma.activity.findFirst({
          where: { id: activityId, userId },
        });

        if (!activity) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Activity not found' },
          });
        }

        await prisma.activity.delete({
          where: { id: activityId },
        });

        await invalidateCache(redis, userId);

        return reply.send({
          success: true,
          message: 'Activity deleted',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to delete activity');
        return reply.status(500).send({
          success: false,
          error: { code: 'DELETE_FAILED', message: 'Failed to delete activity' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /activity - Create activity (admin/internal use)
  // ===========================================================================
  app.post(
    '/',
    {
      schema: {
        description: 'Create a new activity (admin only)',
        tags: ['Activity', 'Admin'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['type', 'category', 'entityType', 'entityId', 'title'],
          properties: {
            type: { type: 'string' },
            category: {
              type: 'string',
              enum: ['property', 'lease', 'payment', 'document', 'maintenance', 'marketing', 'user', 'system'],
            },
            entityType: { type: 'string' },
            entityId: { type: 'string' },
            entityName: { type: 'string' },
            title: { type: 'string', maxLength: 200 },
            description: { type: 'string', maxLength: 500 },
            metadata: { type: 'object' },
            targetUserIds: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const input = CreateActivitySchema.parse(request.body);
        const actorId = request.user?.id;
        const actorName = request.user?.email;

        const targetUserIds = input.targetUserIds || [];

        const activity = await createActivity(redis, {
          type: input.type as ActivityType,
          actorId,
          actorName,
          entityType: input.entityType,
          entityId: input.entityId,
          entityName: input.entityName,
          description: input.description,
          metadata: input.metadata,
          targetUserIds,
        });

        logger.info({
          msg: 'activity_created',
          activityId: activity.id,
          type: activity.type,
          targetCount: targetUserIds.length,
        });

        return reply.status(201).send({
          success: true,
          data: activity,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        logger.error({ error }, 'Failed to create activity');
        return reply.status(500).send({
          success: false,
          error: { code: 'CREATE_FAILED', message: 'Failed to create activity' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /activity/entity/:entityType/:entityId - Get activity for entity
  // ===========================================================================
  app.get(
    '/entity/:entityType/:entityId',
    {
      schema: {
        description: 'Get activity history for a specific entity',
        tags: ['Activity'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['entityType', 'entityId'],
          properties: {
            entityType: { type: 'string' },
            entityId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Params: { entityType: string; entityId: string };
        Querystring: { limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { entityType, entityId } = request.params;
        const { limit = 50 } = request.query;

        // Fetch from Activity table
        const activities = await prisma.activity.findMany({
          where: {
            entityType,
            entityId,
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: {
            actor: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        });

        const formatted = activities.map((activity) => ({
          id: activity.id,
          type: activity.type,
          category: activity.category,
          actorId: activity.actorId,
          actorName: activity.actor
            ? `${activity.actor.firstName} ${activity.actor.lastName}`
            : activity.actorName,
          entityType: activity.entityType,
          entityId: activity.entityId,
          entityName: activity.entityName,
          title: activity.title,
          description: activity.description,
          metadata: activity.metadata,
          timestamp: activity.createdAt.toISOString(),
        }));

        return reply.send({
          success: true,
          data: {
            entityType,
            entityId,
            activities: formatted,
            total: formatted.length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get entity activity');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_FAILED', message: 'Failed to get entity activity' },
        });
      }
    }
  );
}
