/**
 * 3DGS Pipeline Control Admin API
 *
 * Provides admin endpoints for managing 3D Gaussian Splatting pipeline:
 * - Kill switch activation/deactivation per market
 * - Backpressure status monitoring
 * - Metering statistics
 *
 * @see RR-ENG-UPDATE-2026-002 - 3DGS Pipeline Economics and Delivery Control
 */

import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Schemas
// =============================================================================

const ActivateKillSwitchSchema = z.object({
  market: z.string().min(1),
  reason: z.string().min(1).max(500),
  durationHours: z.number().min(1).max(72).optional().default(24),
});

const DeactivateKillSwitchSchema = z.object({
  market: z.string().min(1),
  reason: z.string().max(500).optional(),
});

const GetMeteringStatsSchema = z.object({
  market: z.string().optional(),
  plan: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// =============================================================================
// Types
// =============================================================================

interface KillSwitchManager {
  activate(params: {
    scope: 'market';
    scopeValue: string;
    reason: string;
    activatedBy: string;
    durationHours: number;
    affectedTools: string[];
  }): Promise<{ success: boolean; data?: { id: string }; error?: { message: string } }>;

  deactivate(
    killSwitchId: string,
    deactivatedBy: string,
    reason?: string
  ): Promise<{ success: boolean; error?: { message: string } }>;

  getByScope(scope: 'market', scopeValue?: string): Array<{
    id: string;
    scope: string;
    scopeValue?: string;
    reason: string;
    activatedBy: string;
    activatedAt: Date;
    expiresAt?: Date;
    active: boolean;
    affectedTools?: string[];
  }>;

  getActive(): Array<{
    id: string;
    scope: string;
    scopeValue?: string;
    reason: string;
    activatedBy: string;
    activatedAt: Date;
    expiresAt?: Date;
    active: boolean;
    affectedTools?: string[];
  }>;

  getAuditLog(options?: { limit?: number }): Array<{
    action: string;
    killSwitchId: string;
    performedBy: string;
    timestamp: Date;
    reason?: string;
  }>;
}

interface BackpressureStatus {
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  queueDepth: number;
  maxPendingJobs: number;
  utilizationPercent: number;
  acceptingJobs: boolean;
  rejectionReason?: 'queue_full' | 'circuit_open';
}

// =============================================================================
// Helper Functions
// =============================================================================

function getKillSwitchManager(app: FastifyInstance): KillSwitchManager | null {
  return (app as unknown as { killSwitchManager?: KillSwitchManager }).killSwitchManager || null;
}

async function getBackpressureStatus(): Promise<BackpressureStatus | null> {
  try {
    // Dynamic import to avoid bundling issues
    const { getBackpressureStatus } = await import('@realriches/tour-conversion');
    return await getBackpressureStatus();
  } catch {
    return null;
  }
}

async function getWorkerStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
} | null> {
  try {
    const { getWorkerStats } = await import('@realriches/tour-conversion');
    return await getWorkerStats();
  } catch {
    return null;
  }
}

// =============================================================================
// Routes
// =============================================================================

export async function threeDGSControlAdminRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================================================
  // POST /admin/3dgs/kill-switch/activate - Activate kill switch for market
  // ===========================================================================
  app.post(
    '/kill-switch/activate',
    {
      schema: {
        description: 'Activate 3DGS kill switch for a specific market',
        tags: ['Admin', '3DGS Control'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['market', 'reason'],
          properties: {
            market: { type: 'string', description: 'Market ID to disable' },
            reason: { type: 'string', description: 'Reason for activation' },
            durationHours: { type: 'number', minimum: 1, maximum: 72, default: 24 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const params = ActivateKillSwitchSchema.parse(request.body);
        const manager = getKillSwitchManager(app);

        if (!manager) {
          return reply.status(503).send({
            success: false,
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Kill switch manager not available' },
          });
        }

        const result = await manager.activate({
          scope: 'market',
          scopeValue: params.market,
          reason: params.reason,
          activatedBy: request.user?.id ?? 'system',
          durationHours: params.durationHours,
          affectedTools: ['3dgs_tours'],
        });

        if (!result.success) {
          return reply.status(400).send({
            success: false,
            error: { code: 'ACTIVATION_FAILED', message: result.error?.message },
          });
        }

        logger.warn({
          msg: '3dgs_kill_switch_activated',
          adminUserId: request.user?.id,
          market: params.market,
          reason: params.reason,
          durationHours: params.durationHours,
          killSwitchId: result.data?.id,
        });

        return reply.status(201).send({
          success: true,
          data: {
            killSwitchId: result.data?.id,
            market: params.market,
            reason: params.reason,
            durationHours: params.durationHours,
            expiresAt: new Date(Date.now() + params.durationHours * 60 * 60 * 1000).toISOString(),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to activate 3DGS kill switch');
        return reply.status(500).send({
          success: false,
          error: { code: 'ACTIVATION_ERROR', message: 'Failed to activate kill switch' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/3dgs/kill-switch/deactivate - Deactivate kill switch for market
  // ===========================================================================
  app.post(
    '/kill-switch/deactivate',
    {
      schema: {
        description: 'Deactivate 3DGS kill switch for a specific market',
        tags: ['Admin', '3DGS Control'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['market'],
          properties: {
            market: { type: 'string', description: 'Market ID to re-enable' },
            reason: { type: 'string', description: 'Reason for deactivation' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const params = DeactivateKillSwitchSchema.parse(request.body);
        const manager = getKillSwitchManager(app);

        if (!manager) {
          return reply.status(503).send({
            success: false,
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Kill switch manager not available' },
          });
        }

        // Find active kill switches for this market
        const activeForMarket = manager.getByScope('market', params.market);
        const threeDgsSwitch = activeForMarket.find(
          (ks) => ks.active && ks.affectedTools?.includes('3dgs_tours')
        );

        if (!threeDgsSwitch) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'No active 3DGS kill switch found for this market' },
          });
        }

        const result = await manager.deactivate(
          threeDgsSwitch.id,
          request.user?.id ?? 'system',
          params.reason
        );

        if (!result.success) {
          return reply.status(400).send({
            success: false,
            error: { code: 'DEACTIVATION_FAILED', message: result.error?.message },
          });
        }

        logger.info({
          msg: '3dgs_kill_switch_deactivated',
          adminUserId: request.user?.id,
          market: params.market,
          reason: params.reason,
          killSwitchId: threeDgsSwitch.id,
        });

        return reply.send({
          success: true,
          data: {
            killSwitchId: threeDgsSwitch.id,
            market: params.market,
            deactivatedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to deactivate 3DGS kill switch');
        return reply.status(500).send({
          success: false,
          error: { code: 'DEACTIVATION_ERROR', message: 'Failed to deactivate kill switch' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/3dgs/kill-switch/status - Get kill switch status
  // ===========================================================================
  app.get(
    '/kill-switch/status',
    {
      schema: {
        description: 'Get 3DGS kill switch status across all markets',
        tags: ['Admin', '3DGS Control'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const manager = getKillSwitchManager(app);

        if (!manager) {
          return reply.status(503).send({
            success: false,
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Kill switch manager not available' },
          });
        }

        // Get all active kill switches
        const allActive = manager.getActive();
        const threeDgsActive = allActive.filter(
          (ks) => ks.affectedTools?.includes('3dgs_tours') || ks.scope === 'global'
        );

        // Group by market
        const byMarket: Record<string, {
          killSwitchId: string;
          reason: string;
          activatedBy: string;
          activatedAt: string;
          expiresAt?: string;
        }> = {};

        for (const ks of threeDgsActive) {
          if (ks.scope === 'market' && ks.scopeValue) {
            byMarket[ks.scopeValue] = {
              killSwitchId: ks.id,
              reason: ks.reason,
              activatedBy: ks.activatedBy,
              activatedAt: ks.activatedAt.toISOString(),
              expiresAt: ks.expiresAt?.toISOString(),
            };
          }
        }

        // Get recent audit log entries
        const recentAudit = manager.getAuditLog({ limit: 20 }).map((entry) => ({
          action: entry.action,
          killSwitchId: entry.killSwitchId,
          performedBy: entry.performedBy,
          timestamp: entry.timestamp.toISOString(),
          reason: entry.reason,
        }));

        return reply.send({
          success: true,
          data: {
            active: threeDgsActive.map((ks) => ({
              id: ks.id,
              scope: ks.scope,
              scopeValue: ks.scopeValue,
              reason: ks.reason,
              activatedBy: ks.activatedBy,
              activatedAt: ks.activatedAt.toISOString(),
              expiresAt: ks.expiresAt?.toISOString(),
            })),
            byMarket,
            totalActive: threeDgsActive.length,
            recentAudit,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get 3DGS kill switch status');
        return reply.status(500).send({
          success: false,
          error: { code: 'STATUS_ERROR', message: 'Failed to get kill switch status' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/3dgs/backpressure - Get backpressure status
  // ===========================================================================
  app.get(
    '/backpressure',
    {
      schema: {
        description: 'Get 3DGS conversion queue backpressure status',
        tags: ['Admin', '3DGS Control'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const [backpressure, workerStats] = await Promise.all([
          getBackpressureStatus(),
          getWorkerStats(),
        ]);

        if (!backpressure) {
          return reply.status(503).send({
            success: false,
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Backpressure status not available' },
          });
        }

        return reply.send({
          success: true,
          data: {
            backpressure: {
              circuitBreakerState: backpressure.circuitBreakerState,
              queueDepth: backpressure.queueDepth,
              maxPendingJobs: backpressure.maxPendingJobs,
              utilizationPercent: backpressure.utilizationPercent,
              acceptingJobs: backpressure.acceptingJobs,
              rejectionReason: backpressure.rejectionReason,
            },
            queue: workerStats ?? {
              waiting: 0,
              active: 0,
              completed: 0,
              failed: 0,
              delayed: 0,
            },
            health: {
              status: backpressure.acceptingJobs ? 'healthy' : 'degraded',
              circuitBreaker: backpressure.circuitBreakerState,
              queueUtilization: `${backpressure.utilizationPercent}%`,
            },
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get 3DGS backpressure status');
        return reply.status(500).send({
          success: false,
          error: { code: 'BACKPRESSURE_ERROR', message: 'Failed to get backpressure status' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/3dgs/metering - Get metering statistics
  // ===========================================================================
  app.get(
    '/metering',
    {
      schema: {
        description: 'Get 3DGS tour metering statistics for unit economics',
        tags: ['Admin', '3DGS Control'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            market: { type: 'string' },
            plan: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const params = GetMeteringStatsSchema.parse(request.query);

        // Dynamic import to access Prisma
        const { prisma } = await import('@realriches/database');

        // Build date range filter
        const startDate = params.startDate
          ? new Date(params.startDate)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days default
        const endDate = params.endDate ? new Date(params.endDate) : new Date();

        // Query daily aggregates
        const dailyStats = await prisma.tourMeteringDaily.findMany({
          where: {
            date: {
              gte: startDate,
              lte: endDate,
            },
            ...(params.market && { market: params.market }),
            ...(params.plan && { plan: params.plan }),
          },
          orderBy: { date: 'desc' },
        });

        // Calculate totals
        const totals = dailyStats.reduce(
          (acc, day) => ({
            totalViews: acc.totalViews + day.totalViews,
            uniqueViewers: acc.uniqueViewers + day.uniqueViewers,
            completedViews: acc.completedViews + day.completedViews,
            totalMinutesStreamed: acc.totalMinutesStreamed + day.totalMinutesStreamed,
            conversionsTriggered: acc.conversionsTriggered + day.conversionsTriggered,
            estimatedEgressGb: acc.estimatedEgressGb + day.estimatedEgressGb,
            estimatedCostUsd: acc.estimatedCostUsd + day.estimatedCostUsd,
          }),
          {
            totalViews: 0,
            uniqueViewers: 0,
            completedViews: 0,
            totalMinutesStreamed: 0,
            conversionsTriggered: 0,
            estimatedEgressGb: 0,
            estimatedCostUsd: 0,
          }
        );

        // Calculate rates
        const completionRate = totals.totalViews > 0
          ? (totals.completedViews / totals.totalViews * 100).toFixed(2)
          : 0;
        const conversionRate = totals.totalViews > 0
          ? (totals.conversionsTriggered / totals.totalViews * 100).toFixed(2)
          : 0;
        const avgMinutesPerView = totals.totalViews > 0
          ? (totals.totalMinutesStreamed / totals.totalViews).toFixed(2)
          : 0;

        // Group by market and plan
        const byMarket: Record<string, typeof totals> = {};
        const byPlan: Record<string, typeof totals> = {};

        for (const day of dailyStats) {
          // By market
          if (!byMarket[day.market]) {
            byMarket[day.market] = {
              totalViews: 0, uniqueViewers: 0, completedViews: 0,
              totalMinutesStreamed: 0, conversionsTriggered: 0,
              estimatedEgressGb: 0, estimatedCostUsd: 0,
            };
          }
          byMarket[day.market].totalViews += day.totalViews;
          byMarket[day.market].completedViews += day.completedViews;
          byMarket[day.market].totalMinutesStreamed += day.totalMinutesStreamed;
          byMarket[day.market].conversionsTriggered += day.conversionsTriggered;

          // By plan
          if (!byPlan[day.plan]) {
            byPlan[day.plan] = {
              totalViews: 0, uniqueViewers: 0, completedViews: 0,
              totalMinutesStreamed: 0, conversionsTriggered: 0,
              estimatedEgressGb: 0, estimatedCostUsd: 0,
            };
          }
          byPlan[day.plan].totalViews += day.totalViews;
          byPlan[day.plan].completedViews += day.completedViews;
          byPlan[day.plan].totalMinutesStreamed += day.totalMinutesStreamed;
          byPlan[day.plan].conversionsTriggered += day.conversionsTriggered;
        }

        return reply.send({
          success: true,
          data: {
            period: {
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              daysIncluded: dailyStats.length,
            },
            totals,
            rates: {
              completionRate: `${completionRate}%`,
              conversionRate: `${conversionRate}%`,
              avgMinutesPerView,
            },
            byMarket,
            byPlan,
            daily: dailyStats.slice(0, 7).map((d) => ({
              date: d.date.toISOString().split('T')[0],
              market: d.market,
              plan: d.plan,
              views: d.totalViews,
              completedViews: d.completedViews,
              minutesStreamed: d.totalMinutesStreamed.toFixed(2),
              conversions: d.conversionsTriggered,
            })),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get 3DGS metering stats');
        return reply.status(500).send({
          success: false,
          error: { code: 'METERING_ERROR', message: 'Failed to get metering statistics' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/3dgs/health - Get overall 3DGS pipeline health
  // ===========================================================================
  app.get(
    '/health',
    {
      schema: {
        description: 'Get overall 3DGS pipeline health status',
        tags: ['Admin', '3DGS Control'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const [backpressure, workerStats] = await Promise.all([
          getBackpressureStatus(),
          getWorkerStats(),
        ]);

        const manager = getKillSwitchManager(app);
        const activeKillSwitches = manager?.getActive().filter(
          (ks) => ks.affectedTools?.includes('3dgs_tours') || ks.scope === 'global'
        ) ?? [];

        // Determine overall health
        let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
        const issues: string[] = [];

        if (activeKillSwitches.length > 0) {
          status = 'degraded';
          issues.push(`${activeKillSwitches.length} active kill switch(es)`);
        }

        if (backpressure && !backpressure.acceptingJobs) {
          status = 'critical';
          issues.push(`Queue not accepting jobs: ${backpressure.rejectionReason}`);
        } else if (backpressure && backpressure.utilizationPercent > 80) {
          if (status !== 'critical') status = 'degraded';
          issues.push(`High queue utilization: ${backpressure.utilizationPercent}%`);
        }

        if (backpressure?.circuitBreakerState === 'open') {
          status = 'critical';
          issues.push('Circuit breaker is open');
        }

        return reply.send({
          success: true,
          data: {
            status,
            issues,
            components: {
              conversionQueue: {
                status: backpressure?.acceptingJobs ? 'healthy' : 'degraded',
                circuitBreaker: backpressure?.circuitBreakerState ?? 'unknown',
                utilization: `${backpressure?.utilizationPercent ?? 0}%`,
                jobs: workerStats ?? null,
              },
              killSwitch: {
                status: activeKillSwitches.length === 0 ? 'healthy' : 'active',
                activeCount: activeKillSwitches.length,
                affectedMarkets: activeKillSwitches
                  .filter((ks) => ks.scope === 'market')
                  .map((ks) => ks.scopeValue)
                  .filter(Boolean),
              },
              delivery: {
                status: 'healthy', // Could check R2 connectivity
                signedUrlTtl: {
                  free: '15 minutes',
                  pro: '1 hour',
                  enterprise: '2 hours',
                },
              },
            },
            lastChecked: new Date().toISOString(),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get 3DGS health status');
        return reply.status(500).send({
          success: false,
          error: { code: 'HEALTH_ERROR', message: 'Failed to get health status' },
        });
      }
    }
  );
}
