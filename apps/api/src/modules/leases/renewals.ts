/**
 * Lease Renewal Automation Module
 *
 * Auto-generates renewal offers, tracks responses, and sends escalation reminders.
 * Supports rent-stabilized and market-rate renewals with compliance checks.
 */

import { prisma } from '@realriches/database';
import { generatePrefixedId, logger, AppError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

export type RenewalStatus = 'pending' | 'offer_sent' | 'offer_viewed' | 'accepted' | 'declined' | 'counter_offer' | 'expired' | 'renewed';
export type RenewalTermOption = '1_year' | '2_year' | 'month_to_month';

interface RenewalOffer {
  id: string;
  leaseId: string;
  tenantId: string;
  landlordId: string;
  status: RenewalStatus;
  currentRent: number;
  proposedRent: number;
  rentIncreasePercent: number;
  termOptions: Array<{
    term: RenewalTermOption;
    proposedRent: number;
    startDate: string;
    endDate: string;
  }>;
  selectedTerm?: RenewalTermOption;
  counterOfferRent?: number;
  counterOfferTerm?: RenewalTermOption;
  expiresAt: Date;
  sentAt?: Date;
  viewedAt?: Date;
  respondedAt?: Date;
  reminders: Array<{
    sentAt: Date;
    type: 'initial' | 'reminder' | 'final';
  }>;
  notes?: string;
  isRentStabilized: boolean;
  maxLegalIncrease?: number;
  createdAt: Date;
  updatedAt: Date;
}

interface RenewalRule {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  conditions: {
    daysBeforeExpiry: number;
    propertyTypes?: string[];
    propertyIds?: string[];
    minTenancy?: number; // months
  };
  actions: {
    autoGenerateOffer: boolean;
    defaultTermOptions: RenewalTermOption[];
    rentIncreasePercent: number;
    offerValidDays: number;
    sendReminders: boolean;
    reminderDays: number[];
  };
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// In-Memory Storage (would be Prisma in production)
// =============================================================================

const renewalOffers = new Map<string, RenewalOffer>();
const renewalRules = new Map<string, RenewalRule>();

// =============================================================================
// Schemas
// =============================================================================

const CreateRenewalOfferSchema = z.object({
  leaseId: z.string(),
  proposedRent: z.number().min(0),
  termOptions: z.array(z.object({
    term: z.enum(['1_year', '2_year', 'month_to_month']),
    proposedRent: z.number().min(0),
  })).min(1),
  validDays: z.number().min(1).max(90).default(30),
  notes: z.string().optional(),
});

const RespondToOfferSchema = z.object({
  action: z.enum(['accept', 'decline', 'counter']),
  selectedTerm: z.enum(['1_year', '2_year', 'month_to_month']).optional(),
  counterOfferRent: z.number().min(0).optional(),
  counterOfferTerm: z.enum(['1_year', '2_year', 'month_to_month']).optional(),
  notes: z.string().optional(),
});

const CreateRenewalRuleSchema = z.object({
  name: z.string().min(1).max(100),
  conditions: z.object({
    daysBeforeExpiry: z.number().min(30).max(180),
    propertyTypes: z.array(z.string()).optional(),
    propertyIds: z.array(z.string()).optional(),
    minTenancy: z.number().min(0).optional(),
  }),
  actions: z.object({
    autoGenerateOffer: z.boolean().default(true),
    defaultTermOptions: z.array(z.enum(['1_year', '2_year', 'month_to_month'])),
    rentIncreasePercent: z.number().min(0).max(100),
    offerValidDays: z.number().min(7).max(90).default(30),
    sendReminders: z.boolean().default(true),
    reminderDays: z.array(z.number()).default([14, 7, 3]),
  }),
});

// =============================================================================
// Helper Functions
// =============================================================================

function calculateRenewalDates(startDate: Date, term: RenewalTermOption): { start: Date; end: Date } {
  const start = new Date(startDate);
  const end = new Date(startDate);

  switch (term) {
    case '1_year':
      end.setFullYear(end.getFullYear() + 1);
      break;
    case '2_year':
      end.setFullYear(end.getFullYear() + 2);
      break;
    case 'month_to_month':
      end.setMonth(end.getMonth() + 1);
      break;
  }

  return { start, end };
}

async function checkRentStabilizedLimits(leaseId: string, proposedRent: number): Promise<{
  isCompliant: boolean;
  maxAllowedRent?: number;
  currentLegalRent?: number;
  maxIncreasePercent?: number;
}> {
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    select: {
      isRentStabilized: true,
      legalRentAmount: true,
      monthlyRent: true,
    },
  });

  if (!lease || !lease.isRentStabilized) {
    return { isCompliant: true };
  }

  // NYC RGB 2024-2025 guidelines (example)
  const maxIncreasePercent = 3.0; // 1-year lease
  const currentLegalRent = lease.legalRentAmount || lease.monthlyRent || 0;
  const maxAllowedRent = currentLegalRent * (1 + maxIncreasePercent / 100);

  return {
    isCompliant: proposedRent <= maxAllowedRent,
    maxAllowedRent,
    currentLegalRent,
    maxIncreasePercent,
  };
}

