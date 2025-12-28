// @ts-nocheck
/**
 * Application Routes - FCHA Compliant
 * Fair Chance Housing Act (NYC Local Law 63) compliance
 * Criminal history can only be assessed AFTER conditional offer
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';

const createApplicationSchema = z.object({
  listingId: z.string().uuid(),
  employmentInfo: z.object({
    status: z.enum(['EMPLOYED', 'SELF_EMPLOYED', 'UNEMPLOYED', 'RETIRED', 'STUDENT']),
    employer: z.string().optional(),
    title: z.string().optional(),
    monthlyIncome: z.number().positive(),
    startDate: z.string().optional()
  }),
  references: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
    phone: z.string(),
    email: z.string().email().optional()
  })).optional(),
  additionalOccupants: z.number().int().min(0).optional(),
  pets: z.array(z.object({
    type: z.string(),
    breed: z.string().optional(),
    weight: z.number().optional()
  })).optional(),
  moveInDate: z.string().datetime(),
  message: z.string().max(1000).optional()
});

// FCHA Assessment - Only after conditional offer
const fchaAssessmentSchema = z.object({
  applicationId: z.string().uuid(),
  hasCriminalHistory: z.boolean(),
  convictionDetails: z.array(z.object({
    offense: z.string(),
    date: z.string(),
    jurisdiction: z.string(),
    sentence: z.string().optional()
  })).optional(),
  factors: z.object({
    timeElapsed: z.number().int().min(1).max(5), // 1-5 scale
    ageAtOffense: z.number().int().min(1).max(5),
    rehabilitation: z.number().int().min(1).max(5),
    relevanceToHousing: z.number().int().min(1).max(5),
    characterReferences: z.number().int().min(1).max(5)
  }),
  supportingDocuments: z.array(z.string()).optional(),
  additionalContext: z.string().optional()
});

export const applicationRoutes: FastifyPluginAsync = async (fastify) => {
  // Create application (tenants only)
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'TENANT') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only tenants can submit applications', 403);
    }

    const body = createApplicationSchema.parse(request.body);

    // Check listing exists and is active
    const listing = await prisma.listing.findUnique({
      where: { id: body.listingId },
      include: { fareActDisclosure: true }
    });

    if (!listing || listing.status !== 'ACTIVE') {
      throw new AppError(ErrorCode.NOT_FOUND, 'Listing not found or not available', 404);
    }

    // Check for existing application
    const existing = await prisma.application.findFirst({
      where: { 
        listingId: body.listingId, 
        tenantId: request.user.userId,
        status: { notIn: ['WITHDRAWN', 'REJECTED'] }
      }
    });

    if (existing) {
      throw new AppError(ErrorCode.DUPLICATE, 'You have already applied to this listing', 409);
    }

    const application = await prisma.application.create({
      data: {
        listingId: body.listingId,
        tenantId: request.user.userId,
        status: 'PENDING',
        employmentInfo: body.employmentInfo,
        references: body.references || [],
        additionalOccupants: body.additionalOccupants || 0,
        pets: body.pets || [],
        moveInDate: new Date(body.moveInDate),
        message: body.message,
        fchaStatus: 'NOT_APPLICABLE', // FCHA only applies after conditional offer
        fareActDisclosureAccepted: true,
        fareActDisclosureAcceptedAt: new Date()
      },
      include: { listing: { include: { images: true } } }
    });

    // Notify landlord/agent
    const recipientId = listing.landlordId || listing.agentId;
    if (recipientId) {
      await prisma.notification.create({
        data: {
          userId: recipientId,
          type: 'NEW_APPLICATION',
          title: 'New Application Received',
          message: `New application for ${listing.title}`,
          data: { applicationId: application.id, listingId: listing.id }
        }
      });
    }

    return reply.status(201).send({ success: true, data: application });
  });

  // Get application details
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        listing: { include: { images: true, market: true } },
        tenant: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatar: true } },
        documents: true,
        fchaAssessment: true
      }
    });

    if (!application) throw new AppError(ErrorCode.NOT_FOUND, 'Application not found', 404);

    // Authorization: tenant can see their own, landlord/agent can see for their listings
    const isOwner = application.tenantId === request.user.userId;
    const isListingOwner = application.listing.landlordId === request.user.userId || 
                           application.listing.agentId === request.user.userId;
    const isAdmin = request.user.role === 'ADMIN';

    if (!isOwner && !isListingOwner && !isAdmin) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized to view this application', 403);
    }

    return reply.send({ success: true, data: application });
  });

  // Get my applications (tenant)
  fastify.get('/my/applications', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const applications = await prisma.application.findMany({
      where: { tenantId: request.user.userId },
      include: { listing: { include: { images: { take: 1 }, market: true } } },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send({ success: true, data: applications });
  });

  // Get applications for listing (landlord/agent)
  fastify.get('/listing/:listingId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { listingId } = request.params as { listingId: string };

    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new AppError(ErrorCode.NOT_FOUND, 'Listing not found', 404);

    if (listing.landlordId !== request.user.userId && listing.agentId !== request.user.userId && request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    const applications = await prisma.application.findMany({
      where: { listingId },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatar: true, tenantProfile: true } },
        documents: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send({ success: true, data: applications });
  });

  // Update application status (landlord/agent)
  fastify.patch('/:id/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, reason } = request.body as { status: string; reason?: string };

    const application = await prisma.application.findUnique({
      where: { id },
      include: { listing: true, tenant: true }
    });

    if (!application) throw new AppError(ErrorCode.NOT_FOUND, 'Application not found', 404);

    if (application.listing.landlordId !== request.user.userId && 
        application.listing.agentId !== request.user.userId && 
        request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    // FCHA Compliance: Can only move to CONDITIONAL_OFFER before assessing criminal history
    const validTransitions: Record<string, string[]> = {
      'PENDING': ['UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'],
      'UNDER_REVIEW': ['CONDITIONAL_OFFER', 'REJECTED'],
      'CONDITIONAL_OFFER': ['FCHA_PENDING', 'APPROVED', 'REJECTED'], // FCHA only after conditional offer
      'FCHA_PENDING': ['FCHA_APPROVED', 'FCHA_DENIED'],
      'FCHA_APPROVED': ['APPROVED'],
      'FCHA_DENIED': ['REJECTED']
    };

    if (!validTransitions[application.status]?.includes(status)) {
      throw new AppError(ErrorCode.INVALID_TRANSITION, `Cannot transition from ${application.status} to ${status}`, 400);
    }

    const updated = await prisma.application.update({
      where: { id },
      data: {
        status,
        statusReason: reason,
        ...(status === 'CONDITIONAL_OFFER' && { conditionalOfferAt: new Date() }),
        ...(status === 'FCHA_PENDING' && { fchaStatus: 'PENDING_ASSESSMENT' }),
        ...(status === 'APPROVED' && { approvedAt: new Date() })
      }
    });

    // Notify tenant
    await prisma.notification.create({
      data: {
        userId: application.tenantId,
        type: 'APPLICATION_UPDATE',
        title: 'Application Status Updated',
        message: `Your application status has been updated to: ${status}`,
        data: { applicationId: id, status }
      }
    });

    return reply.send({ success: true, data: updated });
  });

  // Submit FCHA assessment (AFTER conditional offer only)
  fastify.post('/:id/fcha-assessment', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = fchaAssessmentSchema.parse({ ...request.body, applicationId: id });

    const application = await prisma.application.findUnique({
      where: { id },
      include: { listing: true }
    });

    if (!application) throw new AppError(ErrorCode.NOT_FOUND, 'Application not found', 404);

    // FCHA Compliance: Can only assess after conditional offer
    if (application.status !== 'FCHA_PENDING' && application.status !== 'CONDITIONAL_OFFER') {
      throw new AppError(
        ErrorCode.FCHA_VIOLATION,
        'Criminal history can only be assessed after a conditional offer is made (FCHA compliance)',
        400
      );
    }

    if (application.listing.landlordId !== request.user.userId && 
        application.listing.agentId !== request.user.userId && 
        request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    // Calculate Article 23-A weighted score (NYC Fair Chance Act)
    const factors = body.factors;
    const weightedScore = (
      factors.timeElapsed * 0.25 +
      factors.ageAtOffense * 0.15 +
      factors.rehabilitation * 0.30 +
      factors.relevanceToHousing * 0.20 +
      factors.characterReferences * 0.10
    );

    // Score >= 3.0 generally favors approval
    const recommendation = weightedScore >= 3.0 ? 'APPROVE' : 'FURTHER_REVIEW';

    const assessment = await prisma.fCHAAssessment.create({
      data: {
        applicationId: id,
        assessedBy: request.user.userId,
        hasCriminalHistory: body.hasCriminalHistory,
        convictionDetails: body.convictionDetails || [],
        article23AFactors: body.factors,
        weightedScore,
        recommendation,
        supportingDocuments: body.supportingDocuments || [],
        additionalContext: body.additionalContext,
        status: 'COMPLETED'
      }
    });

    // Update application status
    await prisma.application.update({
      where: { id },
      data: {
        fchaStatus: 'ASSESSMENT_COMPLETE',
        fchaAssessmentId: assessment.id
      }
    });

    return reply.status(201).send({ success: true, data: assessment });
  });

  // Withdraw application (tenant)
  fastify.post('/:id/withdraw', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const application = await prisma.application.findUnique({ where: { id } });

    if (!application) throw new AppError(ErrorCode.NOT_FOUND, 'Application not found', 404);
    if (application.tenantId !== request.user.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    if (['APPROVED', 'REJECTED', 'WITHDRAWN'].includes(application.status)) {
      throw new AppError(ErrorCode.INVALID_TRANSITION, 'Cannot withdraw application in current status', 400);
    }

    const updated = await prisma.application.update({
      where: { id },
      data: { status: 'WITHDRAWN', withdrawnAt: new Date() }
    });

    return reply.send({ success: true, data: updated });
  });

  // Upload application document
  fastify.post('/:id/documents', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { type, url, name, mimeType, size } = request.body as {
      type: string; url: string; name: string; mimeType: string; size: number;
    };

    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) throw new AppError(ErrorCode.NOT_FOUND, 'Application not found', 404);
    if (application.tenantId !== request.user.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    const document = await prisma.applicationDocument.create({
      data: { applicationId: id, type, url, name, mimeType, size, status: 'PENDING' }
    });

    return reply.status(201).send({ success: true, data: document });
  });
};
