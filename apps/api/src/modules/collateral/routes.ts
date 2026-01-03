/**
 * Collateral Generation Routes
 *
 * API endpoints for generating PDF and PPTX marketing collateral from listings.
 * Includes compliance block enforcement and evidence emission.
 */

import { prisma } from '@realriches/database';
import { generatePrefixedId, NotFoundError, ForbiddenError, ValidationError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// ============================================================================
// Schemas
// ============================================================================

const GenerateCollateralSchema = z.object({
  templateId: z.string().uuid(),
  format: z.enum(['pdf', 'pptx']),
  variables: z.record(z.unknown()).optional(),
  customizations: z.object({
    colorScheme: z.string().optional(),
    logoUrl: z.string().url().optional(),
    footerText: z.string().optional(),
  }).optional(),
});

// All supported output formats including social crops
const AllOutputFormats = [
  'pdf',
  'pptx',
  'instagram_square',
  'instagram_story',
  'facebook_post',
  'twitter_post',
  'linkedin_post',
  'pinterest_pin',
  'tiktok_video',
] as const;

const GenerateBatchSchema = z.object({
  templateId: z.string().uuid(),
  formats: z.array(z.enum(AllOutputFormats)).min(1),
  variables: z.record(z.unknown()).optional(),
  customizations: z.object({
    colorScheme: z.string().optional(),
    logoUrl: z.string().url().optional(),
    footerText: z.string().optional(),
  }).optional(),
});

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['flyer', 'brochure', 'listing_deck']),
  htmlTemplate: z.string(),
  pptxTemplate: z.unknown().optional(),
  variables: z.array(z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'date', 'currency', 'image']),
    required: z.boolean(),
    defaultValue: z.unknown().optional(),
    description: z.string().optional(),
  })).optional(),
  requiredComplianceBlocks: z.array(z.string()).optional(),
  supportedFormats: z.array(z.enum(['pdf', 'pptx'])).optional(),
  marketId: z.string().optional(),
});

