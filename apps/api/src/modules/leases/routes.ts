import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@realriches/database';
import { generateId, NotFoundError, ForbiddenError, ValidationError } from '@realriches/utils';

const CreateLeaseSchema = z.object({
  unitId: z.string(),
  tenantId: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  monthlyRent: z.number().min(0),
  securityDeposit: z.number().min(0).optional(),
  leaseType: z.enum(['STANDARD', 'REBNY', 'CUSTOM']).default('STANDARD'),
  terms: z.record(z.unknown()).optional(),
});

const CreateAmendmentSchema = z.object({
  type: z.enum(['RENT_CHANGE', 'TERM_EXTENSION', 'RIDER', 'OTHER']),
  description: z.string(),
  changes: z.record(z.unknown()),
  effectiveDate: z.string().datetime(),
});

const TenantApplicationSchema = z.object({
  listingId: z.string(),
  employmentInfo: z.object({
    employer: z.string(),
    position: z.string(),
    annualIncome: z.number(),
    yearsEmployed: z.number(),
  }),
  references: z.array(
    z.object({
      name: z.string(),
      phone: z.string(),
      relationship: z.string(),
    })
  ),
  emergencyContact: z.object({
    name: z.string(),
    phone: z.string(),
    relationship: z.string(),
  }),
  hasGuarantor: z.boolean().default(false),
  guarantorInfo: z
    .object({
      name: z.string(),
      email: z.string(),
      phone: z.string(),
    })
    .optional(),
});

export async function leaseRoutes(app: FastifyInstance): Promise<void> {
  // List leases
  app.get(
    '/',
    {
      schema: {
        description: 'List leases for current user',
        tags: ['Leases'],
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
      const role = request.user.role;

      const where: Record<string, unknown> = {};

      if (role === 'LANDLORD') {
        where.unit = { property: { ownerId: request.user.id } };
      } else if (role === 'TENANT') {
        where.tenantId = request.user.id;
      } else if (role === 'AGENT') {
        where.createdById = request.user.id;
      }

      if (status) where.status = status;

      const [leases, total] = await Promise.all([
        prisma.lease.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          include: {
            unit: { include: { property: { select: { id: true, name: true, address: true } } } },
            tenant: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.lease.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: leases,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }
  );

  // Get lease by ID
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get lease details',
        tags: ['Leases'],
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

      const lease = await prisma.lease.findUnique({
        where: { id: request.params.id },
        include: {
          unit: { include: { property: true } },
          tenant: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          amendments: { orderBy: { effectiveDate: 'desc' } },
          documents: true,
        },
      });

      if (!lease) {
        throw new NotFoundError('Lease not found');
      }

      // Check access
      const isOwner = lease.unit.property.ownerId === request.user.id;
      const isTenant = lease.tenantId === request.user.id;
      const isAdmin = request.user.role === 'ADMIN';

      if (!isOwner && !isTenant && !isAdmin) {
        throw new ForbiddenError('Access denied');
      }

      return reply.send({ success: true, data: lease });
    }
  );

  // Create lease
  app.post(
    '/',
    {
      schema: {
        description: 'Create a new lease',
        tags: ['Leases'],
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

      const data = CreateLeaseSchema.parse(request.body);

      // Verify unit ownership
      const unit = await prisma.unit.findUnique({
        where: { id: data.unitId },
        include: { property: true },
      });

      if (!unit) {
        throw new NotFoundError('Unit not found');
      }

      if (unit.property.ownerId !== request.user.id && request.user.role !== 'ADMIN') {
        throw new ForbiddenError('Access denied');
      }

      // Validate dates
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);

      if (endDate <= startDate) {
        throw new ValidationError('End date must be after start date');
      }

      // Check for overlapping leases
      const existingLease = await prisma.lease.findFirst({
        where: {
          unitId: data.unitId,
          status: { in: ['ACTIVE', 'PENDING'] },
          OR: [
            { startDate: { lte: endDate }, endDate: { gte: startDate } },
          ],
        },
      });

      if (existingLease) {
        throw new ValidationError('An active lease already exists for this unit in the specified period');
      }

      const lease = await prisma.lease.create({
        data: {
          id: generateId('lse'),
          ...data,
          monthlyRent: data.monthlyRent,
          securityDeposit: data.securityDeposit,
          startDate,
          endDate,
          status: 'PENDING',
          createdById: request.user.id,
        },
        include: {
          unit: { include: { property: true } },
          tenant: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      // Update unit status
      await prisma.unit.update({
        where: { id: data.unitId },
        data: { status: 'OCCUPIED' },
      });

      return reply.status(201).send({ success: true, data: lease });
    }
  );

  // Add lease amendment
  app.post(
    '/:id/amendments',
    {
      schema: {
        description: 'Add an amendment to a lease',
        tags: ['Leases'],
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

      const lease = await prisma.lease.findUnique({
        where: { id: request.params.id },
        include: { unit: { include: { property: true } } },
      });

      if (!lease) {
        throw new NotFoundError('Lease not found');
      }

      if (lease.unit.property.ownerId !== request.user.id && request.user.role !== 'ADMIN') {
        throw new ForbiddenError('Access denied');
      }

      const data = CreateAmendmentSchema.parse(request.body);

      const amendment = await prisma.leaseAmendment.create({
        data: {
          id: generateId('amd'),
          leaseId: lease.id,
          ...data,
          effectiveDate: new Date(data.effectiveDate),
          status: 'PENDING',
        },
      });

      return reply.status(201).send({ success: true, data: amendment });
    }
  );

  // Submit tenant application
  app.post(
    '/applications',
    {
      schema: {
        description: 'Submit a tenant application',
        tags: ['Leases'],
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

      const data = TenantApplicationSchema.parse(request.body);

      // Verify listing exists
      const listing = await prisma.listing.findUnique({
        where: { id: data.listingId },
      });

      if (!listing) {
        throw new NotFoundError('Listing not found');
      }

      const application = await prisma.tenantApplication.create({
        data: {
          id: generateId('app'),
          listingId: data.listingId,
          applicantId: request.user.id,
          status: 'SUBMITTED',
          employmentInfo: data.employmentInfo,
          references: data.references,
          emergencyContact: data.emergencyContact,
          hasGuarantor: data.hasGuarantor,
          guarantorInfo: data.guarantorInfo,
        },
      });

      return reply.status(201).send({ success: true, data: application });
    }
  );

  // Get applications for a listing (landlord/agent)
  app.get(
    '/applications',
    {
      schema: {
        description: 'Get tenant applications',
        tags: ['Leases'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            listingId: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['LANDLORD', 'AGENT', 'ADMIN'] });
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { listingId?: string; status?: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { listingId, status } = request.query;

      const where: Record<string, unknown> = {};
      if (listingId) where.listingId = listingId;
      if (status) where.status = status;

      // Filter by ownership if not admin
      if (request.user.role !== 'ADMIN') {
        where.listing = {
          unit: { property: { ownerId: request.user.id } },
        };
      }

      const applications = await prisma.tenantApplication.findMany({
        where,
        include: {
          applicant: { select: { id: true, firstName: true, lastName: true, email: true } },
          listing: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ success: true, data: applications });
    }
  );
}
