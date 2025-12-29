import { prisma } from '@realriches/database';
import { generatePrefixedId, NotFoundError, ForbiddenError, AppError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

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
          address: data.address,
          totalUnits: 1, // Commercial properties use square footage instead
          squareFeet: data.totalSquareFeet,
          yearBuilt: data.yearBuilt,
          amenities: data.amenities,
          ownerId: request.user.id,
          metadata: {
            commercialType: data.type,
            floors: data.floors,
            parkingSpaces: data.parkingSpaces,
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

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Implement full underwriting model
      // This is a simplified placeholder calculation

      const purchasePrice = data.purchasePrice;
      const loanAmount = data.loanAmount || purchasePrice * 0.7; // 70% LTV default
      const equity = purchasePrice - loanAmount;
      const interestRate = data.interestRate || 0.065; // 6.5% default
      const holdPeriod = data.holdPeriod;
      const exitCapRate = data.exitCapRate || 0.055; // 5.5% default

      // Assume NOI based on property size (placeholder)
      const estimatedNOI = (property.squareFeet || 10000) * 25; // $25/sqft NOI estimate
      const goingInCapRate = estimatedNOI / purchasePrice;

      // Annual debt service
      const annualDebtService = loanAmount * interestRate;

      // Cash on cash return
      const yearOneCashFlow = estimatedNOI - annualDebtService;
      const cashOnCash = (yearOneCashFlow / equity) * 100;

      // Exit value and IRR estimate
      const exitNOI = estimatedNOI * Math.pow(1.02, holdPeriod); // 2% annual NOI growth
      const exitValue = exitNOI / exitCapRate;
      const totalProfit = exitValue - loanAmount - equity;
      const irr = Math.pow((equity + totalProfit) / equity, 1 / holdPeriod) - 1;

      const analysis = {
        propertyId: data.propertyId,
        propertyName: property.name,
        inputs: {
          purchasePrice,
          loanAmount,
          equity,
          interestRate,
          holdPeriod,
          exitCapRate,
        },
        metrics: {
          goingInCapRate: Math.round(goingInCapRate * 10000) / 100,
          cashOnCash: Math.round(cashOnCash * 100) / 100,
          estimatedIRR: Math.round(irr * 10000) / 100,
          dscr: Math.round((estimatedNOI / annualDebtService) * 100) / 100,
          ltv: Math.round((loanAmount / purchasePrice) * 10000) / 100,
        },
        projections: {
          year1NOI: Math.round(estimatedNOI),
          year1CashFlow: Math.round(yearOneCashFlow),
          exitValue: Math.round(exitValue),
          totalProfit: Math.round(totalProfit),
        },
        sensitivity: {
          capRateMinus50bps: Math.round(exitNOI / (exitCapRate - 0.005)),
          capRatePlus50bps: Math.round(exitNOI / (exitCapRate + 0.005)),
        },
        createdAt: new Date().toISOString(),
        createdBy: request.user.id,
      };

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
      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Query actual fractional offerings table
      // For now, return sample data

      const offerings = [
        {
          id: 'frac-1',
          propertyName: 'Manhattan Office Tower',
          propertyType: 'OFFICE',
          location: 'New York, NY',
          totalValue: 50000000,
          pricePerShare: 1000,
          sharesAvailable: 5000,
          minimumInvestment: 10000,
          projectedReturns: {
            annualCashYield: 6.5,
            targetIRR: 15,
            holdPeriod: 5,
          },
          status: 'OPEN',
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];

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

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Create offering in database
      // Would need regulatory compliance checks (SEC, etc.)

      const offering = {
        id: generatePrefixedId('frac'),
        ...data,
        property: {
          id: property.id,
          name: property.name,
          address: property.address,
        },
        status: 'PENDING_APPROVAL',
        sharesSubscribed: 0,
        createdAt: new Date().toISOString(),
        createdBy: request.user.id,
      };

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

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Implement investment flow
      // Would need:
      // - Accredited investor verification
      // - KYC/AML compliance
      // - Escrow for funds
      // - Share issuance

      const investment = {
        id: generatePrefixedId('inv'),
        offeringId: request.params.id,
        investorId: request.user.id,
        shares,
        status: 'PENDING_VERIFICATION',
        createdAt: new Date().toISOString(),
      };

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

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Query actual portfolio data

      const portfolio = {
        totalInvested: 0,
        currentValue: 0,
        totalReturns: 0,
        investments: [],
        distributions: [],
      };

      return reply.send({ success: true, data: portfolio });
    }
  );
}
