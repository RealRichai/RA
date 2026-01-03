/**
 * Agent Usage Routes
 *
 * API endpoints for tracking agent usage, costs, and budget management.
 * Provides real-time cost tracking via Redis and historical data from database.
 */

import {
  AgentUsageService,
  PrismaAgentRunStore,
  type Period,
} from '@realriches/agent-governance';
import { prisma } from '@realriches/database';
import { generatePrefixedId, ForbiddenError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';

// ============================================================================
// Request Schemas
// ============================================================================

const UsageSummaryQuerySchema = z.object({
  period: z.enum(['today', 'week', 'month', 'custom']).default('month'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const CostBreakdownQuerySchema = z.object({
  groupBy: z.enum(['model', 'agent_type', 'day', 'hour']).default('day'),
  period: z.enum(['today', 'week', 'month']).default('week'),
});

const RunListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  agentType: z.string().optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'policy_blocked']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const SetBudgetSchema = z.object({
  dailyLimitCents: z.number().int().min(0),
  monthlyLimitCents: z.number().int().min(0),
  alertThresholds: z.array(z.number().min(0).max(1)).default([0.8, 0.9, 1.0]),
  isEnabled: z.boolean().default(true),
});

// ============================================================================
// Service Initialization
// ============================================================================

let usageService: AgentUsageService | null = null;
let runStore: PrismaAgentRunStore | null = null;

function getServices(redis: Redis): { usageService: AgentUsageService; runStore: PrismaAgentRunStore } {
  if (!runStore) {
    runStore = new PrismaAgentRunStore(prisma);
  }
  if (!usageService) {
    usageService = new AgentUsageService(redis, runStore);
  }
  return { usageService, runStore };
}

// ============================================================================
// Routes
// ============================================================================

export async function agentUsageRoutes(app: FastifyInstance): Promise<void> {
  // =========================================================================
  // GET /summary - Get usage summary for current organization
  // =========================================================================
  app.get(
    '/summary',
    {
      schema: {
        description: 'Get agent usage summary for the current period',
        tags: ['Agent Usage'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['today', 'week', 'month', 'custom'] },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user?.organizationId) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Organization context required' },
        });
      }

      const query = UsageSummaryQuerySchema.parse(request.query);
      const { usageService } = getServices(app.redis);

      const summary = await usageService.getCostSummary(
        request.user.organizationId,
        query.period as Period,
        query.startDate ? new Date(query.startDate) : undefined,
        query.endDate ? new Date(query.endDate) : undefined
      );

      return reply.send({
        success: true,
        data: {
          organizationId: request.user.organizationId,
          period: query.period,
          summary: {
            totalCostUsd: summary.totalCostCents / 100,
            totalCostCents: summary.totalCostCents,
            totalTokensIn: summary.totalTokensIn,
            totalTokensOut: summary.totalTokensOut,
            totalRuns: summary.totalRuns,
            avgCostPerRunCents: summary.avgCostPerRunCents,
          },
          byModel: Object.entries(summary.byModel).map(([model, data]) => ({
            model,
            costUsd: data.totalCostCents / 100,
            costCents: data.totalCostCents,
            tokensIn: data.tokensIn,
            tokensOut: data.tokensOut,
            runCount: data.runCount,
          })),
          byAgentType: Object.entries(summary.byAgentType).map(([agentType, costCents]) => ({
            agentType,
            costUsd: costCents / 100,
            costCents,
          })),
          periodStart: summary.periodStart.toISOString(),
          periodEnd: summary.periodEnd.toISOString(),
        },
      });
    }
  );

  // =========================================================================
  // GET /cost-breakdown - Get cost breakdown by dimension
  // =========================================================================
  app.get(
    '/cost-breakdown',
    {
      schema: {
        description: 'Get cost breakdown grouped by model, agent type, or time',
        tags: ['Agent Usage'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            groupBy: { type: 'string', enum: ['model', 'agent_type', 'day', 'hour'] },
            period: { type: 'string', enum: ['today', 'week', 'month'] },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user?.organizationId) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Organization context required' },
        });
      }

      const query = CostBreakdownQuerySchema.parse(request.query);
      const { usageService } = getServices(app.redis);

      const breakdown = await usageService.getCostBreakdown(
        request.user.organizationId,
        query.groupBy,
        query.period as Period
      );

      return reply.send({
        success: true,
        data: {
          groupBy: query.groupBy,
          period: query.period,
          breakdown: breakdown.map((item) => ({
            key: item.key,
            costUsd: item.costCents / 100,
            costCents: item.costCents,
            runCount: item.runCount,
            tokensIn: item.tokensIn,
            tokensOut: item.tokensOut,
          })),
        },
      });
    }
  );

  // =========================================================================
  // GET /runs - List agent runs with pagination
  // =========================================================================
  app.get(
    '/runs',
    {
      schema: {
        description: 'List agent runs with pagination and filtering',
        tags: ['Agent Usage'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            agentType: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'policy_blocked'] },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user?.organizationId) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Organization context required' },
        });
      }

      const query = RunListQuerySchema.parse(request.query);
      const { runStore } = getServices(app.redis);

      const offset = (query.page - 1) * query.limit;

      const [listResult, countResult] = await Promise.all([
        runStore.list({
          tenantId: request.user.organizationId,
          agentType: query.agentType as Parameters<typeof runStore.list>[0]['agentType'],
          status: query.status as Parameters<typeof runStore.list>[0]['status'],
          startDate: query.startDate ? new Date(query.startDate) : undefined,
          endDate: query.endDate ? new Date(query.endDate) : undefined,
          limit: query.limit,
          offset,
        }),
        runStore.count({
          tenantId: request.user.organizationId,
          agentType: query.agentType as Parameters<typeof runStore.count>[0]['agentType'],
          status: query.status as Parameters<typeof runStore.count>[0]['status'],
          startDate: query.startDate ? new Date(query.startDate) : undefined,
          endDate: query.endDate ? new Date(query.endDate) : undefined,
        }),
      ]);

      if (!listResult.ok) {
        const err = listResult as { ok: false; error: { code: string; message: string } };
        return reply.status(500).send({
          success: false,
          error: { code: err.error.code, message: err.error.message },
        });
      }

      const totalCount = countResult.ok ? countResult.data : 0;
      const totalPages = Math.ceil(totalCount / query.limit);

      return reply.send({
        success: true,
        data: {
          runs: listResult.data.map((run) => ({
            id: run.id,
            requestId: run.requestId,
            agentType: run.agentType,
            status: run.status,
            modelId: run.modelId,
            totalTokensIn: run.totalTokensIn,
            totalTokensOut: run.totalTokensOut,
            totalCostUsd: run.totalCostUsd,
            startedAt: run.startedAt.toISOString(),
            completedAt: run.completedAt?.toISOString(),
            durationMs: run.durationMs,
          })),
          pagination: {
            page: query.page,
            limit: query.limit,
            totalCount,
            totalPages,
            hasMore: query.page < totalPages,
          },
        },
      });
    }
  );

  // =========================================================================
  // GET /runs/:runId - Get single run details
  // =========================================================================
  app.get(
    '/runs/:runId',
    {
      schema: {
        description: 'Get details of a specific agent run',
        tags: ['Agent Usage'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
          },
          required: ['runId'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { runId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user?.organizationId) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Organization context required' },
        });
      }

      const { runId } = request.params;
      const { runStore } = getServices(app.redis);

      const result = await runStore.get(runId);

      if (!result.ok) {
        const err = result as { ok: false; error: { code: string; message: string } };
        return reply.status(500).send({
          success: false,
          error: { code: err.error.code, message: err.error.message },
        });
      }

      if (!result.data) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Agent run not found' },
        });
      }

      // Verify organization access
      if (result.data.tenantId !== request.user.organizationId) {
        throw new ForbiddenError('Not authorized to access this run');
      }

      const run = result.data;

      return reply.send({
        success: true,
        data: {
          id: run.id,
          requestId: run.requestId,
          agentType: run.agentType,
          status: run.status,
          modelId: run.modelId,
          market: run.market,
          policyVersion: run.policyVersion,
          totalTokensIn: run.totalTokensIn,
          totalTokensOut: run.totalTokensOut,
          totalCostUsd: run.totalCostUsd,
          toolCalls: run.toolCalls,
          policyViolations: run.policyViolations,
          outcome: run.outcome,
          startedAt: run.startedAt.toISOString(),
          completedAt: run.completedAt?.toISOString(),
          durationMs: run.durationMs,
        },
      });
    }
  );

  // =========================================================================
  // GET /budget-status - Get current budget status
  // =========================================================================
  app.get(
    '/budget-status',
    {
      schema: {
        description: 'Get current budget status including daily and monthly limits',
        tags: ['Agent Usage'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user?.organizationId) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Organization context required' },
        });
      }

      const { usageService } = getServices(app.redis);

      const status = await usageService.getUsageStatus(request.user.organizationId);

      return reply.send({
        success: true,
        data: {
          organizationId: request.user.organizationId,
          daily: {
            allowed: status.daily.allowed,
            currentCostUsd: status.daily.currentCostCents / 100,
            currentCostCents: status.daily.currentCostCents,
            budgetLimitUsd: status.daily.budgetLimitCents / 100,
            budgetLimitCents: status.daily.budgetLimitCents,
            remainingUsd: status.daily.remainingCents / 100,
            remainingCents: status.daily.remainingCents,
            percentUsed: status.daily.percentUsed,
          },
          monthly: {
            allowed: status.monthly.allowed,
            currentCostUsd: status.monthly.currentCostCents / 100,
            currentCostCents: status.monthly.currentCostCents,
            budgetLimitUsd: status.monthly.budgetLimitCents / 100,
            budgetLimitCents: status.monthly.budgetLimitCents,
            remainingUsd: status.monthly.remainingCents / 100,
            remainingCents: status.monthly.remainingCents,
            percentUsed: status.monthly.percentUsed,
          },
          config: {
            dailyLimitCents: status.config.dailyLimitCents,
            monthlyLimitCents: status.config.monthlyLimitCents,
            alertThresholds: status.config.alertThresholds,
            isEnabled: status.config.isEnabled,
          },
          runCount: status.runCount,
        },
      });
    }
  );

  // =========================================================================
  // GET /token-usage - Get token usage summary
  // =========================================================================
  app.get(
    '/token-usage',
    {
      schema: {
        description: 'Get token usage summary by model',
        tags: ['Agent Usage'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['today', 'week', 'month'] },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { period?: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user?.organizationId) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Organization context required' },
        });
      }

      const period = (request.query.period || 'month') as Period;
      const { usageService } = getServices(app.redis);

      const tokenUsage = await usageService.getTokenUsage(request.user.organizationId, period);

      return reply.send({
        success: true,
        data: {
          organizationId: request.user.organizationId,
          period,
          totalTokensIn: tokenUsage.totalTokensIn,
          totalTokensOut: tokenUsage.totalTokensOut,
          totalCostUsd: tokenUsage.totalCostCents / 100,
          totalCostCents: tokenUsage.totalCostCents,
          byModel: tokenUsage.byModel.map((m) => ({
            model: m.model,
            tokensIn: m.tokensIn,
            tokensOut: m.tokensOut,
            costUsd: m.costCents / 100,
            costCents: m.costCents,
          })),
        },
      });
    }
  );

  // =========================================================================
  // Admin Routes
  // =========================================================================

  // GET /admin/all - Get usage for all organizations (admin only)
  app.get(
    '/admin/all',
    {
      schema: {
        description: 'Get usage summary for all organizations (admin only)',
        tags: ['Agent Usage', 'Admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['today', 'week', 'month'] },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        // Check admin role
        if (request.user?.role !== 'admin' && request.user?.role !== 'super_admin') {
          throw new ForbiddenError('Admin access required');
        }
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { period?: string; limit?: number } }>,
      reply: FastifyReply
    ) => {
      const period = request.query.period || 'month';
      const limit = request.query.limit || 20;

      // Get top organizations by usage
      const topOrgs = await prisma.agentRun.groupBy({
        by: ['organizationId'],
        _sum: {
          cost: true,
          tokensTotal: true,
        },
        _count: true,
        where: {
          organizationId: { not: null },
          startedAt: {
            gte: period === 'today'
              ? new Date(new Date().setHours(0, 0, 0, 0))
              : period === 'week'
                ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                : new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        orderBy: {
          _sum: {
            cost: 'desc',
          },
        },
        take: limit,
      });

      // Get organization details
      const orgIds = topOrgs.map((o) => o.organizationId).filter((id): id is string => id !== null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orgs = await (prisma as any).organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true },
      });
      const orgMap = new Map(orgs.map((o: { id: string; name: string }) => [o.id, o.name]));

      return reply.send({
        success: true,
        data: {
          period,
          organizations: topOrgs.map((o) => ({
            organizationId: o.organizationId,
            organizationName: orgMap.get(o.organizationId || '') || 'Unknown',
            totalCostUsd: (o._sum.cost || 0) / 100,
            totalCostCents: o._sum.cost || 0,
            totalTokens: o._sum.tokensTotal || 0,
            runCount: o._count,
          })),
        },
      });
    }
  );

  // PUT /admin/budgets/:organizationId - Set budget for an organization
  app.put(
    '/admin/budgets/:organizationId',
    {
      schema: {
        description: 'Set budget limits for an organization (admin only)',
        tags: ['Agent Usage', 'Admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
          },
          required: ['organizationId'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        if (request.user?.role !== 'admin' && request.user?.role !== 'super_admin') {
          throw new ForbiddenError('Admin access required');
        }
      },
    },
    async (
      request: FastifyRequest<{ Params: { organizationId: string } }>,
      reply: FastifyReply
    ) => {
      const { organizationId } = request.params;
      const data = SetBudgetSchema.parse(request.body);
      const { usageService } = getServices(app.redis);

      const config = await usageService.setBudgetConfig({
        organizationId,
        dailyLimitCents: data.dailyLimitCents,
        monthlyLimitCents: data.monthlyLimitCents,
        alertThresholds: data.alertThresholds,
        isEnabled: data.isEnabled,
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          id: generatePrefixedId('aud'),
          actorId: request.user?.id,
          actorEmail: request.user?.email || 'admin',
          action: 'agent_budget_updated',
          entityType: 'organization',
          entityId: organizationId,
          changes: JSON.stringify(data),
          metadata: JSON.stringify({ previousConfig: 'not_tracked' }),
          timestamp: new Date(),
        },
      });

      return reply.send({
        success: true,
        data: {
          organizationId: config.organizationId,
          dailyLimitCents: config.dailyLimitCents,
          monthlyLimitCents: config.monthlyLimitCents,
          alertThresholds: config.alertThresholds,
          isEnabled: config.isEnabled,
        },
      });
    }
  );

  // GET /admin/budgets/:organizationId - Get budget for an organization
  app.get(
    '/admin/budgets/:organizationId',
    {
      schema: {
        description: 'Get budget configuration for an organization (admin only)',
        tags: ['Agent Usage', 'Admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
          },
          required: ['organizationId'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        if (request.user?.role !== 'admin' && request.user?.role !== 'super_admin') {
          throw new ForbiddenError('Admin access required');
        }
      },
    },
    async (
      request: FastifyRequest<{ Params: { organizationId: string } }>,
      reply: FastifyReply
    ) => {
      const { organizationId } = request.params;
      const { usageService } = getServices(app.redis);

      const config = await usageService.getBudgetConfig(organizationId);
      const status = await usageService.getUsageStatus(organizationId);

      return reply.send({
        success: true,
        data: {
          config: {
            organizationId: config.organizationId,
            dailyLimitCents: config.dailyLimitCents,
            monthlyLimitCents: config.monthlyLimitCents,
            alertThresholds: config.alertThresholds,
            isEnabled: config.isEnabled,
          },
          currentUsage: {
            daily: {
              currentCostCents: status.daily.currentCostCents,
              percentUsed: status.daily.percentUsed,
            },
            monthly: {
              currentCostCents: status.monthly.currentCostCents,
              percentUsed: status.monthly.percentUsed,
            },
            runCount: status.runCount,
          },
        },
      });
    }
  );
}
