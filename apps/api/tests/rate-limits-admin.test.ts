/**
 * Rate Limit Admin API Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// Mock Prisma - inline values to avoid hoisting issues
vi.mock('@realriches/database', () => {
  const testUserId = '33333333-3333-3333-3333-333333333333';
  const testUser = {
    id: testUserId,
    email: 'user@example.com',
    role: 'investor',
    firstName: 'Test',
    lastName: 'User',
  };

  return {
    prisma: {
      user: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
          where.id === testUserId ? Promise.resolve(testUser) : Promise.resolve(null)
        ),
        groupBy: vi.fn().mockResolvedValue([
          { role: 'admin', _count: 5 },
          { role: 'investor', _count: 100 },
          { role: 'landlord', _count: 50 },
        ]),
      },
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'log_1',
            action: 'rate_limit_exceeded',
            actorId: testUserId,
            timestamp: new Date(),
            metadata: { category: 'ai' },
            actor: testUser,
          },
        ]),
        count: vi.fn().mockResolvedValue(15),
      },
    },
  };
});

import { rateLimitAdminRoutes } from '../src/modules/admin/rate-limits';

// User ID for tests
const mockUserId = '33333333-3333-3333-3333-333333333333';

// Mock rate limit service - inline values to avoid hoisting issues
vi.mock('../src/plugins/rate-limit', () => ({
  getRateLimitService: vi.fn().mockReturnValue({
    getState: vi.fn().mockResolvedValue({
      remaining: 50,
      limit: 100,
      reset: Date.now() + 60000,
    }),
    reset: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock types
vi.mock('@realriches/types', () => ({
  DEFAULT_TIER_LIMITS: {
    free: { default: { windowMs: 60000, max: 60 } },
    basic: { default: { windowMs: 60000, max: 120 } },
    professional: { default: { windowMs: 60000, max: 300 } },
    enterprise: { default: { windowMs: 60000, max: 1000 } },
  },
  getTierFromRole: vi.fn().mockImplementation((role: string) => {
    if (role === 'admin') return 'enterprise';
    if (role === 'landlord') return 'professional';
    return 'basic';
  }),
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

// Mock admin user
const mockAdminUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'admin@example.com',
  role: 'admin',
};

describe('Rate Limit Admin API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    app.decorate('authenticate', async (request: { user?: typeof mockAdminUser }) => {
      request.user = mockAdminUser;
    });

    app.decorate('authorize', (_request: unknown, reply: { code: (n: number) => { send: (obj: unknown) => void } }, opts: { roles: string[] }) => {
      const request = _request as { user?: { role: string } };
      if (!opts.roles.includes(request.user?.role || '')) {
        reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
      }
    });

    await app.register(rateLimitAdminRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /admin/rate-limits/tiers', () => {
    it('should return tier configurations', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/tiers',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.tiers).toBeDefined();
      expect(body.data.categories).toContain('default');
    });
  });

  describe('GET /admin/rate-limits/user/:userId', () => {
    it('should return user rate limit status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/user/${mockUserId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.user.id).toBe(mockUserId);
      expect(body.data.states).toBeDefined();
    });

    it('should return 404 for non-existent user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/user/44444444-4444-4444-4444-444444444444',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should filter by category', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/user/${mockUserId}?category=ai`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.states.ai).toBeDefined();
    });
  });

  describe('POST /admin/rate-limits/reset', () => {
    it('should reset rate limit for a user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/reset',
        payload: { userId: mockUserId },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.message).toContain('Rate limit reset');
    });

    it('should reset specific category', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/reset',
        payload: { userId: mockUserId, category: 'ai' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('ai');
    });
  });

  describe('GET /admin/rate-limits/exceeded', () => {
    it('should return users who exceeded rate limits', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/exceeded',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.events).toBeDefined();
      expect(body.data.summary).toBeDefined();
    });

    it('should respect hours parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/exceeded?hours=48',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.period.hours).toBe(48);
    });
  });

  describe('GET /admin/rate-limits/stats', () => {
    it('should return rate limit statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.usersByTier).toBeDefined();
      expect(body.data.last24Hours).toBeDefined();
    });
  });
});
