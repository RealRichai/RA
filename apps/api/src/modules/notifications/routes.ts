/**
 * Notification Preference Routes
 *
 * API endpoints for managing user notification preferences.
 */

import { prisma } from '@realriches/database';
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationFrequency,
} from '@realriches/types';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_FREQUENCIES,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_CATEGORY_DESCRIPTIONS,
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_FREQUENCY_LABELS,
  MANDATORY_CATEGORIES,
} from '@realriches/types';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { NotificationPreferenceService } from './service';

// =============================================================================
// Request Schemas
// =============================================================================

const PreferenceInputSchema = z.object({
  category: z.enum(NOTIFICATION_CATEGORIES as unknown as [string, ...string[]]),
  channel: z.enum(NOTIFICATION_CHANNELS as unknown as [string, ...string[]]),
  enabled: z.boolean().optional(),
  frequency: z.enum(NOTIFICATION_FREQUENCIES as unknown as [string, ...string[]]).optional(),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
});

const BulkPreferencesSchema = z.object({
  preferences: z.array(PreferenceInputSchema),
});

const QuietHoursSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:mm'),
  end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:mm'),
});

// =============================================================================
// Routes
// =============================================================================

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // =========================================================================
  // GET /notifications/preferences - Get all user preferences
  // =========================================================================
  app.get(
    '/preferences',
    {
      schema: {
        description: 'Get all notification preferences for the current user',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const preferences = await NotificationPreferenceService.getPreferencesByCategory(
        request.user.id
      );

      return reply.send({
        success: true,
        data: {
          preferences,
          metadata: {
            categories: NOTIFICATION_CATEGORY_LABELS,
            categoryDescriptions: NOTIFICATION_CATEGORY_DESCRIPTIONS,
            channels: NOTIFICATION_CHANNEL_LABELS,
            frequencies: NOTIFICATION_FREQUENCY_LABELS,
            mandatoryCategories: MANDATORY_CATEGORIES,
          },
        },
      });
    }
  );

  // =========================================================================
  // GET /notifications/preferences/list - Get preferences as flat list
  // =========================================================================
  app.get(
    '/preferences/list',
    {
      schema: {
        description: 'Get notification preferences as a flat list',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const preferences = await NotificationPreferenceService.getUserPreferences(request.user.id);

      return reply.send({
        success: true,
        data: preferences,
      });
    }
  );

  // =========================================================================
  // PUT /notifications/preferences - Update a single preference
  // =========================================================================
  app.put(
    '/preferences',
    {
      schema: {
        description: 'Update a notification preference',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['category', 'channel'],
          properties: {
            category: { type: 'string', enum: NOTIFICATION_CATEGORIES as unknown as string[] },
            channel: { type: 'string', enum: NOTIFICATION_CHANNELS as unknown as string[] },
            enabled: { type: 'boolean' },
            frequency: { type: 'string', enum: NOTIFICATION_FREQUENCIES as unknown as string[] },
            quietStart: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
            quietEnd: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const input = PreferenceInputSchema.parse(request.body);

      const preference = await NotificationPreferenceService.upsertPreference(request.user.id, {
        category: input.category as NotificationCategory,
        channel: input.channel as NotificationChannel,
        enabled: input.enabled,
        frequency: input.frequency as NotificationFrequency | undefined,
        quietStart: input.quietStart,
        quietEnd: input.quietEnd,
      });

      return reply.send({
        success: true,
        data: preference,
      });
    }
  );

  // =========================================================================
  // PUT /notifications/preferences/bulk - Bulk update preferences
  // =========================================================================
  app.put(
    '/preferences/bulk',
    {
      schema: {
        description: 'Bulk update notification preferences',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['preferences'],
          properties: {
            preferences: {
              type: 'array',
              items: {
                type: 'object',
                required: ['category', 'channel'],
                properties: {
                  category: { type: 'string' },
                  channel: { type: 'string' },
                  enabled: { type: 'boolean' },
                  frequency: { type: 'string' },
                  quietStart: { type: 'string' },
                  quietEnd: { type: 'string' },
                },
              },
            },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { preferences } = BulkPreferencesSchema.parse(request.body);

      const results = await NotificationPreferenceService.bulkUpsertPreferences(
        request.user.id,
        preferences.map((p) => ({
          category: p.category as NotificationCategory,
          channel: p.channel as NotificationChannel,
          enabled: p.enabled,
          frequency: p.frequency as NotificationFrequency | undefined,
          quietStart: p.quietStart,
          quietEnd: p.quietEnd,
        }))
      );

      return reply.send({
        success: true,
        data: {
          updated: results.length,
          preferences: results,
        },
      });
    }
  );

  // =========================================================================
  // POST /notifications/preferences/initialize - Initialize defaults
  // =========================================================================
  app.post(
    '/preferences/initialize',
    {
      schema: {
        description: 'Initialize default notification preferences for user',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const preferences = await NotificationPreferenceService.initializeDefaults(request.user.id);

      return reply.send({
        success: true,
        data: {
          initialized: preferences.length,
          preferences,
        },
      });
    }
  );

  // =========================================================================
  // PUT /notifications/preferences/quiet-hours - Set quiet hours
  // =========================================================================
  app.put(
    '/preferences/quiet-hours',
    {
      schema: {
        description: 'Set global quiet hours for notifications',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['start', 'end'],
          properties: {
            start: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
            end: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { start, end } = QuietHoursSchema.parse(request.body);

      await NotificationPreferenceService.setQuietHours(request.user.id, start, end);

      return reply.send({
        success: true,
        data: {
          message: 'Quiet hours updated',
          quietHours: { start, end },
        },
      });
    }
  );

  // =========================================================================
  // DELETE /notifications/preferences/quiet-hours - Clear quiet hours
  // =========================================================================
  app.delete(
    '/preferences/quiet-hours',
    {
      schema: {
        description: 'Clear quiet hours for notifications',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      await NotificationPreferenceService.clearQuietHours(request.user.id);

      return reply.send({
        success: true,
        data: { message: 'Quiet hours cleared' },
      });
    }
  );

  // =========================================================================
  // POST /notifications/preferences/unsubscribe-all - Unsubscribe from all
  // =========================================================================
  app.post(
    '/preferences/unsubscribe-all',
    {
      schema: {
        description: 'Unsubscribe from all non-mandatory notifications',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      await NotificationPreferenceService.unsubscribeAll(request.user.id);

      return reply.send({
        success: true,
        data: {
          message: 'Unsubscribed from all optional notifications',
          note: 'Security and critical compliance notifications will still be sent',
        },
      });
    }
  );

  // =========================================================================
  // POST /notifications/preferences/resubscribe-all - Reset to defaults
  // =========================================================================
  app.post(
    '/preferences/resubscribe-all',
    {
      schema: {
        description: 'Resubscribe to all notifications with default settings',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      await NotificationPreferenceService.resubscribeAll(request.user.id);

      return reply.send({
        success: true,
        data: { message: 'Resubscribed to all notifications with default settings' },
      });
    }
  );

  // =========================================================================
  // GET /notifications - Get user's notifications
  // =========================================================================
  app.get(
    '/',
    {
      schema: {
        description: 'Get notifications for the current user',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['pending', 'sent', 'read'] },
            type: { type: 'string' },
            limit: { type: 'integer', default: 20 },
            offset: { type: 'integer', default: 0 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; type?: string; limit?: number; offset?: number };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { status, type, limit = 20, offset = 0 } = request.query;

      const where: Record<string, unknown> = { userId: request.user.id };
      if (status) where.status = status;
      if (type) where.type = type;

      const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({
          where: { userId: request.user.id, readAt: null },
        }),
      ]);

      return reply.send({
        success: true,
        data: notifications,
        meta: {
          total,
          unreadCount,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    }
  );

  // =========================================================================
  // POST /notifications/:id/read - Mark notification as read
  // =========================================================================
  app.post(
    '/:id/read',
    {
      schema: {
        description: 'Mark a notification as read',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const notification = await prisma.notification.updateMany({
        where: { id: request.params.id, userId: request.user.id },
        data: { readAt: new Date() },
      });

      if (notification.count === 0) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Notification not found' },
        });
      }

      return reply.send({
        success: true,
        data: { message: 'Notification marked as read' },
      });
    }
  );

  // =========================================================================
  // POST /notifications/read-all - Mark all notifications as read
  // =========================================================================
  app.post(
    '/read-all',
    {
      schema: {
        description: 'Mark all notifications as read',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const result = await prisma.notification.updateMany({
        where: { userId: request.user.id, readAt: null },
        data: { readAt: new Date() },
      });

      return reply.send({
        success: true,
        data: { markedRead: result.count },
      });
    }
  );
}
