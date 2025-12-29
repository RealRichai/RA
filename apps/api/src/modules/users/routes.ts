import { prisma } from '@realriches/database';
import type { Role } from '@realriches/types';
import { NotFoundError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const UpdateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

const UpdateProfileSchema = z.object({
  companyName: z.string().optional(),
  licenseNumber: z.string().optional(),
  bio: z.string().optional(),
  specialties: z.array(z.string()).optional(),
  serviceAreas: z.array(z.string()).optional(),
});

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // Get user by ID
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get user by ID',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          phone: true,
          avatarUrl: true,
          createdAt: true,
          landlordProfile: true,
          agentProfile: true,
          tenantProfile: true,
          investorProfile: true,
        },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      return reply.send({ success: true, data: user });
    }
  );

  // Update current user
  app.patch(
    '/me',
    {
      schema: {
        description: 'Update current user profile',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            phone: { type: 'string' },
            avatarUrl: { type: 'string' },
          },
        },
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

      const data = UpdateUserSchema.parse(request.body);

      const user = await prisma.user.update({
        where: { id: request.user.id },
        data,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          phone: true,
          avatarUrl: true,
        },
      });

      return reply.send({ success: true, data: user });
    }
  );

  // Update role-specific profile
  app.patch(
    '/me/profile',
    {
      schema: {
        description: 'Update role-specific profile',
        tags: ['Users'],
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

      const data = UpdateProfileSchema.parse(request.body);
      const role = request.user.role as Role;

      let profile;

      switch (role) {
        case 'landlord':
          profile = await prisma.landlordProfile.upsert({
            where: { userId: request.user.id },
            update: data,
            create: { userId: request.user.id, ...data },
          });
          break;

        case 'agent':
          profile = await prisma.agentProfile.upsert({
            where: { userId: request.user.id },
            update: data,
            create: { userId: request.user.id, ...data },
          });
          break;

        case 'tenant':
          profile = await prisma.tenantProfile.upsert({
            where: { userId: request.user.id },
            update: data,
            create: { userId: request.user.id },
          });
          break;

        case 'investor':
          profile = await prisma.investorProfile.upsert({
            where: { userId: request.user.id },
            update: data,
            create: { userId: request.user.id },
          });
          break;

        default:
          return reply.status(400).send({
            success: false,
            error: { code: 'INVALID_ROLE', message: 'Invalid user role' },
          });
      }

      return reply.send({ success: true, data: profile });
    }
  );

  // List users (admin only)
  app.get(
    '/',
    {
      schema: {
        description: 'List all users (admin only)',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            role: { type: 'string' },
            status: { type: 'string' },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { role?: string; status?: string; page?: number; limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      const { role, status, page = 1, limit = 20 } = request.query;

      const where: Record<string, unknown> = {};
      if (role) where.role = role;
      if (status) where.status = status;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: users,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }
  );
}
