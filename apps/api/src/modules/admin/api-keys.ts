/**
 * API Key Management Admin API
 *
 * Provides admin endpoints for managing API keys.
 */

import { createHash, randomBytes } from 'crypto';

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

const API_KEY_PREFIX = 'rr_';
const KEY_LENGTH = 32;

// =============================================================================
// Schemas
// =============================================================================

const CreateApiKeySchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).min(1),
  expiresAt: z.string().datetime().optional(),
});

const ListApiKeysQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const UpdateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.string()).min(1).optional(),
  isActive: z.boolean().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function generateApiKey(): { key: string; prefix: string; hashedKey: string } {
  const randomPart = randomBytes(KEY_LENGTH).toString('base64url');
  const key = `${API_KEY_PREFIX}${randomPart}`;
  const prefix = key.substring(0, 8);
  const hashedKey = createHash('sha256').update(key).digest('hex');

  return { key, prefix, hashedKey };
}

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// =============================================================================
// Routes
// =============================================================================

export async function apiKeyAdminRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================================================
  // GET /admin/api-keys - List API keys
  // ===========================================================================
  app.get(
    '/',
    {
      schema: {
        description: 'List API keys with filtering',
        tags: ['Admin', 'API Keys'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            isActive: { type: 'string', enum: ['true', 'false'] },
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
    async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const params = ListApiKeysQuerySchema.parse(request.query);

        const where: Record<string, unknown> = {};
        if (params.userId) where.userId = params.userId;
        if (params.isActive !== undefined) where.isActive = params.isActive === 'true';

        const [keys, total] = await Promise.all([
          prisma.apiKey.findMany({
            where,
            skip: (params.page - 1) * params.limit,
            take: params.limit,
            orderBy: { createdAt: 'desc' },
            include: {
              user: {
                select: { id: true, email: true, firstName: true, lastName: true },
              },
            },
          }),
          prisma.apiKey.count({ where }),
        ]);

        return reply.send({
          success: true,
          data: keys.map((key) => ({
            id: key.id,
            name: key.name,
            keyPrefix: key.keyPrefix,
            scopes: key.scopes,
            isActive: key.isActive,
            lastUsedAt: key.lastUsedAt,
            expiresAt: key.expiresAt,
            createdAt: key.createdAt,
            user: key.user,
          })),
          meta: {
            page: params.page,
            limit: params.limit,
            total,
            totalPages: Math.ceil(total / params.limit),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list API keys');
        return reply.status(500).send({
          success: false,
          error: { code: 'LIST_ERROR', message: 'Failed to list API keys' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/api-keys - Create API key
  // ===========================================================================
  app.post(
    '/',
    {
      schema: {
        description: 'Create a new API key',
        tags: ['Admin', 'API Keys'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['userId', 'name', 'scopes'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
            name: { type: 'string', minLength: 1, maxLength: 100 },
            scopes: { type: 'array', items: { type: 'string' }, minItems: 1 },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const params = CreateApiKeySchema.parse(request.body);

        // Verify user exists
        const user = await prisma.user.findUnique({
          where: { id: params.userId },
          select: { id: true, email: true },
        });

        if (!user) {
          return reply.status(404).send({
            success: false,
            error: { code: 'USER_NOT_FOUND', message: 'User not found' },
          });
        }

        // Generate API key
        const { key, prefix, hashedKey } = generateApiKey();

        // Create in database
        const apiKey = await prisma.apiKey.create({
          data: {
            userId: params.userId,
            name: params.name,
            keyPrefix: prefix,
            hashedKey,
            scopes: params.scopes,
            expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
          },
        });

        logger.info({
          msg: 'api_key_created',
          adminUserId: request.user?.id,
          targetUserId: params.userId,
          apiKeyId: apiKey.id,
          scopes: params.scopes,
        });

        // Return the key ONCE - it won't be retrievable again
        return reply.status(201).send({
          success: true,
          data: {
            id: apiKey.id,
            key, // Only returned on creation!
            name: apiKey.name,
            keyPrefix: apiKey.keyPrefix,
            scopes: apiKey.scopes,
            expiresAt: apiKey.expiresAt,
            createdAt: apiKey.createdAt,
          },
          warning: 'Store this API key securely. It will not be shown again.',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to create API key');
        return reply.status(500).send({
          success: false,
          error: { code: 'CREATE_ERROR', message: 'Failed to create API key' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/api-keys/:id - Get API key details
  // ===========================================================================
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get API key details',
        tags: ['Admin', 'API Keys'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const apiKey = await prisma.apiKey.findUnique({
          where: { id: request.params.id },
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true, role: true },
            },
          },
        });

        if (!apiKey) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'API key not found' },
          });
        }

        return reply.send({
          success: true,
          data: {
            id: apiKey.id,
            name: apiKey.name,
            keyPrefix: apiKey.keyPrefix,
            scopes: apiKey.scopes,
            isActive: apiKey.isActive,
            lastUsedAt: apiKey.lastUsedAt,
            expiresAt: apiKey.expiresAt,
            createdAt: apiKey.createdAt,
            updatedAt: apiKey.updatedAt,
            user: apiKey.user,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get API key');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get API key' },
        });
      }
    }
  );

  // ===========================================================================
  // PATCH /admin/api-keys/:id - Update API key
  // ===========================================================================
  app.patch(
    '/:id',
    {
      schema: {
        description: 'Update API key',
        tags: ['Admin', 'API Keys'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            scopes: { type: 'array', items: { type: 'string' }, minItems: 1 },
            isActive: { type: 'boolean' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const params = UpdateApiKeySchema.parse(request.body);

        const apiKey = await prisma.apiKey.findUnique({
          where: { id: request.params.id },
        });

        if (!apiKey) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'API key not found' },
          });
        }

        const updated = await prisma.apiKey.update({
          where: { id: request.params.id },
          data: {
            ...(params.name && { name: params.name }),
            ...(params.scopes && { scopes: params.scopes }),
            ...(params.isActive !== undefined && { isActive: params.isActive }),
          },
        });

        logger.info({
          msg: 'api_key_updated',
          adminUserId: request.user?.id,
          apiKeyId: request.params.id,
          changes: Object.keys(params),
        });

        return reply.send({
          success: true,
          data: {
            id: updated.id,
            name: updated.name,
            keyPrefix: updated.keyPrefix,
            scopes: updated.scopes,
            isActive: updated.isActive,
            updatedAt: updated.updatedAt,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to update API key');
        return reply.status(500).send({
          success: false,
          error: { code: 'UPDATE_ERROR', message: 'Failed to update API key' },
        });
      }
    }
  );

  // ===========================================================================
  // DELETE /admin/api-keys/:id - Revoke API key
  // ===========================================================================
  app.delete(
    '/:id',
    {
      schema: {
        description: 'Revoke (delete) an API key',
        tags: ['Admin', 'API Keys'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const apiKey = await prisma.apiKey.findUnique({
          where: { id: request.params.id },
        });

        if (!apiKey) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'API key not found' },
          });
        }

        await prisma.apiKey.delete({
          where: { id: request.params.id },
        });

        logger.info({
          msg: 'api_key_revoked',
          adminUserId: request.user?.id,
          apiKeyId: request.params.id,
          userId: apiKey.userId,
        });

        return reply.send({
          success: true,
          message: 'API key revoked',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to revoke API key');
        return reply.status(500).send({
          success: false,
          error: { code: 'DELETE_ERROR', message: 'Failed to revoke API key' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/api-keys/scopes - List available scopes
  // ===========================================================================
  app.get(
    '/scopes',
    {
      schema: {
        description: 'List available API key scopes',
        tags: ['Admin', 'API Keys'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        success: true,
        data: {
          scopes: [
            { name: 'read:properties', description: 'Read property data' },
            { name: 'write:properties', description: 'Create/update properties' },
            { name: 'read:listings', description: 'Read listing data' },
            { name: 'write:listings', description: 'Create/update listings' },
            { name: 'read:leases', description: 'Read lease data' },
            { name: 'write:leases', description: 'Create/update leases' },
            { name: 'read:users', description: 'Read user data' },
            { name: 'read:analytics', description: 'Read analytics data' },
            { name: 'webhooks:manage', description: 'Manage webhook subscriptions' },
            { name: 'ai:chat', description: 'Access AI chat features' },
            { name: 'payments:read', description: 'Read payment data' },
            { name: 'payments:write', description: 'Process payments' },
          ],
        },
      });
    }
  );

  // ===========================================================================
  // GET /admin/api-keys/stats - Get API key usage statistics
  // ===========================================================================
  app.get(
    '/stats',
    {
      schema: {
        description: 'Get API key usage statistics',
        tags: ['Admin', 'API Keys'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const [total, active, expired, recentlyUsed] = await Promise.all([
          prisma.apiKey.count(),
          prisma.apiKey.count({ where: { isActive: true } }),
          prisma.apiKey.count({
            where: {
              expiresAt: { lt: new Date() },
            },
          }),
          prisma.apiKey.count({
            where: {
              lastUsedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          }),
        ]);

        // Get keys by user
        const keysByUser = await prisma.apiKey.groupBy({
          by: ['userId'],
          where: { isActive: true },
          _count: true,
          orderBy: { _count: { userId: 'desc' } },
          take: 10,
        });

        return reply.send({
          success: true,
          data: {
            total,
            active,
            inactive: total - active,
            expired,
            usedLast24Hours: recentlyUsed,
            topUsersByKeys: keysByUser.map((u) => ({
              userId: u.userId,
              keyCount: u._count,
            })),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get API key stats');
        return reply.status(500).send({
          success: false,
          error: { code: 'STATS_ERROR', message: 'Failed to get API key statistics' },
        });
      }
    }
  );
}

// =============================================================================
// Exports for API Key Validation
// =============================================================================

export { hashApiKey };
