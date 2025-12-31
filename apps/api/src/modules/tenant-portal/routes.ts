/**
 * Tenant Portal API
 *
 * Self-service endpoints for tenants to pay rent, submit maintenance requests,
 * view documents, and manage their profile.
 */

import { prisma } from '@realriches/database';
import { generatePrefixedId, logger, AppError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

interface TenantDashboard {
  lease: {
    id: string;
    propertyName: string;
    unitNumber: string;
    address: string;
    monthlyRent: number;
    startDate: string;
    endDate: string;
    status: string;
    daysRemaining: number;
  } | null;
  balance: {
    currentDue: number;
    pastDue: number;
    nextPaymentDate: string | null;
    nextPaymentAmount: number;
  };
  maintenanceRequests: {
    open: number;
    inProgress: number;
    completed: number;
  };
  documents: {
    pendingSignature: number;
    total: number;
  };
  announcements: Array<{
    id: string;
    title: string;
    message: string;
    createdAt: string;
  }>;
}

interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_account';
  last4: string;
  brand?: string;
  bankName?: string;
  isDefault: boolean;
  expiresAt?: string;
}

interface RentPaymentRequest {
  amount: number;
  paymentMethodId: string;
  note?: string;
}

// =============================================================================
// Prisma Storage (replaced in-memory Maps)
// =============================================================================

// paymentMethods and announcements now use Prisma models:
// - prisma.paymentMethod
// - prisma.propertyAnnouncement

// =============================================================================
// Schemas
// =============================================================================

const SubmitMaintenanceSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(2000),
  category: z.enum(['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'pest', 'safety', 'other']),
  priority: z.enum(['low', 'normal', 'high', 'emergency']).default('normal'),
  preferredSchedule: z.string().optional(),
  images: z.array(z.string().url()).max(5).optional(),
  allowEntry: z.boolean().default(true),
  petInfo: z.string().optional(),
});

const PayRentSchema = z.object({
  amount: z.number().min(1),
  paymentMethodId: z.string(),
  note: z.string().max(200).optional(),
});

const AddPaymentMethodSchema = z.object({
  type: z.enum(['card', 'bank_account']),
  token: z.string(), // Stripe/Plaid token
  isDefault: z.boolean().default(false),
});

