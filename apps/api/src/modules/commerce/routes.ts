/**
 * Commerce Routes
 *
 * Endpoints for commerce services:
 * - Utilities concierge
 * - Moving services
 * - Renters insurance
 * - Guarantor products
 * - Vendor marketplace
 *
 * All endpoints use the CommerceService which orchestrates
 * provider integrations with fallback to mock providers.
 */

import { generatePrefixedId, logger } from '@realriches/utils';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { CommerceService } from './commerce.service';
import { getCommerceProviderRegistry } from './providers';
import type { Address, MoveSize, OrderType, UtilityType } from './providers/provider.types';

// =============================================================================
// Request Schemas
// =============================================================================

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

const MovingBookSchema = z.object({
  quoteId: z.string(),
  paymentMethodId: z.string(),
  specialInstructions: z.string().optional(),
});

const InsuranceQuoteSchema = z.object({
  leaseId: z.string(),
  coverageAmount: z.number().int().min(5000).max(100000),
  liabilityCoverage: z.number().int().min(100000).max(500000).default(100000),
  deductible: z.number().int().min(100).max(2500).default(500),
});

const InsurancePurchaseSchema = z.object({
  quoteId: z.string(),
  leaseId: z.string(),
  paymentMethodId: z.string(),
  autoRenew: z.boolean().optional(),
});

const GuarantorApplySchema = z.object({
  applicationId: z.string(),
  leaseId: z.string(),
  optionId: z.string(),
  monthlyRent: z.number().int().min(500),
  annualIncome: z.number().int().min(0),
});

