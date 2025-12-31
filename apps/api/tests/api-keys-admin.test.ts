/**
 * API Key Admin API Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// Constants for test IDs
const TEST_USER_ID = '33333333-3333-3333-3333-333333333333';
const TEST_API_KEY_ID = '55555555-5555-5555-5555-555555555555';

// Mock Prisma - inline values to avoid hoisting issues
vi.mock('@realriches/database', () => {
  const testUser = {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'investor',
  };

  const testApiKey = {
    id: '55555555-5555-5555-5555-555555555555',
    userId: testUser.id,
    name: 'Test API Key',
    keyPrefix: 'rr_abcd',
    hashedKey: 'abc123hashed',
    scopes: ['read:properties', 'read:listings'],
    isActive: true,
    lastUsedAt: new Date(),
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: testUser,
  };

  return {
    prisma: {
      user: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
          where.id === testUser.id ? Promise.resolve(testUser) : Promise.resolve(null)
        ),
      },
      apiKey: {
        findMany: vi.fn().mockResolvedValue([testApiKey]),
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
          where.id === testApiKey.id ? Promise.resolve(testApiKey) : Promise.resolve(null)
        ),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: '66666666-6666-6666-6666-666666666666',
            ...data,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ),
        update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          if (where.id === testApiKey.id) {
            return Promise.resolve({ ...testApiKey, ...data });
          }
          return Promise.reject(new Error('Not found'));
        }),
        delete: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === testApiKey.id) {
            return Promise.resolve(testApiKey);
          }
          return Promise.reject(new Error('Not found'));
        }),
        groupBy: vi.fn().mockResolvedValue([
          { userId: testUser.id, _count: 2 },
        ]),
      },
    },
  };
});

import { apiKeyAdminRoutes } from '../src/modules/admin/api-keys';

// Mock crypto
vi.mock('crypto', async () => {
  const actual = await vi.importActual('crypto');
  return {
    ...actual,
    randomBytes: vi.fn().mockReturnValue({
      toString: () => 'mockRandomBytes123456789012345678',
    }),
    createHash: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        digest: () => 'mockedHashValue123',
      }),
    }),
  };
});

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

describe('API Key Admin API', () => {
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

    await app.register(apiKeyAdminRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /admin/api-keys', () => {
    it('should list API keys', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.meta.total).toBe(1);
    });

    it('should filter by userId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/?userId=${TEST_USER_ID}`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should filter by isActive', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/?isActive=true',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should support pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/?page=1&limit=10',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
    });
  });

  describe('POST /admin/api-keys', () => {
    it('should create an API key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          userId: TEST_USER_ID,
          name: 'New API Key',
          scopes: ['read:properties'],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.key).toBeDefined();
      expect(body.warning).toContain('Store this API key securely');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          userId: '44444444-4444-4444-4444-444444444444',
          name: 'New API Key',
          scopes: ['read:properties'],
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /admin/api-keys/:id', () => {
    it('should return API key details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/${TEST_API_KEY_ID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(TEST_API_KEY_ID);
    });

    it('should return 404 for non-existent API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/77777777-7777-7777-7777-777777777777',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /admin/api-keys/:id', () => {
    it('should update API key', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/${TEST_API_KEY_ID}`,
        payload: {
          name: 'Updated Name',
          isActive: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent API key', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/77777777-7777-7777-7777-777777777777',
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /admin/api-keys/:id', () => {
    it('should revoke API key', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/${TEST_API_KEY_ID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.message).toContain('revoked');
    });

    it('should return 404 for non-existent API key', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/77777777-7777-7777-7777-777777777777',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /admin/api-keys/scopes', () => {
    it('should return available scopes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/scopes',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.scopes).toBeDefined();
      expect(body.data.scopes.length).toBeGreaterThan(0);
    });
  });

  describe('GET /admin/api-keys/stats', () => {
    it('should return API key statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.total).toBeDefined();
      expect(body.data.active).toBeDefined();
    });
  });
});
