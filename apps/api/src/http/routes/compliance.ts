/**
 * Compliance Routes - FARE Act, FCHA, NYC Local Laws
 */

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';

const FARE_ACT_MAX_APPLICATION_FEE = 2000; // $20.00

export const complianceRoutes: FastifyPluginAsync = async (fastify) => {
  // Get FARE Act disclosure for listing
  fastify.get('/fare-act/:listingId', async (request, reply) => {
    const { listingId } = request.params as { listingId: string };

    const disclosure = await prisma.fAREActDisclosure.findUnique({
      where: { listingId },
      include: { listing: { select: { id: true, title: true, monthlyRent: true } } }
    });

    if (!disclosure) throw new AppError(ErrorCode.NOT_FOUND, 'Disclosure not found', 404);

    return reply.send({ success: true, data: disclosure });
  });

  // Accept FARE Act disclosure
  fastify.post('/fare-act/:listingId/accept', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { listingId } = request.params as { listingId: string };

    const disclosure = await prisma.fAREActDisclosure.findUnique({ where: { listingId } });
    if (!disclosure) throw new AppError(ErrorCode.NOT_FOUND, 'Disclosure not found', 404);

    const updated = await prisma.fAREActDisclosure.update({
      where: { listingId },
      data: { acceptedAt: new Date(), acceptedBy: request.user.userId }
    });

    return reply.send({ success: true, data: updated });
  });

  // Validate listing compliance
  fastify.post('/validate-listing', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { applicationFee, securityDeposit, monthlyRent, brokerFee, brokerFeePaidBy } = request.body as {
      applicationFee: number; securityDeposit: number; monthlyRent: number;
      brokerFee?: number; brokerFeePaidBy?: string;
    };

    const violations: string[] = [];

    // FARE Act: Max $20 application fee
    if (applicationFee > FARE_ACT_MAX_APPLICATION_FEE) {
      violations.push(`Application fee ($${(applicationFee/100).toFixed(2)}) exceeds FARE Act maximum of $20.00`);
    }

    // NYC: Security deposit max 1 month rent
    if (securityDeposit > monthlyRent) {
      violations.push(`Security deposit ($${(securityDeposit/100).toFixed(2)}) exceeds maximum of one month rent`);
    }

    // FARE Act: Broker fee disclosure required
    if (brokerFee && brokerFee > 0 && !brokerFeePaidBy) {
      violations.push('Broker fee payer must be disclosed (FARE Act requirement)');
    }

    return reply.send({
      success: true,
      data: {
        compliant: violations.length === 0,
        violations,
        regulations: ['NYC FARE Act (Local Law 18 of 2024)', 'NYC Housing Stability Act', 'NYC Local Law 63 (FCHA)']
      }
    });
  });

  // Get FCHA assessment requirements
  fastify.get('/fcha/requirements', async (request, reply) => {
    return reply.send({
      success: true,
      data: {
        name: 'Fair Chance Housing Act (NYC Local Law 63)',
        effectiveDate: '2025-01-01',
        requirements: [
          'Criminal history inquiry ONLY after conditional offer of housing',
          'Must consider Article 23-A factors before adverse action',
          'Written notice required before and after adverse action',
          '5 business days for applicant to respond to adverse action notice'
        ],
        article23AFactors: [
          { name: 'timeElapsed', description: 'Time elapsed since conviction', weight: 0.25 },
          { name: 'ageAtOffense', description: 'Age at time of offense', weight: 0.15 },
          { name: 'rehabilitation', description: 'Evidence of rehabilitation', weight: 0.30 },
          { name: 'relevanceToHousing', description: 'Relevance to housing tenancy', weight: 0.20 },
          { name: 'characterReferences', description: 'Character references', weight: 0.10 }
        ],
        scoreThreshold: 3.0
      }
    });
  });

  // Get audit log for compliance
  fastify.get('/audit-log', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Admin access required', 403);
    }

    const { entityType, entityId, page = 1, limit = 50 } = request.query as {
      entityType?: string; entityId?: string; page?: number; limit?: number;
    };

    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const logs = await prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    });

    return reply.send({ success: true, data: logs });
  });
};
