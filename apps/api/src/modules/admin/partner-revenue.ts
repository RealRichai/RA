/**
 * Partner Revenue Dashboard Admin API
 *
 * Admin-only endpoints for viewing partner attribution and revenue data.
 */

import {
  AttributionQuerySchema,
  RevenueDashboardQuerySchema,
  CreateAttributionSchema,
} from '@realriches/revenue-engine';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { getAttributionService } from '../../persistence';

// ============================================================================
// Schemas
// ============================================================================

const AttributionIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const QualifyAttributionSchema = z.object({
  notes: z.string().optional(),
});

const RealizeAttributionSchema = z.object({
  realizedRevenue: z.number().nonnegative(),
  ledgerTransactionId: z.string().uuid().optional(),
});

const FailAttributionSchema = z.object({
  reason: z.string().optional(),
});

// ============================================================================
// Routes
// ============================================================================

export async function partnerRevenueRoutes(fastify: FastifyInstance) {
  // Authentication middleware for admin routes
  const adminAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    fastify.authorize(request, reply, { roles: ['admin', 'super_admin'] });
  };

  // ==========================================================================
  // Dashboard Overview
  // ==========================================================================

  fastify.get(
    '/admin/partner-revenue/dashboard',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Get partner revenue dashboard data',
        tags: ['Partner Revenue'],
        querystring: RevenueDashboardQuerySchema,
        response: {
          200: z.object({
            period: z.object({
              startDate: z.coerce.date(),
              endDate: z.coerce.date(),
            }),
            totals: z.object({
              expectedRevenue: z.number(),
              realizedRevenue: z.number(),
              pendingRevenue: z.number(),
              failedRevenue: z.number(),
            }),
            byPartner: z.array(z.object({
              partnerId: z.string(),
              partnerName: z.string(),
              totalExpectedRevenue: z.number(),
              totalRealizedRevenue: z.number(),
              pendingCount: z.number(),
              qualifiedCount: z.number(),
              realizedCount: z.number(),
              failedCount: z.number(),
              conversionRate: z.number(),
            })),
            byProduct: z.array(z.object({
              productType: z.string(),
              totalExpectedRevenue: z.number(),
              totalRealizedRevenue: z.number(),
              attributionCount: z.number(),
              averageRevenue: z.number(),
            })),
            recentAttributions: z.array(z.unknown()),
          }),
        },
      },
    },
    async (request, _reply) => {
      const query = RevenueDashboardQuerySchema.parse(request.query);
      return getAttributionService().getDashboard(query);
    }
  );

  // ==========================================================================
  // List Attributions
  // ==========================================================================

  fastify.get(
    '/admin/partner-revenue/attributions',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Query partner attributions',
        tags: ['Partner Revenue'],
        querystring: AttributionQuerySchema,
        response: {
          200: z.object({
            attributions: z.array(z.unknown()),
            total: z.number(),
          }),
        },
      },
    },
    async (request, _reply) => {
      const query = AttributionQuerySchema.parse(request.query);
      return getAttributionService().queryAttributions(query);
    }
  );

  // ==========================================================================
  // Get Single Attribution
  // ==========================================================================

  fastify.get(
    '/admin/partner-revenue/attributions/:id',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Get a single attribution by ID',
        tags: ['Partner Revenue'],
        params: AttributionIdParamsSchema,
      },
    },
    async (request, reply) => {
      const { id } = AttributionIdParamsSchema.parse(request.params);
      const attribution = await getAttributionService().getAttribution(id);

      if (!attribution) {
        return reply.status(404).send({ error: 'Attribution not found' });
      }

      return attribution;
    }
  );

  // ==========================================================================
  // Create Attribution
  // ==========================================================================

  fastify.post(
    '/admin/partner-revenue/attributions',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Create a new partner attribution',
        tags: ['Partner Revenue'],
        body: CreateAttributionSchema,
      },
    },
    async (request, reply) => {
      const input = CreateAttributionSchema.parse(request.body);
      const attribution = await getAttributionService().createAttribution(input);
      return reply.status(201).send(attribution);
    }
  );

  // ==========================================================================
  // Qualify Attribution
  // ==========================================================================

  fastify.post(
    '/admin/partner-revenue/attributions/:id/qualify',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Qualify an attribution (mark lead as validated)',
        tags: ['Partner Revenue'],
        params: AttributionIdParamsSchema,
        body: QualifyAttributionSchema,
      },
    },
    async (request, reply) => {
      const { id } = AttributionIdParamsSchema.parse(request.params);
      const { notes } = QualifyAttributionSchema.parse(request.body);

      try {
        const attribution = await getAttributionService().qualifyAttribution(id, notes);
        return attribution;
      } catch (error) {
        return reply.status(404).send({ error: 'Attribution not found' });
      }
    }
  );

  // ==========================================================================
  // Realize Attribution
  // ==========================================================================

  fastify.post(
    '/admin/partner-revenue/attributions/:id/realize',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Realize revenue from an attribution',
        tags: ['Partner Revenue'],
        params: AttributionIdParamsSchema,
        body: RealizeAttributionSchema,
      },
    },
    async (request, reply) => {
      const { id } = AttributionIdParamsSchema.parse(request.params);
      const { realizedRevenue, ledgerTransactionId } = RealizeAttributionSchema.parse(request.body);

      try {
        const attribution = await getAttributionService().realizeAttribution(
          id,
          realizedRevenue,
          ledgerTransactionId
        );
        return attribution;
      } catch (error) {
        return reply.status(404).send({ error: 'Attribution not found' });
      }
    }
  );

  // ==========================================================================
  // Fail Attribution
  // ==========================================================================

  fastify.post(
    '/admin/partner-revenue/attributions/:id/fail',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Mark an attribution as failed',
        tags: ['Partner Revenue'],
        params: AttributionIdParamsSchema,
        body: FailAttributionSchema,
      },
    },
    async (request, reply) => {
      const { id } = AttributionIdParamsSchema.parse(request.params);
      const { reason } = FailAttributionSchema.parse(request.body);

      try {
        const attribution = await getAttributionService().failAttribution(id, reason);
        return attribution;
      } catch (error) {
        return reply.status(404).send({ error: 'Attribution not found' });
      }
    }
  );

  // ==========================================================================
  // Get Attributions by Partner
  // ==========================================================================

  fastify.get(
    '/admin/partner-revenue/partners/:partnerId/attributions',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Get all attributions for a specific partner',
        tags: ['Partner Revenue'],
        params: z.object({
          partnerId: z.string(),
        }),
        querystring: AttributionQuerySchema.omit({ partnerId: true }),
      },
    },
    async (request, _reply) => {
      const { partnerId } = request.params as { partnerId: string };
      const query = AttributionQuerySchema.omit({ partnerId: true }).parse(request.query);

      const attributions = await getAttributionService().getPartnerAttributions(partnerId, query);
      return { attributions, total: attributions.length };
    }
  );

  // ==========================================================================
  // Get Attributions by Lease
  // ==========================================================================

  fastify.get(
    '/admin/partner-revenue/leases/:leaseId/attributions',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Get all attributions for a specific lease',
        tags: ['Partner Revenue'],
        params: z.object({
          leaseId: z.string().uuid(),
        }),
      },
    },
    async (request, _reply) => {
      const { leaseId } = request.params as { leaseId: string };

      const attributions = await getAttributionService().getLeaseAttributions(leaseId);
      return { attributions, total: attributions.length };
    }
  );

  // ==========================================================================
  // Calculate Commission Preview
  // ==========================================================================

  fastify.post(
    '/admin/partner-revenue/calculate-commission',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Calculate expected commission for a transaction (preview)',
        tags: ['Partner Revenue'],
        body: z.object({
          commissionType: z.enum(['percentage', 'fixed', 'hybrid']),
          transactionAmount: z.number().nonnegative(),
          commissionRate: z.number().min(0).max(1).optional(),
          fixedAmount: z.number().nonnegative().optional(),
        }),
        response: {
          200: z.object({
            expectedCommission: z.number(),
          }),
        },
      },
    },
    async (request, _reply) => {
      const { commissionType, transactionAmount, commissionRate, fixedAmount } = request.body as {
        commissionType: 'percentage' | 'fixed' | 'hybrid';
        transactionAmount: number;
        commissionRate?: number;
        fixedAmount?: number;
      };

      const expectedCommission = getAttributionService().calculateExpectedCommission(
        commissionType,
        transactionAmount,
        commissionRate,
        fixedAmount
      );

      return { expectedCommission };
    }
  );
}

export default partnerRevenueRoutes;
