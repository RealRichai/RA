import { prisma } from '@realriches/database';
import { generatePrefixedId, NotFoundError, ForbiddenError, ValidationError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

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

      const payment = await prisma.payment.findUnique({
        where: { id: request.params.id },
        include: { lease: true },
      });

      if (!payment) {
        throw new NotFoundError('Payment not found');
      }

      if (payment.lease.tenantId !== request.user.id) {
        throw new ForbiddenError('Access denied');
      }

      if (payment.status !== 'pending') {
        throw new ValidationError('Payment is not in pending status');
      }

      // Verify payment method
      const paymentMethod = await prisma.paymentMethod.findUnique({
        where: { id: paymentMethodId },
      });

      if (!paymentMethod || paymentMethod.userId !== request.user.id) {
        throw new ValidationError('Invalid payment method');
      }

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Integrate with Stripe for payment processing
      // const stripeResult = await stripe.paymentIntents.create({ ... });

      // Simulate successful payment
      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'completed',
          paidAt: new Date(),
          paymentMethodId,
          transactionId: generatePrefixedId('txn'),
        },
      });

      return reply.send({ success: true, data: updatedPayment });
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

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Validate token with Stripe/Plaid
      // const stripeMethod = await stripe.paymentMethods.retrieve(data.token);

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
          externalId: data.token,
          last4: '4242', // Would come from Stripe
          isDefault: data.isDefault,
          isActive: true,
        },
      });

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
        description: 'Apply for deposit alternative (LeaseLock, Rhino)',
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
      });

      if (!lease || lease.tenantId !== request.user.id) {
        throw new ForbiddenError('Access denied');
      }

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Integrate with LeaseLock/Rhino API
      // const quote = await leaselock.getQuote({ ... });

      const depositAlt = await prisma.depositAlternative.create({
        data: {
          id: generatePrefixedId('da'),
          leaseId: data.leaseId,
          userId: request.user.id,
          provider: data.provider,
          coverageAmount: data.coverageAmount,
          monthlyPremium: data.coverageAmount * 0.02, // ~2% monthly premium estimate
          status: 'pending',
        },
      });

      return reply.status(201).send({
        success: true,
        data: depositAlt,
        message: 'Application submitted. You will receive a decision shortly.',
      });
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
