import { prisma } from '@realriches/database';
import {
  generatePaymentIdempotencyKey,
  createMockIdempotencyManager,
  getPartnerProvider,
  type IdempotencyManager,
} from '@realriches/revenue-engine';
import { generatePrefixedId, NotFoundError, ForbiddenError, ValidationError, AppError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import {
  isStripeConfigured,
  getOrCreateCustomer,
  createPaymentIntent,
  retrievePaymentMethod,
  attachPaymentMethod,
  redactStripeData,
} from '../../lib/stripe';

// =============================================================================
// Idempotency Manager (mock for now, use Redis in production)
// =============================================================================

let idempotencyManager: IdempotencyManager | null = null;

function getIdempotencyManager(): IdempotencyManager {
  if (!idempotencyManager) {
    // In production, this would be initialized with Redis from app context
    // For now, use the mock implementation
    idempotencyManager = createMockIdempotencyManager();
  }
  return idempotencyManager;
}

/**
 * Set the idempotency manager (for dependency injection in tests/production).
 */
export function setIdempotencyManager(manager: IdempotencyManager): void {
  idempotencyManager = manager;
}

const CreatePaymentSchema = z.object({
  leaseId: z.string(),
  amount: z.number().min(0),
  type: z.enum(['rent', 'security_deposit', 'late_fee', 'other']),
  dueDate: z.string().datetime(),
  description: z.string().optional(),
});

const ProcessPaymentSchema = z.object({
  paymentMethodId: z.string(),
});

const AddPaymentMethodSchema = z.object({
  type: z.enum(['card', 'bank_account']),
  token: z.string(), // Stripe/Plaid token
  isDefault: z.boolean().default(false),
});

const DepositAlternativeSchema = z.object({
  leaseId: z.string(),
  provider: z.enum(['leaselock', 'rhino', 'jetty']),
  coverageAmount: z.number().min(0),
});

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  // List payments
  app.get(
    '/',
    {
      schema: {
        description: 'List payments for current user',
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            leaseId: { type: 'string' },
            status: { type: 'string' },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { leaseId?: string; status?: string; page?: number; limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { leaseId, status, page = 1, limit = 20 } = request.query;

      const where: Record<string, unknown> = {};
      if (leaseId) where.leaseId = leaseId;
      if (status) where.status = status;

      // Filter by user role
      if (request.user.role === 'tenant') {
        where.lease = { tenantId: request.user.id };
      } else if (request.user.role === 'landlord') {
        where.lease = { unit: { property: { ownerId: request.user.id } } };
      }

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          include: {
            lease: {
              select: {
                id: true,
                unit: { select: { unitNumber: true, property: { select: { name: true } } } },
              },
            },
          },
          orderBy: { dueDate: 'desc' },
        }),
        prisma.payment.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: payments,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }
  );

  // Get payment by ID
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get payment details',
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const payment = await prisma.payment.findUnique({
        where: { id: request.params.id },
        include: {
          lease: {
            include: {
              unit: { include: { property: true } },
              tenant: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });

      if (!payment) {
        throw new NotFoundError('Payment not found');
      }

      return reply.send({ success: true, data: payment });
    }
  );

  // Create payment (landlord/admin)
  app.post(
    '/',
    {
      schema: {
        description: 'Create a payment request',
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = CreatePaymentSchema.parse(request.body);

      // Verify lease ownership
      const lease = await prisma.lease.findUnique({
        where: { id: data.leaseId },
        include: { unit: { include: { property: true } } },
      });

      if (!lease) {
        throw new NotFoundError('Lease not found');
      }

      if (lease.unit.property.ownerId !== request.user.id && request.user.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      const payment = await prisma.payment.create({
        data: {
          id: generatePrefixedId('pay'),
          ...data,
          amount: data.amount,
          dueDate: new Date(data.dueDate),
          status: 'pending',
        },
      });

      return reply.status(201).send({ success: true, data: payment });
    }
  );

  // Process payment (tenant)
  app.post(
    '/:id/process',
    {
      schema: {
        description: 'Process a payment',
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        headers: {
          type: 'object',
          properties: {
            'idempotency-key': { type: 'string', description: 'Optional idempotency key' },
          },
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

      const { paymentMethodId } = ProcessPaymentSchema.parse(request.body);

      // Check idempotency - use provided key or generate from payment ID + user
      const providedKey = request.headers['idempotency-key'] as string | undefined;
      const idempotencyKey = providedKey || generatePaymentIdempotencyKey(
        request.params.id,
        `process:${request.user.id}`
      );

      const manager = getIdempotencyManager();
      const idempotencyCheck = await manager.checkAndLock(idempotencyKey);

      if (!idempotencyCheck.isNew) {
        // Request already processed - return cached result
        request.log.info({ idempotencyKey, status: idempotencyCheck.existingRecord?.status }, 'Idempotent request - returning cached result');

        if (idempotencyCheck.existingRecord?.status === 'completed') {
          const cachedPayment = await prisma.payment.findUnique({
            where: { id: request.params.id },
          });
          return reply.send({
            success: true,
            data: cachedPayment,
            idempotent: true,
          });
        } else if (idempotencyCheck.existingRecord?.status === 'failed') {
          throw new AppError(
            idempotencyCheck.existingRecord.error || 'Previous request failed',
            'PAYMENT_FAILED',
            400
          );
        } else {
          // Still processing
          return reply.status(409).send({
            success: false,
            error: { code: 'REQUEST_IN_PROGRESS', message: 'Payment is already being processed' },
          });
        }
      }

      const payment = await prisma.payment.findUnique({
        where: { id: request.params.id },
        include: { lease: true },
      });

      if (!payment) {
        await manager.recordFailed(idempotencyKey, '', 'Payment not found');
        throw new NotFoundError('Payment not found');
      }

      if (payment.lease.tenantId !== request.user.id) {
        await manager.recordFailed(idempotencyKey, '', 'Access denied');
        throw new ForbiddenError('Access denied');
      }

      if (payment.status !== 'pending') {
        await manager.recordFailed(idempotencyKey, '', 'Payment is not in pending status');
        throw new ValidationError('Payment is not in pending status');
      }

      // Verify payment method
      const paymentMethod = await prisma.paymentMethod.findUnique({
        where: { id: paymentMethodId },
      });

      if (!paymentMethod || paymentMethod.userId !== request.user.id) {
        await manager.recordFailed(idempotencyKey, '', 'Invalid payment method');
        throw new ValidationError('Invalid payment method');
      }

      // Check if Stripe is configured
      if (!isStripeConfigured()) {
        await manager.recordFailed(idempotencyKey, '', 'Payment processing not configured');
        throw new AppError(
          'Payment processing is not configured',
          'PAYMENT_PROCESSING_UNAVAILABLE',
          503
        );
      }

      // Get the user with their Stripe customer ID from metadata
      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { id: true, email: true, firstName: true, lastName: true, metadata: true },
      });

      if (!user) {
        await manager.recordFailed(idempotencyKey, '', 'User not found');
        throw new NotFoundError('User not found');
      }

      // Get or create Stripe customer
      const existingCustomerId = (user.metadata as Record<string, unknown> | null)?.stripeCustomerId as string | undefined;
      const stripeCustomerId = await getOrCreateCustomer(
        user.id,
        user.email,
        `${user.firstName} ${user.lastName}`,
        existingCustomerId
      );

      // Store Stripe customer ID in user metadata if new
      if (!existingCustomerId) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            metadata: {
              ...(user.metadata as Record<string, unknown> || {}),
              stripeCustomerId,
            },
          },
        });
      }

      // Verify the payment method has a Stripe payment method ID
      if (!paymentMethod.stripePaymentMethodId) {
        await manager.recordFailed(idempotencyKey, '', 'Payment method not linked to Stripe');
        throw new ValidationError('Payment method not linked to Stripe');
      }

      // Record processing started
      await manager.recordProcessing(idempotencyKey, payment.id);

      // Update payment to processing status
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'processing' },
      });

      try {
        // Create and confirm PaymentIntent with Stripe
        const paymentIntent = await createPaymentIntent({
          amount: Math.round(Number(payment.amount) * 100), // Convert to cents
          currency: 'usd',
          customerId: stripeCustomerId,
          paymentMethodId: paymentMethod.stripePaymentMethodId,
          paymentId: payment.id,
          description: `Payment for ${payment.type} - ${payment.id}`,
          confirm: true,
        });

        // Log redacted payment intent for debugging
        request.log.info({ paymentIntent: redactStripeData(paymentIntent) }, 'PaymentIntent created');

        // Handle the payment intent status
        if (paymentIntent.status === 'succeeded') {
          // Payment succeeded immediately
          const updatedPayment = await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: 'completed',
              paidAt: new Date(),
              processedAt: new Date(),
              stripePaymentIntentId: paymentIntent.id,
              stripeChargeId: paymentIntent.latest_charge as string | undefined,
            },
          });

          await manager.recordCompleted(idempotencyKey, payment.id, { status: 'completed' });
          return reply.send({ success: true, data: updatedPayment });
        } else if (paymentIntent.status === 'requires_action') {
          // Payment requires additional action (e.g., 3D Secure)
          const updatedPayment = await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: 'pending',
              stripePaymentIntentId: paymentIntent.id,
            },
          });

          await manager.recordCompleted(idempotencyKey, payment.id, { status: 'requires_action' });
          return reply.send({
            success: true,
            data: updatedPayment,
            requiresAction: true,
            clientSecret: paymentIntent.client_secret,
          });
        } else {
          // Payment is processing or has other status
          const updatedPayment = await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: 'processing',
              stripePaymentIntentId: paymentIntent.id,
            },
          });

          await manager.recordCompleted(idempotencyKey, payment.id, { status: 'processing' });
          return reply.send({ success: true, data: updatedPayment });
        }
      } catch (error) {
        // Payment failed - update status and record error
        request.log.error({ error: redactStripeData(error) }, 'Payment processing failed');

        const errorMessage = error instanceof Error ? error.message : 'Payment processing failed';

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'failed',
            lastError: errorMessage,
            retryCount: { increment: 1 },
          },
        });

        await manager.recordFailed(idempotencyKey, payment.id, errorMessage);
        throw new AppError(errorMessage, 'PAYMENT_FAILED', 400);
      }
    }
  );

  // List payment methods
  app.get(
    '/methods',
    {
      schema: {
        description: 'List payment methods for current user',
        tags: ['Payments'],
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

      const methods = await prisma.paymentMethod.findMany({
        where: { userId: request.user.id, isActive: true },
        orderBy: { isDefault: 'desc' },
      });

      return reply.send({ success: true, data: methods });
    }
  );

  // Add payment method
  app.post(
    '/methods',
    {
      schema: {
        description: 'Add a payment method',
        tags: ['Payments'],
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

      const data = AddPaymentMethodSchema.parse(request.body);

      // Check if Stripe is configured
      if (!isStripeConfigured()) {
        throw new AppError(
          'Payment processing is not configured',
          'PAYMENT_PROCESSING_UNAVAILABLE',
          503
        );
      }

      // Retrieve and validate the payment method from Stripe
      // The token should be a Stripe PaymentMethod ID (pm_xxx) created on the frontend
      let stripePaymentMethod;
      try {
        stripePaymentMethod = await retrievePaymentMethod(data.token);
      } catch (error) {
        request.log.error({ error: redactStripeData(error) }, 'Failed to retrieve payment method');
        throw new ValidationError('Invalid payment method token');
      }

      // Validate the payment method type matches what was requested
      const stripeType = stripePaymentMethod.type;
      const expectedType = data.type === 'card' ? 'card' : 'us_bank_account';
      if (stripeType !== expectedType && stripeType !== 'card') {
        throw new ValidationError(`Payment method type mismatch: expected ${data.type}, got ${stripeType}`);
      }

      // Get or create Stripe customer for the user
      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { id: true, email: true, firstName: true, lastName: true, metadata: true },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      const existingCustomerId = (user.metadata as Record<string, unknown> | null)?.stripeCustomerId as string | undefined;
      const stripeCustomerId = await getOrCreateCustomer(
        user.id,
        user.email,
        `${user.firstName} ${user.lastName}`,
        existingCustomerId
      );

      // Store Stripe customer ID if new
      if (!existingCustomerId) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            metadata: {
              ...(user.metadata as Record<string, unknown> || {}),
              stripeCustomerId,
            },
          },
        });
      }

      // Attach the payment method to the customer if not already attached
      if (stripePaymentMethod.customer !== stripeCustomerId) {
        try {
          await attachPaymentMethod(data.token, stripeCustomerId);
        } catch (error) {
          request.log.error({ error: redactStripeData(error) }, 'Failed to attach payment method');
          throw new ValidationError('Failed to attach payment method to customer');
        }
      }

      // Extract card or bank account details
      let last4 = '****';
      let cardBrand: string | undefined;
      let cardExpMonth: number | undefined;
      let cardExpYear: number | undefined;
      let bankName: string | undefined;

      if (stripePaymentMethod.card) {
        last4 = stripePaymentMethod.card.last4;
        cardBrand = stripePaymentMethod.card.brand;
        cardExpMonth = stripePaymentMethod.card.exp_month;
        cardExpYear = stripePaymentMethod.card.exp_year;
      } else if (stripePaymentMethod.us_bank_account) {
        last4 = stripePaymentMethod.us_bank_account.last4 || '****';
        bankName = stripePaymentMethod.us_bank_account.bank_name || undefined;
      }

      // If setting as default, unset other defaults
      if (data.isDefault) {
        await prisma.paymentMethod.updateMany({
          where: { userId: request.user.id },
          data: { isDefault: false },
        });
      }

      const method = await prisma.paymentMethod.create({
        data: {
          id: generatePrefixedId('pm'),
          userId: request.user.id,
          type: data.type,
          provider: 'stripe',
          stripePaymentMethodId: data.token,
          last4,
          cardBrand,
          cardExpMonth,
          cardExpYear,
          bankName,
          isDefault: data.isDefault,
          isVerified: true,
          isActive: true,
        },
      });

      request.log.info({ paymentMethodId: method.id }, 'Payment method added');
      return reply.status(201).send({ success: true, data: method });
    }
  );

  // Set up recurring payment
  app.post(
    '/recurring',
    {
      schema: {
        description: 'Set up recurring payment (autopay)',
        tags: ['Payments'],
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

      const { leaseId, paymentMethodId, dayOfMonth } = (request.body as {
        leaseId: string;
        paymentMethodId: string;
        dayOfMonth: number;
      }) || {};

      const lease = await prisma.lease.findUnique({
        where: { id: leaseId },
      });

      if (!lease || lease.tenantId !== request.user.id) {
        throw new ForbiddenError('Access denied');
      }

      const recurring = await prisma.recurringPayment.create({
        data: {
          id: generatePrefixedId('rp'),
          leaseId,
          paymentMethodId,
          amount: Number(lease.monthlyRent),
          frequency: 'monthly',
          dayOfMonth: dayOfMonth || 1,
          isActive: true,
          nextPaymentDate: getNextPaymentDate(dayOfMonth || 1),
        },
      });

      return reply.status(201).send({ success: true, data: recurring });
    }
  );

  // Deposit alternatives
  app.post(
    '/deposit-alternative',
    {
      schema: {
        description: 'Apply for deposit alternative (LeaseLock, Rhino, Jetty)',
        tags: ['Payments'],
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

      const data = DepositAlternativeSchema.parse(request.body);

      const lease = await prisma.lease.findUnique({
        where: { id: data.leaseId },
        include: {
          unit: {
            include: {
              property: true,
            },
          },
          tenant: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
        },
      });

      if (!lease || lease.tenantId !== request.user.id) {
        throw new ForbiddenError('Access denied');
      }

      // Map provider string to partner provider enum
      const providerMap: Record<string, 'leaselock' | 'rhino' | 'jetty'> = {
        leaselock: 'leaselock',
        rhino: 'rhino',
        jetty: 'jetty',
      };
      const partnerProvider = providerMap[data.provider];

      if (!partnerProvider) {
        throw new ValidationError(`Unknown deposit alternative provider: ${data.provider}`);
      }

      try {
        // Get the partner provider adapter
        const provider = getPartnerProvider(partnerProvider);

        // Check if the provider is available
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          request.log.warn({ provider: data.provider }, 'Partner provider not available');
          // Fall through to create pending application - will be processed async
        }

        // Build quote request
        const quoteRequest = {
          productType: 'deposit_alternative' as const,
          provider: partnerProvider,
          applicantId: request.user.id,
          leaseId: data.leaseId,
          propertyId: lease.unit.propertyId,
          unitId: lease.unitId,
          coverageAmount: data.coverageAmount,
          term: calculateLeaseTerm(lease.startDate, lease.endDate),
          startDate: new Date(lease.startDate),
          applicantInfo: {
            firstName: lease.tenant.firstName,
            lastName: lease.tenant.lastName,
            email: lease.tenant.email,
            phone: lease.tenant.phone || undefined,
          },
          propertyInfo: {
            address: lease.unit.property.address,
            city: lease.unit.property.city,
            state: lease.unit.property.state,
            zip: lease.unit.property.zip,
            monthlyRent: Number(lease.monthlyRent),
            propertyType: lease.unit.property.type || 'residential',
          },
        };

        // Request quote from partner
        let quote;
        let quoteStatus: 'pending' | 'approved' | 'declined' = 'pending';
        let monthlyPremium = data.coverageAmount * 0.02; // Default 2% estimate
        let providerQuoteId: string | undefined;

        if (isAvailable) {
          try {
            quote = await provider.getQuote(quoteRequest);
            request.log.info(
              { provider: data.provider, quoteId: quote.quoteId, status: quote.status },
              'Received quote from partner'
            );

            if (quote.status === 'success') {
              quoteStatus = 'approved';
              monthlyPremium = quote.premium || monthlyPremium;
              providerQuoteId = quote.providerQuoteId;
            } else if (quote.status === 'declined') {
              quoteStatus = 'declined';
            }
            // 'pending_review' and 'error' stay as 'pending'
          } catch (quoteError) {
            request.log.error(
              { error: quoteError, provider: data.provider },
              'Failed to get quote from partner - application will be processed async'
            );
            // Continue with pending status
          }
        }

        // Create deposit alternative record
        const depositAlt = await prisma.depositAlternative.create({
          data: {
            id: generatePrefixedId('da'),
            leaseId: data.leaseId,
            userId: request.user.id,
            provider: data.provider,
            coverageAmount: data.coverageAmount,
            monthlyPremium,
            status: quoteStatus,
            metadata: {
              quoteId: quote?.quoteId,
              providerQuoteId,
              commissionRate: quote?.commissionRate,
              commissionAmount: quote?.commissionAmount,
              validUntil: quote?.validUntil?.toISOString(),
              declineReason: quote?.declineReason,
            },
          },
        });

        const responseMessage =
          quoteStatus === 'approved'
            ? `Approved! Monthly premium: $${monthlyPremium.toFixed(2)}`
            : quoteStatus === 'declined'
              ? `Application declined: ${quote?.declineReason || 'See provider for details'}`
              : 'Application submitted. You will receive a decision shortly.';

        return reply.status(201).send({
          success: true,
          data: {
            ...depositAlt,
            quote: quote
              ? {
                  premium: quote.premium,
                  premiumFrequency: quote.premiumFrequency,
                  validUntil: quote.validUntil,
                }
              : undefined,
          },
          message: responseMessage,
        });
      } catch (error) {
        request.log.error({ error, provider: data.provider }, 'Deposit alternative application error');

        // Create a pending application even on error
        const depositAlt = await prisma.depositAlternative.create({
          data: {
            id: generatePrefixedId('da'),
            leaseId: data.leaseId,
            userId: request.user.id,
            provider: data.provider,
            coverageAmount: data.coverageAmount,
            monthlyPremium: data.coverageAmount * 0.02,
            status: 'pending',
            metadata: {
              error: error instanceof Error ? error.message : 'Unknown error',
              errorAt: new Date().toISOString(),
            },
          },
        });

        return reply.status(201).send({
          success: true,
          data: depositAlt,
          message: 'Application submitted. Processing may take additional time.',
        });
      }
    }
  );

  // Rent rewards
  app.get(
    '/rewards',
    {
      schema: {
        description: 'Get rent rewards account',
        tags: ['Payments'],
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

      let account = await prisma.rentRewardsAccount.findUnique({
        where: { userId: request.user.id },
        include: {
          transactions: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      });

      if (!account) {
        account = await prisma.rentRewardsAccount.create({
          data: {
            id: generatePrefixedId('rra'),
            userId: request.user.id,
            pointsBalance: 0,
            lifetimePoints: 0,
            tier: 'bronze',
          },
          include: {
            transactions: { orderBy: { createdAt: 'desc' }, take: 10 },
          },
        });
      }

      return reply.send({ success: true, data: account });
    }
  );
}

function getNextPaymentDate(dayOfMonth: number): Date {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (next <= now) {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

/**
 * Calculate lease term in months from start and end dates.
 */
function calculateLeaseTerm(startDate: Date, endDate: Date): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());

  // Round to nearest month (minimum 1)
  return Math.max(1, Math.round(months));
}
