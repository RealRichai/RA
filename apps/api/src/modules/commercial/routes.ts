import { prisma } from '@realriches/database';
import { NotFoundError, ForbiddenError, AppError, generatePrefixedId } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import {
  runUnderwritingAnalysis,
  listFractionalOfferings,
  createFractionalOffering,
  processInvestment,
  getInvestorPortfolio,
} from './commercial.service';

// Commercial module - behind feature flag for enterprise customers

const CreateCommercialPropertySchema = z.object({
  name: z.string().min(1),
  type: z.enum(['OFFICE', 'RETAIL', 'INDUSTRIAL', 'MIXED_USE', 'HOSPITALITY']),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string().default('US'),
  }),
  totalSquareFeet: z.number().int(),
  floors: z.number().int().optional(),
  yearBuilt: z.number().int().optional(),
  parkingSpaces: z.number().int().optional(),
  amenities: z.array(z.string()).optional(),
});

const StackingPlanSchema = z.object({
  propertyId: z.string(),
  floors: z.array(
    z.object({
      number: z.number().int(),
      totalSqFt: z.number().int(),
      spaces: z.array(
        z.object({
          name: z.string(),
          sqFt: z.number().int(),
          status: z.enum(['VACANT', 'OCCUPIED', 'RESERVED', 'UNAVAILABLE']),
          tenant: z.string().optional(),
          leaseExpiry: z.string().datetime().optional(),
          rentPerSqFt: z.number().optional(),
        })
      ),
    })
  ),
});

const UnderwritingRequestSchema = z.object({
  propertyId: z.string(),
  purchasePrice: z.number(),
  loanAmount: z.number().optional(),
  interestRate: z.number().optional(),
  holdPeriod: z.number().int().default(5),
  exitCapRate: z.number().optional(),
  assumptions: z.record(z.unknown()).optional(),
});

const FractionalOfferingSchema = z.object({
  propertyId: z.string(),
  totalShares: z.number().int(),
  pricePerShare: z.number(),
  minimumInvestment: z.number(),
  targetRaise: z.number(),
  offeringDeadline: z.string().datetime(),
  projectedReturns: z.object({
    annualCashYield: z.number(),
    targetIRR: z.number(),
    holdPeriod: z.number().int(),
  }),
});

async function checkCommercialAccess(app: FastifyInstance, request: FastifyRequest): Promise<void> {
  // Check if commercial features are enabled for this user
  const featureFlag = await prisma.featureFlag.findUnique({
    where: { key: 'commercial_module' },
  });

  if (!featureFlag?.isEnabled) {
    throw new AppError('Commercial module is not available', 'FEATURE_DISABLED', 403);
  }

  // Check user permissions
  if (!request.user) {
    throw new AppError('Authentication required', 'AUTH_REQUIRED', 401);
  }

  const allowedRoles = ['investor', 'admin'];
  if (!allowedRoles.includes(request.user.role)) {
    throw new ForbiddenError('Commercial features require investor or admin access');
  }
}

