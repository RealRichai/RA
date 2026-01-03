/**
 * Syndication Routes
 *
 * API endpoints for listing syndication management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { SyndicationPortalSchema } from './providers/provider.types';
import { SyndicationService } from './syndication.service';

// =============================================================================
// Schemas
// =============================================================================

const SyndicateRequestSchema = z.object({
  portals: z.array(SyndicationPortalSchema).min(1).max(9),
});

const RemoveSyndicationSchema = z.object({
  portals: z.array(SyndicationPortalSchema).min(1).max(9),
});

// =============================================================================
// Routes
// =============================================================================

export async function syndicationRoutes(app: FastifyInstance): Promise<void> {
  const service = new SyndicationService(app);

  // ===========================================================================
  // POST /listings/:listingId/syndicate - Syndicate listing to portals
  // ===========================================================================
  app.post<{
    Params: { listingId: string };
    Body: z.infer<typeof SyndicateRequestSchema>;
  }>(
    '/listings/:listingId/syndicate',
    {
      schema: {
        description: 'Syndicate a listing to external portals',
        tags: ['Syndication'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { listingId: { type: 'string', format: 'uuid' } },
          required: ['listingId'],
        },
        body: {
          type: 'object',
          properties: {
            portals: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: 9,
            },
          },
          required: ['portals'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
              meta: { type: 'object' },
            },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request, reply) => {
      const { portals } = SyndicateRequestSchema.parse(request.body);

      const result = await service.syndicateListing(
        request,
        request.params.listingId,
        portals
      );

      if (!result.success) {
        const status = result.error?.code === 'NOT_FOUND' ? 404 :
                       result.error?.code === 'FORBIDDEN' ? 403 :
                       result.error?.code === 'AUTH_REQUIRED' ? 401 : 400;
        return reply.status(status).send({
          success: false,
          error: result.error,
        });
      }

      return reply.send({ success: true, data: result.data, meta: result.meta });
    }
  );

  // ===========================================================================
  // DELETE /listings/:listingId/syndicate - Remove listing from portals
  // ===========================================================================
  app.delete<{
    Params: { listingId: string };
    Body: z.infer<typeof RemoveSyndicationSchema>;
  }>(
    '/listings/:listingId/syndicate',
    {
      schema: {
        description: 'Remove listing from external portals',
        tags: ['Syndication'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { listingId: { type: 'string', format: 'uuid' } },
          required: ['listingId'],
        },
        body: {
          type: 'object',
          properties: {
            portals: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
            },
          },
          required: ['portals'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request, reply) => {
      const { portals } = RemoveSyndicationSchema.parse(request.body);

      const result = await service.removeSyndication(
        request,
        request.params.listingId,
        portals
      );

      if (!result.success) {
        const status = result.error?.code === 'NOT_FOUND' ? 404 :
                       result.error?.code === 'FORBIDDEN' ? 403 : 400;
        return reply.status(status).send({
          success: false,
          error: result.error,
        });
      }

      return reply.send({ success: true, data: result.data });
    }
  );

  // ===========================================================================
  // GET /listings/:listingId/syndication-status - Get syndication status
  // ===========================================================================
  app.get<{ Params: { listingId: string } }>(
    '/listings/:listingId/syndication-status',
    {
      schema: {
        description: 'Get syndication status for a listing',
        tags: ['Syndication'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { listingId: { type: 'string', format: 'uuid' } },
          required: ['listingId'],
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
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request, reply) => {
      const result = await service.getSyndicationStatus(request.params.listingId);

      if (!result.success) {
        return reply.status(404).send({ success: false, error: result.error });
      }

      return reply.send({ success: true, data: result.data });
    }
  );

  // ===========================================================================
  // POST /webhooks/syndication/:portal - Webhook endpoint for portal callbacks
  // ===========================================================================
  app.post<{ Params: { portal: string } }>(
    '/webhooks/syndication/:portal',
    {
      schema: {
        description: 'Webhook endpoint for syndication portal callbacks',
        tags: ['Webhooks'],
        params: {
          type: 'object',
          properties: { portal: { type: 'string' } },
          required: ['portal'],
        },
      },
      config: { rawBody: true },
    },
    async (request: FastifyRequest<{ Params: { portal: string } }>, reply: FastifyReply) => {
      const portalResult = SyndicationPortalSchema.safeParse(request.params.portal);

      if (!portalResult.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_PORTAL', message: 'Unknown portal' },
        });
      }

      const portal = portalResult.data;
      const signature = (request.headers['x-webhook-signature'] ||
                         request.headers['x-signature'] ||
                         '') as string;
      const rawBody = (request as { rawBody?: Buffer }).rawBody?.toString('utf8') ||
                      JSON.stringify(request.body);

      const result = await service.processWebhook(portal, rawBody, signature);

      if (!result.valid) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_WEBHOOK', message: 'Invalid signature or payload' },
        });
      }

      return reply.send({ success: true, event: result.event });
    }
  );

  // ===========================================================================
  // GET /syndication/providers - Get provider status (admin only)
  // ===========================================================================
  app.get(
    '/syndication/providers',
    {
      schema: {
        description: 'Get syndication provider status',
        tags: ['Syndication', 'Admin'],
        security: [{ bearerAuth: [] }],
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
      preHandler: async (request, reply): Promise<void> => {
        await app.authenticate(request, reply);
        if (request.user?.role !== 'admin' && request.user?.role !== 'super_admin') {
          reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Admin access required' },
          });
        }
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const status = service.getProviderStatus();
      return reply.send({ success: true, data: status });
    }
  );
}

export default syndicationRoutes;
