import {
  gateRentIncrease,
  gateLeaseCreation,
  gateFCHAStageTransition,
  gateFCHABackgroundCheck,
  gateDisclosureRequirement,
  type ComplianceDecision,
  type FCHAStage,
} from '@realriches/compliance-engine';
import { prisma } from '@realriches/database';
import { generatePrefixedId, NotFoundError, ForbiddenError, ValidationError, logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const CreateLeaseSchema = z.object({
  unitId: z.string(),
  tenantId: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  monthlyRent: z.number().min(0),
  securityDeposit: z.number().min(0).optional(),
  leaseType: z.enum(['standard', 'rebny', 'custom']).default('standard'),
  terms: z.record(z.unknown()).optional(),
  isRentStabilized: z.boolean().default(false),
  legalRentAmount: z.number().optional(),
  preferentialRentAmount: z.number().optional(),
  deliveredDisclosures: z.array(z.string()).default([]),
  acknowledgedDisclosures: z.array(z.string()).default([]),
});

const RentIncreaseSchema = z.object({
  newMonthlyRent: z.number().min(0),
  effectiveDate: z.string().datetime(),
  noticeDays: z.number().int().min(0),
  reason: z.string().optional(),
});

const ApplicationStageTransitionSchema = z.object({
  targetStage: z.enum([
    'initial_inquiry',
    'application_submitted',
    'application_review',
    'conditional_offer',
    'background_check',
    'final_approval',
    'lease_signing',
  ]),
});

const BackgroundCheckSchema = z.object({
  checkType: z.enum(['criminal_background_check', 'credit_check', 'eviction_history']),
});

/**
 * Store compliance check in database
 */
async function storeComplianceCheck(
  entityType: string,
  entityId: string,
  marketId: string,
  decision: ComplianceDecision
): Promise<string> {
  const check = await prisma.complianceCheck.create({
    data: {
      id: generatePrefixedId('cck'),
      entityType,
      entityId,
      marketId,
      checkType: decision.checksPerformed.join(','),
      status: decision.passed ? 'passed' : 'failed',
      severity: decision.violations.length > 0
        ? decision.violations.reduce((worst, v) => {
            const order = ['info', 'warning', 'violation', 'critical'];
            return order.indexOf(v.severity) > order.indexOf(worst) ? v.severity : worst;
          }, 'info')
        : 'info',
      title: decision.passed
        ? 'Compliance check passed'
        : `${decision.violations.length} compliance violation(s) found`,
      description: decision.violations.map((v) => v.message).join('; ') || 'All checks passed',
      details: {
        policyVersion: decision.policyVersion,
        marketPack: decision.marketPack,
        marketPackVersion: decision.marketPackVersion,
        violations: decision.violations,
        recommendedFixes: decision.recommendedFixes,
      },
      recommendation: decision.recommendedFixes.map((f) => f.description).join('; ') || null,
    },
  });
  return check.id;
}

/**
 * Store audit log for compliance-related actions
 */
async function storeComplianceAuditLog(
  userId: string | undefined,
  action: string,
  entityType: string,
  entityId: string,
  decision: ComplianceDecision,
  requestId: string
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      id: generatePrefixedId('aud'),
      actorId: userId || null,
      actorEmail: userId || 'system',
      action,
      entityType,
      entityId,
      changes: {
        checksPerformed: decision.checksPerformed,
        passed: decision.passed,
        violationCount: decision.violations.length,
      },
      metadata: {
        policyVersion: decision.policyVersion,
        marketPack: decision.marketPack,
        marketPackVersion: decision.marketPackVersion,
        violations: decision.violations,
      },
      requestId,
    },
  });
}

const CreateAmendmentSchema = z.object({
  type: z.enum(['rent_change', 'term_extension', 'rider', 'other']),
  description: z.string(),
  changes: z.record(z.unknown()),
  effectiveDate: z.string().datetime(),
});

