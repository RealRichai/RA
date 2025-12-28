/**
 * Message Routes - In-app messaging, Sendblue iMessage integration
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';

const createConversationSchema = z.object({
  participantIds: z.array(z.string().uuid()).min(1),
  listingId: z.string().uuid().optional(),
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
      where: { participants: { some: { id: request.user.userId } } },
      include: {
        participants: { select: { id: true, firstName: true, lastName: true, avatar: true, role: true } },
        listing: { select: { id: true, title: true, images: { take: 1 } } },
        messages: { 
          take: 1, 
          orderBy: { createdAt: 'desc' },
          select: { id: true, content: true, createdAt: true, senderId: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
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
      return { ...conv, unreadCount };
    }));

    return reply.send({ success: true, data: result });
  });

  // Create conversation
  fastify.post('/conversations', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = createConversationSchema.parse(request.body);

    // Include current user in participants
    const allParticipants = [...new Set([request.user.userId, ...body.participantIds])];

    // Check if conversation already exists
    const existing = await prisma.conversation.findFirst({
      where: {
        AND: allParticipants.map(id => ({ participants: { some: { id } } })),
        participants: { every: { id: { in: allParticipants } } }
      },
      include: { participants: { select: { id: true, firstName: true, lastName: true, avatar: true } } }
    });

    if (existing) {
      return reply.send({ success: true, data: existing });
    }

    const conversation = await prisma.conversation.create({
      data: {
        participants: { connect: allParticipants.map(id => ({ id })) },
        listingId: body.listingId
      },
      include: { participants: { select: { id: true, firstName: true, lastName: true, avatar: true } } }
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
    }

    return reply.status(201).send({ success: true, data: conversation });
  });

  // Get conversation messages
  fastify.get('/conversations/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { cursor, limit = 50 } = request.query as { cursor?: string; limit?: number };

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { participants: { select: { id: true } } }
    });

    if (!conversation) throw new AppError(ErrorCode.NOT_FOUND, 'Conversation not found', 404);
    if (!conversation.participants.some(p => p.id === request.user.userId)) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not a participant', 403);
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
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
      include: { participants: { select: { id: true } } }
    });

    if (!conversation) throw new AppError(ErrorCode.NOT_FOUND, 'Conversation not found', 404);
    if (!conversation.participants.some(p => p.id === request.user.userId)) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not a participant', 403);
    }

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        senderId: request.user.userId,
        content: body.content,
        attachments: body.attachments || []
      },
      include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true } } }
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() }
    });

    // Notify other participants
    const otherParticipants = conversation.participants.filter(p => p.id !== request.user.userId);
    await prisma.notification.createMany({
      data: otherParticipants.map(p => ({
        userId: p.id,
        type: 'NEW_MESSAGE',
        title: 'New Message',
        message: body.content.substring(0, 100),
        data: { conversationId: id, messageId: message.id }
      }))
    });

    return reply.status(201).send({ success: true, data: message });
  });

  // Delete conversation
  fastify.delete('/conversations/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { participants: { select: { id: true } } }
    });

    if (!conversation) throw new AppError(ErrorCode.NOT_FOUND, 'Conversation not found', 404);
    if (!conversation.participants.some(p => p.id === request.user.userId)) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not a participant', 403);
    }

    // Soft delete - just remove participant
    await prisma.conversation.update({
      where: { id },
      data: { participants: { disconnect: { id: request.user.userId } } }
    });

    return reply.send({ success: true, message: 'Left conversation' });
  });

  // Get unread count
  fastify.get('/unread-count', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const count = await prisma.message.count({
      where: {
        conversation: { participants: { some: { id: request.user.userId } } },
        senderId: { not: request.user.userId },
        readAt: null
      }
    });

    return reply.send({ success: true, data: { unreadCount: count } });
  });
};
