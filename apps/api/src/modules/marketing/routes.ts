import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@realriches/database';
import { generateId, NotFoundError, ForbiddenError } from '@realriches/utils';

const CreateMarketingAssetSchema = z.object({
  listingId: z.string(),
  type: z.enum(['FLYER', 'BROCHURE', 'SOCIAL_POST', 'EMAIL', 'VIDEO', 'DECK']),
  templateId: z.string().optional(),
  customizations: z.record(z.unknown()).optional(),
});

const UploadMediaSchema = z.object({
  propertyId: z.string(),
  type: z.enum(['PHOTO', 'VIDEO', 'VIRTUAL_TOUR', 'FLOOR_PLAN', '3D_MODEL']),
  title: z.string().optional(),
  description: z.string().optional(),
  order: z.number().int().optional(),
});

export async function marketingRoutes(app: FastifyInstance): Promise<void> {
  // List marketing templates
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

  // Generate marketing asset
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
        app.authorize(request, reply, { roles: ['LANDLORD', 'AGENT', 'ADMIN'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = CreateMarketingAssetSchema.parse(request.body);

      // Get listing details for asset generation
      const listing = await prisma.listing.findUnique({
        where: { id: data.listingId },
        include: {
          unit: { include: { property: true } },
          media: { orderBy: { order: 'asc' } },
        },
      });

      if (!listing) {
        throw new NotFoundError('Listing not found');
      }

      // Get template if specified
      let template = null;
      if (data.templateId) {
        template = await prisma.marketingTemplate.findUnique({
          where: { id: data.templateId },
        });
      }

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Generate actual marketing asset
      // Use template + listing data to generate flyer/brochure/etc.
      // For now, create a placeholder asset

      const asset = await prisma.marketingAsset.create({
        data: {
          id: generateId('mkt'),
          listingId: data.listingId,
          type: data.type,
          templateId: data.templateId,
          status: 'GENERATING',
          fileUrl: null,
          metadata: {
            customizations: data.customizations,
            listingTitle: listing.title,
            propertyAddress: listing.unit.property.address,
          },
          createdById: request.user.id,
        },
      });

      // Simulate async generation
      // In production, this would be a background job
      setTimeout(async () => {
        await prisma.marketingAsset.update({
          where: { id: asset.id },
          data: {
            status: 'COMPLETED',
            fileUrl: `https://storage.example.com/marketing/${asset.id}.pdf`,
          },
        });
      }, 2000);

      return reply.status(201).send({
        success: true,
        data: asset,
        message: 'Asset generation started. Check back shortly.',
      });
    }
  );

  // List marketing assets
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

  // Upload property media
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
      let fileUrl = '';
      let thumbnailUrl = '';
      let metadata: Record<string, unknown> = {};

      for await (const part of parts) {
        if (part.type === 'file') {
          // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Upload to S3/MinIO
          fileUrl = `https://storage.example.com/media/${generateId('med')}-${part.filename}`;
          thumbnailUrl = fileUrl.replace('.', '-thumb.');
        } else {
          metadata[part.fieldname] = part.value;
        }
      }

      const data = UploadMediaSchema.parse(metadata);

      // Verify property ownership
      const property = await prisma.property.findUnique({
        where: { id: data.propertyId },
      });

      if (!property) {
        throw new NotFoundError('Property not found');
      }

      if (property.ownerId !== request.user.id && request.user.role !== 'ADMIN') {
        throw new ForbiddenError('Access denied');
      }

      const media = await prisma.propertyMedia.create({
        data: {
          id: generateId('med'),
          propertyId: data.propertyId,
          type: data.type,
          url: fileUrl,
          thumbnailUrl,
          title: data.title,
          description: data.description,
          order: data.order || 0,
          uploadedById: request.user.id,
        },
      });

      return reply.status(201).send({ success: true, data: media });
    }
  );

  // List property media
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

  // Generate video tour
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
        app.authorize(request, reply, { roles: ['LANDLORD', 'AGENT', 'ADMIN'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { propertyId, style, musicTrack, voiceoverScript } = (request.body as {
        propertyId: string;
        style?: string;
        musicTrack?: string;
        voiceoverScript?: string;
      }) || {};

      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        include: { media: { where: { type: { in: ['PHOTO', 'VIDEO'] } } } },
      });

      if (!property) {
        throw new NotFoundError('Property not found');
      }

      if (property.ownerId !== request.user.id && request.user.role !== 'ADMIN') {
        throw new ForbiddenError('Access denied');
      }

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Integrate with video generation API
      // This would use AI to create cinematic tours from photos/videos

      const videoTour = await prisma.propertyMedia.create({
        data: {
          id: generateId('med'),
          propertyId,
          type: 'VIDEO',
          url: '', // Will be populated when generation completes
          title: 'AI-Generated Video Tour',
          description: `Style: ${style || 'cinematic'}`,
          metadata: {
            status: 'GENERATING',
            style,
            musicTrack,
            voiceoverScript,
          },
          uploadedById: request.user.id,
        },
      });

      return reply.status(201).send({
        success: true,
        data: videoTour,
        message: 'Video tour generation started. This may take several minutes.',
      });
    }
  );

  // Create 3D/VR tour
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
        app.authorize(request, reply, { roles: ['LANDLORD', 'AGENT', 'ADMIN'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { propertyId, sourceImages } = (request.body as {
        propertyId: string;
        sourceImages: string[];
      }) || {};

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Integrate with 3DGS generation service
      // Would use Gaussian Splatting to create immersive 3D environments

      const tour = await prisma.propertyMedia.create({
        data: {
          id: generateId('med'),
          propertyId,
          type: 'VIRTUAL_TOUR',
          url: '', // Will be populated when processing completes
          title: '3D Virtual Tour',
          metadata: {
            status: 'PROCESSING',
            sourceImageCount: sourceImages?.length || 0,
            technology: '3DGS',
          },
          uploadedById: request.user.id,
        },
      });

      return reply.status(201).send({
        success: true,
        data: tour,
        message: '3D tour processing started. This may take up to 30 minutes.',
      });
    }
  );

  // Template marketplace
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

  // Purchase template
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
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const template = await prisma.marketingTemplate.findUnique({
        where: { id: request.params.templateId },
      });

      if (!template) {
        throw new NotFoundError('Template not found');
      }

      if (!template.isPremium) {
        return reply.send({
          success: true,
          data: template,
          message: 'This template is free to use',
        });
      }

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Process payment via Stripe
      // const payment = await stripe.paymentIntents.create({ ... });

      // Record purchase
      await prisma.marketingTemplate.update({
        where: { id: template.id },
        data: { downloads: { increment: 1 } },
      });

      return reply.send({
        success: true,
        data: template,
        message: 'Template purchased successfully',
      });
    }
  );
}
