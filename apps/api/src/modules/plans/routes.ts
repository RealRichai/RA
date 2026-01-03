/**
 * Plan Management Routes
 *
 * Endpoints for subscription plan management and usage tracking.
 */

import { DEFAULT_PLANS } from '@realriches/agent-plans';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Schemas
// =============================================================================

const GetPlansQuerySchema = z.object({
  includeEnterprise: z.enum(['true', 'false']).optional().default('false'),
});

const AssignPlanBodySchema = z.object({
  planId: z.string().uuid(),
  customCallLimit: z.number().int().positive().optional(),
  customGenerationLimit: z.number().int().positive().optional(),
  customTaskLimit: z.number().int().positive().optional(),
  billingCycleStart: z.string().datetime().optional(),
});

// =============================================================================
// Routes
// =============================================================================

export async function planRoutes(fastify: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // GET /plans - List available plans
  // ---------------------------------------------------------------------------
  fastify.get(
    '/',
    {
      schema: {
        description: 'List all available subscription plans',
        tags: ['Plans'],
        querystring: {
          type: 'object',
          properties: {
            includeEnterprise: { type: 'string', enum: ['true', 'false'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    tier: { type: 'string' },
                    monthlyCallLimit: { type: 'number' },
                    monthlyGenerationLimit: { type: 'number' },
                    monthlyTaskLimit: { type: 'number' },
                    monthlyPriceCents: { type: 'number' },
                    features: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = GetPlansQuerySchema.parse(request.query);

      const plans = await fastify.prisma.agentPlan.findMany({
        where: query.includeEnterprise === 'false'
          ? { tier: { not: 'enterprise' } }
          : undefined,
        orderBy: { monthlyPriceCents: 'asc' },
      });

      // If no plans in DB, return defaults
      if (plans.length === 0) {
        const defaultPlans = DEFAULT_PLANS.filter(
          p => query.includeEnterprise === 'true' || p.tier !== 'enterprise'
        );

        return reply.send({
          success: true,
          data: defaultPlans.map((p, i) => ({
            id: `default-${i}`,
            name: p.name,
            tier: p.tier,
            monthlyCallLimit: p.limits.monthlyCallLimit,
            monthlyGenerationLimit: p.limits.monthlyGenerationLimit,
            monthlyTaskLimit: p.limits.monthlyTaskLimit,
            callsPerMinute: p.limits.callsPerMinute,
            monthlyPriceCents: p.monthlyPriceCents,
            features: p.features,
          })),
        });
      }

      return reply.send({
        success: true,
        data: plans.map(p => ({
          id: p.id,
          name: p.name,
          tier: p.tier,
          monthlyCallLimit: p.monthlyCallLimit,
          monthlyGenerationLimit: p.monthlyGenerationLimit,
          monthlyTaskLimit: p.monthlyTaskLimit,
          callsPerMinute: p.callsPerMinute,
          monthlyPriceCents: p.monthlyPriceCents,
          features: p.features,
        })),
      });
    }
  );

  // ---------------------------------------------------------------------------
  // GET /plans/current - Get organization's current plan and usage
  // ---------------------------------------------------------------------------
  fastify.get(
    '/current',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Get current organization plan and usage',
        tags: ['Plans'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  plan: { type: 'object' },
                  usage: { type: 'object' },
                  billingCycle: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.user?.organizationId;

      if (!organizationId) {
        return reply.status(400).send({
          success: false,
          error: { code: 'NO_ORGANIZATION', message: 'User is not associated with an organization' },
        });
      }

      // Get organization plan
      const orgPlan = await fastify.prisma.organizationPlan.findUnique({
        where: { organizationId },
        include: { plan: true },
      });

      if (!orgPlan) {
        // Default to free plan if none assigned
        const freePlan = DEFAULT_PLANS.find(p => p.tier === 'free');
        return reply.send({
          success: true,
          data: {
            plan: {
              id: null,
              name: freePlan?.name || 'Free',
              tier: 'free',
              limits: freePlan?.limits || {
                monthlyCallLimit: 10,
                monthlyGenerationLimit: 100,
                monthlyTaskLimit: 50,
              },
            },
            usage: {
              calls: { used: 0, limit: 10, remaining: 10 },
              generations: { used: 0, limit: 100, remaining: 100 },
              tasks: { used: 0, limit: 50, remaining: 50 },
            },
            billingCycle: null,
          },
        });
      }

      // Get usage summary
      const usageSummary = await fastify.getUsageSummary(organizationId);

      return reply.send({
        success: true,
        data: {
          plan: {
            id: orgPlan.plan.id,
            name: orgPlan.plan.name,
            tier: orgPlan.plan.tier,
            limits: {
              monthlyCallLimit: orgPlan.customCallLimit ?? orgPlan.plan.monthlyCallLimit,
              monthlyGenerationLimit: orgPlan.customGenerationLimit ?? orgPlan.plan.monthlyGenerationLimit,
              monthlyTaskLimit: orgPlan.customTaskLimit ?? orgPlan.plan.monthlyTaskLimit,
              callsPerMinute: orgPlan.plan.callsPerMinute,
            },
            features: orgPlan.plan.features,
          },
          usage: usageSummary ? {
            calls: {
              used: usageSummary.calls.currentUsage,
              limit: usageSummary.calls.limit,
              remaining: usageSummary.calls.remaining,
            },
            generations: {
              used: usageSummary.generations.currentUsage,
              limit: usageSummary.generations.limit,
              remaining: usageSummary.generations.remaining,
            },
            tasks: {
              used: usageSummary.tasks.currentUsage,
              limit: usageSummary.tasks.limit,
              remaining: usageSummary.tasks.remaining,
            },
          } : null,
          billingCycle: {
            start: orgPlan.billingCycleStart,
            end: orgPlan.billingCycleEnd,
            status: orgPlan.status,
          },
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // PUT /admin/organizations/:id/plan - Assign plan (admin only)
  // ---------------------------------------------------------------------------
  fastify.put<{
    Params: { id: string };
    Body: z.infer<typeof AssignPlanBodySchema>;
  }>(
    '/admin/organizations/:id/plan',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(['super_admin', 'admin'])],
      schema: {
        description: 'Assign a plan to an organization (admin only)',
        tags: ['Plans', 'Admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            planId: { type: 'string', format: 'uuid' },
            customCallLimit: { type: 'number' },
            customGenerationLimit: { type: 'number' },
            customTaskLimit: { type: 'number' },
            billingCycleStart: { type: 'string', format: 'date-time' },
          },
          required: ['planId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id: organizationId } = request.params;
      const body = AssignPlanBodySchema.parse(request.body);

      // Verify plan exists
      const plan = await fastify.prisma.agentPlan.findUnique({
        where: { id: body.planId },
      });

      if (!plan) {
        return reply.status(404).send({
          success: false,
          error: { code: 'PLAN_NOT_FOUND', message: 'Plan not found' },
        });
      }

      // Calculate billing cycle
      const now = new Date();
      const billingCycleStart = body.billingCycleStart
        ? new Date(body.billingCycleStart)
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const billingCycleEnd = new Date(billingCycleStart);
      billingCycleEnd.setMonth(billingCycleEnd.getMonth() + 1);

      // Upsert organization plan
      const orgPlan = await fastify.prisma.organizationPlan.upsert({
        where: { organizationId },
        create: {
          organizationId,
          planId: body.planId,
          status: 'active',
          billingCycleStart,
          billingCycleEnd,
          customCallLimit: body.customCallLimit,
          customGenerationLimit: body.customGenerationLimit,
          customTaskLimit: body.customTaskLimit,
        },
        update: {
          planId: body.planId,
          customCallLimit: body.customCallLimit,
          customGenerationLimit: body.customGenerationLimit,
          customTaskLimit: body.customTaskLimit,
          billingCycleStart,
          billingCycleEnd,
        },
        include: { plan: true },
      });

      // Reset usage counters for new billing cycle
      if (fastify.planUsageService) {
        await fastify.planUsageService.resetForNewPeriod(organizationId);
      }

      // Audit log
      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'plan_assigned',
          entityType: 'organization',
          entityId: organizationId,
          changes: {
            planId: body.planId,
            planName: plan.name,
            planTier: plan.tier,
          },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] || null,
        },
      });

      return reply.send({
        success: true,
        data: {
          organizationId,
          plan: {
            id: orgPlan.plan.id,
            name: orgPlan.plan.name,
            tier: orgPlan.plan.tier,
          },
          billingCycle: {
            start: orgPlan.billingCycleStart,
            end: orgPlan.billingCycleEnd,
          },
          customLimits: {
            calls: body.customCallLimit,
            generations: body.customGenerationLimit,
            tasks: body.customTaskLimit,
          },
        },
      });
    }
  );
}

export default planRoutes;