export async function commercialRoutes(app: FastifyInstance): Promise<void> {
  // === COMMERCIAL PROPERTIES ===

  // List commercial properties
  app.get(
    '/properties',
    {
      schema: {
        description: 'List commercial properties (enterprise feature)',
        tags: ['Commercial'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            minSqFt: { type: 'integer' },
            maxSqFt: { type: 'integer' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        await checkCommercialAccess(app, request);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { type?: string; minSqFt?: number; maxSqFt?: number };
      }>,
      reply: FastifyReply
    ) => {
      const { type, minSqFt, maxSqFt } = request.query;

      const where: Record<string, unknown> = { propertyType: 'COMMERCIAL' };
      if (type) where.commercialType = type;

      const properties = await prisma.property.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ success: true, data: properties });
    }
  );

  // Create commercial property
  app.post(
    '/properties',
    {
      schema: {
        description: 'Create a commercial property (enterprise feature)',
        tags: ['Commercial'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        await checkCommercialAccess(app, request);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = CreateCommercialPropertySchema.parse(request.body);

      const property = await prisma.property.create({
        data: {
          id: generatePrefixedId('prp'),
          name: data.name,
          type: 'commercial',
          street1: data.address.street,
          city: data.address.city,
          state: data.address.state,
          postalCode: data.address.zipCode,
          country: data.address.country,
          marketId: 'US_STANDARD',
          totalUnits: 1, // Commercial properties use square footage instead
          yearBuilt: data.yearBuilt,
          amenities: data.amenities,
          ownerId: request.user.id,
          metadata: {
            commercialType: data.type,
            floors: data.floors,
            parkingSpaces: data.parkingSpaces,
            totalSquareFeet: data.totalSquareFeet,
          },
        },
      });

      return reply.status(201).send({ success: true, data: property });
    }
  );

  // === STACKING PLANS ===

  // Get stacking plan for property
  app.get(
    '/properties/:id/stacking-plan',
    {
      schema: {
        description: 'Get stacking plan for a commercial property',
        tags: ['Commercial'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        await checkCommercialAccess(app, request);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const property = await prisma.property.findUnique({
        where: { id: request.params.id },
      });

      if (!property) {
        throw new NotFoundError('Property not found');
      }

      // Get or generate stacking plan
      // In a full implementation, this would be stored and managed separately
      const stackingPlan = (property.metadata as Record<string, unknown>)?.stackingPlan || {
        propertyId: property.id,
        propertyName: property.name,
        totalSqFt: property.squareFeet,
        floors: [],
        summary: {
          occupiedSqFt: 0,
          vacantSqFt: property.squareFeet,
          occupancyRate: 0,
          averageRentPerSqFt: 0,
        },
      };

      return reply.send({ success: true, data: stackingPlan });
    }
  );

  // Update stacking plan
  app.put(
    '/properties/:id/stacking-plan',
    {
      schema: {
        description: 'Update stacking plan for a commercial property',
        tags: ['Commercial'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        await checkCommercialAccess(app, request);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const property = await prisma.property.findUnique({
        where: { id: request.params.id },
      });

      if (!property) {
        throw new NotFoundError('Property not found');
      }

      if (property.ownerId !== request.user.id && request.user.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      const data = StackingPlanSchema.parse(request.body);

      // Calculate summary metrics
      let occupiedSqFt = 0;
      let totalRentableSqFt = 0;
      let weightedRent = 0;

      data.floors.forEach((floor) => {
        floor.spaces.forEach((space) => {
          totalRentableSqFt += space.sqFt;
          if (space.status === 'OCCUPIED') {
            occupiedSqFt += space.sqFt;
            if (space.rentPerSqFt) {
              weightedRent += space.sqFt * space.rentPerSqFt;
            }
          }
        });
      });

      const summary = {
        occupiedSqFt,
        vacantSqFt: totalRentableSqFt - occupiedSqFt,
        occupancyRate: totalRentableSqFt > 0 ? (occupiedSqFt / totalRentableSqFt) * 100 : 0,
        averageRentPerSqFt: occupiedSqFt > 0 ? weightedRent / occupiedSqFt : 0,
      };

      // Store stacking plan in metadata
      const existingMetadata = (property.metadata as Record<string, unknown>) || {};
      await prisma.property.update({
        where: { id: property.id },
        data: {
          metadata: {
            ...existingMetadata,
            stackingPlan: { ...data, summary },
          },
        },
      });

      return reply.send({
        success: true,
        data: { ...data, summary },
      });
    }
  );

  // === UNDERWRITING ===

  // Run underwriting analysis
  app.post(
    '/underwriting/analyze',
    {
      schema: {
        description: 'Run underwriting analysis for a commercial property',
        tags: ['Commercial'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        await checkCommercialAccess(app, request);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = UnderwritingRequestSchema.parse(request.body);

      const property = await prisma.property.findUnique({
        where: { id: data.propertyId },
      });

      if (!property) {
        throw new NotFoundError('Property not found');
      }

      // Run underwriting analysis using commercial service
      const analysis = await runUnderwritingAnalysis(
        {
          propertyId: data.propertyId,
          purchasePrice: data.purchasePrice,
          loanAmount: data.loanAmount,
          interestRate: data.interestRate,
          holdPeriod: data.holdPeriod,
          exitCapRate: data.exitCapRate,
        },
        { id: property.id, name: property.name, squareFeet: property.squareFeet },
        request.user.id
      );

      return reply.send({ success: true, data: analysis });
    }
  );

  // === FRACTIONAL OWNERSHIP ===

  // List fractional offerings
  app.get(
    '/fractional/offerings',
    {
      schema: {
        description: 'List fractional ownership offerings',
        tags: ['Commercial'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            minInvestment: { type: 'number' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        await checkCommercialAccess(app, request);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; minInvestment?: number };
      }>,
      reply: FastifyReply
    ) => {
      // Get fractional offerings using commercial service
      const { status, minInvestment } = request.query;
      const offerings = listFractionalOfferings({ status, minInvestment });

      return reply.send({ success: true, data: offerings });
    }
  );

  // Create fractional offering (admin only)
  app.post(
    '/fractional/offerings',
    {
      schema: {
        description: 'Create a fractional ownership offering',
        tags: ['Commercial'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        await checkCommercialAccess(app, request);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = FractionalOfferingSchema.parse(request.body);

      const property = await prisma.property.findUnique({
        where: { id: data.propertyId },
      });

      if (!property) {
        throw new NotFoundError('Property not found');
      }

      // Create fractional offering using commercial service
      const addressStr = typeof property.address === 'object'
        ? `${(property.address as Record<string, string>).city}, ${(property.address as Record<string, string>).state}`
        : String(property.address || '');

      const offering = await createFractionalOffering(
        {
          propertyId: data.propertyId,
          totalValue: data.totalShares * data.pricePerShare,
          pricePerShare: data.pricePerShare,
          minimumInvestment: data.minimumInvestment,
          projectedReturns: {
            annualCashYield: data.projectedReturns.annualCashYield,
            targetIRR: data.projectedReturns.targetIRR,
            holdPeriod: data.projectedReturns.holdPeriod,
          },
          deadline: data.offeringDeadline,
        },
        {
          id: property.id,
          name: property.name,
          address: addressStr,
          type: (property.metadata as Record<string, unknown>)?.commercialType as string || 'COMMERCIAL',
        },
        request.user.id
      );

      return reply.status(201).send({
        success: true,
        data: offering,
        message: 'Offering created. Pending regulatory approval.',
      });
    }
  );

  // Invest in fractional offering
  app.post(
    '/fractional/offerings/:id/invest',
    {
      schema: {
        description: 'Invest in a fractional ownership offering',
        tags: ['Commercial'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        await checkCommercialAccess(app, request);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { shares, paymentMethodId } = (request.body as {
        shares: number;
        paymentMethodId: string;
      }) || {};

      // Process investment using commercial service
      // Note: Full implementation would include accredited investor verification,
      // KYC/AML compliance, escrow, and share issuance
      const investment = await processInvestment(
        request.params.id,
        request.user.id,
        shares,
        paymentMethodId
      );

      return reply.status(201).send({
        success: true,
        data: investment,
        message: 'Investment submitted. Pending accreditation verification.',
      });
    }
  );

  // Get investor portfolio
  app.get(
    '/portfolio',
    {
      schema: {
        description: 'Get commercial investment portfolio',
        tags: ['Commercial'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        await checkCommercialAccess(app, request);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      // Get investor portfolio using commercial service
      const portfolio = await getInvestorPortfolio(request.user.id);

      return reply.send({ success: true, data: portfolio });
    }
  );
}
