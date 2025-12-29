import { prisma } from '@realriches/database';
import { generateId, NotFoundError, ForbiddenError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const CreateWorkOrderSchema = z.object({
  unitId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string(),
  category: z.enum([
    'plumbing',
    'electrical',
    'hvac',
    'appliance',
    'structural',
    'pest',
    'other',
    'safety',
  ]),
  priority: z.enum(['low', 'normal', 'high', 'emergency']).default('normal'),
  images: z.array(z.string()).optional(),
  preferredSchedule: z.string().optional(),
});

const UpdateWorkOrderSchema = z.object({
  status: z.enum(['submitted', 'acknowledged', 'in_progress', 'completed', 'cancelled']).optional(),
  vendorId: z.string().optional(),
  scheduledDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  resolution: z.string().optional(),
  actualCost: z.number().optional(),
});

const CreateVendorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string(),
  specialty: z.array(z.string()),
  licenseNumber: z.string().optional(),
  insuranceExpiry: z.string().datetime().optional(),
  serviceAreas: z.array(z.string()).optional(),
  hourlyRate: z.number().optional(),
});

export async function maintenanceRoutes(app: FastifyInstance): Promise<void> {
  // List work orders
  app.get(
    '/work-orders',
    {
      schema: {
        description: 'List work orders',
        tags: ['Maintenance'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            priority: { type: 'string' },
            propertyId: { type: 'string' },
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
        Querystring: {
          status?: string;
          priority?: string;
          propertyId?: string;
          page?: number;
          limit?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { status, priority, propertyId, page = 1, limit = 20 } = request.query;

      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (priority) where.priority = priority;
      if (propertyId) where.unit = { propertyId };

      // Filter by role
      if (request.user.role === 'tenant') {
        where.reportedById = request.user.id;
      } else if (request.user.role === 'landlord') {
        where.unit = { property: { ownerId: request.user.id } };
      }

      const [workOrders, total] = await Promise.all([
        prisma.workOrder.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          include: {
            unit: { include: { property: { select: { id: true, name: true, address: true } } } },
            vendor: { select: { id: true, name: true, phone: true } },
            reportedBy: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        }),
        prisma.workOrder.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: workOrders,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }
  );

  // Get work order by ID
  app.get(
    '/work-orders/:id',
    {
      schema: {
        description: 'Get work order details',
        tags: ['Maintenance'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const workOrder = await prisma.workOrder.findUnique({
        where: { id: request.params.id },
        include: {
          unit: { include: { property: true } },
          vendor: true,
          reportedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      if (!workOrder) {
        throw new NotFoundError('Work order not found');
      }

      return reply.send({ success: true, data: workOrder });
    }
  );

  // Create work order
  app.post(
    '/work-orders',
    {
      schema: {
        description: 'Create a work order',
        tags: ['Maintenance'],
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

      const data = CreateWorkOrderSchema.parse(request.body);

      const unit = await prisma.unit.findUnique({
        where: { id: data.unitId },
        include: { property: true },
      });

      if (!unit) {
        throw new NotFoundError('Unit not found');
      }

      const workOrder = await prisma.workOrder.create({
        data: {
          id: generateId('wo'),
          ...data,
          status: 'submitted',
          reportedById: request.user.id,
        },
        include: { unit: { include: { property: true } } },
      });

      // Auto-escalate emergencies
      if (data.priority === 'emergency') {
        // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Send emergency notifications
        // await sendEmergencyAlert(workOrder);
      }

      return reply.status(201).send({ success: true, data: workOrder });
    }
  );

  // Update work order
  app.patch(
    '/work-orders/:id',
    {
      schema: {
        description: 'Update a work order',
        tags: ['Maintenance'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const workOrder = await prisma.workOrder.findUnique({
        where: { id: request.params.id },
        include: { unit: { include: { property: true } } },
      });

      if (!workOrder) {
        throw new NotFoundError('Work order not found');
      }

      if (workOrder.unit.property.ownerId !== request.user.id && request.user.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      const data = UpdateWorkOrderSchema.parse(request.body);

      const updated = await prisma.workOrder.update({
        where: { id: request.params.id },
        data: {
          ...data,
          scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : undefined,
          completedAt: data.status === 'completed' ? new Date() : undefined,
          actualCost: data.actualCost,
        },
      });

      return reply.send({ success: true, data: updated });
    }
  );

  // God View Dashboard - Property manager overview
  app.get(
    '/god-view',
    {
      schema: {
        description: 'God View dashboard for property managers',
        tags: ['Maintenance'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            propertyId: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'admin'] });
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { propertyId?: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const propertyFilter =
        request.user.role === 'admin'
          ? {}
          : { property: { ownerId: request.user.id } };

      if (request.query.propertyId) {
        Object.assign(propertyFilter, { propertyId: request.query.propertyId });
      }

      // Get counts by status
      const statusCounts = await prisma.workOrder.groupBy({
        by: ['status'],
        where: { unit: propertyFilter },
        _count: true,
      });

      // Get counts by priority
      const priorityCounts = await prisma.workOrder.groupBy({
        by: ['priority'],
        where: { unit: propertyFilter },
        _count: true,
      });

      // Get emergency/urgent open work orders
      const urgentOrders = await prisma.workOrder.findMany({
        where: {
          unit: propertyFilter,
          status: { in: ['submitted', 'acknowledged'] },
          priority: { in: ['emergency', 'high'] },
        },
        include: {
          unit: { include: { property: { select: { name: true, address: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });

      // Get overdue work orders
      const overdueOrders = await prisma.workOrder.findMany({
        where: {
          unit: propertyFilter,
          status: { in: ['submitted', 'acknowledged', 'in_progress'] },
          scheduledDate: { lt: new Date() },
        },
        include: {
          unit: { include: { property: { select: { name: true } } } },
        },
        take: 10,
      });

      // Get recent completions
      const recentCompletions = await prisma.workOrder.findMany({
        where: {
          unit: propertyFilter,
          status: 'completed',
          completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { completedAt: 'desc' },
        take: 5,
      });

      // Calculate metrics
      const totalOpen = statusCounts.find((s) => s.status === 'submitted')?._count || 0;
      const totalInProgress = statusCounts.find((s) => s.status === 'in_progress')?._count || 0;
      const totalCompleted = statusCounts.find((s) => s.status === 'completed')?._count || 0;

      return reply.send({
        success: true,
        data: {
          summary: {
            open: totalOpen,
            inProgress: totalInProgress,
            completed: totalCompleted,
            urgent: urgentOrders.length,
            overdue: overdueOrders.length,
          },
          statusBreakdown: statusCounts,
          priorityBreakdown: priorityCounts,
          urgentOrders,
          overdueOrders,
          recentCompletions,
        },
      });
    }
  );

  // List vendors
  app.get(
    '/vendors',
    {
      schema: {
        description: 'List vendors',
        tags: ['Maintenance'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            specialty: { type: 'string' },
            isActive: { type: 'boolean' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'admin'] });
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { specialty?: string; isActive?: boolean };
      }>,
      reply: FastifyReply
    ) => {
      const { specialty, isActive } = request.query;

      const where: Record<string, unknown> = {};
      if (specialty) where.specialty = { has: specialty };
      if (isActive !== undefined) where.isActive = isActive;

      const vendors = await prisma.vendor.findMany({
        where,
        orderBy: { rating: 'desc' },
      });

      return reply.send({ success: true, data: vendors });
    }
  );

  // Create vendor
  app.post(
    '/vendors',
    {
      schema: {
        description: 'Add a vendor',
        tags: ['Maintenance'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = CreateVendorSchema.parse(request.body);

      const vendor = await prisma.vendor.create({
        data: {
          id: generateId('vnd'),
          ...data,
          hourlyRate: data.hourlyRate,
          insuranceExpiry: data.insuranceExpiry ? new Date(data.insuranceExpiry) : null,
          isActive: true,
          rating: 0,
          jobsCompleted: 0,
        },
      });

      return reply.status(201).send({ success: true, data: vendor });
    }
  );

  // Schedule inspection
  app.post(
    '/inspections',
    {
      schema: {
        description: 'Schedule a property inspection',
        tags: ['Maintenance'],
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

      const { unitId, type, scheduledDate, notes } = (request.body as {
        unitId: string;
        type: string;
        scheduledDate: string;
        notes?: string;
      }) || {};

      const unit = await prisma.unit.findUnique({
        where: { id: unitId },
        include: { property: true },
      });

      if (!unit) {
        throw new NotFoundError('Unit not found');
      }

      if (unit.property.ownerId !== request.user.id && request.user.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      const inspection = await prisma.inspection.create({
        data: {
          id: generateId('ins'),
          unitId,
          type,
          scheduledDate: new Date(scheduledDate),
          notes,
          status: 'scheduled',
          inspectorId: request.user.id,
        },
      });

      return reply.status(201).send({ success: true, data: inspection });
    }
  );

  // Escalation button
  app.post(
    '/work-orders/:id/escalate',
    {
      schema: {
        description: 'Escalate a work order',
        tags: ['Maintenance'],
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

      const { reason } = (request.body as { reason: string }) || {};

      const workOrder = await prisma.workOrder.findUnique({
        where: { id: request.params.id },
        include: { unit: { include: { property: true } } },
      });

      if (!workOrder) {
        throw new NotFoundError('Work order not found');
      }

      // Escalate priority
      const newPriority =
        workOrder.priority === 'low'
          ? 'normal'
          : workOrder.priority === 'normal'
            ? 'high'
            : 'emergency';

      const updated = await prisma.workOrder.update({
        where: { id: workOrder.id },
        data: {
          priority: newPriority,
          notes: `${workOrder.notes || ''}\n[ESCALATED by ${request.user.email}]: ${reason}`,
        },
      });

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Send escalation notifications

      return reply.send({
        success: true,
        data: updated,
        message: `Work order escalated to ${newPriority} priority`,
      });
    }
  );
}