const VendorOrderSchema = z.object({
  vendorId: z.string(),
  productId: z.string(),
  productName: z.string(),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().int().min(0),
  deliveryAddress: z.object({
    street: z.string(),
    unit: z.string().optional(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
  }),
  deliveryDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

const OrderConfirmSchema = z.object({
  orderId: z.string(),
  paymentIntentId: z.string(),
  idempotencyKey: z.string(),
});

// Type exports for Zod schemas
type MovingBookInput = z.infer<typeof MovingBookSchema>;
type InsurancePurchaseInput = z.infer<typeof InsurancePurchaseSchema>;
type GuarantorApplyInput = z.infer<typeof GuarantorApplySchema>;

// =============================================================================
// Helper Functions
// =============================================================================

function sendServiceResponse<T>(
  reply: FastifyReply,
  response: { success: boolean; data?: T; error?: { code: string; message: string }; meta?: any },
  successStatus = 200
): FastifyReply {
  if (!response.success) {
    const statusCode = response.error?.code === 'NOT_FOUND' ? 404
      : response.error?.code === 'FORBIDDEN' ? 403
      : response.error?.code === 'AUTH_REQUIRED' ? 401
      : response.error?.code === 'INVALID_STATE' ? 409
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

export async function commerceRoutes(app: FastifyInstance): Promise<void> {
  const commerceService = new CommerceService(app);

  // ===========================================================================
  // Provider Status (Admin/Debug)
  // ===========================================================================

  app.get(
    '/status',
    {
      schema: {
        description: 'Get commerce provider status',
        tags: ['Commerce'],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const status = commerceService.getProviderStatus();
      return reply.send({ success: true, data: status });
    }
  );

  // ===========================================================================
  // UTILITIES CONCIERGE
  // ===========================================================================

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
            utilityType: { type: 'string', enum: ['ELECTRIC', 'GAS', 'WATER', 'INTERNET', 'CABLE', 'TRASH'] },
          },
          required: ['zipCode'],
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { zipCode: string; utilityType?: UtilityType };
      }>,
      reply: FastifyReply
    ) => {
      const { zipCode, utilityType } = request.query;
      const response = await commerceService.getUtilityProviders({ zipCode, utilityType });
      return sendServiceResponse(reply, response);
    }
  );

  app.post(
    '/utilities/setup',
    {
      schema: {
        description: 'Request utility setup assistance via concierge service',
        tags: ['Commerce'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = UtilitySetupSchema.parse(request.body);
      const response = await commerceService.createUtilitySetup(request, {
        leaseId: data.leaseId,
        utilityType: data.utilityType as UtilityType,
        provider: data.provider,
        transferDate: new Date(data.transferDate),
      });
      return sendServiceResponse(reply, response, 201);
    }
  );

  // ===========================================================================
  // MOVING SERVICES
  // ===========================================================================

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
      const data = MovingQuoteSchema.parse(request.body);
      const response = await commerceService.getMovingQuotes(request, {
        leaseId: data.leaseId,
        originAddress: data.originAddress as Address,
        moveDate: new Date(data.moveDate),
        estimatedItems: data.estimatedItems as MoveSize,
        needsPacking: data.needsPacking,
        hasElevator: data.hasElevator,
        floorNumber: data.floorNumber,
      });
      return sendServiceResponse(reply, response);
    }
  );

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
      const data: MovingBookInput = MovingBookSchema.parse(request.body);
      const response = await commerceService.bookMovingService(request, data);
      return sendServiceResponse(reply, response, 201);
    }
  );

  // ===========================================================================
  // VENDOR MARKETPLACE
  // ===========================================================================

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
            serviceArea: { type: 'string' },
            minRating: { type: 'number' },
            limit: { type: 'number', default: 20 },
            offset: { type: 'number', default: 0 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          category?: string;
          search?: string;
          serviceArea?: string;
          minRating?: number;
          limit?: number;
          offset?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const response = await commerceService.listVendors(request.query);
      return sendServiceResponse(reply, response);
    }
  );

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
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            limit: { type: 'number' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { vendorId: string };
        Querystring: { category?: string; limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      const response = await commerceService.getVendorProducts(
        request.params.vendorId,
        request.query
      );
      return sendServiceResponse(reply, response);
    }
  );

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
      const idempotencyKey = data.idempotencyKey || generatePrefixedId('idem');

      const response = await commerceService.createOrder(request, {
        userId: request.user.id,
        type: 'VENDOR_PRODUCT' as OrderType,
        items: [
          {
            productId: data.productId,
            productName: data.productName,
            quantity: data.quantity,
            unitPrice: data.unitPrice,
            totalPrice: data.unitPrice * data.quantity,
          },
        ],
        vendorId: data.vendorId,
        deliveryAddress: data.deliveryAddress as Address,
        deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : undefined,
        idempotencyKey,
        notes: data.notes,
      });

      return sendServiceResponse(reply, response, 201);
    }
  );

  app.post(
    '/marketplace/orders/:orderId/confirm',
    {
      schema: {
        description: 'Confirm an order with payment',
        tags: ['Commerce'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { orderId: string } }>,
      reply: FastifyReply
    ) => {
      const body = OrderConfirmSchema.parse(request.body);
      const response = await commerceService.confirmOrder(request, {
        orderId: request.params.orderId,
        paymentIntentId: body.paymentIntentId,
        idempotencyKey: body.idempotencyKey,
      });
      return sendServiceResponse(reply, response);
    }
  );

  app.post(
    '/marketplace/orders/:orderId/cancel',
    {
      schema: {
        description: 'Cancel an order',
        tags: ['Commerce'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { orderId: string }; Body: { reason?: string } }>,
      reply: FastifyReply
    ) => {
      const reason = (request.body as { reason?: string })?.reason;
      const response = await commerceService.cancelOrder(
        request,
        request.params.orderId,
        reason
      );
      return sendServiceResponse(reply, response);
    }
  );

  app.get(
    '/marketplace/orders/:orderId',
    {
      schema: {
        description: 'Get order details',
        tags: ['Commerce'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { orderId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const response = await commerceService.getOrder(
        request.params.orderId,
        request.user.id
      );
      return sendServiceResponse(reply, response);
    }
  );

  // ===========================================================================
  // RENTERS INSURANCE
  // ===========================================================================

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
      const data = InsuranceQuoteSchema.parse(request.body);
      const response = await commerceService.getInsuranceQuotes(request, {
        leaseId: data.leaseId,
        coverageAmount: data.coverageAmount,
        liabilityCoverage: data.liabilityCoverage,
        deductible: data.deductible,
      });
      return sendServiceResponse(reply, response);
    }
  );

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
      const data: InsurancePurchaseInput = InsurancePurchaseSchema.parse(request.body);
      const response = await commerceService.purchaseInsurance(request, data);
      return sendServiceResponse(reply, response, 201);
    }
  );

  // ===========================================================================
  // GUARANTOR PRODUCTS
  // ===========================================================================

  app.get(
    '/guarantor/options',
    {
      schema: {
        description: 'Get guarantor service options',
        tags: ['Commerce'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            monthlyRent: { type: 'number' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { monthlyRent?: number } }>,
      reply: FastifyReply
    ) => {
      const monthlyRent = request.query.monthlyRent || 2000;
      const response = await commerceService.getGuarantorOptions(monthlyRent);
      return sendServiceResponse(reply, response);
    }
  );

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
      const data: GuarantorApplyInput = GuarantorApplySchema.parse(request.body);
      const response = await commerceService.submitGuarantorApplication(request, data);
      return sendServiceResponse(reply, response, 201);
    }
  );

  app.get(
    '/guarantor/applications/:applicationId/status',
    {
      schema: {
        description: 'Poll guarantor application status',
        tags: ['Commerce'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { applicationId: string } }>,
      reply: FastifyReply
    ) => {
      const response = await commerceService.pollGuarantorStatus(
        request.params.applicationId
      );
      return sendServiceResponse(reply, response);
    }
  );

  // ===========================================================================
  // PROVIDER WEBHOOKS
  // ===========================================================================

  // Lemonade Insurance Webhook
  app.post(
    '/webhooks/insurance/lemonade',
    {
      schema: {
        description: 'Webhook endpoint for Lemonade insurance status updates',
        tags: ['Commerce', 'Webhooks'],
      },
      config: {
        rawBody: true, // Preserve raw body for signature verification
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const registry = getCommerceProviderRegistry();
      const lemonadeAdapter = registry.getLemonadeAdapter();

      if (!lemonadeAdapter) {
        logger.warn({ msg: 'lemonade_webhook_received_but_adapter_not_configured' });
        return reply.status(200).send({ received: true, processed: false });
      }

      // Get signature from header (Lemonade uses X-Lemonade-Signature)
      const signature = request.headers['x-lemonade-signature'] as string;
      if (!signature) {
        logger.warn({ msg: 'lemonade_webhook_missing_signature' });
        return reply.status(401).send({ error: 'Missing signature' });
      }

      // Get raw body for signature verification
      const rawBody = (request as any).rawBody || JSON.stringify(request.body);

      try {
        const result = await lemonadeAdapter.processWebhook(rawBody, signature);

        if (!result.valid) {
          logger.warn({ msg: 'lemonade_webhook_invalid' });
          return reply.status(401).send({ error: 'Invalid signature' });
        }

        // Log successful webhook processing
        logger.info({
          msg: 'lemonade_webhook_processed',
          eventType: result.event?.type,
          policyId: result.event?.policyId,
        });

        // Acknowledge receipt
        return reply.status(200).send({
          received: true,
          processed: true,
          eventType: result.event?.type,
        });
      } catch (error) {
        logger.error({
          msg: 'lemonade_webhook_processing_error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return reply.status(500).send({ error: 'Webhook processing failed' });
      }
    }
  );

  // The Guarantors Webhook
  app.post(
    '/webhooks/guarantor/the-guarantors',
    {
      schema: {
        description: 'Webhook endpoint for The Guarantors application status updates',
        tags: ['Commerce', 'Webhooks'],
      },
      config: {
        rawBody: true,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const registry = getCommerceProviderRegistry();
      const tgAdapter = registry.getTheGuarantorsAdapter();

      if (!tgAdapter) {
        logger.warn({ msg: 'the_guarantors_webhook_received_but_adapter_not_configured' });
        return reply.status(200).send({ received: true, processed: false });
      }

      // Get signature from header (The Guarantors uses X-TG-Signature)
      const signature = request.headers['x-tg-signature'] as string;
      if (!signature) {
        logger.warn({ msg: 'the_guarantors_webhook_missing_signature' });
        return reply.status(401).send({ error: 'Missing signature' });
      }

      const rawBody = (request as any).rawBody || JSON.stringify(request.body);

      try {
        const result = await tgAdapter.processWebhook(rawBody, signature);

        if (!result.valid) {
          logger.warn({ msg: 'the_guarantors_webhook_invalid' });
          return reply.status(401).send({ error: 'Invalid signature' });
        }

        logger.info({
          msg: 'the_guarantors_webhook_processed',
          eventType: result.event?.type,
          applicationId: result.event?.applicationId,
        });

        return reply.status(200).send({
          received: true,
          processed: true,
          eventType: result.event?.type,
        });
      } catch (error) {
        logger.error({
          msg: 'the_guarantors_webhook_processing_error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return reply.status(500).send({ error: 'Webhook processing failed' });
      }
    }
  );
}