const TenantApplicationSchema = z.object({
  listingId: z.string(),
  employmentInfo: z.object({
    employer: z.string(),
    position: z.string(),
    annualIncome: z.number(),
    yearsEmployed: z.number(),
  }),
  references: z.array(
    z.object({
      name: z.string(),
      phone: z.string(),
      relationship: z.string(),
    })
  ),
  emergencyContact: z.object({
    name: z.string(),
    phone: z.string(),
    relationship: z.string(),
  }),
  hasGuarantor: z.boolean().default(false),
  guarantorInfo: z
    .object({
      name: z.string(),
      email: z.string(),
      phone: z.string(),
    })
    .optional(),
});

export async function leaseRoutes(app: FastifyInstance): Promise<void> {
  // List leases
  app.get(
    '/',
    {
      schema: {
        description: 'List leases for current user',
        tags: ['Leases'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; page?: number; limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { status, page = 1, limit = 20 } = request.query;
      const role = request.user.role;

      const where: Record<string, unknown> = {};

      if (role === 'landlord') {
        where.unit = { property: { ownerId: request.user.id } };
      } else if (role === 'tenant') {
        where.tenantId = request.user.id;
      } else if (role === 'agent') {
        where.createdById = request.user.id;
      }

      if (status) where.status = status;

      const [leases, total] = await Promise.all([
        prisma.lease.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          include: {
            unit: { include: { property: { select: { id: true, name: true, address: true } } } },
            tenant: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.lease.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: leases,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }
  );

  // Get lease by ID
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get lease details',
        tags: ['Leases'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const lease = await prisma.lease.findUnique({
        where: { id: request.params.id },
        include: {
          unit: { include: { property: true } },
          tenant: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          amendments: { orderBy: { effectiveDate: 'desc' } },
          documents: true,
        },
      });

      if (!lease) {
        throw new NotFoundError('Lease not found');
      }

      // Check access
      const isOwner = lease.unit.property.ownerId === request.user.id;
      const isTenant = lease.tenantId === request.user.id;
      const isAdmin = request.user.role === 'admin';

      if (!isOwner && !isTenant && !isAdmin) {
        throw new ForbiddenError('Access denied');
      }

      return reply.send({ success: true, data: lease });
    }
  );

  // Create lease
  app.post(
    '/',
    {
      schema: {
        description: 'Create a new lease',
        tags: ['Leases'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'agent', 'admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = CreateLeaseSchema.parse(request.body);

      // Verify unit ownership
      const unit = await prisma.unit.findUnique({
        where: { id: data.unitId },
        include: { property: true },
      });

      if (!unit) {
        throw new NotFoundError('Unit not found');
      }

      if (unit.property.ownerId !== request.user.id && request.user.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      // Validate dates
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);

      if (endDate <= startDate) {
        throw new ValidationError('End date must be after start date');
      }

      // Check for overlapping leases
      const existingLease = await prisma.lease.findFirst({
        where: {
          unitId: data.unitId,
          status: { in: ['active', 'pending_signatures'] },
          OR: [
            { startDate: { lte: endDate }, endDate: { gte: startDate } },
          ],
        },
      });

      if (existingLease) {
        throw new ValidationError('An active lease already exists for this unit in the specified period');
      }

      const lease = await prisma.lease.create({
        data: {
          id: generatePrefixedId('lse'),
          ...data,
          monthlyRent: data.monthlyRent,
          securityDeposit: data.securityDeposit,
          startDate,
          endDate,
          status: 'pending_signatures',
          createdById: request.user.id,
        },
        include: {
          unit: { include: { property: true } },
          tenant: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      // Update unit status
      await prisma.unit.update({
        where: { id: data.unitId },
        data: { status: 'occupied' },
      });

      return reply.status(201).send({ success: true, data: lease });
    }
  );

  // Add lease amendment
  app.post(
    '/:id/amendments',
    {
      schema: {
        description: 'Add an amendment to a lease',
        tags: ['Leases'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const lease = await prisma.lease.findUnique({
        where: { id: request.params.id },
        include: { unit: { include: { property: true } } },
      });

      if (!lease) {
        throw new NotFoundError('Lease not found');
      }

      if (lease.unit.property.ownerId !== request.user.id && request.user.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      const data = CreateAmendmentSchema.parse(request.body);

      const amendment = await prisma.leaseAmendment.create({
        data: {
          id: generatePrefixedId('amd'),
          leaseId: lease.id,
          ...data,
          effectiveDate: new Date(data.effectiveDate),
          status: 'pending',
        },
      });

      return reply.status(201).send({ success: true, data: amendment });
    }
  );

  // Submit tenant application
  app.post(
    '/applications',
    {
      schema: {
        description: 'Submit a tenant application',
        tags: ['Leases'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = TenantApplicationSchema.parse(request.body);

      // Verify listing exists
      const listing = await prisma.listing.findUnique({
        where: { id: data.listingId },
      });

      if (!listing) {
        throw new NotFoundError('Listing not found');
      }

      const application = await prisma.tenantApplication.create({
        data: {
          id: generatePrefixedId('app'),
          listingId: data.listingId,
          applicantId: request.user.id,
          status: 'submitted',
          employmentInfo: data.employmentInfo,
          references: data.references,
          emergencyContact: data.emergencyContact,
          hasGuarantor: data.hasGuarantor,
          guarantorInfo: data.guarantorInfo,
        },
      });

      return reply.status(201).send({ success: true, data: application });
    }
  );

  // Get applications for a listing (landlord/agent)
  app.get(
    '/applications',
    {
      schema: {
        description: 'Get tenant applications',
        tags: ['Leases'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            listingId: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'agent', 'admin'] });
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { listingId?: string; status?: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { listingId, status } = request.query;

      const where: Record<string, unknown> = {};
      if (listingId) where.listingId = listingId;
      if (status) where.status = status;

      // Filter by ownership if not admin
      if (request.user.role !== 'admin') {
        where.listing = {
          unit: { property: { ownerId: request.user.id } },
        };
      }

      const applications = await prisma.tenantApplication.findMany({
        where,
        include: {
          applicant: { select: { id: true, firstName: true, lastName: true, email: true } },
          listing: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ success: true, data: applications });
    }
  );

  // ============================================================================
  // Rent Increase with Good Cause Compliance Gate
  // ============================================================================

  app.post(
    '/:id/rent-increase',
    {
      schema: {
        description: 'Request rent increase with Good Cause compliance enforcement',
        tags: ['Leases'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const lease = await prisma.lease.findUnique({
        where: { id: request.params.id },
        include: { unit: { include: { property: true } } },
      });

      if (!lease) {
        throw new NotFoundError('Lease not found');
      }

      if (lease.unit.property.ownerId !== request.user.id && request.user.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      const data = RentIncreaseSchema.parse(request.body);
      const marketId = lease.unit.property.marketId || 'US_STANDARD';

      // Run Good Cause compliance gate
      const gateResult = await gateRentIncrease({
        leaseId: lease.id,
        marketId,
        currentRent: lease.monthlyRent,
        proposedRent: data.newMonthlyRent,
        noticeDays: data.noticeDays,
      });

      // Store compliance check
      const complianceCheckId = await storeComplianceCheck(
        'lease',
        lease.id,
        marketId,
        gateResult.decision
      );

      // Store audit log
      await storeComplianceAuditLog(
        request.user.id,
        gateResult.allowed ? 'rent_increase_approved' : 'rent_increase_blocked',
        'lease',
        lease.id,
        gateResult.decision,
        request.id
      );

      // If blocked, return error with violations
      if (!gateResult.allowed) {
        logger.warn({
          msg: 'rent_increase_blocked',
          leaseId: lease.id,
          currentRent: lease.monthlyRent,
          proposedRent: data.newMonthlyRent,
          violations: gateResult.decision.violations,
          complianceCheckId,
        });

        return reply.status(422).send({
          success: false,
          error: {
            code: 'COMPLIANCE_VIOLATION',
            message: gateResult.blockedReason || 'Rent increase not permitted',
            details: {
              violations: gateResult.decision.violations,
              recommendedFixes: gateResult.decision.recommendedFixes,
              complianceCheckId,
              policyVersion: gateResult.decision.policyVersion,
              marketPack: gateResult.decision.marketPack,
            },
          },
        });
      }

      // Create rent change amendment
      const amendment = await prisma.leaseAmendment.create({
        data: {
          id: generatePrefixedId('amd'),
          leaseId: lease.id,
          type: 'rent_change',
          description: data.reason || `Rent increase from $${lease.monthlyRent} to $${data.newMonthlyRent}`,
          changes: {
            previousRent: lease.monthlyRent,
            newRent: data.newMonthlyRent,
            increasePercent: ((data.newMonthlyRent - lease.monthlyRent) / lease.monthlyRent * 100).toFixed(2),
            noticeDays: data.noticeDays,
          },
          effectiveDate: new Date(data.effectiveDate),
          status: 'approved',
        },
      });

      // Update lease with new rent (effective on the date)
      await prisma.lease.update({
        where: { id: lease.id },
        data: {
          monthlyRent: data.newMonthlyRent,
        },
      });

      logger.info({
        msg: 'rent_increase_approved',
        leaseId: lease.id,
        previousRent: lease.monthlyRent,
        newRent: data.newMonthlyRent,
        complianceCheckId,
      });

      return reply.send({
        success: true,
        data: amendment,
        meta: {
          complianceCheckId,
          checksPerformed: gateResult.decision.checksPerformed,
          cpiFallbackUsed: gateResult.decision.violations.some(
            (v) => v.code === 'GOOD_CAUSE_CPI_FALLBACK_USED'
          ),
        },
      });
    }
  );

  // ============================================================================
  // FCHA Stage Transition with Compliance Gate
  // ============================================================================

  app.post(
    '/applications/:id/transition',
    {
      schema: {
        description: 'Transition application stage with FCHA compliance enforcement',
        tags: ['Leases'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'agent', 'admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const application = await prisma.tenantApplication.findUnique({
        where: { id: request.params.id },
        include: {
          listing: { include: { unit: { include: { property: true } } } },
        },
      });

      if (!application) {
        throw new NotFoundError('Application not found');
      }

      const data = ApplicationStageTransitionSchema.parse(request.body);
      const marketId = application.listing.unit.property.marketId || 'US_STANDARD';

      // Get current stage from application status (map to FCHA stages)
      const statusToStageMap: Record<string, FCHAStage> = {
        'submitted': 'application_submitted',
        'under_review': 'application_review',
        'conditional_offer': 'conditional_offer',
        'background_check': 'background_check',
        'approved': 'final_approval',
        'lease_pending': 'lease_signing',
      };
      const currentStage = statusToStageMap[application.status] || 'initial_inquiry';

      // Run FCHA compliance gate
      const gateResult = await gateFCHAStageTransition({
        applicationId: application.id,
        marketId,
        currentStage: currentStage,
        targetStage: data.targetStage,
      });

      // Store compliance check
      const complianceCheckId = await storeComplianceCheck(
        'application',
        application.id,
        marketId,
        gateResult.decision
      );

      // Store audit log
      await storeComplianceAuditLog(
        request.user.id,
        gateResult.allowed ? 'stage_transition_approved' : 'stage_transition_blocked',
        'application',
        application.id,
        gateResult.decision,
        request.id
      );

      if (!gateResult.allowed) {
        logger.warn({
          msg: 'fcha_stage_transition_blocked',
          applicationId: application.id,
          currentStage,
          targetStage: data.targetStage,
          violations: gateResult.decision.violations,
          complianceCheckId,
        });

        return reply.status(422).send({
          success: false,
          error: {
            code: 'COMPLIANCE_VIOLATION',
            message: gateResult.blockedReason || 'Stage transition not permitted',
            details: {
              violations: gateResult.decision.violations,
              recommendedFixes: gateResult.decision.recommendedFixes,
              complianceCheckId,
            },
          },
        });
      }

      // Map target stage back to application status
      const stageToStatusMap: Record<string, string> = {
        'application_submitted': 'submitted',
        'application_review': 'under_review',
        'conditional_offer': 'conditional_offer',
        'background_check': 'background_check',
        'final_approval': 'approved',
        'lease_signing': 'lease_pending',
      };

      const updated = await prisma.tenantApplication.update({
        where: { id: application.id },
        data: {
          status: stageToStatusMap[data.targetStage] || application.status,
        },
        include: {
          applicant: { select: { id: true, firstName: true, lastName: true, email: true } },
          listing: { select: { id: true, title: true } },
        },
      });

      return reply.send({
        success: true,
        data: updated,
        meta: { complianceCheckId },
      });
    }
  );

  // ============================================================================
  // FCHA Background Check Gate
  // ============================================================================

  app.post(
    '/applications/:id/background-check',
    {
      schema: {
        description: 'Request background check with FCHA compliance enforcement',
        tags: ['Leases'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'agent', 'admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const application = await prisma.tenantApplication.findUnique({
        where: { id: request.params.id },
        include: {
          listing: { include: { unit: { include: { property: true } } } },
        },
      });

      if (!application) {
        throw new NotFoundError('Application not found');
      }

      const data = BackgroundCheckSchema.parse(request.body);
      const marketId = application.listing.unit.property.marketId || 'US_STANDARD';

      // Map status to FCHA stage
      const statusToStageMap: Record<string, FCHAStage> = {
        'submitted': 'application_submitted',
        'under_review': 'application_review',
        'conditional_offer': 'conditional_offer',
        'background_check': 'background_check',
      };
      const currentStage = statusToStageMap[application.status] || 'initial_inquiry';

      // Run FCHA background check gate
      const gateResult = await gateFCHABackgroundCheck({
        applicationId: application.id,
        marketId,
        currentStage: currentStage,
        checkType: data.checkType,
      });

      // Store compliance check
      const complianceCheckId = await storeComplianceCheck(
        'application',
        application.id,
        marketId,
        gateResult.decision
      );

      // Store audit log
      await storeComplianceAuditLog(
        request.user.id,
        gateResult.allowed ? 'background_check_approved' : 'background_check_blocked',
        'application',
        application.id,
        gateResult.decision,
        request.id
      );

      if (!gateResult.allowed) {
        logger.warn({
          msg: 'fcha_background_check_blocked',
          applicationId: application.id,
          currentStage,
          checkType: data.checkType,
          violations: gateResult.decision.violations,
          complianceCheckId,
        });

        return reply.status(422).send({
          success: false,
          error: {
            code: 'COMPLIANCE_VIOLATION',
            message: gateResult.blockedReason || 'Background check not permitted at this stage',
            details: {
              violations: gateResult.decision.violations,
              recommendedFixes: gateResult.decision.recommendedFixes,
              complianceCheckId,
              currentStage,
              requiredStage: 'conditional_offer',
            },
          },
        });
      }

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Integrate with actual background check provider
      logger.info({
        msg: 'background_check_initiated',
        applicationId: application.id,
        checkType: data.checkType,
        complianceCheckId,
      });

      return reply.send({
        success: true,
        data: {
          applicationId: application.id,
          checkType: data.checkType,
          status: 'initiated',
          message: 'Background check has been initiated. Results will be available shortly.',
        },
        meta: { complianceCheckId },
      });
    }
  );
}
