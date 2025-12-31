/**
 * Webhook Admin API
 *
 * Provides admin endpoints for managing outbound webhook delivery.
 */

import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { WebhookRetryJob } from '../../jobs/webhook-retry';

// =============================================================================
// Schemas
// =============================================================================

const WebhookListQuerySchema = z.object({
  status: z.enum(['pending', 'dlq']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const RetryWebhookSchema = z.object({
  webhookId: z.string(),
});

const QueueWebhookSchema = z.object({
  url: z.string().url(),
  eventType: z.string(),
  payload: z.record(z.unknown()),
  secret: z.string().optional(),
  delayMs: z.number().int().min(0).max(3600000).optional(),
});

// =============================================================================
// Routes
// =============================================================================

export async function webhookAdminRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================================================
  // GET /admin/webhooks/stats - Get webhook delivery statistics
  // ===========================================================================
  app.get(
    '/stats',
    {
      schema: {
        description: 'Get webhook delivery statistics',
        tags: ['Admin', 'Webhooks'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const stats = await WebhookRetryJob.getStats();

        return reply.send({
          success: true,
          data: {
            queue: {
              pending: stats.pending,
              deadLetterQueue: stats.dlq,
            },
            totals: {
              queued: stats.stats.queued || 0,
              delivered: stats.stats.delivered || 0,
              failed: stats.stats.failed || 0,
              retried: stats.stats.retried || 0,
            },
            bySource: Object.entries(stats.stats)
              .filter(([key]) => key.includes(':'))
              .reduce((acc, [key, value]) => {
                const [metric, source] = key.split(':');
                if (!acc[source]) acc[source] = {};
                acc[source][metric] = value;
                return acc;
              }, {} as Record<string, Record<string, number>>),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get webhook stats');
        return reply.status(500).send({
          success: false,
          error: { code: 'STATS_ERROR', message: 'Failed to get webhook statistics' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/webhooks - List webhooks (pending or DLQ)
  // ===========================================================================
  app.get(
    '/',
    {
      schema: {
        description: 'List webhooks in queue or dead-letter queue',
        tags: ['Admin', 'Webhooks'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['pending', 'dlq'] },
            limit: { type: 'integer', default: 50 },
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
        const params = WebhookListQuerySchema.parse(request.query);

        if (params.status === 'dlq') {
          const entries = await WebhookRetryJob.getDLQEntries(params.limit);
          return reply.send({
            success: true,
            data: entries,
            meta: { status: 'dlq', count: entries.length },
          });
        }

        // For pending, we need to get stats
        const stats = await WebhookRetryJob.getStats();
        return reply.send({
          success: true,
          data: {
            pendingCount: stats.pending,
            dlqCount: stats.dlq,
          },
          meta: { status: 'pending' },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list webhooks');
        return reply.status(500).send({
          success: false,
          error: { code: 'LIST_ERROR', message: 'Failed to list webhooks' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/webhooks/:id - Get webhook status
  // ===========================================================================
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get status of a specific webhook',
        tags: ['Admin', 'Webhooks'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const result = await WebhookRetryJob.getWebhookStatus(request.params.id);

        if (!result) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Webhook not found' },
          });
        }

        return reply.send({ success: true, data: result });
      } catch (error) {
        logger.error({ error }, 'Failed to get webhook status');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get webhook status' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/webhooks/:id/retry - Retry a DLQ webhook
  // ===========================================================================
  app.post(
    '/:id/retry',
    {
      schema: {
        description: 'Retry a webhook from the dead-letter queue',
        tags: ['Admin', 'Webhooks'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const success = await WebhookRetryJob.retryDLQEntry(request.params.id);

        if (!success) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Webhook not found in DLQ' },
          });
        }

        logger.info({
          msg: 'webhook_dlq_retried',
          userId: request.user?.id,
          webhookId: request.params.id,
        });

        return reply.send({
          success: true,
          message: 'Webhook queued for retry',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to retry webhook');
        return reply.status(500).send({
          success: false,
          error: { code: 'RETRY_ERROR', message: 'Failed to retry webhook' },
        });
      }
    }
  );

  // ===========================================================================
  // DELETE /admin/webhooks/:id - Delete a DLQ webhook
  // ===========================================================================
  app.delete(
    '/:id',
    {
      schema: {
        description: 'Delete a webhook from the dead-letter queue',
        tags: ['Admin', 'Webhooks'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const success = await WebhookRetryJob.deleteDLQEntry(request.params.id);

        if (!success) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Webhook not found' },
          });
        }

        logger.info({
          msg: 'webhook_dlq_deleted',
          userId: request.user?.id,
          webhookId: request.params.id,
        });

        return reply.send({ success: true, message: 'Webhook deleted' });
      } catch (error) {
        logger.error({ error }, 'Failed to delete webhook');
        return reply.status(500).send({
          success: false,
          error: { code: 'DELETE_ERROR', message: 'Failed to delete webhook' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/webhooks/queue - Manually queue a webhook
  // ===========================================================================
  app.post(
    '/queue',
    {
      schema: {
        description: 'Manually queue a webhook for delivery',
        tags: ['Admin', 'Webhooks'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['url', 'eventType', 'payload'],
          properties: {
            url: { type: 'string', format: 'uri' },
            eventType: { type: 'string' },
            payload: { type: 'object' },
            secret: { type: 'string' },
            delayMs: { type: 'integer' },
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
        const params = QueueWebhookSchema.parse(request.body);

        const webhookId = await WebhookRetryJob.queueWebhook({
          url: params.url,
          eventType: params.eventType,
          payload: params.payload,
          secret: params.secret,
          source: 'admin',
          delayMs: params.delayMs,
        });

        logger.info({
          msg: 'webhook_manually_queued',
          userId: request.user?.id,
          webhookId,
          eventType: params.eventType,
        });

        return reply.send({
          success: true,
          data: { webhookId },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to queue webhook');
        return reply.status(500).send({
          success: false,
          error: { code: 'QUEUE_ERROR', message: 'Failed to queue webhook' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/webhooks/purge - Purge old DLQ entries
  // ===========================================================================
  app.post(
    '/purge',
    {
      schema: {
        description: 'Purge old entries from the dead-letter queue',
        tags: ['Admin', 'Webhooks'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            olderThanDays: { type: 'integer', default: 7 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Body: { olderThanDays?: number } }>, reply: FastifyReply) => {
      try {
        const olderThanDays = request.body?.olderThanDays || 7;
        const removed = await WebhookRetryJob.purgeOldData(olderThanDays);

        logger.info({
          msg: 'webhook_dlq_purged',
          userId: request.user?.id,
          olderThanDays,
          removed,
        });

        return reply.send({
          success: true,
          data: { removed },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to purge DLQ');
        return reply.status(500).send({
          success: false,
          error: { code: 'PURGE_ERROR', message: 'Failed to purge DLQ' },
        });
      }
    }
  );
}
