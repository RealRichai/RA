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
 * Supports real-time updates via WebSocket integration.
 */

import { prisma } from '@realriches/database';
import { logger, generatePrefixedId } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

const ACTIVITY_FEED_PREFIX = 'activity:';
const ACTIVITY_CACHE_TTL = 300; // 5 minutes
const MAX_FEED_SIZE = 1000;
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

type ActivityCategory = 'property' | 'lease' | 'payment' | 'document' | 'maintenance' | 'marketing' | 'user' | 'system';

interface Activity {
  id: string;
  type: ActivityType;
  category: ActivityCategory;
  userId: string;
  actorId?: string;
  actorName?: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

interface ActivityFeedOptions {
  userId: string;
  category?: ActivityCategory;
  entityType?: string;
  entityId?: string;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
  since?: string;
}

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
// In-Memory Storage (Redis fallback)
// =============================================================================

const inMemoryActivities = new Map<string, Activity[]>();

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

async function getUserActivities(redis: Redis | null, userId: string): Promise<Activity[]> {
  if (redis) {
    const data = await redis.get(`${ACTIVITY_FEED_PREFIX}${userId}`);
    if (data) return JSON.parse(data);
  }
  return inMemoryActivities.get(userId) || [];
}

async function saveUserActivities(redis: Redis | null, userId: string, activities: Activity[]): Promise<void> {
  // Keep only the most recent activities
  const trimmed = activities.slice(0, MAX_FEED_SIZE);

  if (redis) {
    await redis.setex(`${ACTIVITY_FEED_PREFIX}${userId}`, ACTIVITY_CACHE_TTL, JSON.stringify(trimmed));
  }
  inMemoryActivities.set(userId, trimmed);
}

async function addActivity(redis: Redis | null, activity: Activity, targetUserIds: string[]): Promise<void> {
  for (const userId of targetUserIds) {
    const activities = await getUserActivities(redis, userId);
    activities.unshift({ ...activity, userId });
    await saveUserActivities(redis, userId, activities);
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
): Promise<Activity> {
  const activity: Activity = {
    id: generatePrefixedId('act'),
    type: params.type,
    category: getActivityCategory(params.type),
    userId: '', // Will be set per user
    actorId: params.actorId,
    actorName: params.actorName,
    entityType: params.entityType,
    entityId: params.entityId,
    entityName: params.entityName,
    title: generateActivityTitle(params.type, params.entityName),
    description: params.description,
    metadata: params.metadata,
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  await addActivity(redis, activity, params.targetUserIds);

  // Also store in database for persistence
  try {
    await prisma.auditLog.create({
      data: {
        action: `activity:${params.type}`,
        actorId: params.actorId,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: {
          activityId: activity.id,
          entityName: params.entityName,
          description: params.description,
          targetUserIds: params.targetUserIds,
          ...params.metadata,
        },
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to persist activity to audit log');
  }

  return activity;
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

        let activities = await getUserActivities(redis, userId);

        // Apply filters
        if (category) {
          activities = activities.filter((a) => a.category === category);
        }
        if (entityType) {
          activities = activities.filter((a) => a.entityType === entityType);
        }
        if (entityId) {
          activities = activities.filter((a) => a.entityId === entityId);
        }
        if (unreadOnly) {
          activities = activities.filter((a) => !a.isRead);
        }
        if (since) {
          const sinceDate = new Date(since);
          activities = activities.filter((a) => new Date(a.createdAt) > sinceDate);
        }

        const total = activities.length;
        const paginated = activities.slice(offset, offset + limit);

        // Count unread
        const unreadCount = activities.filter((a) => !a.isRead).length;

        return reply.send({
          success: true,
          data: {
            activities: paginated,
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

        const activities = await getUserActivities(redis, userId);
        const unreadCount = activities.filter((a) => !a.isRead).length;

        // Count by category
        const byCategory: Record<string, number> = {};
        activities.filter((a) => !a.isRead).forEach((a) => {
          byCategory[a.category] = (byCategory[a.category] || 0) + 1;
        });

        return reply.send({
          success: true,
          data: {
            total: unreadCount,
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

        const activities = await getUserActivities(redis, userId);
        const activity = activities.find((a) => a.id === activityId);

        if (!activity) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Activity not found' },
          });
        }

        activity.isRead = true;
        await saveUserActivities(redis, userId, activities);

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

        const activities = await getUserActivities(redis, userId);
        let markedCount = 0;

        for (const activity of activities) {
          if (activity.isRead) continue;

          // Apply filters
          if (category && activity.category !== category) continue;
          if (before && new Date(activity.createdAt) > new Date(before)) continue;

          activity.isRead = true;
          markedCount++;
        }

        await saveUserActivities(redis, userId, activities);

        return reply.send({
          success: true,
          message: `${markedCount} activities marked as read`,
          data: { markedCount },
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

        let activities = await getUserActivities(redis, userId);
        const initialLength = activities.length;

        activities = activities.filter((a) => a.id !== activityId);

        if (activities.length === initialLength) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Activity not found' },
          });
        }

        await saveUserActivities(redis, userId, activities);

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

        // Fetch from audit logs
        const logs = await prisma.auditLog.findMany({
          where: {
            entityType: entityType,
            entityId: entityId,
            action: { startsWith: 'activity:' },
          },
          orderBy: { timestamp: 'desc' },
          take: limit,
          include: {
            actor: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        });

        const activities = logs.map((log) => ({
          id: (log.metadata as Record<string, string>)?.activityId || log.id,
          type: log.action.replace('activity:', ''),
          actorId: log.actorId,
          actorName: log.actor ? `${log.actor.firstName} ${log.actor.lastName}` : undefined,
          entityType: log.entityType,
          entityId: log.entityId,
          entityName: (log.metadata as Record<string, string>)?.entityName,
          description: (log.metadata as Record<string, string>)?.description,
          metadata: log.metadata,
          timestamp: log.timestamp.toISOString(),
        }));

        return reply.send({
          success: true,
          data: {
            entityType,
            entityId,
            activities,
            total: activities.length,
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

