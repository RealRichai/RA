/**
 * Data Export API
 *
 * GDPR-compliant data export for users (properties, leases, documents, payment history).
 * Supports both user-initiated and admin-initiated exports.
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

const EXPORT_PREFIX = 'export:';
const EXPORT_TTL = 86400; // 24 hours

// =============================================================================
// Types
// =============================================================================

type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface ExportJob {
  id: string;
  userId: string;
  requestedBy: string;
  requestedByType: 'user' | 'admin';
  status: ExportStatus;
  sections: string[];
  format: 'json' | 'csv';
  createdAt: string;
  completedAt?: string;
  downloadUrl?: string;
  expiresAt?: string;
  error?: string;
  progress?: number;
}

interface ExportData {
  exportedAt: string;
  requestedBy: string;
  userId: string;
  sections: Record<string, unknown>;
}

// =============================================================================
// Schemas
// =============================================================================

const CreateExportSchema = z.object({
  userId: z.string().uuid(),
  sections: z.array(z.enum([
    'profile',
    'properties',
    'units',
    'listings',
    'leases',
    'payments',
    'documents',
    'notifications',
    'audit_logs',
    'ai_conversations',
  ])).min(1),
  format: z.enum(['json', 'csv']).default('json'),
});

// =============================================================================
// Helper Functions
// =============================================================================

function getRedis(app: FastifyInstance): Redis | null {
  return (app as unknown as { redis?: Redis }).redis || null;
}

function generateExportId(): string {
  return `exp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function getExportJob(redis: Redis | null, exportId: string): Promise<ExportJob | null> {
  if (!redis) return null;
  const data = await redis.get(`${EXPORT_PREFIX}${exportId}`);
  return data ? JSON.parse(data) : null;
}

async function setExportJob(redis: Redis | null, job: ExportJob): Promise<void> {
  if (!redis) return;
  await redis.setex(`${EXPORT_PREFIX}${job.id}`, EXPORT_TTL, JSON.stringify(job));
}

async function listUserExports(redis: Redis | null, userId: string): Promise<ExportJob[]> {
  if (!redis) return [];

  const keys = await redis.keys(`${EXPORT_PREFIX}*`);
  const jobs: ExportJob[] = [];

  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      const job = JSON.parse(data) as ExportJob;
      if (job.userId === userId) {
        jobs.push(job);
      }
    }
  }

  return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// =============================================================================
// Export Data Collectors
// =============================================================================

async function collectProfileData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      status: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
    },
  });

  const profiles = await Promise.all([
    prisma.landlordProfile.findUnique({ where: { userId } }),
    prisma.tenantProfile.findUnique({ where: { userId } }),
    prisma.agentProfile.findUnique({ where: { userId } }),
    prisma.investorProfile.findUnique({ where: { userId } }),
  ]);

  return {
    user,
    profiles: {
      landlord: profiles[0],
      tenant: profiles[1],
      agent: profiles[2],
      investor: profiles[3],
    },
  };
}

async function collectPropertiesData(userId: string) {
  return prisma.property.findMany({
    where: { ownerId: userId },
    include: {
      units: {
        select: {
          id: true,
          unitNumber: true,
          floor: true,
          bedrooms: true,
          bathrooms: true,
          squareFeet: true,
          marketRentAmount: true,
          status: true,
        },
      },
    },
  });
}

async function collectUnitsData(userId: string) {
  return prisma.unit.findMany({
    where: { property: { ownerId: userId } },
    select: {
      id: true,
      unitNumber: true,
      floor: true,
      bedrooms: true,
      bathrooms: true,
      squareFeet: true,
      marketRentAmount: true,
      status: true,
      amenities: true,
      propertyId: true,
    },
  });
}

async function collectListingsData(userId: string) {
  return prisma.listing.findMany({
    where: {
      OR: [
        { landlordId: userId },
        { unit: { property: { ownerId: userId } } },
      ],
    },
    select: {
      id: true,
      title: true,
      description: true,
      priceAmount: true,
      securityDepositAmount: true,
      availableDate: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      viewCount: true,
    },
  });
}

async function collectLeasesData(userId: string) {
  return prisma.lease.findMany({
    where: {
      OR: [
        { primaryTenantId: userId },
        { landlordId: userId },
        { unit: { property: { ownerId: userId } } },
      ],
    },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      monthlyRentAmount: true,
      securityDepositAmount: true,
      allSignaturesComplete: true,
      createdAt: true,
      type: true,
    },
  });
}

async function collectPaymentsData(userId: string) {
  return prisma.payment.findMany({
    where: {
      OR: [
        { payerId: userId },
        { payeeId: userId },
        { lease: { unit: { property: { ownerId: userId } } } },
      ],
    },
    select: {
      id: true,
      amount: true,
      type: true,
      status: true,
      paidAt: true,
      createdAt: true,
      description: true,
    },
  });
}

async function collectDocumentsData(userId: string) {
  return prisma.document.findMany({
    where: {
      OR: [
        { uploadedBy: userId },
        { ownerId: userId },
      ],
    },
    select: {
      id: true,
      name: true,
      type: true,
      mimeType: true,
      size: true,
      createdAt: true,
      // Exclude actual file content/URLs for security
    },
  });
}

async function collectNotificationsData(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      readAt: true,
      createdAt: true,
    },
    take: 1000, // Limit to recent 1000
    orderBy: { createdAt: 'desc' },
  });
}

async function collectAuditLogsData(userId: string) {
  return prisma.auditLog.findMany({
    where: { actorId: userId },
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      timestamp: true,
      ipAddress: true,
    },
    take: 1000,
    orderBy: { timestamp: 'desc' },
  });
}

async function collectAIConversationsData(userId: string) {
  return prisma.aIConversation.findMany({
    where: { userId },
    select: {
      id: true,
      agentType: true,
      context: true,
      createdAt: true,
      messages: {
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
        },
      },
    },
    take: 100,
    orderBy: { createdAt: 'desc' },
  });
}

async function processExport(redis: Redis | null, job: ExportJob): Promise<void> {
  try {
    // Update status to processing
    job.status = 'processing';
    job.progress = 0;
    await setExportJob(redis, job);

    const exportData: ExportData = {
      exportedAt: new Date().toISOString(),
      requestedBy: job.requestedBy,
      userId: job.userId,
      sections: {},
    };

    const sectionCollectors: Record<string, (userId: string) => Promise<unknown>> = {
      profile: collectProfileData,
      properties: collectPropertiesData,
      units: collectUnitsData,
      listings: collectListingsData,
      leases: collectLeasesData,
      payments: collectPaymentsData,
      documents: collectDocumentsData,
      notifications: collectNotificationsData,
      audit_logs: collectAuditLogsData,
      ai_conversations: collectAIConversationsData,
    };

    // Collect each section
    for (let i = 0; i < job.sections.length; i++) {
      const section = job.sections[i];
      const collector = sectionCollectors[section];

      if (collector) {
        exportData.sections[section] = await collector(job.userId);
      }

      job.progress = Math.round(((i + 1) / job.sections.length) * 100);
      await setExportJob(redis, job);
    }

    // In production, this would upload to S3/storage and provide a download URL
    // For now, we store the data in Redis temporarily
    const exportDataKey = `${EXPORT_PREFIX}data:${job.id}`;
    if (redis) {
      await redis.setex(exportDataKey, EXPORT_TTL, JSON.stringify(exportData));
    }

    // Update job as completed
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.expiresAt = new Date(Date.now() + EXPORT_TTL * 1000).toISOString();
    job.progress = 100;
    await setExportJob(redis, job);

    logger.info({
      msg: 'export_completed',
      exportId: job.id,
      userId: job.userId,
      sections: job.sections,
    });
  } catch (error) {
    job.status = 'failed';
    job.error = (error as Error).message;
    await setExportJob(redis, job);

    logger.error({ error, exportId: job.id }, 'Export failed');
  }
}

// =============================================================================
// Routes
// =============================================================================

export async function dataExportRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================================================
  // POST /admin/exports - Create a data export request
  // ===========================================================================
  app.post(
    '/',
    {
      schema: {
        description: 'Create a data export request',
        tags: ['Admin', 'Data Export'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['userId', 'sections'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
            sections: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'profile', 'properties', 'units', 'listings',
                  'leases', 'payments', 'documents', 'notifications',
                  'audit_logs', 'ai_conversations',
                ],
              },
            },
            format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Body: { userId: string; sections: string[]; format?: string } }>, reply: FastifyReply) => {
      try {
        const params = CreateExportSchema.parse(request.body);
        const redis = getRedis(app);

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

        // Create export job
        const job: ExportJob = {
          id: generateExportId(),
          userId: params.userId,
          requestedBy: request.user?.id || 'unknown',
          requestedByType: 'admin',
          status: 'pending',
          sections: params.sections,
          format: params.format,
          createdAt: new Date().toISOString(),
        };

        await setExportJob(redis, job);

        // Create audit log
        await prisma.auditLog.create({
          data: {
            action: 'data_export_requested',
            actorId: request.user?.id,
            entityType: 'user',
            entityId: params.userId,
            metadata: {
              exportId: job.id,
              sections: params.sections,
              format: params.format,
            },
          },
        });

        // Start processing in background (in production, use a job queue)
        setImmediate(() => processExport(redis, job));

        logger.info({
          msg: 'data_export_requested',
          exportId: job.id,
          userId: params.userId,
          requestedBy: request.user?.id,
          sections: params.sections,
        });

        return reply.status(202).send({
          success: true,
          data: job,
          message: 'Export request created. Check status for progress.',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to create export request');
        return reply.status(500).send({
          success: false,
          error: { code: 'CREATE_ERROR', message: 'Failed to create export request' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/exports/:id - Get export status
  // ===========================================================================
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get export status',
        tags: ['Admin', 'Data Export'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const redis = getRedis(app);
        const job = await getExportJob(redis, request.params.id);

        if (!job) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Export job not found' },
          });
        }

        return reply.send({ success: true, data: job });
      } catch (error) {
        logger.error({ error }, 'Failed to get export status');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get export status' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/exports/:id/download - Download export data
  // ===========================================================================
  app.get(
    '/:id/download',
    {
      schema: {
        description: 'Download export data',
        tags: ['Admin', 'Data Export'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const redis = getRedis(app);
        const job = await getExportJob(redis, request.params.id);

        if (!job) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Export job not found' },
          });
        }

        if (job.status !== 'completed') {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'NOT_READY',
              message: `Export is ${job.status}`,
              progress: job.progress,
            },
          });
        }

        // Get export data
        const exportDataKey = `${EXPORT_PREFIX}data:${job.id}`;
        const exportData = redis ? await redis.get(exportDataKey) : null;

        if (!exportData) {
          return reply.status(410).send({
            success: false,
            error: { code: 'EXPIRED', message: 'Export data has expired' },
          });
        }

        // Log download
        await prisma.auditLog.create({
          data: {
            action: 'data_export_downloaded',
            actorId: request.user?.id,
            entityType: 'user',
            entityId: job.userId,
            metadata: { exportId: job.id },
          },
        });

        // Return as JSON
        return reply
          .header('Content-Type', 'application/json')
          .header('Content-Disposition', `attachment; filename="export-${job.userId}-${job.id}.json"`)
          .send(exportData);
      } catch (error) {
        logger.error({ error }, 'Failed to download export');
        return reply.status(500).send({
          success: false,
          error: { code: 'DOWNLOAD_ERROR', message: 'Failed to download export' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/exports/user/:userId - List exports for a user
  // ===========================================================================
  app.get(
    '/user/:userId',
    {
      schema: {
        description: 'List exports for a user',
        tags: ['Admin', 'Data Export'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string', format: 'uuid' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      try {
        const redis = getRedis(app);
        const exports = await listUserExports(redis, request.params.userId);

        return reply.send({
          success: true,
          data: exports,
          meta: { count: exports.length },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list user exports');
        return reply.status(500).send({
          success: false,
          error: { code: 'LIST_ERROR', message: 'Failed to list user exports' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/exports/sections - List available export sections
  // ===========================================================================
  app.get(
    '/sections',
    {
      schema: {
        description: 'List available export sections',
        tags: ['Admin', 'Data Export'],
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
          sections: [
            { id: 'profile', name: 'User Profile', description: 'Basic user information and role-specific profiles' },
            { id: 'properties', name: 'Properties', description: 'Properties owned by the user' },
            { id: 'units', name: 'Units', description: 'Units within owned properties' },
            { id: 'listings', name: 'Listings', description: 'Property listings created by or for the user' },
            { id: 'leases', name: 'Leases', description: 'Lease agreements as tenant or landlord' },
            { id: 'payments', name: 'Payments', description: 'Payment history' },
            { id: 'documents', name: 'Documents', description: 'Document metadata (not files)' },
            { id: 'notifications', name: 'Notifications', description: 'Notification history' },
            { id: 'audit_logs', name: 'Audit Logs', description: 'Activity history' },
            { id: 'ai_conversations', name: 'AI Conversations', description: 'AI chat history' },
          ],
          formats: ['json', 'csv'],
        },
      });
    }
  );
}
