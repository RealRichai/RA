/**
 * Message Routes - In-app messaging
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';

const createConversationSchema = z.object({
  participantIds: z.array(z.string()).min(1),
  listingId: z.string().optional(),
  initialMessage: z.string().min(1).max(2000).optional()
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(2000),
  attachments: z.array(z.object({
    type: z.enum(['IMAGE', 'DOCUMENT', 'LINK']),
    url: z.string().url(),
    name: z.string().optional()
  })).optional()
});

export const messageRoutes: FastifyPluginAsync = async (fastify) => {
  // Get conversations
  fastify.get('/conversations', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: { some: { userId: request.user.userId } }
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true } }
          }
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, content: true, createdAt: true, senderId: true }
        }
      },
      orderBy: { lastMessageAt: 'desc' }
    });

    // Add unread count
    const result = await Promise.all(conversations.map(async (conv) => {
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conv.id,
          senderId: { not: request.user.userId },
          readAt: null
        }
      });
      return {
        ...conv,
        unreadCount,
        participants: conv.participants.map(p => p.user)
      };
    }));

    return reply.send({ success: true, data: result });
  });

  // Create conversation
  fastify.post('/conversations', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = createConversationSchema.parse(request.body);

    // Include current user in participants
    const allParticipants = [...new Set([request.user.userId, ...body.participantIds])];

    // Check if conversation already exists between these participants
    const existing = await prisma.conversation.findFirst({
      where: {
        AND: allParticipants.map(id => ({
          participants: { some: { userId: id } }
        }))
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } }
          }
        }
      }
    });

    if (existing && existing.participants.length === allParticipants.length) {
      return reply.send({
        success: true,
        data: {
          ...existing,
          participants: existing.participants.map(p => p.user)
        }
      });
    }

    const conversation = await prisma.conversation.create({
      data: {
        listingId: body.listingId,
        participants: {
          create: allParticipants.map(userId => ({ userId }))
        }
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } }
          }
        }
      }
    });

    // Send initial message if provided
    if (body.initialMessage) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: request.user.userId,
          content: body.initialMessage
        }
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() }
      });
    }

    return reply.status(201).send({
      success: true,
      data: {
        ...conversation,
        participants: conversation.participants.map(p => p.user)
      }
    });
  });

  // Get conversation messages
  fastify.get('/conversations/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { cursor, limit = 50 } = request.query as { cursor?: string; limit?: number };

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { participants: { select: { userId: true } } }
    });

    if (!conversation) throw new AppError(ErrorCode.NOT_FOUND, 'Conversation not found', 404);
    if (!conversation.participants.some(p => p.userId === request.user.userId)) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not a participant', 403);
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      include: { sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor && { cursor: { id: cursor }, skip: 1 })
    });

    // Mark messages as read
    await prisma.message.updateMany({
      where: {
        conversationId: id,
        senderId: { not: request.user.userId },
        readAt: null
      },
      data: { readAt: new Date() }
    });

    return reply.send({
      success: true,
      data: messages.reverse(),
      nextCursor: messages.length === limit ? messages[0].id : null
    });
  });

  // Send message
  fastify.post('/conversations/:id/messages', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = sendMessageSchema.parse(request.body);

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { participants: { select: { userId: true } } }
    });

    if (!conversation) throw new AppError(ErrorCode.NOT_FOUND, 'Conversation not found', 404);
    if (!conversation.participants.some(p => p.userId === request.user.userId)) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not a participant', 403);
    }

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        senderId: request.user.userId,
        content: body.content,
        attachments: body.attachments || []
      },
      include: { sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } }
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date() }
    });

    // Notify other participants
    const otherParticipants = conversation.participants.filter(p => p.userId !== request.user.userId);
    if (otherParticipants.length > 0) {
      await prisma.notification.createMany({
        data: otherParticipants.map(p => ({
          userId: p.userId,
          type: 'MESSAGE_RECEIVED' as const,
          title: 'New Message',
          body: body.content.substring(0, 100),
          data: { conversationId: id, messageId: message.id }
        }))
      });
    }

    return reply.status(201).send({ success: true, data: message });
  });

  // Delete conversation (leave)
  fastify.delete('/conversations/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const participant = await prisma.conversationParticipant.findFirst({
      where: { conversationId: id, userId: request.user.userId }
    });

    if (!participant) throw new AppError(ErrorCode.NOT_FOUND, 'Conversation not found', 404);

    // Remove participant from conversation
    await prisma.conversationParticipant.delete({
      where: { id: participant.id }
    });

    return reply.send({ success: true, message: 'Left conversation' });
  });

  // Get unread count
  fastify.get('/unread-count', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const count = await prisma.message.count({
      where: {
        conversation: { participants: { some: { userId: request.user.userId } } },
        senderId: { not: request.user.userId },
        readAt: null
      }
    });

    return reply.send({ success: true, data: { unreadCount: count } });
  });
};
