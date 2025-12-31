/**
 * Audit Log API Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { auditLogRoutes } from '../src/modules/admin/audit-logs';

// Mock Prisma
vi.mock('@realriches/database', () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock('@realriches/utils', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import mocked prisma
import { prisma } from '@realriches/database';

const mockPrisma = prisma as unknown as {
  auditLog: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
  user: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

// Valid UUIDs for testing
const ADMIN_USER_ID = '11111111-1111-1111-1111-111111111111';
const REGULAR_USER_ID = '22222222-2222-2222-2222-222222222222';
const TARGET_USER_ID = '33333333-3333-3333-3333-333333333333';
const LOG_ID_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LOG_ID_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// Mock user for authentication
const mockAdminUser = {
  id: ADMIN_USER_ID,
  email: 'admin@example.com',
  role: 'admin',
};

const mockRegularUser = {
  id: REGULAR_USER_ID,
  email: 'user@example.com',
  role: 'investor',
};

// Mock audit log entries
const mockAuditLogs = [
  {
    id: LOG_ID_1,
    actorId: ADMIN_USER_ID,
    actorEmail: 'admin@example.com',
    action: 'user.create',
    entityType: 'User',
    entityId: TARGET_USER_ID,
    changes: { firstName: 'John' },
    metadata: {},
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    requestId: 'req_123',
    timestamp: new Date('2025-01-15T10:00:00Z'),
    actor: {
      id: ADMIN_USER_ID,
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
    },
  },
  {
    id: LOG_ID_2,
    actorId: ADMIN_USER_ID,
    actorEmail: 'admin@example.com',
    action: 'listing.update',
    entityType: 'Listing',
    entityId: 'lst_789',
    changes: { status: 'active' },
    metadata: {},
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    requestId: 'req_124',
    timestamp: new Date('2025-01-15T11:00:00Z'),
    actor: {
      id: ADMIN_USER_ID,
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
    },
  },
];

describe('Audit Log API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // Add mock authenticate and authorize decorators
    app.decorate('authenticate', async (request: { user?: typeof mockAdminUser }) => {
      request.user = mockAdminUser;
    });

    app.decorate('authorize', (_request: unknown, reply: { code: (n: number) => { send: (obj: unknown) => void } }, opts: { roles: string[] }) => {
      const request = _request as { user?: { role: string } };
      if (!opts.roles.includes(request.user?.role || '')) {
        reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
      }
    });

    await app.register(auditLogRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('GET /admin/audit-logs', () => {
    it('should return paginated audit logs', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      mockPrisma.auditLog.count.mockResolvedValue(2);

      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.meta.total).toBe(2);
      expect(body.meta.page).toBe(1);
    });

    it('should filter by actorId', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([mockAuditLogs[0]]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const response = await app.inject({
        method: 'GET',
        url: `/?actorId=${ADMIN_USER_ID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });

    it('should filter by action', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([mockAuditLogs[0]]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const response = await app.inject({
        method: 'GET',
        url: '/?action=user.create',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });

    it('should filter by entityType', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([mockAuditLogs[1]]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const response = await app.inject({
        method: 'GET',
        url: '/?entityType=Listing',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });

    it('should filter by date range', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      mockPrisma.auditLog.count.mockResolvedValue(2);

      const response = await app.inject({
        method: 'GET',
        url: '/?startDate=2025-01-01T00:00:00Z&endDate=2025-01-31T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });

    it('should support pagination', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([mockAuditLogs[1]]);
      mockPrisma.auditLog.count.mockResolvedValue(2);

      const response = await app.inject({
        method: 'GET',
        url: '/?page=2&limit=1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.meta.page).toBe(2);
      expect(body.meta.limit).toBe(1);
    });

    it('should support sorting', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      mockPrisma.auditLog.count.mockResolvedValue(2);

      const response = await app.inject({
        method: 'GET',
        url: '/?sortBy=action&sortOrder=asc',
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { action: 'asc' },
        })
      );
    });
  });

  describe('GET /admin/audit-logs/stats', () => {
    it('should return audit log statistics', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(100);
      mockPrisma.auditLog.groupBy.mockResolvedValue([
        { action: 'user.create', _count: 50 },
        { action: 'listing.update', _count: 30 },
        { action: 'lease.sign', _count: 20 },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.total).toBe(100);
      expect(body.data.breakdown).toBeDefined();
    });

    it('should group by entityType', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(100);
      mockPrisma.auditLog.groupBy.mockResolvedValue([
        { entityType: 'User', _count: 40 },
        { entityType: 'Listing', _count: 35 },
        { entityType: 'Lease', _count: 25 },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/stats?groupBy=entityType',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.groupedBy).toBe('entityType');
    });

    it('should group by actor', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(100);
      mockPrisma.auditLog.groupBy.mockResolvedValue([
        { actorEmail: 'admin@example.com', _count: 60 },
        { actorEmail: 'user@example.com', _count: 40 },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/stats?groupBy=actor',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.groupedBy).toBe('actor');
    });

    it('should filter stats by date range', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(50);
      mockPrisma.auditLog.groupBy.mockResolvedValue([
        { action: 'user.create', _count: 50 },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/stats?startDate=2025-01-01T00:00:00Z&endDate=2025-01-15T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /admin/audit-logs/export', () => {
    it('should export audit logs as JSON', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);

      const response = await app.inject({
        method: 'GET',
        url: '/export?format=json',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it('should export audit logs as CSV', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);

      const response = await app.inject({
        method: 'GET',
        url: '/export?format=csv',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/csv');
      expect(response.headers['content-disposition']).toMatch(/attachment; filename="audit-logs-\d+\.csv"/);
      expect(response.payload).toContain('ID,Timestamp,Actor Email');
    });

    it('should respect export limit', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);

      await app.inject({
        method: 'GET',
        url: '/export?limit=500',
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 500,
        })
      );
    });

    it('should filter exports', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([mockAuditLogs[0]]);

      await app.inject({
        method: 'GET',
        url: '/export?entityType=User&action=user.create',
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: 'User',
            action: 'user.create',
          }),
        })
      );
    });
  });

  describe('GET /admin/audit-logs/:id', () => {
    it('should return a specific audit log entry', async () => {
      mockPrisma.auditLog.findUnique.mockResolvedValue(mockAuditLogs[0]);

      const response = await app.inject({
        method: 'GET',
        url: `/${LOG_ID_1}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(LOG_ID_1);
    });

    it('should return 404 for non-existent entry', async () => {
      mockPrisma.auditLog.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/cccccccc-cccc-cccc-cccc-cccccccccccc',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /admin/audit-logs/entity/:entityType/:entityId', () => {
    it('should return audit trail for an entity', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs.filter(l => l.entityType === 'User'));
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const response = await app.inject({
        method: 'GET',
        url: `/entity/User/${TARGET_USER_ID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.meta.entityType).toBe('User');
      expect(body.meta.entityId).toBe(TARGET_USER_ID);
    });

    it('should return empty array if no audit trail exists', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const response = await app.inject({
        method: 'GET',
        url: '/entity/Property/44444444-4444-4444-4444-444444444444',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveLength(0);
      expect(body.meta.total).toBe(0);
    });
  });

  describe('GET /admin/audit-logs/user/:userId', () => {
    it('should return audit trail for a user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: ADMIN_USER_ID,
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@example.com',
      });
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      mockPrisma.auditLog.count.mockResolvedValue(2);

      const response = await app.inject({
        method: 'GET',
        url: `/user/${ADMIN_USER_ID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.user.id).toBe(ADMIN_USER_ID);
      expect(body.data.logs).toHaveLength(2);
    });

    it('should return 404 for non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/user/55555555-5555-5555-5555-555555555555',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('USER_NOT_FOUND');
    });
  });
});

describe('Audit Log API - Authorization', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // Add mock authenticate that returns non-admin user
    app.decorate('authenticate', async (request: { user?: typeof mockRegularUser }) => {
      request.user = mockRegularUser;
    });

    app.decorate('authorize', (_request: unknown, reply: { code: (n: number) => { send: (obj: unknown) => void } }, opts: { roles: string[] }) => {
      const request = _request as { user?: { role: string } };
      if (!opts.roles.includes(request.user?.role || '')) {
        reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
      }
    });

    await app.register(auditLogRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject non-admin users for list endpoint', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('should reject non-admin users for stats endpoint', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/stats',
    });

    expect(response.statusCode).toBe(403);
  });

  it('should reject non-admin users for export endpoint', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/export',
    });

    expect(response.statusCode).toBe(403);
  });
});
