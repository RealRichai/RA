import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@realriches/database';
import { generateId, NotFoundError, ForbiddenError } from '@realriches/utils';

const UtilitySetupSchema = z.object({
  leaseId: z.string(),
  utilityType: z.enum(['ELECTRIC', 'GAS', 'WATER', 'INTERNET', 'CABLE', 'TRASH']),
  provider: z.string().optional(),
  transferDate: z.string().datetime(),
});

const MovingQuoteSchema = z.object({
  leaseId: z.string(),
  moveDate: z.string().datetime(),
  originAddress: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
  }),
  estimatedItems: z.enum(['STUDIO', 'ONE_BEDROOM', 'TWO_BEDROOM', 'THREE_PLUS']),
  needsPacking: z.boolean().default(false),
  hasElevator: z.boolean().default(false),
  floorNumber: z.number().int().optional(),
});

const VendorOrderSchema = z.object({
  vendorId: z.string(),
  productId: z.string(),
  quantity: z.number().int().min(1).default(1),
  deliveryAddress: z.object({
    street: z.string(),
    unit: z.string().optional(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
  }),
  deliveryDate: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export async function commerceRoutes(app: FastifyInstance): Promise<void> {
  // === UTILITIES CONCIERGE ===

  // Get available utility providers
  app.get(
    '/utilities/providers',
    {
      schema: {
        description: 'Get available utility providers for a location',
        tags: ['Commerce'],
        querystring: {
          type: 'object',
          properties: {
            zipCode: { type: 'string' },
            utilityType: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { zipCode?: string; utilityType?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { zipCode, utilityType } = request.query;

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Integrate with utility provider APIs
      // Return providers available in the area

      const providers = [
        {
          id: 'con-ed',
          name: 'Con Edison',
          types: ['ELECTRIC', 'GAS'],
          website: 'https://coned.com',
          phone: '1-800-752-6633',
        },
        {
          id: 'national-grid',
          name: 'National Grid',
          types: ['GAS'],
          website: 'https://nationalgrid.com',
          phone: '1-800-930-5003',
        },
        {
          id: 'spectrum',
          name: 'Spectrum',
          types: ['INTERNET', 'CABLE'],
          website: 'https://spectrum.com',
          phone: '1-844-222-0718',
        },
      ];

      const filtered = utilityType
        ? providers.filter((p) => p.types.includes(utilityType))
        : providers;

      return reply.send({ success: true, data: filtered });
    }
  );

  // Request utility setup
  app.post(
    '/utilities/setup',
    {
      schema: {
        description: 'Request utility setup assistance',
        tags: ['Commerce'],
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

      const data = UtilitySetupSchema.parse(request.body);

      const lease = await prisma.lease.findUnique({
        where: { id: data.leaseId },
        include: { unit: { include: { property: true } } },
      });

      if (!lease || lease.tenantId !== request.user.id) {
        throw new ForbiddenError('Access denied');
      }

      // Create utility setup request
      const utilitySetup = await prisma.utilitySetup.create({
        data: {
          id: generateId('utl'),
          leaseId: data.leaseId,
          userId: request.user.id,
          utilityType: data.utilityType,
          provider: data.provider,
          transferDate: new Date(data.transferDate),
          status: 'PENDING',
          address: lease.unit.property.address,
        },
      });

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Integrate with utility concierge service

      return reply.status(201).send({
        success: true,
        data: utilitySetup,
        message: 'Utility setup request submitted. We will contact you shortly.',
      });
    }
  );

  // === MOVING SERVICES ===

  // Get moving quotes
  app.post(
    '/moving/quotes',
    {
      schema: {
        description: 'Get moving quotes from partner companies',
        tags: ['Commerce'],
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

      const data = MovingQuoteSchema.parse(request.body);

      const lease = await prisma.lease.findUnique({
        where: { id: data.leaseId },
        include: { unit: { include: { property: true } } },
      });

      if (!lease || lease.tenantId !== request.user.id) {
        throw new ForbiddenError('Access denied');
      }

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Integrate with moving company APIs
      // For now, return sample quotes

      const basePrice = {
        STUDIO: 300,
        ONE_BEDROOM: 500,
        TWO_BEDROOM: 800,
        THREE_PLUS: 1200,
      }[data.estimatedItems];

      const quotes = [
        {
          id: generateId('mvq'),
          company: 'City Movers',
          price: basePrice * 1.0,
          duration: '3-4 hours',
          rating: 4.8,
          reviews: 234,
          includes: ['Loading', 'Unloading', 'Basic protection'],
        },
        {
          id: generateId('mvq'),
          company: 'Quick Move NYC',
          price: basePrice * 1.15,
          duration: '3-5 hours',
          rating: 4.6,
          reviews: 189,
          includes: ['Loading', 'Unloading', 'Basic protection', 'Furniture disassembly'],
        },
        {
          id: generateId('mvq'),
          company: 'Premium Relocations',
          price: basePrice * 1.4,
          duration: '4-5 hours',
          rating: 4.9,
          reviews: 312,
          includes: [
            'Loading',
            'Unloading',
            'Full protection',
            'Furniture disassembly',
            'Packing materials',
          ],
        },
      ];

      // Add packing cost if needed
      if (data.needsPacking) {
        quotes.forEach((q) => {
          q.price *= 1.3;
          q.includes.push('Full packing service');
        });
      }

      return reply.send({ success: true, data: quotes });
    }
  );

  // Book moving service
  app.post(
    '/moving/book',
    {
      schema: {
        description: 'Book a moving service',
        tags: ['Commerce'],
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

      const { quoteId, paymentMethodId } = (request.body as {
        quoteId: string;
        paymentMethodId: string;
      }) || {};

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Process booking with moving company

      const booking = {
        id: generateId('mvb'),
        quoteId,
        status: 'CONFIRMED',
        confirmationCode: `MV-${Date.now().toString(36).toUpperCase()}`,
      };

      return reply.status(201).send({
        success: true,
        data: booking,
        message: 'Moving service booked successfully. Confirmation sent to your email.',
      });
    }
  );

  // === VENDOR MARKETPLACE ===

  // List marketplace vendors
  app.get(
    '/marketplace/vendors',
    {
      schema: {
        description: 'List marketplace vendors',
        tags: ['Commerce'],
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            search: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { category?: string; search?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { category, search } = request.query;

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Query actual vendor database
      // For now, return sample vendors

      const vendors = [
        {
          id: 'vendor-1',
          name: 'NYC Furniture Outlet',
          category: 'FURNITURE',
          rating: 4.7,
          description: 'Quality furniture at affordable prices',
          logo: 'https://example.com/logo1.png',
          featured: true,
        },
        {
          id: 'vendor-2',
          name: 'Home Essentials Plus',
          category: 'HOME_GOODS',
          rating: 4.5,
          description: 'Everything you need for your new home',
          logo: 'https://example.com/logo2.png',
          featured: false,
        },
        {
          id: 'vendor-3',
          name: 'CleanStart Services',
          category: 'CLEANING',
          rating: 4.9,
          description: 'Professional move-in/move-out cleaning',
          logo: 'https://example.com/logo3.png',
          featured: true,
        },
      ];

      let filtered = vendors;
      if (category) {
        filtered = filtered.filter((v) => v.category === category);
      }
      if (search) {
        const searchLower = search.toLowerCase();
        filtered = filtered.filter(
          (v) =>
            v.name.toLowerCase().includes(searchLower) ||
            v.description.toLowerCase().includes(searchLower)
        );
      }

      return reply.send({ success: true, data: filtered });
    }
  );

  // Get vendor products
  app.get(
    '/marketplace/vendors/:vendorId/products',
    {
      schema: {
        description: 'Get products from a vendor',
        tags: ['Commerce'],
        params: {
          type: 'object',
          properties: { vendorId: { type: 'string' } },
          required: ['vendorId'],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { vendorId: string } }>, reply: FastifyReply) => {
      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Query actual product database

      const products = [
        {
          id: 'prod-1',
          name: 'Move-In Cleaning Package',
          description: 'Deep cleaning for your new apartment',
          price: 149.99,
          category: 'SERVICES',
        },
        {
          id: 'prod-2',
          name: 'Essential Kitchen Set',
          description: 'Pots, pans, and utensils to get started',
          price: 89.99,
          category: 'HOME_GOODS',
        },
      ];

      return reply.send({ success: true, data: products });
    }
  );

  // Place order
  app.post(
    '/marketplace/orders',
    {
      schema: {
        description: 'Place an order with a vendor',
        tags: ['Commerce'],
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

      const data = VendorOrderSchema.parse(request.body);

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Process order with vendor
      // Create order in database and process payment

      const order = {
        id: generateId('ord'),
        vendorId: data.vendorId,
        productId: data.productId,
        quantity: data.quantity,
        status: 'CONFIRMED',
        deliveryAddress: data.deliveryAddress,
        estimatedDelivery: data.deliveryDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}`,
      };

      return reply.status(201).send({
        success: true,
        data: order,
        message: 'Order placed successfully',
      });
    }
  );

  // === RENTERS INSURANCE ===

  // Get insurance quotes
  app.post(
    '/insurance/quotes',
    {
      schema: {
        description: 'Get renters insurance quotes',
        tags: ['Commerce'],
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

      const { leaseId, coverageAmount, deductible } = (request.body as {
        leaseId: string;
        coverageAmount: number;
        deductible: number;
      }) || {};

      const lease = await prisma.lease.findUnique({
        where: { id: leaseId },
        include: { unit: { include: { property: true } } },
      });

      if (!lease || lease.tenantId !== request.user.id) {
        throw new ForbiddenError('Access denied');
      }

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Integrate with Lemonade/other insurance APIs

      const monthlyPremium = (coverageAmount / 1000) * 0.5 + (1000 - deductible) * 0.01;

      const quotes = [
        {
          id: generateId('ins'),
          provider: 'Lemonade',
          monthlyPremium: Math.round(monthlyPremium * 100) / 100,
          coverageAmount,
          deductible,
          features: ['Personal property', 'Liability', 'Loss of use', 'Medical payments'],
          rating: 4.9,
        },
        {
          id: generateId('ins'),
          provider: 'State Farm',
          monthlyPremium: Math.round(monthlyPremium * 1.1 * 100) / 100,
          coverageAmount,
          deductible,
          features: ['Personal property', 'Liability', 'Loss of use', 'Identity theft'],
          rating: 4.7,
        },
      ];

      return reply.send({ success: true, data: quotes });
    }
  );

  // Purchase insurance
  app.post(
    '/insurance/purchase',
    {
      schema: {
        description: 'Purchase renters insurance',
        tags: ['Commerce'],
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

      const { quoteId, leaseId, paymentMethodId } = (request.body as {
        quoteId: string;
        leaseId: string;
        paymentMethodId: string;
      }) || {};

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Process insurance purchase

      const policy = await prisma.rentersInsurance.create({
        data: {
          id: generateId('rip'),
          leaseId,
          userId: request.user.id,
          provider: 'Lemonade',
          policyNumber: `POL-${Date.now().toString(36).toUpperCase()}`,
          coverageAmount: 30000,
          deductible: 500,
          monthlyPremium: 15.0,
          startDate: new Date(),
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
        },
      });

      return reply.status(201).send({
        success: true,
        data: policy,
        message: 'Insurance policy activated. Certificate sent to your email.',
      });
    }
  );

  // === GUARANTOR PRODUCTS ===

  // Get guarantor options
  app.get(
    '/guarantor/options',
    {
      schema: {
        description: 'Get guarantor service options',
        tags: ['Commerce'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Integrate with The Guarantors API

      const options = [
        {
          id: 'tg-basic',
          provider: 'The Guarantors',
          name: 'Basic Coverage',
          coverageMultiple: 1, // 1x rent
          feePercentage: 5,
          description: 'Standard guarantor coverage for 1x monthly rent',
        },
        {
          id: 'tg-premium',
          provider: 'The Guarantors',
          name: 'Premium Coverage',
          coverageMultiple: 2, // 2x rent
          feePercentage: 8,
          description: 'Enhanced coverage for 2x monthly rent',
        },
        {
          id: 'insurent',
          provider: 'Insurent',
          name: 'Institutional Guarantee',
          coverageMultiple: 2,
          feePercentage: 6.5,
          description: 'Institutional guarantor service',
        },
      ];

      return reply.send({ success: true, data: options });
    }
  );

  // Apply for guarantor
  app.post(
    '/guarantor/apply',
    {
      schema: {
        description: 'Apply for guarantor service',
        tags: ['Commerce'],
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

      const { applicationId, optionId, annualIncome } = (request.body as {
        applicationId: string;
        optionId: string;
        annualIncome: number;
      }) || {};

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Submit to guarantor provider

      const application = await prisma.guarantorProduct.create({
        data: {
          id: generateId('gua'),
          userId: request.user.id,
          applicationId,
          provider: optionId.startsWith('tg') ? 'THE_GUARANTORS' : 'INSURENT',
          status: 'PENDING',
          annualFee: (annualIncome * 12 * 0.005), // Approximate
        },
      });

      return reply.status(201).send({
        success: true,
        data: application,
        message: 'Guarantor application submitted. Decision typically within 24 hours.',
      });
    }
  );
}