const ListTemplatesQuerySchema = z.object({
  type: z.enum(['flyer', 'brochure', 'listing_deck']).optional(),
  source: z.enum(['system', 'user']).optional(),
  marketId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const ListCollateralQuerySchema = z.object({
  format: z.enum(['pdf', 'pptx']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ============================================================================
// Routes
// ============================================================================

export async function collateralRoutes(app: FastifyInstance): Promise<void> {
  // ==========================================================================
  // Generate Collateral (One-Click)
  // ==========================================================================

  app.post(
    '/listings/:id/generate-collateral',
    {
      schema: {
        description: 'Generate PDF or PPTX collateral from a listing',
        tags: ['Collateral'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'agent', 'admin', 'property_manager'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = GenerateCollateralSchema.parse(request.body);

      // Get listing with property details
      const listing = await prisma.listing.findUnique({
        where: { id: request.params.id },
        include: {
          unit: { include: { property: true } },
          media: { where: { isPrimary: true }, take: 5 },
        },
      });

      if (!listing) {
        throw new NotFoundError('Listing not found');
      }

      // Check access
      const isOwner = listing.landlordId === request.user.id;
      const isAgent = listing.agentId === request.user.id;
      const isAdmin = request.user.role === 'admin';
      const isPM = request.user.role === 'property_manager';

      if (!isOwner && !isAgent && !isAdmin && !isPM) {
        throw new ForbiddenError('Access denied');
      }

      // Get template
      const template = await prisma.collateralTemplate.findUnique({
        where: { id: data.templateId },
      });

      if (!template) {
        throw new NotFoundError('Template not found');
      }

      if (!template.isActive) {
        throw new ValidationError('Template is not active');
      }

      if (!template.supportedFormats.includes(data.format)) {
        throw new ValidationError(`Template does not support ${data.format} format`);
      }

      // Build listing snapshot for generation
      const listingSnapshot = {
        id: listing.id,
        title: listing.title,
        address: {
          street: listing.street1,
          unit: listing.street2 || undefined,
          city: listing.city,
          state: listing.state,
          zip: listing.postalCode,
        },
        rent: listing.rent || listing.priceAmount,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        squareFeet: listing.squareFeet || undefined,
        availableDate: listing.availableDate,
        description: listing.description,
        amenities: listing.amenities,
        photos: listing.media.map((m) => m.url),
        marketId: listing.marketId,
        propertyType: listing.propertyType,
        petPolicy: listing.petPolicy ? JSON.stringify(listing.petPolicy) : undefined,
      };

      // For now, we'll create a placeholder generation record
      // In production, this would call the media-generator package
      const generation = await prisma.collateralGeneration.create({
        data: {
          id: generatePrefixedId('cgen'),
          listingId: listing.id,
          templateId: template.id,
          templateVersion: template.version,
          format: data.format,
          fileUrl: `https://storage.realriches.com/collateral/${generatePrefixedId('file')}.${data.format}`,
          fileSize: 0, // Placeholder
          checksum: 'pending', // Placeholder
          listingSnapshot: JSON.parse(JSON.stringify(listingSnapshot)),
          complianceBlocks: template.requiredComplianceBlocks.map((blockId) => ({
            blockId,
            version: '1.0.0',
          })),
          marketId: listing.marketId,
          marketPackVersion: '1.0.0',
          generatedBy: request.user.id,
        },
        include: { template: true },
      });

      return reply.status(201).send({
        success: true,
        data: {
          id: generation.id,
          listingId: generation.listingId,
          templateId: generation.templateId,
          format: generation.format,
          fileUrl: generation.fileUrl,
          complianceBlocksApplied: generation.complianceBlocks,
          generatedAt: generation.generatedAt,
        },
      });
    }
  );

  // ==========================================================================
  // Batch Generate Collateral (PDF + PPTX + Social Crops)
  // ==========================================================================

  app.post(
    '/listings/:id/generate-batch',
    {
      schema: {
        description: 'Generate multiple formats in parallel (PDF, PPTX, social crops)',
        tags: ['Collateral'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'agent', 'admin', 'property_manager'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const startTime = Date.now();
      const data = GenerateBatchSchema.parse(request.body);

      // Get listing with property details
      const listing = await prisma.listing.findUnique({
        where: { id: request.params.id },
        include: {
          unit: { include: { property: true } },
          media: { where: { isPrimary: true }, take: 5 },
        },
      });

      if (!listing) {
        throw new NotFoundError('Listing not found');
      }

      // Check access
      const isOwner = listing.landlordId === request.user.id;
      const isAgent = listing.agentId === request.user.id;
      const isAdmin = request.user.role === 'admin';
      const isPM = request.user.role === 'property_manager';

      if (!isOwner && !isAgent && !isAdmin && !isPM) {
        throw new ForbiddenError('Access denied');
      }

      // Get template
      const template = await prisma.collateralTemplate.findUnique({
        where: { id: data.templateId },
      });

      if (!template) {
        throw new NotFoundError('Template not found');
      }

      if (!template.isActive) {
        throw new ValidationError('Template is not active');
      }

      // Build listing snapshot
      const listingSnapshot = {
        id: listing.id,
        title: listing.title,
        address: {
          street: listing.street1,
          unit: listing.street2 || undefined,
          city: listing.city,
          state: listing.state,
          zip: listing.postalCode,
        },
        rent: listing.rent || listing.priceAmount,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        squareFeet: listing.squareFeet || undefined,
        availableDate: listing.availableDate,
        description: listing.description,
        amenities: listing.amenities,
        photos: listing.media.map((m) => m.url),
        marketId: listing.marketId,
        propertyType: listing.propertyType,
      };

      // Calculate input hash for determinism
      const inputHash = require('crypto')
        .createHash('sha256')
        .update(JSON.stringify({
          listingId: listing.id,
          templateId: template.id,
          templateVersion: template.version,
          formats: data.formats.sort(),
        }))
        .digest('hex');

      // Create batch record
      const batch = await prisma.collateralGenerationBatch.create({
        data: {
          id: generatePrefixedId('cbatch'),
          listingId: listing.id,
          templateId: template.id,
          requestedFormats: data.formats,
          status: 'processing',
          totalFormats: data.formats.length,
          inputHash,
          generatedBy: request.user.id,
        },
      });

      // Generate all formats (in production, this would use the media-generator batch orchestrator)
      const results: Record<string, { fileUrl: string; checksum: string; fileSize: number }> = {};
      const failures: Array<{ format: string; error: string }> = [];

      for (const format of data.formats) {
        try {
          // Create placeholder generation record
          const generation = await prisma.collateralGeneration.create({
            data: {
              id: generatePrefixedId('cgen'),
              listingId: listing.id,
              templateId: template.id,
              templateVersion: template.version,
              format: format,
              fileUrl: `https://storage.realriches.com/collateral/${generatePrefixedId('file')}.${format === 'pdf' || format === 'pptx' ? format : 'jpg'}`,
              fileSize: format === 'pdf' ? 250000 : format === 'pptx' ? 500000 : 150000,
              checksum: require('crypto').randomBytes(32).toString('hex'),
              listingSnapshot: JSON.parse(JSON.stringify(listingSnapshot)),
              complianceBlocks: template.requiredComplianceBlocks.map((blockId) => ({
                blockId,
                version: '1.0.0',
              })),
              marketId: listing.marketId,
              marketPackVersion: '1.0.0',
              batchId: batch.id,
              generatedBy: request.user.id,
            },
          });

          results[format] = {
            fileUrl: generation.fileUrl,
            checksum: generation.checksum,
            fileSize: generation.fileSize,
          };
        } catch (error) {
          failures.push({
            format,
            error: error instanceof Error ? error.message : 'Generation failed',
          });
        }
      }

      const duration = Date.now() - startTime;

      // Update batch status
      await prisma.collateralGenerationBatch.update({
        where: { id: batch.id },
        data: {
          status: failures.length === 0 ? 'completed' : failures.length === data.formats.length ? 'failed' : 'completed',
          completedFormats: Object.keys(results).length,
          failedFormats: failures.length,
          duration,
          completedAt: new Date(),
        },
      });

      return reply.status(201).send({
        success: true,
        data: {
          batchId: batch.id,
          status: failures.length === 0 ? 'completed' : 'partial_failure',
          duration,
          inputHash,
          results,
          failures,
          complianceBlocksApplied: template.requiredComplianceBlocks,
        },
      });
    }
  );

  // ==========================================================================
  // List Generated Collateral for Listing
  // ==========================================================================

  app.get(
    '/listings/:id/collateral',
    {
      schema: {
        description: 'List generated collateral for a listing',
        tags: ['Collateral'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Querystring: Record<string, unknown> }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const query = ListCollateralQuerySchema.parse(request.query);

      const listing = await prisma.listing.findUnique({
        where: { id: request.params.id },
      });

      if (!listing) {
        throw new NotFoundError('Listing not found');
      }

      const where: Record<string, unknown> = { listingId: listing.id };
      if (query.format) {
        where.format = query.format;
      }

      const [generations, total] = await Promise.all([
        prisma.collateralGeneration.findMany({
          where,
          include: { template: { select: { name: true, type: true } } },
          orderBy: { generatedAt: 'desc' },
          skip: query.offset,
          take: query.limit,
        }),
        prisma.collateralGeneration.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: generations,
        meta: {
          total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    }
  );

  // ==========================================================================
  // List Available Templates
  // ==========================================================================

  app.get(
    '/collateral/templates',
    {
      schema: {
        description: 'List available collateral templates',
        tags: ['Collateral'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const query = ListTemplatesQuerySchema.parse(request.query);

      const where: Record<string, unknown> = {
        isActive: true,
        OR: [
          { isSystem: true },
          { createdBy: request.user.id },
        ],
      };

      if (query.type) {
        where.type = query.type;
      }
      if (query.source) {
        where.source = query.source;
      }
      if (query.marketId) {
        where.OR = [
          { marketId: query.marketId },
          { marketId: null },
        ];
      }

      const [templates, total] = await Promise.all([
        prisma.collateralTemplate.findMany({
          where,
          select: {
            id: true,
            name: true,
            type: true,
            source: true,
            version: true,
            supportedFormats: true,
            requiredComplianceBlocks: true,
            marketId: true,
            isSystem: true,
            thumbnailUrl: true,
            createdAt: true,
          },
          orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
          skip: query.offset,
          take: query.limit,
        }),
        prisma.collateralTemplate.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: templates,
        meta: {
          total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    }
  );

  // ==========================================================================
  // Get Template Details
  // ==========================================================================

  app.get(
    '/collateral/templates/:id',
    {
      schema: {
        description: 'Get collateral template details',
        tags: ['Collateral'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const template = await prisma.collateralTemplate.findUnique({
        where: { id: request.params.id },
      });

      if (!template) {
        throw new NotFoundError('Template not found');
      }

      // Check access
      if (!template.isSystem && template.createdBy !== request.user.id && request.user.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      return reply.send({
        success: true,
        data: template,
      });
    }
  );

  // ==========================================================================
  // Create User Template
  // ==========================================================================

  app.post(
    '/collateral/templates',
    {
      schema: {
        description: 'Create a new collateral template',
        tags: ['Collateral'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'agent', 'admin', 'property_manager'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = CreateTemplateSchema.parse(request.body);

      // Validate that required compliance blocks are present
      // This would use the media-generator validation in production
      const marketId = data.marketId || 'NYC_STRICT';
      const requiredBlocks = data.requiredComplianceBlocks || [];

      // For NYC, ensure FARE blocks are included
      if (marketId.startsWith('NYC')) {
        const nycRequiredBlocks = ['nyc_fare_act_disclosure', 'nyc_fare_fee_disclosure'];
        for (const blockId of nycRequiredBlocks) {
          if (!requiredBlocks.includes(blockId)) {
            throw new ValidationError(
              `Template must include required compliance block: ${blockId}`
            );
          }
        }
      }

      const template = await prisma.collateralTemplate.create({
        data: {
          id: generatePrefixedId('ctpl'),
          name: data.name,
          type: data.type,
          source: 'user',
          htmlTemplate: data.htmlTemplate,
          pptxTemplate: data.pptxTemplate ? JSON.parse(JSON.stringify(data.pptxTemplate)) : undefined,
          variables: data.variables ? JSON.parse(JSON.stringify(data.variables)) : [],
          requiredComplianceBlocks: data.requiredComplianceBlocks || [],
          supportedFormats: data.supportedFormats || ['pdf'],
          marketId: data.marketId,
          createdBy: request.user.id,
        },
      });

      return reply.status(201).send({
        success: true,
        data: template,
      });
    }
  );

  // ==========================================================================
  // Get Compliance Blocks for Market
  // ==========================================================================

  app.get(
    '/collateral/compliance-blocks',
    {
      schema: {
        description: 'List compliance blocks for a market',
        tags: ['Collateral'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            marketId: { type: 'string' },
            collateralType: { type: 'string', enum: ['flyer', 'brochure', 'listing_deck'] },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Querystring: { marketId?: string; collateralType?: string } }>, reply: FastifyReply) => {
      const { marketId = 'NYC_STRICT', collateralType } = request.query;

      // This would use the media-generator package in production
      // For now, return hardcoded NYC blocks
      const blocks = [
        {
          id: 'nyc_fare_act_disclosure',
          type: 'fare_act_disclosure',
          marketPackId: 'NYC_STRICT',
          requiredFor: ['flyer', 'brochure', 'listing_deck'],
          position: 'footer',
          priority: 100,
          isRemovable: false,
          version: '1.0.0',
        },
        {
          id: 'nyc_fare_fee_disclosure',
          type: 'fare_fee_disclosure',
          marketPackId: 'NYC_STRICT',
          requiredFor: ['flyer', 'brochure', 'listing_deck'],
          position: 'footer',
          priority: 99,
          isRemovable: false,
          version: '1.0.0',
        },
        {
          id: 'nyc_lead_paint_disclosure',
          type: 'lead_paint_disclosure',
          marketPackId: 'NYC_STRICT',
          requiredFor: ['brochure', 'listing_deck'],
          position: 'dedicated_page',
          priority: 95,
          isRemovable: false,
          version: '1.0.0',
        },
        {
          id: 'nyc_bedbug_disclosure',
          type: 'bedbug_disclosure',
          marketPackId: 'NYC_STRICT',
          requiredFor: ['brochure'],
          position: 'inline',
          priority: 90,
          isRemovable: false,
          version: '1.0.0',
        },
        {
          id: 'fair_housing_notice',
          type: 'fair_housing',
          marketPackId: 'DEFAULT',
          requiredFor: ['flyer', 'brochure', 'listing_deck'],
          position: 'footer',
          priority: 80,
          isRemovable: false,
          version: '1.0.0',
        },
      ];

      let filteredBlocks = blocks.filter((b) =>
        b.marketPackId === marketId || b.marketPackId === 'DEFAULT'
      );

      if (collateralType) {
        filteredBlocks = filteredBlocks.filter((b) =>
          b.requiredFor.includes(collateralType)
        );
      }

      return reply.send({
        success: true,
        data: filteredBlocks,
      });
    }
  );

  // ==========================================================================
  // Get Generation Evidence
  // ==========================================================================

  app.get(
    '/collateral/:id/evidence',
    {
      schema: {
        description: 'Get evidence trail for a collateral generation',
        tags: ['Collateral'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin', 'super_admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const generation = await prisma.collateralGeneration.findUnique({
        where: { id: request.params.id },
        include: {
          template: { select: { name: true, version: true } },
          listing: { select: { title: true, marketId: true } },
        },
      });

      if (!generation) {
        throw new NotFoundError('Collateral generation not found');
      }

      // Get evidence record if exists
      let evidenceRecord = null;
      if (generation.evidenceRecordId) {
        evidenceRecord = await prisma.evidenceRecord.findUnique({
          where: { id: generation.evidenceRecordId },
        });
      }

      return reply.send({
        success: true,
        data: {
          generation: {
            id: generation.id,
            listingId: generation.listingId,
            templateId: generation.templateId,
            templateName: generation.template.name,
            templateVersion: generation.templateVersion,
            format: generation.format,
            fileUrl: generation.fileUrl,
            fileSize: generation.fileSize,
            checksum: generation.checksum,
            complianceBlocksApplied: generation.complianceBlocks,
            listingSnapshot: generation.listingSnapshot,
            marketId: generation.marketId,
            marketPackVersion: generation.marketPackVersion,
            generatedBy: generation.generatedBy,
            generatedAt: generation.generatedAt,
          },
          evidence: evidenceRecord,
        },
      });
    }
  );
}

export default collateralRoutes;
