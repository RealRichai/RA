/**
 * Partner Admin Routes
 *
 * Admin endpoints for partner integration reporting and management.
 * All endpoints require admin role and are feature flag gated.
 */

import {
  generateRevenueReport,
  generatePartnerPayoutReport,
  generateConversionFunnelReport,
  buildReportResponse,
  getReferralTracker,
} from '@realriches/revenue-engine';
import { ForbiddenError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { AnalyticsAggregationJob } from '../../jobs/analytics-aggregation';
import { DataCleanupJob } from '../../jobs/data-cleanup';
import { PartnerHealthJob } from '../../jobs/partner-health';
import { WebhookRetryJob } from '../../jobs/webhook-retry';

// =============================================================================
// Request Schemas
// =============================================================================

const DateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const PartnerIdParamsSchema = z.object({
  partnerId: z.string().min(1),
});

const ReferralFilterSchema = z.object({
  partnerId: z.string().optional(),
  status: z.enum(['pending', 'qualified', 'converted', 'paid']).optional(),
  productType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// =============================================================================
// Partner Routes
// =============================================================================

export async function partnerRoutes(app: FastifyInstance): Promise<void> {
  // Middleware to check admin role and partner feature flag
  const adminPartnerAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(request, reply);
    app.authorize(request, reply, { roles: ['admin'] });

    // Check if partner integrations are enabled
    // Feature flags: LEASELOCK_INTEGRATION, RHINO_INTEGRATION, GUARANTOR_PRODUCTS
    // For admin reports, we allow access if any partner integration is enabled
    // In production, this would check the feature flag service
    const isPartnerEnabled = process.env['LEASELOCK_INTEGRATION'] === 'true' ||
      process.env['RHINO_INTEGRATION'] === 'true' ||
      process.env['GUARANTOR_PRODUCTS'] === 'true' ||
      process.env['NODE_ENV'] === 'development' ||
      process.env['NODE_ENV'] === 'test';

    if (!isPartnerEnabled) {
      throw new ForbiddenError('Partner integrations are not enabled');
    }
  };

  // =========================================================================
  // GET /admin/partners/revenue - Revenue report
  // =========================================================================
  app.get(
    '/admin/partners/revenue',
    {
      schema: {
        description: 'Get partner revenue report for a period',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Querystring: { startDate?: string; endDate?: string } }>,
      reply: FastifyReply
    ) => {
      const { startDate, endDate } = request.query;

      // Default to last 30 days
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate
        ? new Date(startDate)
        : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

      const report = generateRevenueReport(start, end);

      return reply.send(buildReportResponse(report));
    }
  );

  // =========================================================================
  // GET /admin/partners/payouts/:partnerId - Partner payout report
  // =========================================================================
  app.get(
    '/admin/partners/payouts/:partnerId',
    {
      schema: {
        description: 'Get payout report for a specific partner',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['partnerId'],
          properties: {
            partnerId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{
        Params: { partnerId: string };
        Querystring: { startDate?: string; endDate?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { partnerId } = request.params;
      const { startDate, endDate } = request.query;

      // Default to last 30 days
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate
        ? new Date(startDate)
        : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get partner name from tracker if available
      const tracker = getReferralTracker();
      const partnerReferrals = tracker.getReferralsByPartner(partnerId);
      const partnerName = partnerReferrals[0]?.partnerName || partnerId;

      const report = generatePartnerPayoutReport(partnerId, partnerName, start, end);

      return reply.send(buildReportResponse(report));
    }
  );

  // =========================================================================
  // GET /admin/partners/conversions - Conversion funnel report
  // =========================================================================
  app.get(
    '/admin/partners/conversions',
    {
      schema: {
        description: 'Get conversion funnel report',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Querystring: { startDate?: string; endDate?: string } }>,
      reply: FastifyReply
    ) => {
      const { startDate, endDate } = request.query;

      // Default to last 30 days
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate
        ? new Date(startDate)
        : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

      const report = generateConversionFunnelReport(start, end);

      return reply.send(buildReportResponse(report));
    }
  );

  // =========================================================================
  // GET /admin/partners/referrals - List referrals
  // =========================================================================
  app.get(
    '/admin/partners/referrals',
    {
      schema: {
        description: 'List referrals with filters',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            partnerId: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'qualified', 'converted', 'paid'] },
            productType: { type: 'string' },
            limit: { type: 'integer', default: 50 },
            offset: { type: 'integer', default: 0 },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          partnerId?: string;
          status?: 'pending' | 'qualified' | 'converted' | 'paid';
          productType?: string;
          limit?: number;
          offset?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { partnerId, status, productType, limit = 50, offset = 0 } = request.query;

      const tracker = getReferralTracker();

      // Get referrals based on filters
      let referrals = partnerId
        ? tracker.getReferralsByPartner(partnerId)
        : status
          ? tracker.getReferralsByStatus(status)
          : [];

      // Apply additional filters
      if (productType) {
        referrals = referrals.filter((r) => r.productType === productType);
      }

      // Apply pagination
      const total = referrals.length;
      const paginated = referrals.slice(offset, offset + limit);

      return reply.send({
        success: true,
        data: {
          referrals: paginated,
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total,
          },
        },
      });
    }
  );

  // =========================================================================
  // GET /admin/partners/stats - Global partner stats
  // =========================================================================
  app.get(
    '/admin/partners/stats',
    {
      schema: {
        description: 'Get global partner statistics',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminPartnerAuth,
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const tracker = getReferralTracker();
      const stats = tracker.getGlobalStats();

      return reply.send({
        success: true,
        data: stats,
      });
    }
  );

  // =========================================================================
  // GET /admin/partners/stats/:partnerId - Partner-specific stats
  // =========================================================================
  app.get(
    '/admin/partners/stats/:partnerId',
    {
      schema: {
        description: 'Get statistics for a specific partner',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['partnerId'],
          properties: {
            partnerId: { type: 'string' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Params: { partnerId: string } }>,
      reply: FastifyReply
    ) => {
      const { partnerId } = request.params;
      const tracker = getReferralTracker();
      const stats = tracker.getPartnerStats(partnerId);

      return reply.send({
        success: true,
        data: stats,
      });
    }
  );

  // =========================================================================
  // POST /admin/partners/payouts/:partnerId/process - Process payout
  // =========================================================================
  app.post(
    '/admin/partners/payouts/:partnerId/process',
    {
      schema: {
        description: 'Process pending payouts for a partner',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['partnerId'],
          properties: {
            partnerId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            referralIds: { type: 'array', items: { type: 'string' } },
            ledgerTransactionId: { type: 'string' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{
        Params: { partnerId: string };
        Body: { referralIds?: string[]; ledgerTransactionId?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { partnerId } = request.params;
      const { referralIds, ledgerTransactionId } = request.body || {};

      const tracker = getReferralTracker();

      // Get pending payouts for this partner
      const { referrals: pendingReferrals } = tracker.getPendingPayouts(partnerId);

      // Filter to specified referral IDs if provided
      const toProcess = referralIds
        ? pendingReferrals.filter((r) => referralIds.includes(r.id))
        : pendingReferrals;

      if (toProcess.length === 0) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'NO_PENDING_PAYOUTS',
            message: 'No pending payouts found for this partner',
          },
        });
      }

      // Generate a ledger transaction ID if not provided
      const txnId = ledgerTransactionId || `payout_${partnerId}_${Date.now()}`;

      // Mark referrals as paid
      const processed: string[] = [];
      const errors: Array<{ referralId: string; error: string }> = [];

      for (const referral of toProcess) {
        try {
          tracker.markReferralPaid(referral.id, txnId);
          processed.push(referral.id);
        } catch (error) {
          errors.push({
            referralId: referral.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      const totalPaid = toProcess
        .filter((r) => processed.includes(r.id))
        .reduce((sum, r) => sum + (r.revShareAmount || 0), 0);

      return reply.send({
        success: true,
        data: {
          processedCount: processed.length,
          totalPaid: Math.round(totalPaid * 100) / 100,
          ledgerTransactionId: txnId,
          processed,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    }
  );

  // =========================================================================
  // GET /admin/partners/health - All partner health statuses
  // =========================================================================
  app.get(
    '/admin/partners/health',
    {
      schema: {
        description: 'Get health status for all partner integrations',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminPartnerAuth,
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const statuses = await PartnerHealthJob.getAllHealthStatus();

      // Calculate summary
      const healthy = statuses.filter((s) => s.status === 'healthy').length;
      const degraded = statuses.filter((s) => s.status === 'degraded').length;
      const down = statuses.filter((s) => s.status === 'down').length;

      return reply.send({
        success: true,
        data: {
          summary: {
            total: statuses.length,
            healthy,
            degraded,
            down,
          },
          providers: statuses,
        },
      });
    }
  );

  // =========================================================================
  // GET /admin/partners/health/:providerId - Single provider health
  // =========================================================================
  app.get(
    '/admin/partners/health/:providerId',
    {
      schema: {
        description: 'Get health status for a specific partner',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['providerId'],
          properties: {
            providerId: { type: 'string' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Params: { providerId: string } }>,
      reply: FastifyReply
    ) => {
      const { providerId } = request.params;
      const status = await PartnerHealthJob.getHealthStatus(providerId as Parameters<typeof PartnerHealthJob.getHealthStatus>[0]);

      if (!status) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'PROVIDER_NOT_FOUND',
            message: `No health data found for provider: ${providerId}`,
          },
        });
      }

      return reply.send({
        success: true,
        data: status,
      });
    }
  );

  // =========================================================================
  // GET /admin/partners/health/history - Health history for reporting
  // =========================================================================
  app.get(
    '/admin/partners/health/history',
    {
      schema: {
        description: 'Get partner health check history',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Querystring: { startDate?: string; endDate?: string } }>,
      reply: FastifyReply
    ) => {
      const { startDate, endDate } = request.query;

      // Default to last 24 hours
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate
        ? new Date(startDate)
        : new Date(end.getTime() - 24 * 60 * 60 * 1000);

      const history = await PartnerHealthJob.getHealthHistory(start, end);

      return reply.send({
        success: true,
        data: {
          period: {
            start: start.toISOString(),
            end: end.toISOString(),
          },
          checkCount: history.length,
          history,
        },
      });
    }
  );

  // =========================================================================
  // GET /admin/partners/webhooks/stats - Webhook queue statistics
  // =========================================================================
  app.get(
    '/admin/partners/webhooks/stats',
    {
      schema: {
        description: 'Get webhook delivery queue statistics',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminPartnerAuth,
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const stats = await WebhookRetryJob.getStats();

      return reply.send({
        success: true,
        data: stats,
      });
    }
  );

  // =========================================================================
  // GET /admin/partners/webhooks/dlq - Dead letter queue entries
  // =========================================================================
  app.get(
    '/admin/partners/webhooks/dlq',
    {
      schema: {
        description: 'Get failed webhook deliveries from dead letter queue',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', default: 50 },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Querystring: { limit?: number } }>,
      reply: FastifyReply
    ) => {
      const { limit = 50 } = request.query;
      const entries = await WebhookRetryJob.getDLQEntries(limit);

      return reply.send({
        success: true,
        data: {
          count: entries.length,
          entries,
        },
      });
    }
  );

  // =========================================================================
  // GET /admin/partners/webhooks/:webhookId - Webhook delivery status
  // =========================================================================
  app.get(
    '/admin/partners/webhooks/:webhookId',
    {
      schema: {
        description: 'Get status of a specific webhook delivery',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['webhookId'],
          properties: {
            webhookId: { type: 'string' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Params: { webhookId: string } }>,
      reply: FastifyReply
    ) => {
      const { webhookId } = request.params;
      const result = await WebhookRetryJob.getWebhookStatus(webhookId);

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'WEBHOOK_NOT_FOUND',
            message: `No webhook found with ID: ${webhookId}`,
          },
        });
      }

      return reply.send({
        success: true,
        data: result,
      });
    }
  );

  // =========================================================================
  // POST /admin/partners/webhooks/dlq/:webhookId/retry - Retry a DLQ entry
  // =========================================================================
  app.post(
    '/admin/partners/webhooks/dlq/:webhookId/retry',
    {
      schema: {
        description: 'Retry a failed webhook from the dead letter queue',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['webhookId'],
          properties: {
            webhookId: { type: 'string' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Params: { webhookId: string } }>,
      reply: FastifyReply
    ) => {
      const { webhookId } = request.params;
      const success = await WebhookRetryJob.retryDLQEntry(webhookId);

      if (!success) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'WEBHOOK_NOT_FOUND',
            message: `No DLQ entry found with ID: ${webhookId}`,
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          message: 'Webhook requeued for retry',
          webhookId,
        },
      });
    }
  );

  // =========================================================================
  // DELETE /admin/partners/webhooks/dlq/:webhookId - Delete a DLQ entry
  // =========================================================================
  app.delete(
    '/admin/partners/webhooks/dlq/:webhookId',
    {
      schema: {
        description: 'Delete a failed webhook from the dead letter queue',
        tags: ['Admin', 'Partners'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['webhookId'],
          properties: {
            webhookId: { type: 'string' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Params: { webhookId: string } }>,
      reply: FastifyReply
    ) => {
      const { webhookId } = request.params;
      const success = await WebhookRetryJob.deleteDLQEntry(webhookId);

      if (!success) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'WEBHOOK_NOT_FOUND',
            message: `No DLQ entry found with ID: ${webhookId}`,
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          message: 'Webhook deleted from DLQ',
          webhookId,
        },
      });
    }
  );

  // =========================================================================
  // GET /admin/cleanup/stats - Get cleanup statistics
  // =========================================================================
  app.get(
    '/admin/cleanup/stats',
    {
      schema: {
        description: 'Get data cleanup statistics (records eligible for deletion)',
        tags: ['Admin', 'System'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminPartnerAuth,
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const stats = await DataCleanupJob.getCleanupStats();

      const total = Object.values(stats).reduce((sum, count) => sum + count, 0);

      return reply.send({
        success: true,
        data: {
          totalEligible: total,
          byTable: stats,
        },
      });
    }
  );

  // =========================================================================
  // POST /admin/cleanup/:table - Run cleanup for a specific table
  // =========================================================================
  app.post(
    '/admin/cleanup/:table',
    {
      schema: {
        description: 'Run data cleanup for a specific table',
        tags: ['Admin', 'System'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['table'],
          properties: {
            table: {
              type: 'string',
              enum: [
                'sessions',
                'refreshTokens',
                'notifications',
                'auditLogs',
                'aiConversations',
                'aiContexts',
                'jobRecords',
                'processedWebhooks',
                'webhookDLQ',
                'expiredListings',
              ],
            },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Params: { table: string } }>,
      reply: FastifyReply
    ) => {
      const { table } = request.params;

      const result = await DataCleanupJob.cleanupTable(
        table as Parameters<typeof DataCleanupJob.cleanupTable>[0]
      );

      return reply.send({
        success: true,
        data: {
          table,
          deleted: result.deleted,
          durationMs: result.duration,
        },
      });
    }
  );

  // =========================================================================
  // GET /admin/analytics/latest - Get latest aggregated metrics
  // =========================================================================
  app.get(
    '/admin/analytics/latest',
    {
      schema: {
        description: 'Get latest aggregated analytics metrics',
        tags: ['Admin', 'Analytics'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminPartnerAuth,
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const metrics = await AnalyticsAggregationJob.getLatestMetrics();

      if (!metrics) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NO_METRICS',
            message: 'No aggregated metrics available yet',
          },
        });
      }

      return reply.send({
        success: true,
        data: metrics,
      });
    }
  );

  // =========================================================================
  // GET /admin/analytics/daily/:date - Get metrics for a specific date
  // =========================================================================
  app.get(
    '/admin/analytics/daily/:date',
    {
      schema: {
        description: 'Get aggregated metrics for a specific date',
        tags: ['Admin', 'Analytics'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['date'],
          properties: {
            date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Params: { date: string } }>,
      reply: FastifyReply
    ) => {
      const { date } = request.params;
      const metrics = await AnalyticsAggregationJob.getMetricsForDate(date);

      if (!metrics) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NO_METRICS',
            message: `No metrics found for date: ${date}`,
          },
        });
      }

      return reply.send({
        success: true,
        data: metrics,
      });
    }
  );

  // =========================================================================
  // GET /admin/analytics/range - Get metrics for a date range
  // =========================================================================
  app.get(
    '/admin/analytics/range',
    {
      schema: {
        description: 'Get aggregated metrics for a date range',
        tags: ['Admin', 'Analytics'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['startDate', 'endDate'],
          properties: {
            startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Querystring: { startDate: string; endDate: string } }>,
      reply: FastifyReply
    ) => {
      const { startDate, endDate } = request.query;
      const metrics = await AnalyticsAggregationJob.getMetricsRange(startDate, endDate);

      return reply.send({
        success: true,
        data: {
          period: { startDate, endDate },
          count: metrics.length,
          metrics,
        },
      });
    }
  );

  // =========================================================================
  // GET /admin/analytics/weekly/:weekStart - Get weekly metrics
  // =========================================================================
  app.get(
    '/admin/analytics/weekly/:weekStart',
    {
      schema: {
        description: 'Get weekly aggregated metrics',
        tags: ['Admin', 'Analytics'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['weekStart'],
          properties: {
            weekStart: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Params: { weekStart: string } }>,
      reply: FastifyReply
    ) => {
      const { weekStart } = request.params;
      const metrics = await AnalyticsAggregationJob.getWeeklyMetrics(weekStart);

      if (!metrics) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NO_METRICS',
            message: `No weekly metrics found for week starting: ${weekStart}`,
          },
        });
      }

      return reply.send({
        success: true,
        data: metrics,
      });
    }
  );

  // =========================================================================
  // GET /admin/analytics/monthly/:yearMonth - Get monthly metrics
  // =========================================================================
  app.get(
    '/admin/analytics/monthly/:yearMonth',
    {
      schema: {
        description: 'Get monthly aggregated metrics',
        tags: ['Admin', 'Analytics'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['yearMonth'],
          properties: {
            yearMonth: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Params: { yearMonth: string } }>,
      reply: FastifyReply
    ) => {
      const { yearMonth } = request.params;
      const metrics = await AnalyticsAggregationJob.getMonthlyMetrics(yearMonth);

      if (!metrics) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NO_METRICS',
            message: `No monthly metrics found for: ${yearMonth}`,
          },
        });
      }

      return reply.send({
        success: true,
        data: metrics,
      });
    }
  );

  // =========================================================================
  // POST /admin/analytics/aggregate/:date - Manually trigger aggregation
  // =========================================================================
  app.post(
    '/admin/analytics/aggregate/:date',
    {
      schema: {
        description: 'Manually trigger analytics aggregation for a specific date',
        tags: ['Admin', 'Analytics'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['date'],
          properties: {
            date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          },
        },
      },
      preHandler: adminPartnerAuth,
    },
    async (
      request: FastifyRequest<{ Params: { date: string } }>,
      reply: FastifyReply
    ) => {
      const { date } = request.params;
      const startTime = Date.now();

      const metrics = await AnalyticsAggregationJob.aggregateDate(date);

      return reply.send({
        success: true,
        data: {
          date,
          metrics,
          durationMs: Date.now() - startTime,
        },
      });
    }
  );
}
