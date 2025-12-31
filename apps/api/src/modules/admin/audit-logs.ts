/**
 * Audit Log Admin API
 *
 * Provides admin endpoints for querying and exporting audit logs.
 * All endpoints require admin role.
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Schemas
// =============================================================================

const AuditLogQuerySchema = z.object({
  // Filters
  actorId: z.string().uuid().optional(),
  actorEmail: z.string().optional(),
  action: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  ipAddress: z.string().optional(),

  // Date range
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),

  // Search
  search: z.string().optional(),

  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),

  // Sorting
  sortBy: z.enum(['timestamp', 'action', 'entityType', 'actorEmail']).default('timestamp'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const AuditLogStatsQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  groupBy: z.enum(['action', 'entityType', 'actor', 'day', 'hour']).default('action'),
});

const ExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  actorId: z.string().uuid().optional(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
});

// =============================================================================
// Types
// =============================================================================

type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
type AuditLogStatsQuery = z.infer<typeof AuditLogStatsQuerySchema>;
type ExportQuery = z.infer<typeof ExportQuerySchema>;

interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  changes: unknown;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  timestamp: Date;
  actor?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

// =============================================================================
// Service Functions
// =============================================================================

async function queryAuditLogs(params: AuditLogQuery) {
  const {
    actorId,
    actorEmail,
    action,
    entityType,
    entityId,
    ipAddress,
    startDate,
    endDate,
    search,
    page,
    limit,
    sortBy,
    sortOrder,
  } = params;

  // Build where clause
  const where: Record<string, unknown> = {};

  if (actorId) where.actorId = actorId;
  if (actorEmail) where.actorEmail = { contains: actorEmail, mode: 'insensitive' };
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (ipAddress) where.ipAddress = ipAddress;

  // Date range
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) (where.timestamp as Record<string, Date>).gte = new Date(startDate);
    if (endDate) (where.timestamp as Record<string, Date>).lte = new Date(endDate);
  }

  // Search across multiple fields
  if (search) {
    where.OR = [
      { actorEmail: { contains: search, mode: 'insensitive' } },
      { action: { contains: search, mode: 'insensitive' } },
      { entityType: { contains: search, mode: 'insensitive' } },
      { entityId: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Execute query
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        actor: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: logs,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  };
}

async function getAuditLogById(id: string): Promise<AuditLogEntry | null> {
  return prisma.auditLog.findUnique({
    where: { id },
    include: {
      actor: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
}

async function getAuditLogStats(params: AuditLogStatsQuery) {
  const { startDate, endDate, groupBy } = params;

  // Build date filter
  const dateFilter: Record<string, unknown> = {};
  if (startDate || endDate) {
    dateFilter.timestamp = {};
    if (startDate) (dateFilter.timestamp as Record<string, Date>).gte = new Date(startDate);
    if (endDate) (dateFilter.timestamp as Record<string, Date>).lte = new Date(endDate);
  }

  // Get total count
  const totalCount = await prisma.auditLog.count({ where: dateFilter });

  // Get grouped stats based on groupBy parameter
  let groupedStats: Array<{ label: string; count: number }> = [];

  switch (groupBy) {
    case 'action': {
      const stats = await prisma.auditLog.groupBy({
        by: ['action'],
        where: dateFilter,
        _count: true,
        orderBy: { _count: { action: 'desc' } },
        take: 20,
      });
      groupedStats = stats.map((s) => ({ label: s.action, count: s._count }));
      break;
    }
    case 'entityType': {
      const stats = await prisma.auditLog.groupBy({
        by: ['entityType'],
        where: dateFilter,
        _count: true,
        orderBy: { _count: { entityType: 'desc' } },
        take: 20,
      });
      groupedStats = stats.map((s) => ({ label: s.entityType, count: s._count }));
      break;
    }
    case 'actor': {
      const stats = await prisma.auditLog.groupBy({
        by: ['actorEmail'],
        where: { ...dateFilter, actorEmail: { not: null } },
        _count: true,
        orderBy: { _count: { actorEmail: 'desc' } },
        take: 20,
      });
      groupedStats = stats.map((s) => ({ label: s.actorEmail || 'unknown', count: s._count }));
      break;
    }
    case 'day':
    case 'hour': {
      // For time-based grouping, we need raw SQL or aggregation
      // Using a simpler approach with recent entries
      const recentLogs = await prisma.auditLog.findMany({
        where: dateFilter,
        select: { timestamp: true },
        orderBy: { timestamp: 'desc' },
        take: 10000,
      });

      const grouped = new Map<string, number>();
      for (const log of recentLogs) {
        const date = new Date(log.timestamp);
        const key = groupBy === 'day'
          ? date.toISOString().split('T')[0]
          : `${date.toISOString().split('T')[0]} ${date.getHours().toString().padStart(2, '0')}:00`;
        grouped.set(key, (grouped.get(key) || 0) + 1);
      }

      groupedStats = Array.from(grouped.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.label.localeCompare(a.label))
        .slice(0, 30);
      break;
    }
  }

  // Get recent activity summary
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [last24h, lastWeek, uniqueActors] = await Promise.all([
    prisma.auditLog.count({ where: { timestamp: { gte: oneDayAgo } } }),
    prisma.auditLog.count({ where: { timestamp: { gte: oneWeekAgo } } }),
    prisma.auditLog.groupBy({
      by: ['actorId'],
      where: { ...dateFilter, actorId: { not: null } },
    }),
  ]);

  return {
    total: totalCount,
    last24Hours: last24h,
    lastWeek: lastWeek,
    uniqueActors: uniqueActors.length,
    groupedBy: groupBy,
    breakdown: groupedStats,
  };
}

async function exportAuditLogs(params: ExportQuery) {
  const { format, startDate, endDate, actorId, entityType, action, limit } = params;

  const where: Record<string, unknown> = {};

  if (actorId) where.actorId = actorId;
  if (entityType) where.entityType = entityType;
  if (action) where.action = action;

  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) (where.timestamp as Record<string, Date>).gte = new Date(startDate);
    if (endDate) (where.timestamp as Record<string, Date>).lte = new Date(endDate);
  }

  const logs = await prisma.auditLog.findMany({
    where,
    take: limit,
    orderBy: { timestamp: 'desc' },
    include: {
      actor: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  if (format === 'csv') {
    return convertToCSV(logs);
  }

  return logs;
}

function convertToCSV(logs: AuditLogEntry[]): string {
  const headers = [
    'ID',
    'Timestamp',
    'Actor Email',
    'Actor Name',
    'Action',
    'Entity Type',
    'Entity ID',
    'IP Address',
    'User Agent',
    'Request ID',
  ];

  const rows = logs.map((log) => [
    log.id,
    log.timestamp.toISOString(),
    log.actorEmail || '',
    log.actor ? `${log.actor.firstName} ${log.actor.lastName}` : '',
    log.action,
    log.entityType,
    log.entityId,
    log.ipAddress || '',
    (log.userAgent || '').replace(/"/g, '""'),
    log.requestId || '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  return csvContent;
}

// =============================================================================
// Routes
// =============================================================================

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================================================
  // GET /admin/audit-logs - List audit logs with filters
  // ===========================================================================
  app.get(
    '/',
    {
      schema: {
        description: 'List audit logs with filtering, pagination, and sorting',
        tags: ['Admin', 'Audit'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            actorId: { type: 'string', format: 'uuid' },
            actorEmail: { type: 'string' },
            action: { type: 'string' },
            entityType: { type: 'string' },
            entityId: { type: 'string' },
            ipAddress: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            search: { type: 'string' },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
            sortBy: { type: 'string', enum: ['timestamp', 'action', 'entityType', 'actorEmail'] },
            sortOrder: { type: 'string', enum: ['asc', 'desc'] },
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
        const params = AuditLogQuerySchema.parse(request.query);
        const result = await queryAuditLogs(params);

        logger.info({
          msg: 'audit_logs_queried',
          userId: request.user?.id,
          filters: {
            actorId: params.actorId,
            action: params.action,
            entityType: params.entityType,
            dateRange: params.startDate || params.endDate ? true : false,
          },
          resultCount: result.data.length,
        });

        return reply.send({ success: true, ...result });
      } catch (error) {
        logger.error({ error }, 'Failed to query audit logs');
        return reply.status(500).send({
          success: false,
          error: { code: 'QUERY_ERROR', message: 'Failed to query audit logs' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/audit-logs/stats - Get audit log statistics
  // ===========================================================================
  app.get(
    '/stats',
    {
      schema: {
        description: 'Get audit log statistics and breakdowns',
        tags: ['Admin', 'Audit'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            groupBy: { type: 'string', enum: ['action', 'entityType', 'actor', 'day', 'hour'] },
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
        const params = AuditLogStatsQuerySchema.parse(request.query);
        const stats = await getAuditLogStats(params);

        return reply.send({ success: true, data: stats });
      } catch (error) {
        logger.error({ error }, 'Failed to get audit log stats');
        return reply.status(500).send({
          success: false,
          error: { code: 'STATS_ERROR', message: 'Failed to get audit log statistics' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/audit-logs/export - Export audit logs
  // ===========================================================================
  app.get(
    '/export',
    {
      schema: {
        description: 'Export audit logs as JSON or CSV',
        tags: ['Admin', 'Audit'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            actorId: { type: 'string', format: 'uuid' },
            entityType: { type: 'string' },
            action: { type: 'string' },
            limit: { type: 'integer', default: 1000, maximum: 10000 },
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
        const params = ExportQuerySchema.parse(request.query);
        const result = await exportAuditLogs(params);

        logger.info({
          msg: 'audit_logs_exported',
          userId: request.user?.id,
          format: params.format,
          limit: params.limit,
        });

        if (params.format === 'csv') {
          reply.header('Content-Type', 'text/csv');
          reply.header('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);
          return reply.send(result);
        }

        return reply.send({ success: true, data: result, count: (result as unknown[]).length });
      } catch (error) {
        logger.error({ error }, 'Failed to export audit logs');
        return reply.status(500).send({
          success: false,
          error: { code: 'EXPORT_ERROR', message: 'Failed to export audit logs' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/audit-logs/:id - Get specific audit log entry
  // ===========================================================================
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get a specific audit log entry by ID',
        tags: ['Admin', 'Audit'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const log = await getAuditLogById(request.params.id);

        if (!log) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Audit log entry not found' },
          });
        }

        return reply.send({ success: true, data: log });
      } catch (error) {
        logger.error({ error }, 'Failed to get audit log entry');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get audit log entry' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/audit-logs/entity/:type/:id - Get audit trail for entity
  // ===========================================================================
  app.get(
    '/entity/:entityType/:entityId',
    {
      schema: {
        description: 'Get audit trail for a specific entity',
        tags: ['Admin', 'Audit'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['entityType', 'entityId'],
          properties: {
            entityType: { type: 'string' },
            entityId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', default: 1 },
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
        Params: { entityType: string; entityId: string };
        Querystring: { page?: number; limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { entityType, entityId } = request.params;
        const page = request.query.page || 1;
        const limit = request.query.limit || 50;

        const [logs, total] = await Promise.all([
          prisma.auditLog.findMany({
            where: { entityType, entityId },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { timestamp: 'desc' },
            include: {
              actor: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          }),
          prisma.auditLog.count({ where: { entityType, entityId } }),
        ]);

        return reply.send({
          success: true,
          data: logs,
          meta: {
            entityType,
            entityId,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get entity audit trail');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get entity audit trail' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/audit-logs/user/:userId - Get audit trail for user
  // ===========================================================================
  app.get(
    '/user/:userId',
    {
      schema: {
        description: 'Get all audit logs for a specific user (as actor)',
        tags: ['Admin', 'Audit'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', default: 1 },
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
        Params: { userId: string };
        Querystring: { page?: number; limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { userId } = request.params;
        const page = request.query.page || 1;
        const limit = request.query.limit || 50;

        // Get user info
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, firstName: true, lastName: true, email: true },
        });

        if (!user) {
          return reply.status(404).send({
            success: false,
            error: { code: 'USER_NOT_FOUND', message: 'User not found' },
          });
        }

        const [logs, total] = await Promise.all([
          prisma.auditLog.findMany({
            where: { actorId: userId },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { timestamp: 'desc' },
          }),
          prisma.auditLog.count({ where: { actorId: userId } }),
        ]);

        return reply.send({
          success: true,
          data: {
            user,
            logs,
          },
          meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get user audit trail');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get user audit trail' },
        });
      }
    }
  );
}
