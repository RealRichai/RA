/**
 * Feature Flag Admin API Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { featureFlagAdminRoutes } from '../src/modules/admin/feature-flags';

// Mock Redis
const mockFlags = new Map<string, string>();

const mockRedis = {
  get: vi.fn().mockImplementation((key: string) => {
    const value = mockFlags.get(key);
    return Promise.resolve(value || null);
  }),
  set: vi.fn().mockImplementation((key: string, value: string) => {
    mockFlags.set(key, value);
    return Promise.resolve('OK');
  }),
  del: vi.fn().mockImplementation((key: string) => {
    mockFlags.delete(key);
    return Promise.resolve(1);
  }),
  sadd: vi.fn().mockResolvedValue(1),
  srem: vi.fn().mockResolvedValue(1),
  smembers: vi.fn().mockImplementation(() => {
    const keys: string[] = [];
    for (const key of mockFlags.keys()) {
      if (key.startsWith('ff:') && key !== 'ff:__all__') {
        keys.push(key.replace('ff:', ''));
      }
    }
    return Promise.resolve(keys);
  }),
  pipeline: vi.fn().mockReturnValue({
    get: vi.fn().mockReturnThis(),
    exec: vi.fn().mockImplementation(() => {
      const results: [null, string | null][] = [];
      for (const [key, value] of mockFlags.entries()) {
        if (key.startsWith('ff:') && key !== 'ff:__all__') {
          results.push([null, value]);
        }
      }
      return Promise.resolve(results);
    }),
  }),
};

// Mock types
vi.mock('@realriches/types', () => ({
  PLATFORM_FEATURE_FLAGS: {
    AI_LEASING_CONCIERGE: 'ai_leasing_concierge',
    ACH_PAYMENTS: 'ach_payments',
    LEASELOCK_INTEGRATION: 'leaselock_integration',
    COMPLIANCE_AUTOPILOT: 'compliance_autopilot',
  },
}));

// Mock database
vi.mock('@realriches/database', () => ({
  prisma: {},
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

describe('Feature Flag Admin API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // Decorate with Redis
    app.decorate('redis', mockRedis);

    app.decorate('authenticate', async (request: { user?: typeof mockAdminUser }) => {
      request.user = mockAdminUser;
    });

    app.decorate('authorize', (_request: unknown, reply: { code: (n: number) => { send: (obj: unknown) => void } }, opts: { roles: string[] }) => {
      const request = _request as { user?: { role: string } };
      if (!opts.roles.includes(request.user?.role || '')) {
        reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
      }
    });

    await app.register(featureFlagAdminRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockFlags.clear();
    vi.clearAllMocks();
  });

  describe('GET /admin/feature-flags', () => {
    it('should list all feature flags', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.meta.total).toBeDefined();
    });
  });

  describe('GET /admin/feature-flags/predefined', () => {
    it('should list predefined platform flags', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/predefined',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.flags.length).toBe(4);
      expect(body.data.byCategory).toBeDefined();
    });
  });

  describe('POST /admin/feature-flags', () => {
    it('should create a feature flag', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          key: 'test_feature',
          name: 'Test Feature',
          description: 'A test feature flag',
          type: 'boolean',
          enabled: false,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.key).toBe('test_feature');
    });

    it('should reject duplicate keys', async () => {
      // First create
      await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          key: 'duplicate_test',
          name: 'First Flag',
        },
      });

      // Second create with same key
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          key: 'duplicate_test',
          name: 'Second Flag',
        },
      });

      expect(response.statusCode).toBe(409);
    });

    it('should reject invalid key format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          key: 'Invalid-Key',
          name: 'Test',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /admin/feature-flags/:key', () => {
    it('should return flag details', async () => {
      // Create a flag first
      await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          key: 'get_test',
          name: 'Get Test',
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/get_test',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.key).toBe('get_test');
    });

    it('should return 404 for non-existent flag', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent_flag',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /admin/feature-flags/:key', () => {
    it('should update a feature flag', async () => {
      // Create a flag first
      await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          key: 'update_test',
          name: 'Original Name',
          enabled: false,
        },
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/update_test',
        payload: {
          name: 'Updated Name',
          enabled: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.name).toBe('Updated Name');
      expect(body.data.enabled).toBe(true);
    });

    it('should return 404 for non-existent flag', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/nonexistent_flag',
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /admin/feature-flags/:key/toggle', () => {
    it('should toggle flag enabled state', async () => {
      // Create a flag first (disabled)
      await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          key: 'toggle_test',
          name: 'Toggle Test',
          enabled: false,
        },
      });

      // Toggle to enabled
      const response = await app.inject({
        method: 'POST',
        url: '/toggle_test/toggle',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.enabled).toBe(true);

      // Toggle back to disabled
      const response2 = await app.inject({
        method: 'POST',
        url: '/toggle_test/toggle',
      });

      const body2 = JSON.parse(response2.payload);
      expect(body2.data.enabled).toBe(false);
    });
  });

  describe('DELETE /admin/feature-flags/:key', () => {
    it('should delete a feature flag', async () => {
      // Create a flag first
      await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          key: 'delete_test',
          name: 'Delete Test',
        },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/delete_test',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('deleted');

      // Verify it's gone
      const getResponse = await app.inject({
        method: 'GET',
        url: '/delete_test',
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it('should return 404 for non-existent flag', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/nonexistent_flag',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /admin/feature-flags/:key/evaluate', () => {
    it('should evaluate flag for context', async () => {
      // Create a flag with targeting
      await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          key: 'evaluate_test',
          name: 'Evaluate Test',
          enabled: true,
          defaultValue: true,
          targetedUsers: ['22222222-2222-2222-2222-222222222222'],
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/evaluate_test/evaluate',
        payload: {
          userId: '22222222-2222-2222-2222-222222222222',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.value).toBe(true);
      expect(body.data.reason).toBe('target_match');
    });

    it('should return off value when disabled', async () => {
      // Create a disabled flag
      await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          key: 'disabled_test',
          name: 'Disabled Test',
          enabled: false,
          defaultValue: false,
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/disabled_test/evaluate',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.value).toBe(false);
      expect(body.data.reason).toBe('off');
    });
  });

  describe('GET /admin/feature-flags/stats', () => {
    it('should return feature flag statistics', async () => {
      // Create some flags
      await app.inject({
        method: 'POST',
        url: '/',
        payload: { key: 'stats_test_1', name: 'Stats 1', enabled: true, category: 'core' },
      });
      await app.inject({
        method: 'POST',
        url: '/',
        payload: { key: 'stats_test_2', name: 'Stats 2', enabled: false, category: 'ai' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.total).toBe(2);
      expect(body.data.enabled).toBe(1);
      expect(body.data.disabled).toBe(1);
      expect(body.data.byCategory).toBeDefined();
    });
  });
});

describe('Feature Flag Admin API - Authorization', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    app.decorate('redis', mockRedis);

    app.decorate('authenticate', async (request: { user?: { id: string; email: string; role: string } }) => {
      request.user = { id: '22222222-2222-2222-2222-222222222222', email: 'user@example.com', role: 'investor' };
    });

    app.decorate('authorize', (_request: unknown, reply: { code: (n: number) => { send: (obj: unknown) => void } }, opts: { roles: string[] }) => {
      const request = _request as { user?: { role: string } };
      if (!opts.roles.includes(request.user?.role || '')) {
        reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
      }
    });

    await app.register(featureFlagAdminRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject non-admin users', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(403);
  });
});
