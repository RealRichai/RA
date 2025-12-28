/**
 * Notification Routes - Push, Email, In-app notifications
 */

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';

export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  // Get notifications
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { page = 1, limit = 20, unreadOnly = false } = request.query as {
      page?: number; limit?: number; unreadOnly?: boolean;
    };

    const where: any = { userId: request.user.userId };
    if (unreadOnly) where.readAt = null;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.notification.count({ where })
    ]);

    return reply.send({
      success: true,
      data: notifications,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  });

  // Mark as read
  fastify.patch('/:id/read', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const notification = await prisma.notification.findFirst({
      where: { id, userId: request.user.userId }
    });

    if (!notification) throw new AppError(ErrorCode.NOT_FOUND, 'Notification not found', 404);

    const updated = await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() }
    });

    return reply.send({ success: true, data: updated });
  });

  // Mark all as read
  fastify.post('/mark-all-read', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    await prisma.notification.updateMany({
      where: { userId: request.user.userId, readAt: null },
      data: { readAt: new Date() }
    });

    return reply.send({ success: true, message: 'All notifications marked as read' });
  });

  // Get unread count
  fastify.get('/unread-count', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const count = await prisma.notification.count({
      where: { userId: request.user.userId, readAt: null }
    });

    return reply.send({ success: true, data: { count } });
  });

  // Delete notification
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.notification.deleteMany({
      where: { id, userId: request.user.userId }
    });

    return reply.send({ success: true, message: 'Notification deleted' });
  });

  // Update notification preferences
  fastify.patch('/preferences', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { email, push, sms } = request.body as {
      email?: boolean; push?: boolean; sms?: boolean;
    };

    const user = await prisma.user.update({
      where: { id: request.user.userId },
      data: {
        notificationPreferences: { email, push, sms }
      }
    });

    return reply.send({ success: true, data: user.notificationPreferences });
  });

  // Register push token
  fastify.post('/push-token', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { token, platform } = request.body as { token: string; platform: 'ios' | 'android' | 'web' };

    await prisma.user.update({
      where: { id: request.user.userId },
      data: {
        pushTokens: {
          push: { token, platform, createdAt: new Date().toISOString() }
        }
      }
    });

    return reply.send({ success: true, message: 'Push token registered' });
  });
};
