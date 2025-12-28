/**
 * Agent Routes - License Verification, Reviews, Commissions
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import type { Prisma } from '@prisma/client';

const updateAgentProfileSchema = z.object({
  licenseNumber: z.string().optional(),
  licenseState: z.string().length(2).optional(),
  licenseExpiry: z.string().datetime().optional(),
  brokerageName: z.string().optional(),
  brokerageAddress: z.string().optional(),
  bio: z.string().max(2000).optional(),
  specialties: z.array(z.string()).optional(),
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

    const where: Prisma.UserWhereInput = {
      role: 'AGENT',
      status: 'ACTIVE',
      agentProfile: { verificationStatus: 'VERIFIED' }
    };

    if (marketId) {
      // Filter by listings in the market via agentProfile
      where.agentProfile = {
        ...where.agentProfile as Prisma.AgentProfileWhereInput,
        listings: { some: { marketId } }
      };
    }
    if (specialization) {
      where.agentProfile = {
        ...where.agentProfile as Prisma.AgentProfileWhereInput,
        specialties: { has: specialization }
      };
    }

    const agents = await prisma.user.findMany({
      where,
      include: {
        agentProfile: {
          include: {
            reviews: { take: 5, orderBy: { createdAt: 'desc' } }
          }
        }
      },
      skip: (page - 1) * limit,
      take: limit
    });

    // Filter by rating if specified
    const filtered = minRating
      ? agents.filter(a => (a.agentProfile?.averageRating ? Number(a.agentProfile.averageRating) : 0) >= minRating)
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
        agentProfile: {
          include: {
            reviews: {
              include: { reviewer: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
              orderBy: { createdAt: 'desc' },
              take: 10
            },
            listings: {
              where: { status: 'ACTIVE' },
              include: { images: { take: 1 } },
              take: 6
            }
          }
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

    // Build update data properly typed
    const updateData: Prisma.AgentProfileUpdateInput = {};
    if (body.licenseNumber !== undefined) updateData.licenseNumber = body.licenseNumber;
    if (body.licenseState !== undefined) updateData.licenseState = body.licenseState;
    if (body.licenseExpiry !== undefined) updateData.licenseExpiry = new Date(body.licenseExpiry);
    if (body.brokerageName !== undefined) updateData.brokerageName = body.brokerageName;
    if (body.brokerageAddress !== undefined) updateData.brokerageAddress = body.brokerageAddress;
    if (body.bio !== undefined) updateData.bio = body.bio;
    if (body.specialties !== undefined) updateData.specialties = body.specialties;
    if (body.languages !== undefined) updateData.languages = body.languages;
    if (body.serviceAreas !== undefined) updateData.serviceAreas = body.serviceAreas;

    const profile = await prisma.agentProfile.upsert({
      where: { userId: request.user.userId },
      update: updateData,
      create: {
        userId: request.user.userId,
        licenseNumber: body.licenseNumber || '',
        licenseState: body.licenseState || 'NY',
        licenseExpiry: body.licenseExpiry ? new Date(body.licenseExpiry) : new Date(),
        brokerageName: body.brokerageName,
        brokerageAddress: body.brokerageAddress,
        bio: body.bio,
        specialties: body.specialties || [],
        languages: body.languages || [],
        serviceAreas: body.serviceAreas || []
      }
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
        verificationStatus: 'PENDING'
      }
    });

    return reply.send({ success: true, data: profile, message: 'License submitted for verification' });
  });

  // Create review for agent
  fastify.post('/reviews', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = createReviewSchema.parse(request.body);

    // Verify agent profile exists
    const agentProfile = await prisma.agentProfile.findUnique({
      where: { userId: body.agentId }
    });
    if (!agentProfile) throw new AppError(ErrorCode.NOT_FOUND, 'Agent not found', 404);

    // Check for existing review from this user
    const existing = await prisma.agentReview.findFirst({
      where: { agentId: agentProfile.id, reviewerId: request.user.userId }
    });
    if (existing) {
      throw new AppError(ErrorCode.DUPLICATE, 'You have already reviewed this agent', 409);
    }

    const review = await prisma.agentReview.create({
      data: {
        agentId: agentProfile.id,
        reviewerId: request.user.userId,
        rating: body.rating,
        comment: body.comment,
        transactionType: body.transactionType
      }
    });

    // Update agent's average rating
    const stats = await prisma.agentReview.aggregate({
      where: { agentId: agentProfile.id },
      _avg: { rating: true },
      _count: { rating: true }
    });

    await prisma.agentProfile.update({
      where: { id: agentProfile.id },
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

    // Find agent profile by userId
    const agentProfile = await prisma.agentProfile.findUnique({
      where: { userId: id }
    });

    if (!agentProfile) throw new AppError(ErrorCode.NOT_FOUND, 'Agent not found', 404);

    const reviews = await prisma.agentReview.findMany({
      where: { agentId: agentProfile.id },
      include: { reviewer: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    });

    const total = await prisma.agentReview.count({ where: { agentId: agentProfile.id } });

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

    // Find the agent profile first
    const agentProfile = await prisma.agentProfile.findUnique({
      where: { userId: request.user.userId }
    });

    if (!agentProfile) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Agent profile not found', 404);
    }

    const commissions = await prisma.commission.findMany({
      where: { agentId: agentProfile.id },
      include: {
        listing: { select: { id: true, title: true, address: true } },
        lease: { select: { id: true, status: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const summary = await prisma.commission.aggregate({
      where: { agentId: agentProfile.id },
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
