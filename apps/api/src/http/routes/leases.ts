// @ts-nocheck
/**
 * Lease Routes - DocuSign Integration
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';

const createLeaseSchema = z.object({
  applicationId: z.string().uuid(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  monthlyRent: z.number().int().positive(),
  securityDeposit: z.number().int().min(0),
  terms: z.object({
    lateFee: z.number().int().min(0).optional(),
    lateFeeGraceDays: z.number().int().min(0).optional(),
    renewalNotice: z.number().int().min(30).optional(),
    utilities: z.array(z.string()).optional(),
    rules: z.array(z.string()).optional()
  }).optional()
});

export const leaseRoutes: FastifyPluginAsync = async (fastify) => {
  // Create lease from approved application
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = createLeaseSchema.parse(request.body);

    const application = await prisma.application.findUnique({
      where: { id: body.applicationId },
      include: { listing: true, tenant: true }
    });

    if (!application) throw new AppError(ErrorCode.NOT_FOUND, 'Application not found', 404);
    if (application.status !== 'APPROVED') {
      throw new AppError(ErrorCode.INVALID_TRANSITION, 'Application must be approved to create lease', 400);
    }

    if (application.listing.landlordId !== request.user.userId && 
        application.listing.agentId !== request.user.userId && 
        request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    const lease = await prisma.lease.create({
      data: {
        applicationId: body.applicationId,
        listingId: application.listingId,
        tenantId: application.tenantId,
        landlordId: application.listing.landlordId!,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        monthlyRent: body.monthlyRent,
        securityDeposit: body.securityDeposit,
        terms: body.terms || {},
        status: 'PENDING_SIGNATURE',
        docuSignEnvelopeId: null // Will be set when sent for signing
      },
      include: { listing: true, tenant: { select: { id: true, firstName: true, lastName: true, email: true } } }
    });

    // Update listing status
    await prisma.listing.update({
      where: { id: application.listingId },
      data: { status: 'LEASED' }
    });

    return reply.status(201).send({ success: true, data: lease });
  });

  // Get lease details
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const lease = await prisma.lease.findUnique({
      where: { id },
      include: {
        listing: { include: { images: true, market: true } },
        tenant: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        landlord: { select: { id: true, firstName: true, lastName: true, email: true } },
        payments: { orderBy: { dueDate: 'desc' } }
      }
    });

    if (!lease) throw new AppError(ErrorCode.NOT_FOUND, 'Lease not found', 404);

    if (lease.tenantId !== request.user.userId && 
        lease.landlordId !== request.user.userId && 
        request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    return reply.send({ success: true, data: lease });
  });

  // Get my leases
  fastify.get('/my/leases', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const where = request.user.role === 'TENANT'
      ? { tenantId: request.user.userId }
      : { landlordId: request.user.userId };

    const leases = await prisma.lease.findMany({
      where,
      include: {
        listing: { include: { images: { take: 1 }, market: true } },
        tenant: { select: { id: true, firstName: true, lastName: true } },
        landlord: { select: { id: true, firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send({ success: true, data: leases });
  });

  // Send for DocuSign signing
  fastify.post('/:id/send-for-signature', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const lease = await prisma.lease.findUnique({
      where: { id },
      include: { tenant: true, landlord: true }
    });

    if (!lease) throw new AppError(ErrorCode.NOT_FOUND, 'Lease not found', 404);
    if (lease.landlordId !== request.user.userId && request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    // TODO: DocuSign API integration
    // const envelope = await docusign.createEnvelope(lease);

    const updated = await prisma.lease.update({
      where: { id },
      data: {
        status: 'PENDING_SIGNATURE',
        docuSignEnvelopeId: `env_${Date.now()}`, // Placeholder
        docuSignSentAt: new Date()
      }
    });

    return reply.send({ success: true, data: updated });
  });

  // Update lease status (webhook from DocuSign)
  fastify.patch('/:id/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, signedAt, documentUrl } = request.body as { 
      status: string; signedAt?: string; documentUrl?: string; 
    };

    const lease = await prisma.lease.findUnique({ where: { id } });
    if (!lease) throw new AppError(ErrorCode.NOT_FOUND, 'Lease not found', 404);

    const updated = await prisma.lease.update({
      where: { id },
      data: {
        status,
        ...(signedAt && { signedAt: new Date(signedAt) }),
        ...(documentUrl && { documentUrl })
      }
    });

    // If lease is now active, create first payment
    if (status === 'ACTIVE' && lease.status !== 'ACTIVE') {
      await prisma.payment.create({
        data: {
          leaseId: id,
          tenantId: lease.tenantId,
          landlordId: lease.landlordId,
          amount: lease.monthlyRent,
          type: 'RENT',
          status: 'PENDING',
          dueDate: lease.startDate,
          periodStart: lease.startDate,
          periodEnd: new Date(lease.startDate.getTime() + 30 * 24 * 60 * 60 * 1000)
        }
      });
    }

    return reply.send({ success: true, data: updated });
  });

  // Terminate lease
  fastify.post('/:id/terminate', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason, effectiveDate } = request.body as { reason: string; effectiveDate: string };

    const lease = await prisma.lease.findUnique({ where: { id } });
    if (!lease) throw new AppError(ErrorCode.NOT_FOUND, 'Lease not found', 404);

    if (lease.landlordId !== request.user.userId && request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    const updated = await prisma.lease.update({
      where: { id },
      data: {
        status: 'TERMINATED',
        terminatedAt: new Date(),
        terminationReason: reason,
        terminationEffectiveDate: new Date(effectiveDate)
      }
    });

    // Re-activate listing
    await prisma.listing.update({
      where: { id: lease.listingId },
      data: { status: 'ACTIVE' }
    });

    return reply.send({ success: true, data: updated });
  });
};
