/**
 * Marketing Routes
 *
 * Endpoints for marketing services:
 * - Asset generation (flyers, brochures, social posts)
 * - Media upload and management
 * - Video tour generation
 * - 3DGS virtual tour generation
 * - Template marketplace
 *
 * All endpoints use the MarketingService which orchestrates
 * provider integrations with fallback to mock providers.
 */

import { prisma } from '@realriches/database';
import { generatePrefixedId, NotFoundError, ForbiddenError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { MarketingService } from './marketing.service';
import type { AssetType, VideoStyle } from './providers/provider.types';

// =============================================================================
// Request Schemas
// =============================================================================

const CreateMarketingAssetSchema = z.object({
  listingId: z.string(),
  type: z.enum(['flyer', 'brochure', 'social_post', 'email', 'video', 'deck']),
  templateId: z.string().optional(),
  customizations: z.record(z.unknown()).optional(),
});

const UploadMediaSchema = z.object({
  propertyId: z.string(),
  type: z.enum(['photo', 'video', 'virtual_tour', 'floor_plan', '3d_model']),
  title: z.string().optional(),
  description: z.string().optional(),
  order: z.number().int().optional(),
});

const VideoTourSchema = z.object({
  propertyId: z.string(),
  style: z.enum(['cinematic', 'modern', 'luxury', 'cozy', 'minimal']).optional(),
  musicTrack: z.string().optional(),
  voiceoverScript: z.string().optional(),
});

const ThreeDGSTourSchema = z.object({
  propertyId: z.string(),
  sourceImages: z.array(z.string()).min(20),
  quality: z.enum(['standard', 'high', 'ultra']).optional(),
  includeFloorPlan: z.boolean().optional(),
});

const PurchaseTemplateSchema = z.object({
  paymentMethodId: z.string(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function sendServiceResponse<T>(
  reply: FastifyReply,
  response: { success: boolean; data?: T; error?: { code: string; message: string }; meta?: unknown },
  successStatus = 200
): FastifyReply {
  if (!response.success) {
    const statusCode =
      response.error?.code === 'NOT_FOUND'
        ? 404
        : response.error?.code === 'FORBIDDEN'
          ? 403
          : response.error?.code === 'AUTH_REQUIRED'
            ? 401
            : 400;

    return reply.status(statusCode).send({
      success: false,
      error: response.error,
    });
  }

  return reply.status(successStatus).send({
    success: true,
    data: response.data,
    meta: response.meta,
  });
}

// =============================================================================
// Routes
// =============================================================================

export async function marketingRoutes(app: FastifyInstance): Promise<void> {
  const marketingService = new MarketingService(app);

  // ===========================================================================
  // Provider Status (Admin/Debug)
  // ===========================================================================

  app.get(
    '/status',
    {
      schema: {
        description: 'Get marketing provider status',
        tags: ['Marketing'],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const status = marketingService.getProviderStatus();
      return reply.send({ success: true, data: status });
    }
  );

  // ===========================================================================
  // TEMPLATES
  // ===========================================================================

  app.get(
    '/templates',
    {
      schema: {
        description: 'List marketing templates',
        tags: ['Marketing'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            category: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { type?: string; category?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { type, category } = request.query;

      const where: Record<string, unknown> = { isActive: true };
      if (type) where.type = type;
      if (category) where.category = category;

      const templates = await prisma.marketingTemplate.findMany({
        where,
        orderBy: [{ isPremium: 'asc' }, { name: 'asc' }],
      });

      return reply.send({ success: true, data: templates });
    }
  );

  // ===========================================================================
  // ASSET GENERATION
  // ===========================================================================

  app.post(
    '/assets/generate',
    {
      schema: {
        description: 'Generate a marketing asset from template',
        tags: ['Marketing'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'agent', 'admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = CreateMarketingAssetSchema.parse(request.body);
      const response = await marketingService.generateAsset(request, {
        listingId: data.listingId,
        type: data.type as AssetType,
        templateId: data.templateId,
        customizations: data.customizations,
      });
      return sendServiceResponse(reply, response, 201);
    }
  );

  app.get(
    '/assets',
    {
      schema: {
        description: 'List marketing assets',
        tags: ['Marketing'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            listingId: { type: 'string' },
            type: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { listingId?: string; type?: string; status?: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { listingId, type, status } = request.query;

      const where: Record<string, unknown> = { createdById: request.user.id };
      if (listingId) where.listingId = listingId;
      if (type) where.type = type;
      if (status) where.status = status;

      const assets = await prisma.marketingAsset.findMany({
        where,
        include: {
          listing: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ success: true, data: assets });
    }
  );

  // ===========================================================================
  // MEDIA UPLOAD
  // ===========================================================================

  app.post(
    '/media',
    {
      schema: {
        description: 'Upload property media',
        tags: ['Marketing'],
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

      // Handle multipart upload
      const parts = request.parts();
      let fileData: Buffer | null = null;
      let filename = '';
      let mimetype = '';
      const metadata: Record<string, unknown> = {};

      for await (const part of parts) {
        if (part.type === 'file') {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          fileData = Buffer.concat(chunks);
          filename = part.filename;
          mimetype = part.mimetype;
        } else {
          metadata[part.fieldname] = part.value;
        }
      }

      if (!fileData) {
        return reply.status(400).send({
          success: false,
          error: { code: 'NO_FILE', message: 'No file provided' },
        });
      }

      const data = UploadMediaSchema.parse(metadata);

      const response = await marketingService.uploadMedia(request, {
        propertyId: data.propertyId,
        type: data.type,
        file: {
          data: fileData,
          filename,
          mimetype,
        },
        title: data.title,
        description: data.description,
        order: data.order,
      });

      return sendServiceResponse(reply, response, 201);
    }
  );

  app.get(
    '/media/:propertyId',
    {
      schema: {
        description: 'List media for a property',
        tags: ['Marketing'],
        params: {
          type: 'object',
          properties: { propertyId: { type: 'string' } },
          required: ['propertyId'],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { propertyId: string } }>, reply: FastifyReply) => {
      const media = await prisma.propertyMedia.findMany({
        where: { propertyId: request.params.propertyId },
        orderBy: { order: 'asc' },
      });

      return reply.send({ success: true, data: media });
    }
  );

  // ===========================================================================
  // VIDEO TOUR GENERATION
  // ===========================================================================

  app.post(
    '/video-tour/generate',
    {
      schema: {
        description: 'Generate AI cinematic video tour',
        tags: ['Marketing'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'agent', 'admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = VideoTourSchema.parse(request.body);
      const response = await marketingService.generateVideoTour(request, {
        propertyId: data.propertyId,
        style: data.style as VideoStyle,
        musicTrack: data.musicTrack,
        voiceoverScript: data.voiceoverScript,
      });
      return sendServiceResponse(reply, response, 201);
    }
  );

  // ===========================================================================
  // 3D/VR TOUR GENERATION
  // ===========================================================================

  app.post(
    '/3d-tour/create',
    {
      schema: {
        description: 'Create 3DGS/VR virtual tour',
        tags: ['Marketing'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'agent', 'admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = ThreeDGSTourSchema.parse(request.body);
      const response = await marketingService.generate3DGSTour(request, {
        propertyId: data.propertyId,
        sourceImages: data.sourceImages,
        quality: data.quality,
        includeFloorPlan: data.includeFloorPlan,
      });
      return sendServiceResponse(reply, response, 201);
    }
  );

  // ===========================================================================
  // TEMPLATE MARKETPLACE
  // ===========================================================================

  app.get(
    '/marketplace',
    {
      schema: {
        description: 'Browse template marketplace',
        tags: ['Marketing'],
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            priceMax: { type: 'number' },
            sort: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { category?: string; priceMax?: number; sort?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { category, priceMax, sort } = request.query;

      const where: Record<string, unknown> = { isActive: true, isMarketplace: true };
      if (category) where.category = category;
      if (priceMax) where.price = { lte: priceMax };

      const orderBy: Record<string, string> =
        sort === 'popular'
          ? { downloads: 'desc' }
          : sort === 'newest'
            ? { createdAt: 'desc' }
            : { name: 'asc' };

      const templates = await prisma.marketingTemplate.findMany({
        where,
        orderBy,
      });

      return reply.send({ success: true, data: templates });
    }
  );

  app.post(
    '/marketplace/:templateId/purchase',
    {
      schema: {
        description: 'Purchase a premium template',
        tags: ['Marketing'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { templateId: { type: 'string' } },
          required: ['templateId'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { templateId: string } }>, reply: FastifyReply) => {
      const body = PurchaseTemplateSchema.parse(request.body);
      const response = await marketingService.purchaseTemplate(request, {
        templateId: request.params.templateId,
        paymentMethodId: body.paymentMethodId,
      });
      return sendServiceResponse(reply, response);
    }
  );
}