// =============================================================================
// Routes
// =============================================================================

export async function renewalRoutes(app: FastifyInstance): Promise<void> {
  // List renewal offers (tenant or landlord view)
  app.get(
    '/offers',
    {
      schema: {
        description: 'List renewal offers',
        tags: ['Renewals'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            leaseId: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { status?: string; leaseId?: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { status, leaseId } = request.query;

      let offers = Array.from(renewalOffers.values())
        .filter(o => o.tenantId === request.user!.id || o.landlordId === request.user!.id);

      if (status) {
        offers = offers.filter(o => o.status === status);
      }
      if (leaseId) {
        offers = offers.filter(o => o.leaseId === leaseId);
      }

      return reply.send({
        success: true,
        data: { offers },
      });
    }
  );

  // Create renewal offer (landlord)
  app.post(
    '/offers',
    {
      schema: {
        description: 'Create a renewal offer',
        tags: ['Renewals'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateRenewalOfferSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = CreateRenewalOfferSchema.parse(request.body);

      // Get lease details
      const lease = await prisma.lease.findUnique({
        where: { id: data.leaseId },
        include: {
          unit: {
            include: {
              property: true,
            },
          },
          primaryTenant: true,
        },
      });

      if (!lease) {
        throw new AppError('NOT_FOUND', 'Lease not found', 404);
      }

      if (lease.unit?.property.ownerId !== request.user.id) {
        throw new AppError('FORBIDDEN', 'Not authorized to create offers for this lease', 403);
      }

      // Check rent-stabilized compliance
      const compliance = await checkRentStabilizedLimits(data.leaseId, data.proposedRent);
      if (!compliance.isCompliant) {
        throw new AppError(
          'COMPLIANCE_ERROR',
          `Proposed rent exceeds rent-stabilized limit. Maximum allowed: $${compliance.maxAllowedRent?.toFixed(2)}`,
          400
        );
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + data.validDays * 24 * 60 * 60 * 1000);

      const offer: RenewalOffer = {
        id: generatePrefixedId('rnw'),
        leaseId: data.leaseId,
        tenantId: lease.tenantId,
        landlordId: request.user.id,
        status: 'pending',
        currentRent: lease.monthlyRent || 0,
        proposedRent: data.proposedRent,
        rentIncreasePercent: lease.monthlyRent
          ? ((data.proposedRent - lease.monthlyRent) / lease.monthlyRent) * 100
          : 0,
        termOptions: data.termOptions.map(opt => {
          const dates = calculateRenewalDates(new Date(lease.endDate), opt.term);
          return {
            term: opt.term,
            proposedRent: opt.proposedRent,
            startDate: dates.start.toISOString(),
            endDate: dates.end.toISOString(),
          };
        }),
        expiresAt,
        reminders: [],
        notes: data.notes,
        isRentStabilized: lease.isRentStabilized || false,
        maxLegalIncrease: compliance.maxIncreasePercent,
        createdAt: now,
        updatedAt: now,
      };

      renewalOffers.set(offer.id, offer);

      logger.info({
        offerId: offer.id,
        leaseId: data.leaseId,
        proposedRent: data.proposedRent,
      }, 'Renewal offer created');

      return reply.status(201).send({
        success: true,
        data: { offer },
      });
    }
  );

  // Send renewal offer to tenant
  app.post(
    '/offers/:offerId/send',
    {
      schema: {
        description: 'Send renewal offer to tenant',
        tags: ['Renewals'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { offerId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { offerId } = request.params;
      const offer = renewalOffers.get(offerId);

      if (!offer) {
        throw new AppError('NOT_FOUND', 'Offer not found', 404);
      }

      if (offer.landlordId !== request.user.id) {
        throw new AppError('FORBIDDEN', 'Not authorized', 403);
      }

      if (offer.status !== 'pending') {
        throw new AppError('INVALID_STATE', 'Offer has already been sent', 400);
      }

      offer.status = 'offer_sent';
      offer.sentAt = new Date();
      offer.updatedAt = new Date();

      // In production: Send email notification to tenant
      logger.info({ offerId, tenantId: offer.tenantId }, 'Renewal offer sent to tenant');

      return reply.send({
        success: true,
        data: { offer },
        message: 'Offer sent to tenant',
      });
    }
  );

  // Tenant responds to offer
  app.post(
    '/offers/:offerId/respond',
    {
      schema: {
        description: 'Respond to a renewal offer',
        tags: ['Renewals'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Params: { offerId: string };
        Body: z.infer<typeof RespondToOfferSchema>;
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { offerId } = request.params;
      const offer = renewalOffers.get(offerId);

      if (!offer) {
        throw new AppError('NOT_FOUND', 'Offer not found', 404);
      }

      if (offer.tenantId !== request.user.id) {
        throw new AppError('FORBIDDEN', 'Not authorized', 403);
      }

      if (!['offer_sent', 'offer_viewed'].includes(offer.status)) {
        throw new AppError('INVALID_STATE', 'Cannot respond to this offer', 400);
      }

      if (new Date() > offer.expiresAt) {
        offer.status = 'expired';
        offer.updatedAt = new Date();
        throw new AppError('EXPIRED', 'This offer has expired', 400);
      }

      const data = RespondToOfferSchema.parse(request.body);
      offer.respondedAt = new Date();
      offer.updatedAt = new Date();

      switch (data.action) {
        case 'accept':
          if (!data.selectedTerm) {
            throw new AppError('VALIDATION_ERROR', 'Must select a term option', 400);
          }
          offer.status = 'accepted';
          offer.selectedTerm = data.selectedTerm;
          break;
        case 'decline':
          offer.status = 'declined';
          offer.notes = data.notes;
          break;
        case 'counter':
          if (!data.counterOfferRent || !data.counterOfferTerm) {
            throw new AppError('VALIDATION_ERROR', 'Must provide counter offer details', 400);
          }
          offer.status = 'counter_offer';
          offer.counterOfferRent = data.counterOfferRent;
          offer.counterOfferTerm = data.counterOfferTerm;
          offer.notes = data.notes;
          break;
      }

      logger.info({
        offerId,
        action: data.action,
        tenantId: request.user.id,
      }, 'Tenant responded to renewal offer');

      return reply.send({
        success: true,
        data: { offer },
      });
    }
  );

  // Accept counter offer (landlord)
  app.post(
    '/offers/:offerId/accept-counter',
    {
      schema: {
        description: 'Accept tenant counter offer',
        tags: ['Renewals'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { offerId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { offerId } = request.params;
      const offer = renewalOffers.get(offerId);

      if (!offer) {
        throw new AppError('NOT_FOUND', 'Offer not found', 404);
      }

      if (offer.landlordId !== request.user.id) {
        throw new AppError('FORBIDDEN', 'Not authorized', 403);
      }

      if (offer.status !== 'counter_offer') {
        throw new AppError('INVALID_STATE', 'No counter offer to accept', 400);
      }

      offer.status = 'accepted';
      offer.proposedRent = offer.counterOfferRent!;
      offer.selectedTerm = offer.counterOfferTerm;
      offer.updatedAt = new Date();

      logger.info({ offerId }, 'Landlord accepted counter offer');

      return reply.send({
        success: true,
        data: { offer },
      });
    }
  );

  // Execute renewal (create new lease)
  app.post(
    '/offers/:offerId/execute',
    {
      schema: {
        description: 'Execute accepted renewal and create new lease',
        tags: ['Renewals'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { offerId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { offerId } = request.params;
      const offer = renewalOffers.get(offerId);

      if (!offer) {
        throw new AppError('NOT_FOUND', 'Offer not found', 404);
      }

      if (offer.landlordId !== request.user.id) {
        throw new AppError('FORBIDDEN', 'Not authorized', 403);
      }

      if (offer.status !== 'accepted') {
        throw new AppError('INVALID_STATE', 'Offer must be accepted before execution', 400);
      }

      // Get original lease
      const originalLease = await prisma.lease.findUnique({
        where: { id: offer.leaseId },
      });

      if (!originalLease) {
        throw new AppError('NOT_FOUND', 'Original lease not found', 404);
      }

      // Find selected term option
      const selectedOption = offer.termOptions.find(t => t.term === offer.selectedTerm);
      if (!selectedOption) {
        throw new AppError('INVALID_STATE', 'Selected term option not found', 400);
      }

      // Create new lease
      const newLease = await prisma.lease.create({
        data: {
          id: generatePrefixedId('lea'),
          leaseNumber: `${originalLease.leaseNumber}-R`,
          property: { connect: { id: originalLease.propertyId } },
          unit: { connect: { id: originalLease.unitId } },
          primaryTenant: { connect: { id: originalLease.tenantId } },
          landlord: { connect: { id: originalLease.landlordId } },
          startDate: new Date(selectedOption.startDate),
          endDate: new Date(selectedOption.endDate),
          monthlyRent: selectedOption.proposedRent,
          monthlyRentAmount: selectedOption.proposedRent,
          maxOccupants: originalLease.maxOccupants,
          securityDepositAmount: originalLease.securityDepositAmount,
          status: 'pending_signatures',
          type: originalLease.type,
          isRentStabilized: originalLease.isRentStabilized,
          legalRentAmount: offer.isRentStabilized ? selectedOption.proposedRent : null,
          preferentialRentAmount: originalLease.preferentialRentAmount,
          previousLeaseId: originalLease.id,
        },
      });

      // Mark original lease as renewed
      await prisma.lease.update({
        where: { id: originalLease.id },
        data: { status: 'renewed' },
      });

      offer.status = 'renewed';
      offer.updatedAt = new Date();

      logger.info({
        offerId,
        originalLeaseId: originalLease.id,
        newLeaseId: newLease.id,
      }, 'Lease renewed');

      return reply.send({
        success: true,
        data: {
          offer,
          newLease: {
            id: newLease.id,
            startDate: newLease.startDate,
            endDate: newLease.endDate,
            monthlyRent: newLease.monthlyRent,
          },
        },
      });
    }
  );

  // ==========================================================================
  // Renewal Rules (Automation)
  // ==========================================================================

  // List renewal rules
  app.get(
    '/rules',
    {
      schema: {
        description: 'List renewal automation rules',
        tags: ['Renewals'],
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

      const rules = Array.from(renewalRules.values())
        .filter(r => r.userId === request.user!.id);

      return reply.send({
        success: true,
        data: { rules },
      });
    }
  );

  // Create renewal rule
  app.post(
    '/rules',
    {
      schema: {
        description: 'Create a renewal automation rule',
        tags: ['Renewals'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateRenewalRuleSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = CreateRenewalRuleSchema.parse(request.body);
      const now = new Date();

      const rule: RenewalRule = {
        id: generatePrefixedId('rnr'),
        userId: request.user.id,
        name: data.name,
        isActive: true,
        conditions: {
          daysBeforeExpiry: data.conditions.daysBeforeExpiry,
          propertyTypes: data.conditions.propertyTypes,
          propertyIds: data.conditions.propertyIds,
          minTenancy: data.conditions.minTenancy,
        },
        actions: {
          autoGenerateOffer: data.actions.autoGenerateOffer ?? true,
          defaultTermOptions: data.actions.defaultTermOptions,
          rentIncreasePercent: data.actions.rentIncreasePercent,
          offerValidDays: data.actions.offerValidDays ?? 30,
          sendReminders: data.actions.sendReminders ?? true,
          reminderDays: data.actions.reminderDays ?? [14, 7, 3],
        },
        createdAt: now,
        updatedAt: now,
      };

      renewalRules.set(rule.id, rule);

      logger.info({ ruleId: rule.id, name: rule.name }, 'Renewal rule created');

      return reply.status(201).send({
        success: true,
        data: { rule },
      });
    }
  );

  // Toggle rule active status
  app.patch(
    '/rules/:ruleId',
    {
      schema: {
        description: 'Update renewal rule',
        tags: ['Renewals'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Params: { ruleId: string };
        Body: { isActive?: boolean; name?: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { ruleId } = request.params;
      const rule = renewalRules.get(ruleId);

      if (!rule || rule.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Rule not found', 404);
      }

      const { isActive, name } = request.body;
      if (isActive !== undefined) rule.isActive = isActive;
      if (name) rule.name = name;
      rule.updatedAt = new Date();

      return reply.send({
        success: true,
        data: { rule },
      });
    }
  );

  // Delete rule
  app.delete(
    '/rules/:ruleId',
    {
      schema: {
        description: 'Delete renewal rule',
        tags: ['Renewals'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { ruleId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { ruleId } = request.params;
      const rule = renewalRules.get(ruleId);

      if (!rule || rule.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Rule not found', 404);
      }

      renewalRules.delete(ruleId);

      return reply.send({
        success: true,
        message: 'Rule deleted',
      });
    }
  );

  // Get upcoming expirations
  app.get(
    '/upcoming',
    {
      schema: {
        description: 'Get leases expiring soon',
        tags: ['Renewals'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            days: { type: 'integer', default: 90 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { days?: number } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { days = 90 } = request.query;
      const cutoffDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      const leases = await prisma.lease.findMany({
        where: {
          unit: {
            property: {
              ownerId: request.user.id,
            },
          },
          status: 'active',
          endDate: { lte: cutoffDate },
        },
        include: {
          unit: {
            include: {
              property: true,
            },
          },
          primaryTenant: true,
        },
        orderBy: { endDate: 'asc' },
      });

      const upcoming = leases.map(l => {
        const daysUntilExpiry = Math.ceil((l.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const existingOffer = Array.from(renewalOffers.values())
          .find(o => o.leaseId === l.id && !['expired', 'declined'].includes(o.status));

        return {
          leaseId: l.id,
          propertyName: l.unit.property.name,
          unitNumber: l.unit.unitNumber,
          tenantName: l.primaryTenant ? `${l.primaryTenant.firstName} ${l.primaryTenant.lastName}` : 'Unknown',
          tenantEmail: l.primaryTenant?.email,
          currentRent: l.monthlyRent,
          expiryDate: l.endDate.toISOString(),
          daysUntilExpiry,
          isRentStabilized: l.isRentStabilized,
          renewalStatus: existingOffer?.status || 'no_offer',
          existingOfferId: existingOffer?.id,
        };
      });

      return reply.send({
        success: true,
        data: {
          upcoming,
          summary: {
            total: upcoming.length,
            noOffer: upcoming.filter(u => u.renewalStatus === 'no_offer').length,
            offerSent: upcoming.filter(u => u.renewalStatus === 'offer_sent').length,
            accepted: upcoming.filter(u => u.renewalStatus === 'accepted').length,
          },
        },
      });
    }
  );
}

// =============================================================================
// Exports for Job Scheduler
// =============================================================================

export {
  renewalOffers,
  renewalRules,
  checkRentStabilizedLimits,
  calculateRenewalDates,
};
