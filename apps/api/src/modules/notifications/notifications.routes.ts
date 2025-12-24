/**
 * Notifications Routes
 * REST API endpoints for notification management
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as notificationsService from './notifications.service.js';
import { NotificationFiltersSchema } from './notifications.service.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { z } from 'zod';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Get my notifications
   */
  app.get(
    '/',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filtersValidation = NotificationFiltersSchema.safeParse(request.query);
      const pageSchema = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      });
      const pageValidation = pageSchema.safeParse(request.query);

      const filters = filtersValidation.success ? filtersValidation.data : {};
      const page = pageValidation.success ? pageValidation.data.page : 1;
      const limit = pageValidation.success ? pageValidation.data.limit : 20;

      const result = await notificationsService.getUserNotifications(
        request.auth!.userId,
        filters,
        page,
        limit
      );

      if (result.isErr()) throw result.error;
      return reply.send(result.value);
    }
  );

  /**
   * Mark notification as read
   */
  app.post<{ Params: { id: string } }>(
    '/:id/read',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await notificationsService.markAsRead(
        request.params.id,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({ notification: result.value });
    }
  );

  /**
   * Mark all notifications as read
   */
  app.post(
    '/read-all',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await notificationsService.markAllAsRead(request.auth!.userId);
      if (result.isErr()) throw result.error;
      return reply.send({ count: result.value });
    }
  );

  /**
   * Delete notification
   */
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await notificationsService.deleteNotification(
        request.params.id,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.status(204).send();
    }
  );
}
