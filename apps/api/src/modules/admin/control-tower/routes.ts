/**
 * Control Tower API Routes
 *
 * Founder-level monitoring and control for AI agents.
 * Provides active runs, failures, violations, spend, and kill switch management.
 */

import { getKillSwitchManager } from '@realriches/agent-governance';
import type { KillSwitchScope, AgentType, ResultErr } from '@realriches/agent-governance';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Schemas
// =============================================================================

const DateRangeQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  agentType: z.string().optional(),
  tenantId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateKillSwitchSchema = z.object({
  scope: z.enum(['global', 'agent_type', 'tool', 'tenant', 'market', 'user']),
  reason: z.string().min(10),
  durationHours: z.number().int().min(1).max(72).default(24),
  affectedAgentTypes: z.array(z.string()).optional(),
  affectedTools: z.array(z.string()).optional(),
  tenantId: z.string().uuid().optional(),
  market: z.string().optional(),
  userId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateSpendCapsSchema = z.object({
  perUserDailyCents: z.number().int().min(0).optional(),
  perOrgDailyCents: z.number().int().min(0).optional(),
  globalDailyCents: z.number().int().min(0).optional(),
  perRunCents: z.number().int().min(0).optional(),
  alertThresholds: z.array(z.number().min(0).max(100)).optional(),
});

// =============================================================================
// Routes
// =============================================================================

export async function controlTowerRoutes(fastify: FastifyInstance) {
  // Helper to require founder/super_admin role
  const requireFounder = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await fastify.authenticate(request, reply);
    if (!request.user) {
      return;
    }
    // Check for super_admin role
    if (request.user.role !== 'super_admin' && request.user.role !== 'admin') {
      reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Requires admin access' },
      });
      return;
    }
  };

  // ---------------------------------------------------------------------------
  // Active Runs
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/control-tower/runs/active - Get active agent runs
   */
  fastify.get(
    '/runs/active',
    {
      preHandler: requireFounder,
      schema: {
        description: 'Get currently active agent runs',
        tags: ['Control Tower'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            agentType: { type: 'string' },
            tenantId: { type: 'string', format: 'uuid' },
            limit: { type: 'number' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = DateRangeQuerySchema.parse(request.query);

      const runs = await fastify.prisma.agentRun.findMany({
        where: {
          status: { in: ['pending', 'processing'] },
          ...(query.agentType && { agentType: query.agentType }),
          ...(query.tenantId && { organizationId: query.tenantId }),
        },
        orderBy: { startedAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          agentType: true,
          status: true,
          startedAt: true,
          organizationId: true,
          userId: true,
          model: true,
          tokensTotal: true,
          cost: true,
        },
      });

      const total = await fastify.prisma.agentRun.count({
        where: {
          status: { in: ['pending', 'processing'] },
          ...(query.agentType && { agentType: query.agentType }),
          ...(query.tenantId && { organizationId: query.tenantId }),
        },
      });

      return reply.send({
        success: true,
        data: {
          runs,
          total,
          hasMore: query.offset + runs.length < total,
        },
      });
    }
  );

  /**
   * GET /admin/control-tower/runs/:id - Get run details
   */
  fastify.get<{ Params: { id: string } }>(
    '/runs/:id',
    {
      preHandler: requireFounder,
      schema: {
        description: 'Get agent run details',
        tags: ['Control Tower'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const run = await fastify.prisma.agentRun.findUnique({
        where: { id },
      });

      if (!run) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Run not found' },
        });
      }

      return reply.send({
        success: true,
        data: run,
      });
    }
  );

  /**
   * GET /admin/control-tower/runs/history - Get run history with filters
   */
  fastify.get(
    '/runs/history',
    {
      preHandler: requireFounder,
      schema: {
        description: 'Get agent run history',
        tags: ['Control Tower'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            agentType: { type: 'string' },
            tenantId: { type: 'string', format: 'uuid' },
            limit: { type: 'number' },
            offset: { type: 'number' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = DateRangeQuerySchema.parse(request.query);

      const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endDate = query.endDate ? new Date(query.endDate) : new Date();

      const runs = await fastify.prisma.agentRun.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          ...(query.agentType && { agentType: query.agentType }),
          ...(query.tenantId && { organizationId: query.tenantId }),
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      });

      // Aggregate metrics
      const metrics = await fastify.prisma.agentRun.groupBy({
        by: ['agentType', 'status'],
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: true,
        _sum: { cost: true, tokensTotal: true },
      });

      return reply.send({
        success: true,
        data: {
          runs,
          metrics: {
            byAgentType: groupByAgentType(metrics),
            byStatus: groupByStatus(metrics),
            totalCostCents: metrics.reduce((sum, m) => sum + (m._sum.cost || 0), 0),
            totalTokens: metrics.reduce((sum, m) => sum + (m._sum.tokensTotal || 0), 0),
          },
          timeRange: { start: startDate, end: endDate },
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Failures
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/control-tower/failures - Get recent failures
   */
  fastify.get(
    '/failures',
    {
      preHandler: requireFounder,
      schema: {
        description: 'Get recent agent failures',
        tags: ['Control Tower'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            limit: { type: 'number' },
            offset: { type: 'number' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = DateRangeQuerySchema.parse(request.query);

      const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = query.endDate ? new Date(query.endDate) : new Date();

      const failures = await fastify.prisma.agentRun.findMany({
        where: {
          status: { in: ['failed', 'blocked'] },
          createdAt: { gte: startDate, lte: endDate },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          agentType: true,
          status: true,
          errorCode: true,
          errorMessage: true,
          organizationId: true,
          marketId: true,
          createdAt: true,
          policyCheckResult: true,
        },
      });

      // Aggregate by error code
      const byErrorCode = await fastify.prisma.agentRun.groupBy({
        by: ['errorCode'],
        where: {
          status: { in: ['failed', 'blocked'] },
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: true,
      });

      return reply.send({
        success: true,
        data: {
          failures,
          byErrorCode: byErrorCode.filter(e => e.errorCode).map(e => ({
            code: e.errorCode,
            count: e._count,
          })),
          total: failures.length,
        },
      });
    }
  );

  /**
   * GET /admin/control-tower/failures/:id - Get failure details
   */
  fastify.get<{ Params: { id: string } }>(
    '/failures/:id',
    {
      preHandler: requireFounder,
      schema: {
        description: 'Get failure details',
        tags: ['Control Tower'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const failure = await fastify.prisma.agentRun.findFirst({
        where: {
          id,
          status: { in: ['failed', 'blocked'] },
        },
      });

      if (!failure) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Failure not found' },
        });
      }

      // Get related runs for context
      const relatedRuns = await fastify.prisma.agentRun.findMany({
        where: {
          organizationId: failure.organizationId,
          agentType: failure.agentType,
          createdAt: {
            gte: new Date(failure.createdAt.getTime() - 60 * 60 * 1000), // 1 hour before
            lte: new Date(failure.createdAt.getTime() + 60 * 60 * 1000), // 1 hour after
          },
          id: { not: id },
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
      });

      return reply.send({
        success: true,
        data: {
          ...failure,
          relatedRuns,
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Violations
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/control-tower/violations - Get policy violations
   */
  fastify.get(
    '/violations',
    {
      preHandler: requireFounder,
      schema: {
        description: 'Get policy violations',
        tags: ['Control Tower'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            severity: { type: 'string', enum: ['info', 'warning', 'error', 'critical'] },
            limit: { type: 'number' },
            offset: { type: 'number' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = DateRangeQuerySchema.parse(request.query);
      const { severity } = request.query as { severity?: string };

      const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = query.endDate ? new Date(query.endDate) : new Date();

      // Get runs with policy violations
      const runsWithViolations = await fastify.prisma.agentRun.findMany({
        where: {
          status: 'blocked',
          createdAt: { gte: startDate, lte: endDate },
          policyCheckResult: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          agentType: true,
          policyCheckResult: true,
          organizationId: true,
          marketId: true,
          createdAt: true,
        },
      });

      // Extract violations from policy check results
      const violations = runsWithViolations.flatMap(run => {
        const result = run.policyCheckResult as { violations?: Array<{ ruleId: string; severity: string; message: string }> } | null;
        return (result?.violations || []).map(v => ({
          runId: run.id,
          agentType: run.agentType,
          organizationId: run.organizationId,
          market: run.marketId,
          createdAt: run.createdAt,
          ...v,
        }));
      });

      // Filter by severity if provided
      const filteredViolations = severity
        ? violations.filter(v => v.severity === severity)
        : violations;

      // Aggregate by rule
      const byRule = new Map<string, number>();
      for (const v of filteredViolations) {
        byRule.set(v.ruleId, (byRule.get(v.ruleId) || 0) + 1);
      }

      // Aggregate by severity
      const bySeverity = new Map<string, number>();
      for (const v of filteredViolations) {
        bySeverity.set(v.severity, (bySeverity.get(v.severity) || 0) + 1);
      }

      return reply.send({
        success: true,
        data: {
          violations: filteredViolations,
          byRule: Array.from(byRule.entries()).map(([ruleId, count]) => ({ ruleId, count })),
          bySeverity: Array.from(bySeverity.entries()).map(([severity, count]) => ({ severity, count })),
          total: filteredViolations.length,
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Spend
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/control-tower/spend - Get AI spend breakdown
   */
  fastify.get(
    '/spend',
    {
      preHandler: requireFounder,
      schema: {
        description: 'Get AI spend breakdown',
        tags: ['Control Tower'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            groupBy: { type: 'string', enum: ['day', 'agent_type', 'model', 'org'] },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = DateRangeQuerySchema.parse(request.query);
      const { groupBy } = request.query as { groupBy?: string };

      const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = query.endDate ? new Date(query.endDate) : new Date();

      // Get total spend
      const totalSpend = await fastify.prisma.agentRun.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { cost: true, tokensTotal: true },
        _count: true,
      });

      // Get spend by agent type
      const byAgentType = await fastify.prisma.agentRun.groupBy({
        by: ['agentType'],
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { cost: true, tokensTotal: true },
        _count: true,
      });

      // Get spend by model
      const byModel = await fastify.prisma.agentRun.groupBy({
        by: ['model'],
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { cost: true },
        _count: true,
      });

      // Get daily spend (last 30 days)
      const dailySpend = await fastify.prisma.$queryRaw<Array<{ date: Date; cost: number; count: number }>>`
        SELECT
          DATE(created_at) as date,
          SUM(cost) as cost,
          COUNT(*) as count
        FROM agent_runs
        WHERE created_at >= ${startDate} AND created_at <= ${endDate}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `;

      return reply.send({
        success: true,
        data: {
          total: {
            costCents: totalSpend._sum.cost || 0,
            tokens: totalSpend._sum.tokensTotal || 0,
            runs: totalSpend._count,
          },
          byAgentType: byAgentType.map(b => ({
            agentType: b.agentType,
            costCents: b._sum.cost || 0,
            tokens: b._sum.tokensTotal || 0,
            runs: b._count,
          })),
          byModel: byModel.map(b => ({
            model: b.model,
            costCents: b._sum.cost || 0,
            runs: b._count,
          })),
          daily: dailySpend,
          timeRange: { start: startDate, end: endDate },
        },
      });
    }
  );

  /**
   * GET /admin/control-tower/spend/caps - Get spend caps
   */
  fastify.get(
    '/spend/caps',
    {
      preHandler: requireFounder,
      schema: {
        description: 'Get current spend caps',
        tags: ['Control Tower'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Get from Redis or config
      const caps = await fastify.redis.hgetall('spend:caps') || {};

      return reply.send({
        success: true,
        data: {
          perUserDailyCents: parseInt(caps['perUserDaily'] || '10000', 10),
          perOrgDailyCents: parseInt(caps['perOrgDaily'] || '100000', 10),
          globalDailyCents: parseInt(caps['globalDaily'] || '1000000', 10),
          perRunCents: parseInt(caps['perRun'] || '500', 10),
          alertThresholds: [75, 90],
        },
      });
    }
  );

  /**
   * PUT /admin/control-tower/spend/caps - Update spend caps (founders only)
   */
  fastify.put<{ Body: z.infer<typeof UpdateSpendCapsSchema> }>(
    '/spend/caps',
    {
      preHandler: requireFounder,
      schema: {
        description: 'Update spend caps (founders only)',
        tags: ['Control Tower'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            perUserDailyCents: { type: 'number' },
            perOrgDailyCents: { type: 'number' },
            globalDailyCents: { type: 'number' },
            perRunCents: { type: 'number' },
            alertThresholds: { type: 'array', items: { type: 'number' } },
          },
        },
      },
    },
    async (request, reply) => {
      const body = UpdateSpendCapsSchema.parse(request.body);

      const updates: Record<string, string> = {};
      if (body.perUserDailyCents !== undefined) updates['perUserDaily'] = String(body.perUserDailyCents);
      if (body.perOrgDailyCents !== undefined) updates['perOrgDaily'] = String(body.perOrgDailyCents);
      if (body.globalDailyCents !== undefined) updates['globalDaily'] = String(body.globalDailyCents);
      if (body.perRunCents !== undefined) updates['perRun'] = String(body.perRunCents);

      if (Object.keys(updates).length > 0) {
        await fastify.redis.hset('spend:caps', updates);
      }

      // Audit log
      await fastify.prisma.auditLog.create({
        data: {
          actorId: request.user!.id,
          action: 'spend_caps_updated',
          entityType: 'system',
          entityId: request.user!.id, // Use user ID as entity for system-level changes
          changes: body,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] || null,
        },
      });

      return reply.send({
        success: true,
        data: { updated: true },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Kill Switch
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/control-tower/kill-switches - List active kill switches
   */
  fastify.get(
    '/kill-switches',
    {
      preHandler: requireFounder,
      schema: {
        description: 'List active kill switches',
        tags: ['Control Tower'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const killSwitch = getKillSwitchManager();
      const switches = killSwitch.getActive();

      return reply.send({
        success: true,
        data: switches,
      });
    }
  );

  /**
   * POST /admin/control-tower/kill-switches - Create kill switch
   */
  fastify.post<{ Body: z.infer<typeof CreateKillSwitchSchema> }>(
    '/kill-switches',
    {
      preHandler: requireFounder,
      schema: {
        description: 'Create a new kill switch',
        tags: ['Control Tower'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['scope', 'reason'],
          properties: {
            scope: { type: 'string', enum: ['global', 'agent_type', 'tool', 'tenant', 'market', 'user'] },
            reason: { type: 'string', minLength: 10 },
            durationHours: { type: 'number', minimum: 1, maximum: 72 },
            affectedAgentTypes: { type: 'array', items: { type: 'string' } },
            affectedTools: { type: 'array', items: { type: 'string' } },
            tenantId: { type: 'string', format: 'uuid' },
            market: { type: 'string' },
            userId: { type: 'string', format: 'uuid' },
            metadata: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = CreateKillSwitchSchema.parse(request.body);

      const killSwitch = getKillSwitchManager();

      // Determine scopeValue based on scope type
      let scopeValue: string | undefined;
      switch (body.scope) {
        case 'tenant':
          scopeValue = body.tenantId;
          break;
        case 'market':
          scopeValue = body.market;
          break;
        case 'user':
          scopeValue = body.userId;
          break;
        case 'agent_type':
          scopeValue = body.affectedAgentTypes?.[0];
          break;
        case 'tool':
          scopeValue = body.affectedTools?.[0];
          break;
        // 'global' scope doesn't need a scopeValue
      }

      const result = await killSwitch.activate({
        scope: body.scope as KillSwitchScope,
        scopeValue,
        reason: body.reason,
        activatedBy: request.user!.id,
        durationHours: body.durationHours,
        affectedAgentTypes: body.affectedAgentTypes as AgentType[] | undefined,
        affectedTools: body.affectedTools,
        metadata: body.metadata,
      });

      if (!result.ok) {
        const { error } = result as ResultErr;
        return reply.status(400).send({
          success: false,
          error: { code: error.code, message: error.message },
        });
      }

      // Audit log
      await fastify.prisma.auditLog.create({
        data: {
          actorId: request.user!.id,
          action: 'kill_switch_activated',
          entityType: 'kill_switch',
          entityId: result.data.id,
          changes: {
            scope: body.scope,
            reason: body.reason,
            durationHours: body.durationHours,
          },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] || null,
        },
      });

      return reply.send({
        success: true,
        data: result.data,
      });
    }
  );

  /**
   * DELETE /admin/control-tower/kill-switches/:id - Deactivate kill switch
   */
  fastify.delete<{ Params: { id: string } }>(
    '/kill-switches/:id',
    {
      preHandler: requireFounder,
      schema: {
        description: 'Deactivate a kill switch',
        tags: ['Control Tower'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const killSwitch = getKillSwitchManager();
      const result = await killSwitch.deactivate(id, request.user!.id);

      if (!result.ok) {
        const { error } = result as ResultErr;
        return reply.status(400).send({
          success: false,
          error: { code: error.code, message: error.message },
        });
      }

      // Audit log
      await fastify.prisma.auditLog.create({
        data: {
          actorId: request.user!.id,
          action: 'kill_switch_deactivated',
          entityType: 'kill_switch',
          entityId: id,
          changes: {},
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] || null,
        },
      });

      return reply.send({
        success: true,
        data: { deactivated: true },
      });
    }
  );

  /**
   * GET /admin/control-tower/kill-switches/:id/audit - Get kill switch audit trail
   */
  fastify.get<{ Params: { id: string } }>(
    '/kill-switches/:id/audit',
    {
      preHandler: requireFounder,
      schema: {
        description: 'Get kill switch audit trail',
        tags: ['Control Tower'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const auditLogs = await fastify.prisma.auditLog.findMany({
        where: {
          entityType: 'kill_switch',
          entityId: id,
        },
        orderBy: { timestamp: 'desc' },
        take: 100,
      });

      return reply.send({
        success: true,
        data: auditLogs,
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Dashboard (Consolidated View)
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/control-tower/dashboard - Get consolidated dashboard
   */
  fastify.get(
    '/dashboard',
    {
      preHandler: requireFounder,
      schema: {
        description: 'Get consolidated control tower dashboard',
        tags: ['Control Tower'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Active runs
      const activeRuns = await fastify.prisma.agentRun.count({
        where: { status: { in: ['pending', 'processing'] } },
      });

      // Recent failures (last hour)
      const recentFailures = await fastify.prisma.agentRun.count({
        where: {
          status: { in: ['failed', 'blocked'] },
          createdAt: { gte: oneHourAgo },
        },
      });

      // Total runs today
      const runsToday = await fastify.prisma.agentRun.count({
        where: { createdAt: { gte: oneDayAgo } },
      });

      // Spend today
      const spendToday = await fastify.prisma.agentRun.aggregate({
        where: { createdAt: { gte: oneDayAgo } },
        _sum: { cost: true },
      });

      // Active kill switches
      const killSwitch = getKillSwitchManager();
      const activeSwitches = killSwitch.getActive();

      // Get spend caps for alert calculation
      const caps = await fastify.redis.hgetall('spend:caps') || {};
      const globalDailyCap = parseInt(caps['globalDaily'] || '1000000', 10);
      const spentCents = spendToday._sum.cost || 0;
      const budgetUtilization = globalDailyCap > 0 ? (spentCents / globalDailyCap) * 100 : 0;

      // Build alerts
      const alerts: Array<{ type: string; severity: string; message: string }> = [];

      if (budgetUtilization >= 90) {
        alerts.push({
          type: 'budget',
          severity: 'critical',
          message: `Budget utilization at ${budgetUtilization.toFixed(1)}%`,
        });
      } else if (budgetUtilization >= 75) {
        alerts.push({
          type: 'budget',
          severity: 'warning',
          message: `Budget utilization at ${budgetUtilization.toFixed(1)}%`,
        });
      }

      if (recentFailures > 10) {
        alerts.push({
          type: 'failure_rate',
          severity: 'warning',
          message: `${recentFailures} failures in the last hour`,
        });
      }

      if (activeSwitches.length > 0) {
        alerts.push({
          type: 'kill_switch',
          severity: 'info',
          message: `${activeSwitches.length} active kill switch(es)`,
        });
      }

      return reply.send({
        success: true,
        data: {
          summary: {
            activeRuns,
            recentFailures,
            runsToday,
            spendTodayCents: spentCents,
            activeKillSwitches: activeSwitches.length,
            budgetUtilization,
          },
          alerts,
          killSwitches: activeSwitches,
          timestamp: now,
        },
      });
    }
  );
}

// =============================================================================
// Helpers
// =============================================================================

function groupByAgentType(metrics: Array<{ agentType: string | null; _count: number; _sum: { cost: number | null } }>) {
  const result: Record<string, { count: number; costCents: number }> = {};
  for (const m of metrics) {
    const type = m.agentType || 'unknown';
    if (!result[type]) {
      result[type] = { count: 0, costCents: 0 };
    }
    result[type].count += m._count;
    result[type].costCents += m._sum.cost || 0;
  }
  return result;
}

function groupByStatus(metrics: Array<{ status: string; _count: number }>) {
  const result: Record<string, number> = {};
  for (const m of metrics) {
    result[m.status] = (result[m.status] || 0) + m._count;
  }
  return result;
}

export default controlTowerRoutes;
