/**
 * User Impersonation Admin API
 *
 * Allows admins to view the platform as a specific user for debugging and support.
 * All actions during impersonation are logged in the audit trail.
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

const IMPERSONATION_PREFIX = 'impersonate:';
const IMPERSONATION_TTL = 3600; // 1 hour

// =============================================================================
// Types
// =============================================================================

interface ImpersonationSession {
  adminId: string;
  adminEmail: string;
  targetUserId: string;
  targetUserEmail: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
}

// =============================================================================
// Schemas
// =============================================================================

const StartImpersonationSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().min(10).max(500),
});

// =============================================================================
// Helper Functions
// =============================================================================

function getRedis(app: FastifyInstance): Redis | null {
  return (app as unknown as { redis?: Redis }).redis || null;
}

async function getImpersonationSession(
  redis: Redis | null,
  adminId: string
): Promise<ImpersonationSession | null> {
  if (!redis) return null;
  const data = await redis.get(`${IMPERSONATION_PREFIX}${adminId}`);
  return data ? JSON.parse(data) : null;
}

async function setImpersonationSession(
  redis: Redis | null,
  adminId: string,
  session: ImpersonationSession
): Promise<void> {
  if (!redis) return;
  await redis.setex(
    `${IMPERSONATION_PREFIX}${adminId}`,
    IMPERSONATION_TTL,
    JSON.stringify(session)
  );
}

async function deleteImpersonationSession(
  redis: Redis | null,
  adminId: string
): Promise<void> {
  if (!redis) return;
  await redis.del(`${IMPERSONATION_PREFIX}${adminId}`);
}

async function listActiveImpersonations(redis: Redis | null): Promise<ImpersonationSession[]> {
  if (!redis) return [];

  const keys = await redis.keys(`${IMPERSONATION_PREFIX}*`);
  if (keys.length === 0) return [];

  const sessions: ImpersonationSession[] = [];
  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      sessions.push(JSON.parse(data));
    }
  }

  return sessions;
}

// =============================================================================
// Routes
// =============================================================================

export async function impersonationAdminRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================================================
  // POST /admin/impersonate - Start impersonating a user
  // ===========================================================================
  app.post(
    '/',
    {
      schema: {
        description: 'Start impersonating a user',
        tags: ['Admin', 'Impersonation'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['userId', 'reason'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
            reason: { type: 'string', minLength: 10, maxLength: 500 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Body: { userId: string; reason: string } }>, reply: FastifyReply) => {
      try {
        const params = StartImpersonationSchema.parse(request.body);
        const adminId = request.user?.id;
        const adminEmail = request.user?.email;

        if (!adminId || !adminEmail) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Admin not authenticated' },
          });
        }

        // Cannot impersonate yourself
        if (params.userId === adminId) {
          return reply.status(400).send({
            success: false,
            error: { code: 'INVALID_TARGET', message: 'Cannot impersonate yourself' },
          });
        }

        // Get target user
        const targetUser = await prisma.user.findUnique({
          where: { id: params.userId },
          select: { id: true, email: true, role: true, firstName: true, lastName: true },
        });

        if (!targetUser) {
          return reply.status(404).send({
            success: false,
            error: { code: 'USER_NOT_FOUND', message: 'Target user not found' },
          });
        }

        // Cannot impersonate other admins
        if (targetUser.role === 'admin') {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Cannot impersonate admin users' },
          });
        }

        const redis = getRedis(app);

        // Check if already impersonating
        const existing = await getImpersonationSession(redis, adminId);
        if (existing) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'ALREADY_IMPERSONATING',
              message: `Already impersonating ${existing.targetUserEmail}. End current session first.`,
            },
          });
        }

        // Create session
        const now = new Date();
        const expiresAt = new Date(now.getTime() + IMPERSONATION_TTL * 1000);

        const session: ImpersonationSession = {
          adminId,
          adminEmail,
          targetUserId: targetUser.id,
          targetUserEmail: targetUser.email,
          reason: params.reason,
          startedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        };

        await setImpersonationSession(redis, adminId, session);

        // Create audit log
        await prisma.auditLog.create({
          data: {
            action: 'impersonation_started',
            actorId: adminId,
            targetType: 'user',
            targetId: targetUser.id,
            metadata: {
              targetEmail: targetUser.email,
              reason: params.reason,
              expiresAt: expiresAt.toISOString(),
            },
          },
        });

        logger.info({
          msg: 'impersonation_started',
          adminId,
          adminEmail,
          targetUserId: targetUser.id,
          targetEmail: targetUser.email,
          reason: params.reason,
        });

        return reply.send({
          success: true,
          data: {
            session,
            targetUser: {
              id: targetUser.id,
              email: targetUser.email,
              name: `${targetUser.firstName} ${targetUser.lastName}`,
              role: targetUser.role,
            },
            message: 'Impersonation session started. All actions will be logged.',
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to start impersonation');
        return reply.status(500).send({
          success: false,
          error: { code: 'START_ERROR', message: 'Failed to start impersonation' },
        });
      }
    }
  );

  // ===========================================================================
  // DELETE /admin/impersonate - End impersonation session
  // ===========================================================================
  app.delete(
    '/',
    {
      schema: {
        description: 'End current impersonation session',
        tags: ['Admin', 'Impersonation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const adminId = request.user?.id;
        if (!adminId) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Admin not authenticated' },
          });
        }

        const redis = getRedis(app);
        const session = await getImpersonationSession(redis, adminId);

        if (!session) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NO_SESSION', message: 'No active impersonation session' },
          });
        }

        await deleteImpersonationSession(redis, adminId);

        // Create audit log
        await prisma.auditLog.create({
          data: {
            action: 'impersonation_ended',
            actorId: adminId,
            targetType: 'user',
            targetId: session.targetUserId,
            metadata: {
              targetEmail: session.targetUserEmail,
              duration: Math.floor(
                (Date.now() - new Date(session.startedAt).getTime()) / 1000
              ),
            },
          },
        });

        logger.info({
          msg: 'impersonation_ended',
          adminId,
          targetUserId: session.targetUserId,
        });

        return reply.send({
          success: true,
          message: 'Impersonation session ended',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to end impersonation');
        return reply.status(500).send({
          success: false,
          error: { code: 'END_ERROR', message: 'Failed to end impersonation' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/impersonate - Get current impersonation status
  // ===========================================================================
  app.get(
    '/',
    {
      schema: {
        description: 'Get current impersonation session',
        tags: ['Admin', 'Impersonation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const adminId = request.user?.id;
        if (!adminId) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Admin not authenticated' },
          });
        }

        const redis = getRedis(app);
        const session = await getImpersonationSession(redis, adminId);

        if (!session) {
          return reply.send({
            success: true,
            data: { active: false },
          });
        }

        // Get target user details
        const targetUser = await prisma.user.findUnique({
          where: { id: session.targetUserId },
          select: { id: true, email: true, role: true, firstName: true, lastName: true },
        });

        return reply.send({
          success: true,
          data: {
            active: true,
            session,
            targetUser: targetUser
              ? {
                  id: targetUser.id,
                  email: targetUser.email,
                  name: `${targetUser.firstName} ${targetUser.lastName}`,
                  role: targetUser.role,
                }
              : null,
            remainingSeconds: Math.max(
              0,
              Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
            ),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get impersonation status');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get impersonation status' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/impersonate/active - List all active impersonation sessions
  // ===========================================================================
  app.get(
    '/active',
    {
      schema: {
        description: 'List all active impersonation sessions',
        tags: ['Admin', 'Impersonation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const redis = getRedis(app);
        const sessions = await listActiveImpersonations(redis);

        return reply.send({
          success: true,
          data: {
            sessions,
            count: sessions.length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list active impersonations');
        return reply.status(500).send({
          success: false,
          error: { code: 'LIST_ERROR', message: 'Failed to list active impersonations' },
        });
      }
    }
  );

  // ===========================================================================
  // DELETE /admin/impersonate/:adminId - Force end another admin's session
  // ===========================================================================
  app.delete(
    '/:adminId',
    {
      schema: {
        description: 'Force end another admin impersonation session',
        tags: ['Admin', 'Impersonation'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['adminId'],
          properties: { adminId: { type: 'string', format: 'uuid' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { adminId: string } }>, reply: FastifyReply) => {
      try {
        const redis = getRedis(app);
        const session = await getImpersonationSession(redis, request.params.adminId);

        if (!session) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NO_SESSION', message: 'No active impersonation session for this admin' },
          });
        }

        await deleteImpersonationSession(redis, request.params.adminId);

        // Create audit log
        await prisma.auditLog.create({
          data: {
            action: 'impersonation_force_ended',
            actorId: request.user?.id,
            targetType: 'user',
            targetId: session.adminId,
            metadata: {
              forcedByAdminId: request.user?.id,
              originalAdmin: session.adminEmail,
              targetUser: session.targetUserEmail,
            },
          },
        });

        logger.info({
          msg: 'impersonation_force_ended',
          forcedByAdminId: request.user?.id,
          originalAdminId: request.params.adminId,
          targetUserId: session.targetUserId,
        });

        return reply.send({
          success: true,
          message: 'Impersonation session forcibly ended',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to force end impersonation');
        return reply.status(500).send({
          success: false,
          error: { code: 'END_ERROR', message: 'Failed to force end impersonation' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/impersonate/history - Get impersonation history from audit logs
  // ===========================================================================
  app.get(
    '/history',
    {
      schema: {
        description: 'Get impersonation history from audit logs',
        tags: ['Admin', 'Impersonation'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            adminId: { type: 'string', format: 'uuid' },
            targetUserId: { type: 'string', format: 'uuid' },
            limit: { type: 'integer', default: 50 },
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
        Querystring: { adminId?: string; targetUserId?: string; limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { adminId, targetUserId, limit = 50 } = request.query;

        const where: Record<string, unknown> = {
          action: { in: ['impersonation_started', 'impersonation_ended', 'impersonation_force_ended'] },
        };

        if (adminId) {
          where.actorId = adminId;
        }
        if (targetUserId) {
          where.targetId = targetUserId;
        }

        const logs = await prisma.auditLog.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          take: limit,
          include: {
            actor: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        });

        return reply.send({
          success: true,
          data: logs,
          meta: { count: logs.length },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get impersonation history');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get impersonation history' },
        });
      }
    }
  );
}