const UpdateProfileSchema = z.object({
  phone: z.string().optional(),
  emergencyContact: z.object({
    name: z.string(),
    phone: z.string(),
    relationship: z.string(),
  }).optional(),
  vehicles: z.array(z.object({
    make: z.string(),
    model: z.string(),
    color: z.string(),
    licensePlate: z.string(),
  })).optional(),
  pets: z.array(z.object({
    type: z.string(),
    name: z.string(),
    breed: z.string().optional(),
    weight: z.number().optional(),
  })).optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

async function getTenantLease(userId: string) {
  return prisma.lease.findFirst({
    where: {
      tenantId: userId,
      status: { in: ['active', 'pending_signature'] },
    },
    include: {
      unit: {
        include: {
          property: true,
        },
      },
    },
    orderBy: { startDate: 'desc' },
  });
}

async function getTenantBalance(leaseId: string): Promise<{
  currentDue: number;
  pastDue: number;
  nextPaymentDate: string | null;
  nextPaymentAmount: number;
}> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const payments = await prisma.payment.findMany({
    where: {
      leaseId,
      status: { in: ['pending', 'overdue'] },
    },
    orderBy: { dueDate: 'asc' },
  });

  const pastDue = payments
    .filter(p => new Date(p.dueDate) < startOfMonth)
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const currentDue = payments
    .filter(p => new Date(p.dueDate) >= startOfMonth && new Date(p.dueDate) < new Date(now.getFullYear(), now.getMonth() + 1, 1))
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const nextPayment = payments.find(p => new Date(p.dueDate) > now);

  return {
    currentDue,
    pastDue,
    nextPaymentDate: nextPayment?.dueDate.toISOString() || null,
    nextPaymentAmount: nextPayment?.amount || 0,
  };
}

// =============================================================================
// Routes
// =============================================================================

export async function tenantPortalRoutes(app: FastifyInstance): Promise<void> {
  // ==========================================================================
  // Dashboard
  // ==========================================================================

  // Get tenant dashboard
  app.get(
    '/dashboard',
    {
      schema: {
        description: 'Get tenant dashboard overview',
        tags: ['Tenant Portal'],
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

      const lease = await getTenantLease(request.user.id);

      let dashboard: TenantDashboard;

      if (lease) {
        const balance = await getTenantBalance(lease.id);

        const workOrders = await prisma.workOrder.findMany({
          where: {
            unit: { id: lease.unitId },
            reportedById: request.user.id,
          },
          select: { status: true },
        });

        const documents = await prisma.document.findMany({
          where: {
            OR: [
              { leaseId: lease.id },
              { propertyId: lease.unit.propertyId },
            ],
          },
          select: { status: true },
        });

        const daysRemaining = Math.ceil((lease.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        // Get property announcements
        const propertyAnnouncements = await prisma.propertyAnnouncement.findMany({
          where: {
            propertyId: lease.unit.propertyId,
            isActive: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });

        dashboard = {
          lease: {
            id: lease.id,
            propertyName: lease.unit.property.name,
            unitNumber: lease.unit.unitNumber,
            address: `${lease.unit.property.address}, ${lease.unit.property.city}, ${lease.unit.property.state}`,
            monthlyRent: lease.monthlyRent || 0,
            startDate: lease.startDate.toISOString(),
            endDate: lease.endDate.toISOString(),
            status: lease.status,
            daysRemaining: Math.max(0, daysRemaining),
          },
          balance,
          maintenanceRequests: {
            open: workOrders.filter(w => w.status === 'submitted').length,
            inProgress: workOrders.filter(w => ['acknowledged', 'in_progress'].includes(w.status)).length,
            completed: workOrders.filter(w => w.status === 'completed').length,
          },
          documents: {
            pendingSignature: documents.filter(d => d.status === 'pending_signature').length,
            total: documents.length,
          },
          announcements: propertyAnnouncements.map(a => ({
            id: a.id,
            title: a.title,
            message: a.message,
            createdAt: a.createdAt.toISOString(),
          })),
        };
      } else {
        dashboard = {
          lease: null,
          balance: { currentDue: 0, pastDue: 0, nextPaymentDate: null, nextPaymentAmount: 0 },
          maintenanceRequests: { open: 0, inProgress: 0, completed: 0 },
          documents: { pendingSignature: 0, total: 0 },
          announcements: [],
        };
      }

      return reply.send({
        success: true,
        data: { dashboard },
      });
    }
  );

  // ==========================================================================
  // Payments
  // ==========================================================================

  // Get payment history
  app.get(
    '/payments',
    {
      schema: {
        description: 'Get payment history',
        tags: ['Tenant Portal'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
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
        Querystring: { status?: string; page?: number; limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { status, page = 1, limit = 20 } = request.query;
      const lease = await getTenantLease(request.user.id);

      if (!lease) {
        return reply.send({
          success: true,
          data: { payments: [], pagination: { page, limit, total: 0, pages: 0 } },
        });
      }

      const where: Record<string, unknown> = { leaseId: lease.id };
      if (status) {
        where.status = status;
      }

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          orderBy: { dueDate: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.payment.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: {
          payments: payments.map(p => ({
            id: p.id,
            amount: p.amount,
            type: p.type,
            status: p.status,
            dueDate: p.dueDate.toISOString(),
            paidAt: p.paidAt?.toISOString(),
            description: p.description,
          })),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        },
      });
    }
  );

  // Pay rent
  app.post(
    '/payments/pay',
    {
      schema: {
        description: 'Make a rent payment',
        tags: ['Tenant Portal'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof PayRentSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = PayRentSchema.parse(request.body);
      const lease = await getTenantLease(request.user.id);

      if (!lease) {
        throw new AppError('NOT_FOUND', 'No active lease found', 404);
      }

      // Verify payment method belongs to user
      const paymentMethod = await prisma.paymentMethod.findFirst({
        where: { id: data.paymentMethodId, userId: request.user.id },
      });
      if (!paymentMethod) {
        throw new AppError('NOT_FOUND', 'Payment method not found', 404);
      }

      // Find pending payment to apply this to
      const pendingPayment = await prisma.payment.findFirst({
        where: {
          leaseId: lease.id,
          status: { in: ['pending', 'overdue'] },
        },
        orderBy: { dueDate: 'asc' },
      });

      if (!pendingPayment) {
        throw new AppError('INVALID_STATE', 'No pending payments found', 400);
      }

      // In production: Process payment via Stripe
      // const paymentIntent = await stripe.paymentIntents.create({ ... });

      // Update payment status
      const payment = await prisma.payment.update({
        where: { id: pendingPayment.id },
        data: {
          status: 'completed',
          paidAt: new Date(),
          processorId: `mock_pi_${Date.now()}`,
          metadata: {
            ...((pendingPayment.metadata as Record<string, unknown>) || {}),
            paymentMethodId: data.paymentMethodId,
            note: data.note,
          },
        },
      });

      logger.info({
        paymentId: payment.id,
        leaseId: lease.id,
        amount: data.amount,
        tenantId: request.user.id,
      }, 'Tenant payment processed');

      return reply.send({
        success: true,
        data: {
          payment: {
            id: payment.id,
            amount: payment.amount,
            status: payment.status,
            paidAt: payment.paidAt?.toISOString(),
          },
        },
        message: 'Payment successful',
      });
    }
  );

  // Get payment methods
  app.get(
    '/payments/methods',
    {
      schema: {
        description: 'Get saved payment methods',
        tags: ['Tenant Portal'],
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
        where: { userId: request.user.id, status: 'active' },
      });

      return reply.send({
        success: true,
        data: {
          paymentMethods: methods.map(m => ({
            id: m.id,
            type: m.type,
            last4: m.cardLast4 || m.bankLast4 || '',
            brand: m.cardBrand,
            bankName: m.bankName,
            isDefault: m.isDefault,
            expiresAt: m.cardExpMonth && m.cardExpYear ? `${m.cardExpMonth}/${m.cardExpYear}` : undefined,
          })),
        },
      });
    }
  );

  // Add payment method
  app.post(
    '/payments/methods',
    {
      schema: {
        description: 'Add a payment method',
        tags: ['Tenant Portal'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof AddPaymentMethodSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = AddPaymentMethodSchema.parse(request.body);

      // If setting as default, unset others
      if (data.isDefault) {
        await prisma.paymentMethod.updateMany({
          where: { userId: request.user.id, isDefault: true },
          data: { isDefault: false },
        });
      }

      // In production: Verify token with Stripe/Plaid and get actual card details
      const method = await prisma.paymentMethod.create({
        data: {
          id: generatePrefixedId('pm'),
          userId: request.user.id,
          type: data.type,
          cardLast4: data.type === 'card' ? '4242' : null, // Would come from Stripe
          cardBrand: data.type === 'card' ? 'Visa' : null,
          cardExpMonth: data.type === 'card' ? 12 : null,
          cardExpYear: data.type === 'card' ? 2028 : null,
          bankName: data.type === 'bank_account' ? 'Chase' : null,
          bankLast4: data.type === 'bank_account' ? '6789' : null,
          bankAccountType: data.type === 'bank_account' ? 'checking' : null,
          isDefault: data.isDefault,
          status: 'active',
        },
      });

      return reply.status(201).send({
        success: true,
        data: {
          paymentMethod: {
            id: method.id,
            type: method.type,
            last4: method.cardLast4 || method.bankLast4 || '',
            brand: method.cardBrand,
            bankName: method.bankName,
            isDefault: method.isDefault,
            expiresAt: method.cardExpMonth && method.cardExpYear ? `${method.cardExpMonth}/${method.cardExpYear}` : undefined,
          },
        },
      });
    }
  );

  // Delete payment method
  app.delete(
    '/payments/methods/:methodId',
    {
      schema: {
        description: 'Delete a payment method',
        tags: ['Tenant Portal'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { methodId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { methodId } = request.params;
      const method = await prisma.paymentMethod.findFirst({
        where: { id: methodId, userId: request.user.id },
      });

      if (!method) {
        throw new AppError('NOT_FOUND', 'Payment method not found', 404);
      }

      await prisma.paymentMethod.update({
        where: { id: methodId },
        data: { status: 'deleted' },
      });

      return reply.send({
        success: true,
        message: 'Payment method removed',
      });
    }
  );

  // ==========================================================================
  // Maintenance Requests
  // ==========================================================================

  // Get maintenance requests
  app.get(
    '/maintenance',
    {
      schema: {
        description: 'Get maintenance request history',
        tags: ['Tenant Portal'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { status?: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { status } = request.query;

      const where: Record<string, unknown> = {
        reportedById: request.user.id,
      };
      if (status) {
        where.status = status;
      }

      const workOrders = await prisma.workOrder.findMany({
        where,
        include: {
          unit: {
            include: {
              property: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        success: true,
        data: {
          requests: workOrders.map(wo => ({
            id: wo.id,
            title: wo.title,
            description: wo.description,
            category: wo.category,
            priority: wo.priority,
            status: wo.status,
            propertyName: wo.unit.property.name,
            unitNumber: wo.unit.unitNumber,
            createdAt: wo.createdAt.toISOString(),
            scheduledDate: wo.scheduledDate?.toISOString(),
            completedAt: wo.completedAt?.toISOString(),
            resolution: wo.resolution,
          })),
        },
      });
    }
  );

  // Submit maintenance request
  app.post(
    '/maintenance',
    {
      schema: {
        description: 'Submit a maintenance request',
        tags: ['Tenant Portal'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof SubmitMaintenanceSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = SubmitMaintenanceSchema.parse(request.body);
      const lease = await getTenantLease(request.user.id);

      if (!lease) {
        throw new AppError('NOT_FOUND', 'No active lease found', 404);
      }

      const workOrder = await prisma.workOrder.create({
        data: {
          id: generatePrefixedId('wo'),
          unitId: lease.unitId,
          title: data.title,
          description: data.description,
          category: data.category,
          priority: data.priority,
          status: 'submitted',
          reportedById: request.user.id,
          images: data.images || [],
          preferredSchedule: data.preferredSchedule,
          metadata: {
            allowEntry: data.allowEntry,
            petInfo: data.petInfo,
          },
        },
        include: {
          unit: {
            include: {
              property: true,
            },
          },
        },
      });

      logger.info({
        workOrderId: workOrder.id,
        category: data.category,
        priority: data.priority,
        tenantId: request.user.id,
      }, 'Maintenance request submitted');

      return reply.status(201).send({
        success: true,
        data: {
          request: {
            id: workOrder.id,
            title: workOrder.title,
            category: workOrder.category,
            priority: workOrder.priority,
            status: workOrder.status,
            createdAt: workOrder.createdAt.toISOString(),
          },
        },
        message: 'Maintenance request submitted successfully',
      });
    }
  );

  // Get maintenance request details
  app.get(
    '/maintenance/:requestId',
    {
      schema: {
        description: 'Get maintenance request details',
        tags: ['Tenant Portal'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { requestId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { requestId } = request.params;

      const workOrder = await prisma.workOrder.findUnique({
        where: { id: requestId },
        include: {
          unit: {
            include: {
              property: true,
            },
          },
          vendor: true,
        },
      });

      if (!workOrder || workOrder.reportedById !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Request not found', 404);
      }

      return reply.send({
        success: true,
        data: {
          request: {
            id: workOrder.id,
            title: workOrder.title,
            description: workOrder.description,
            category: workOrder.category,
            priority: workOrder.priority,
            status: workOrder.status,
            propertyName: workOrder.unit.property.name,
            unitNumber: workOrder.unit.unitNumber,
            images: workOrder.images,
            createdAt: workOrder.createdAt.toISOString(),
            acknowledgedAt: workOrder.acknowledgedAt?.toISOString(),
            scheduledDate: workOrder.scheduledDate?.toISOString(),
            completedAt: workOrder.completedAt?.toISOString(),
            resolution: workOrder.resolution,
            vendor: workOrder.vendor ? {
              name: workOrder.vendor.name,
              phone: workOrder.vendor.phone,
            } : null,
          },
        },
      });
    }
  );

  // ==========================================================================
  // Documents
  // ==========================================================================

  // Get documents
  app.get(
    '/documents',
    {
      schema: {
        description: 'Get tenant documents',
        tags: ['Tenant Portal'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { type?: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { type } = request.query;
      const lease = await getTenantLease(request.user.id);

      if (!lease) {
        return reply.send({
          success: true,
          data: { documents: [] },
        });
      }

      const where: Record<string, unknown> = {
        OR: [
          { leaseId: lease.id },
          { propertyId: lease.unit.propertyId, isPublic: true },
        ],
      };

      if (type) {
        where.type = type;
      }

      const documents = await prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        success: true,
        data: {
          documents: documents.map(d => ({
            id: d.id,
            name: d.name,
            type: d.type,
            status: d.status,
            fileUrl: d.fileUrl,
            createdAt: d.createdAt.toISOString(),
          })),
        },
      });
    }
  );

  // Download document
  app.get(
    '/documents/:documentId/download',
    {
      schema: {
        description: 'Download a document',
        tags: ['Tenant Portal'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { documentId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { documentId } = request.params;
      const lease = await getTenantLease(request.user.id);

      const document = await prisma.document.findUnique({
        where: { id: documentId },
      });

      if (!document) {
        throw new AppError('NOT_FOUND', 'Document not found', 404);
      }

      // Verify access
      if (document.leaseId !== lease?.id && !document.isPublic) {
        throw new AppError('FORBIDDEN', 'Access denied', 403);
      }

      // In production: Return signed URL or stream file
      return reply.send({
        success: true,
        data: {
          downloadUrl: document.fileUrl,
          expiresIn: 3600,
        },
      });
    }
  );

  // ==========================================================================
  // Profile
  // ==========================================================================

  // Get profile
  app.get(
    '/profile',
    {
      schema: {
        description: 'Get tenant profile',
        tags: ['Tenant Portal'],
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

      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          avatarUrl: true,
          metadata: true,
          createdAt: true,
        },
      });

      if (!user) {
        throw new AppError('NOT_FOUND', 'User not found', 404);
      }

      const metadata = (user.metadata as Record<string, unknown>) || {};

      return reply.send({
        success: true,
        data: {
          profile: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            avatarUrl: user.avatarUrl,
            emergencyContact: metadata.emergencyContact,
            vehicles: metadata.vehicles || [],
            pets: metadata.pets || [],
            memberSince: user.createdAt.toISOString(),
          },
        },
      });
    }
  );

  // Update profile
  app.patch(
    '/profile',
    {
      schema: {
        description: 'Update tenant profile',
        tags: ['Tenant Portal'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof UpdateProfileSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = UpdateProfileSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { metadata: true },
      });

      const currentMetadata = (user?.metadata as Record<string, unknown>) || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(data.emergencyContact && { emergencyContact: data.emergencyContact }),
        ...(data.vehicles && { vehicles: data.vehicles }),
        ...(data.pets && { pets: data.pets }),
      };

      const updated = await prisma.user.update({
        where: { id: request.user.id },
        data: {
          ...(data.phone && { phone: data.phone }),
          metadata: updatedMetadata,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          metadata: true,
        },
      });

      return reply.send({
        success: true,
        data: { profile: updated },
        message: 'Profile updated',
      });
    }
  );

  // ==========================================================================
  // Lease Info
  // ==========================================================================

  // Get lease details
  app.get(
    '/lease',
    {
      schema: {
        description: 'Get current lease details',
        tags: ['Tenant Portal'],
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

      const lease = await getTenantLease(request.user.id);

      if (!lease) {
        return reply.send({
          success: true,
          data: { lease: null },
        });
      }

      return reply.send({
        success: true,
        data: {
          lease: {
            id: lease.id,
            status: lease.status,
            property: {
              name: lease.unit.property.name,
              address: lease.unit.property.address,
              city: lease.unit.property.city,
              state: lease.unit.property.state,
              zip: lease.unit.property.zip,
            },
            unit: {
              number: lease.unit.unitNumber,
              bedrooms: lease.unit.bedrooms,
              bathrooms: lease.unit.bathrooms,
              sqft: lease.unit.sqft,
            },
            terms: {
              startDate: lease.startDate.toISOString(),
              endDate: lease.endDate.toISOString(),
              monthlyRent: lease.monthlyRent,
              securityDeposit: lease.securityDeposit,
              isRentStabilized: lease.isRentStabilized,
            },
          },
        },
      });
    }
  );

  // ==========================================================================
  // Contact
  // ==========================================================================

  // Send message to landlord
  app.post(
    '/contact',
    {
      schema: {
        description: 'Send a message to the landlord',
        tags: ['Tenant Portal'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Body: { subject: string; message: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { subject, message } = request.body;
      const lease = await getTenantLease(request.user.id);

      if (!lease) {
        throw new AppError('NOT_FOUND', 'No active lease found', 404);
      }

      // In production: Send email/notification to landlord
      logger.info({
        from: request.user.id,
        to: lease.unit.property.ownerId,
        subject,
      }, 'Tenant message sent to landlord');

      return reply.send({
        success: true,
        message: 'Message sent to your landlord',
      });
    }
  );
}

// =============================================================================
// Exports
// =============================================================================

export {
  getTenantLease,
  getTenantBalance,
};
