/**
 * User Routes - Profile Management, Documents, Verification
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';

const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  phone: z.string().regex(/^\+1[0-9]{10}$/).optional(),
  avatar: z.string().url().optional(),
  marketId: z.string().uuid().optional()
});

const updateTenantProfileSchema = z.object({
  employerName: z.string().min(1).optional(),
  jobTitle: z.string().min(1).optional(),
  annualIncome: z.number().nonnegative().optional(),
  creditScore: z.number().int().min(300).max(850).optional(),
  monthlyDebt: z.number().nonnegative().optional(),
  emergencyName: z.string().min(1).optional(),
  emergencyPhone: z.string().min(1).optional(),
  emergencyRelation: z.string().min(1).optional(),
  plaidAccessToken: z.string().min(1).optional(),
  plaidItemId: z.string().min(1).optional(),
  incomeVerified: z.boolean().optional(),
});

const updateLandlordProfileSchema = z.object({
  companyName: z.string().min(1).optional(),
  businessLicense: z.string().min(1).optional(),
  stripeAccountId: z.string().min(1).optional(),
  stripeOnboarded: z.boolean().optional(),
  stripePayoutsEnabled: z.boolean().optional(),
  autoApproveApplications: z.boolean().optional(),
  requireScreening: z.boolean().optional(),
  preferredPaymentMethod: z.enum(["ACH", "WIRE", "CHECK"]).optional(),
});


function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // Get user profile
  fastify.get('/profile', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      include: {
        tenantProfile: true,
        landlordProfile: true,
        agentProfile: true,
        documents: true
      }
    });

    if (!user) throw new AppError(ErrorCode.NOT_FOUND, 'User not found', 404);

    const { passwordHash, ...userData } = user;
    return reply.send({ success: true, data: userData });
  });

  // Update user profile
  fastify.patch('/profile', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = updateProfileSchema.parse(request.body);

    const user = await prisma.user.update({
      where: { id: request.user.userId },
      data: body
    });

    const { passwordHash, ...userData } = user;
    return reply.send({ success: true, data: userData });
  });

  // Update tenant profile
  fastify.patch('/profile/tenant', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'TENANT') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only tenants can update tenant profile', 403);
    }

    const body = updateTenantProfileSchema.parse(request.body);

    const profile = await prisma.tenantProfile.upsert({
      where: { userId: request.user.userId },
      update: stripUndefined(body as any) as any,
      create: { user: { connect: { id: request.user.userId } }, ...(stripUndefined(body as any) as any) }
    });

    return reply.send({ success: true, data: profile });
  });

  // Update landlord profile
  fastify.patch('/profile/landlord', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'LANDLORD') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only landlords can update landlord profile', 403);
    }

    const body = updateLandlordProfileSchema.parse(request.body);

    const profile = await prisma.landlordProfile.upsert({
      where: { userId: request.user.userId },
      update: stripUndefined(body as any) as any,
      create: { user: { connect: { id: request.user.userId } }, ...(stripUndefined(body as any) as any) }
    });

    return reply.send({ success: true, data: profile });
  });

  // Upload document
  fastify.post('/documents', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { type, url, name, mimeType, size } = request.body as {
      type: string; url: string; name: string; mimeType: string; size: number;
    };

    const document = await prisma.userDocument.create({
      data: {
        userId: request.user.userId,
        type: type as any,
        url,
        name,
        mimeType,
        size,
        status: 'PENDING'
      }
    });

    return reply.status(201).send({ success: true, data: document });
  });

  // Get user documents
  fastify.get('/documents', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const documents = await prisma.userDocument.findMany({
      where: { userId: request.user.userId },
      orderBy: { uploadedAt: 'desc' }
    });

    return reply.send({ success: true, data: documents });
  });

  // Delete document
  fastify.delete('/documents/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const document = await prisma.userDocument.findFirst({
      where: { id, userId: request.user.userId }
    });

    if (!document) throw new AppError(ErrorCode.NOT_FOUND, 'Document not found', 404);

    await prisma.userDocument.delete({ where: { id } });

    return reply.send({ success: true, message: 'Document deleted' });
  });

  // Get user's favorites
  fastify.get('/favorites', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const favorites = await prisma.favorite.findMany({
      where: { userId: request.user.userId },
      include: { listing: { include: { images: true, market: true } } },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send({ success: true, data: favorites });
  });

  // Add favorite
  fastify.post('/favorites/:listingId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { listingId } = request.params as { listingId: string };

    const favorite = await prisma.favorite.upsert({
      where: { userId_listingId: { userId: request.user.userId, listingId } },
      update: {},
      create: { userId: request.user.userId, listingId }
    });

    return reply.status(201).send({ success: true, data: favorite });
  });

  // Remove favorite
  fastify.delete('/favorites/:listingId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { listingId } = request.params as { listingId: string };

    await prisma.favorite.deleteMany({
      where: { userId: request.user.userId, listingId }
    });

    return reply.send({ success: true, message: 'Favorite removed' });
  });
};
