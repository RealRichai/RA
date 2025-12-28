// @ts-nocheck
/**
 * Agent Routes - License Verification, Reviews, Commissions
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';

const updateAgentProfileSchema = z.object({
  licenseNumber: z.string().optional(),
  licenseState: z.string().length(2).optional(),
  licenseExpiry: z.string().datetime().optional(),
  brokerageName: z.string().optional(),
  brokerageAddress: z.string().optional(),
  bio: z.string().max(2000).optional(),
  specializations: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  serviceAreas: z.array(z.string()).optional()
});

const createReviewSchema = z.object({
  agentId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  transactionType: z.enum(['RENTAL', 'SALE', 'LEASE_RENEWAL']).optional()
});

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
  // Search agents
  fastify.get('/', async (request, reply) => {
    const { marketId, specialization, minRating, page = 1, limit = 20 } = request.query as {
      marketId?: string; specialization?: string; minRating?: number; page?: number; limit?: number;
    };

    const where: any = { 
      role: 'AGENT', 
      status: 'ACTIVE',
      agentProfile: { verificationStatus: 'VERIFIED' }
    };

    if (marketId) where.marketId = marketId;
    if (specialization) where.agentProfile = { ...where.agentProfile, specializations: { has: specialization } };

    const agents = await prisma.user.findMany({
      where,
      include: {
        agentProfile: true,
        market: true,
        agentReviews: { take: 5, orderBy: { createdAt: 'desc' } }
      },
      skip: (page - 1) * limit,
      take: limit
    });

    // Filter by rating if specified
    const filtered = minRating 
      ? agents.filter(a => (a.agentProfile?.averageRating || 0) >= minRating)
      : agents;

    const result = filtered.map(({ passwordHash, ...agent }) => agent);

    return reply.send({ success: true, data: result });
  });

  // Get agent profile
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const agent = await prisma.user.findUnique({
      where: { id, role: 'AGENT' },
      include: {
        agentProfile: true,
        market: true,
        agentReviews: { 
          include: { reviewer: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        agentListings: { 
          where: { status: 'ACTIVE' },
          include: { images: { take: 1 } },
          take: 6
        }
      }
    });

    if (!agent) throw new AppError(ErrorCode.NOT_FOUND, 'Agent not found', 404);

    const { passwordHash, ...agentData } = agent;
    return reply.send({ success: true, data: agentData });
  });

  // Update agent profile
  fastify.patch('/profile', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'AGENT') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only agents can update agent profile', 403);
    }

    const body = updateAgentProfileSchema.parse(request.body);

    const profile = await prisma.agentProfile.upsert({
      where: { userId: request.user.userId },
      update: body,
      create: { userId: request.user.userId, ...body }
    });

    return reply.send({ success: true, data: profile });
  });

  // Submit license for verification
  fastify.post('/verify-license', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'AGENT') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only agents can verify license', 403);
    }

    const { licenseNumber, licenseState, licenseDocumentUrl } = request.body as {
      licenseNumber: string; licenseState: string; licenseDocumentUrl: string;
    };

    const profile = await prisma.agentProfile.update({
      where: { userId: request.user.userId },
      data: {
        licenseNumber,
        licenseState,
        licenseDocumentUrl,
        verificationStatus: 'PENDING',
        verificationSubmittedAt: new Date()
      }
    });

    return reply.send({ success: true, data: profile, message: 'License submitted for verification' });
  });

  // Create review for agent
  fastify.post('/reviews', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = createReviewSchema.parse(request.body);

    // Verify agent exists
    const agent = await prisma.user.findUnique({ 
      where: { id: body.agentId, role: 'AGENT' } 
    });
    if (!agent) throw new AppError(ErrorCode.NOT_FOUND, 'Agent not found', 404);

    // Check for existing review from this user
    const existing = await prisma.agentReview.findFirst({
      where: { agentId: body.agentId, reviewerId: request.user.userId }
    });
    if (existing) {
      throw new AppError(ErrorCode.DUPLICATE, 'You have already reviewed this agent', 409);
    }

    const review = await prisma.agentReview.create({
      data: {
        agentId: body.agentId,
        reviewerId: request.user.userId,
        rating: body.rating,
        comment: body.comment,
        transactionType: body.transactionType
      }
    });

    // Update agent's average rating
    const stats = await prisma.agentReview.aggregate({
      where: { agentId: body.agentId },
      _avg: { rating: true },
      _count: { rating: true }
    });

    await prisma.agentProfile.update({
      where: { userId: body.agentId },
      data: {
        averageRating: stats._avg.rating || 0,
        totalReviews: stats._count.rating
      }
    });

    return reply.status(201).send({ success: true, data: review });
  });

  // Get agent reviews
  fastify.get('/:id/reviews', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { page = 1, limit = 10 } = request.query as { page?: number; limit?: number };

    const reviews = await prisma.agentReview.findMany({
      where: { agentId: id },
      include: { reviewer: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    });

    const total = await prisma.agentReview.count({ where: { agentId: id } });

    return reply.send({
      success: true,
      data: reviews,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  });

  // Get agent commissions (agent only)
  fastify.get('/my/commissions', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'AGENT') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only agents can view commissions', 403);
    }

    const commissions = await prisma.commission.findMany({
      where: { agentId: request.user.userId },
      include: { 
        listing: { select: { id: true, title: true, address: true } },
        application: { select: { id: true, status: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const summary = await prisma.commission.aggregate({
      where: { agentId: request.user.userId },
      _sum: { amount: true },
      _count: { id: true }
    });

    return reply.send({
      success: true,
      data: {
        commissions,
        summary: {
          totalEarnings: summary._sum.amount || 0,
          totalTransactions: summary._count.id
        }
      }
    });
  });
};
