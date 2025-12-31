import { prisma } from '@realriches/database';
import { generatePrefixedId, NotFoundError, ForbiddenError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const CreatePropertySchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['single_family', 'multi_family', 'condo', 'townhouse', 'apartment', 'commercial', 'mixed_use']),
  address: z.object({
    street: z.string(),
    unit: z.string().optional(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string().default('US'),
  }),
  totalUnits: z.number().int().min(1).optional(),
  yearBuilt: z.number().int().optional(),
  squareFeet: z.number().int().optional(),
  amenities: z.array(z.string()).optional(),
});

const CreateUnitSchema = z.object({
  unitNumber: z.string(),
  bedrooms: z.number().int().min(0),
  bathrooms: z.number().min(0),
  squareFeet: z.number().int().optional(),
  rent: z.number().min(0),
  status: z.enum(['vacant', 'occupied', 'under_renovation', 'off_market']).default('vacant'),
  features: z.array(z.string()).optional(),
  isRentStabilized: z.boolean().default(false),
  legalRent: z.number().optional(),
});

export async function propertyRoutes(app: FastifyInstance): Promise<void> {
  // List properties
  app.get(
    '/',
    {
      schema: {
        description: 'List properties for current user',
        tags: ['Properties'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string' },
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
        Querystring: { type?: string; page?: number; limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { type, page = 1, limit = 20 } = request.query;

      const where: Record<string, unknown> = { ownerId: request.user.id };
      if (type) where.type = type;

      const [properties, total] = await Promise.all([
        prisma.property.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          include: {
            units: { select: { id: true, unitNumber: true, status: true, rent: true } },
            _count: { select: { units: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.property.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: properties,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }
  );

  // Get property by ID
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get property by ID',
        tags: ['Properties'],
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

      const property = await prisma.property.findUnique({
        where: { id: request.params.id },
        include: {
          units: true,
          owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      if (!property) {
        throw new NotFoundError('Property not found');
      }

      // Check ownership or admin access
      if (property.ownerId !== request.user.id && request.user.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      return reply.send({ success: true, data: property });
    }
  );

  // Create property
  app.post(
    '/',
    {
      schema: {
        description: 'Create a new property',
        tags: ['Properties'],
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

      const data = CreatePropertySchema.parse(request.body);

      const { address, ...restData } = data;
      const property = await prisma.property.create({
        data: {
          id: generatePrefixedId('prp'),
          name: restData.name,
          type: restData.type,
          totalUnits: restData.totalUnits,
          yearBuilt: restData.yearBuilt,
          totalSquareFeet: restData.squareFeet,
          amenities: restData.amenities,
          street1: address.street,
          street2: address.unit,
          city: address.city,
          state: address.state,
          postalCode: address.zipCode,
          country: address.country,
          address: `${address.street}${address.unit ? ', ' + address.unit : ''}, ${address.city}, ${address.state} ${address.zipCode}`,
          marketId: 'default',
          owner: { connect: { id: request.user.id } },
        },
        include: { units: true },
      });

      return reply.status(201).send({ success: true, data: property });
    }
  );

  // Update property
  app.patch(
    '/:id',
    {
      schema: {
        description: 'Update a property',
        tags: ['Properties'],
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

      const property = await prisma.property.findUnique({
        where: { id: request.params.id },
      });

      if (!property) {
        throw new NotFoundError('Property not found');
      }

      if (property.ownerId !== request.user.id && request.user.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      const parsedData = CreatePropertySchema.partial().parse(request.body);
      const { address: updateAddress, ...updateRestData } = parsedData;

      const updateData: Record<string, unknown> = { ...updateRestData };
      if (updateAddress) {
        updateData.street1 = updateAddress.street;
        updateData.street2 = updateAddress.unit;
        updateData.city = updateAddress.city;
        updateData.state = updateAddress.state;
        updateData.postalCode = updateAddress.zipCode;
        updateData.country = updateAddress.country;
        updateData.address = `${updateAddress.street}${updateAddress.unit ? ', ' + updateAddress.unit : ''}, ${updateAddress.city}, ${updateAddress.state} ${updateAddress.zipCode}`;
      }

      const updated = await prisma.property.update({
        where: { id: request.params.id },
        data: updateData,
        include: { units: true },
      });

      return reply.send({ success: true, data: updated });
    }
  );

  // Delete property
  app.delete(
    '/:id',
    {
      schema: {
        description: 'Delete a property',
        tags: ['Properties'],
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

      const property = await prisma.property.findUnique({
        where: { id: request.params.id },
      });

      if (!property) {
        throw new NotFoundError('Property not found');
      }

      if (property.ownerId !== request.user.id && request.user.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      await prisma.property.delete({ where: { id: request.params.id } });

      return reply.send({ success: true, message: 'Property deleted' });
    }
  );

  // Add unit to property
  app.post(
    '/:id/units',
    {
      schema: {
        description: 'Add a unit to a property',
        tags: ['Properties'],
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

      const property = await prisma.property.findUnique({
        where: { id: request.params.id },
      });

      if (!property) {
        throw new NotFoundError('Property not found');
      }

      if (property.ownerId !== request.user.id && request.user.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      const data = CreateUnitSchema.parse(request.body);

      const unit = await prisma.unit.create({
        data: {
          id: generatePrefixedId('unt'),
          unitNumber: data.unitNumber,
          type: 'residential',
          bedrooms: data.bedrooms,
          bathrooms: data.bathrooms,
          squareFeet: data.squareFeet,
          marketRentAmount: Math.round(data.rent * 100),
          rent: Math.round(data.rent * 100),
          status: data.status,
          features: data.features || [],
          isRentStabilized: data.isRentStabilized,
          legalRentAmount: data.legalRent ? Math.round(data.legalRent * 100) : null,
          propertyId: request.params.id,
        },
      });

      return reply.status(201).send({ success: true, data: unit });
    }
  );

  // Get units for property
  app.get(
    '/:id/units',
    {
      schema: {
        description: 'Get all units for a property',
        tags: ['Properties'],
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

      const property = await prisma.property.findUnique({
        where: { id: request.params.id },
        include: { units: true },
      });

      if (!property) {
        throw new NotFoundError('Property not found');
      }

      if (property.ownerId !== request.user.id && request.user.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      return reply.send({ success: true, data: property.units });
    }
  );
}
