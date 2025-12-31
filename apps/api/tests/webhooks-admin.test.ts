/**
 * Webhook Admin API Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// Mock WebhookRetryJob - inline values to avoid hoisting issues
vi.mock('../src/jobs/webhook-retry', () => ({
  WebhookRetryJob: {
    getStats: vi.fn().mockResolvedValue({
      pending: 5,
      dlq: 3,
      stats: {
        queued: 100,
        delivered: 90,
        failed: 7,
        retried: 10,
        'delivered:lease': 50,
        'delivered:payment': 40,
        'failed:lease': 3,
        'failed:payment': 4,
      },
    }),
    getDLQEntries: vi.fn().mockResolvedValue([{
      id: 'webhook_123',
      url: 'https://example.com/webhook',
      eventType: 'lease.created',
      payload: { leaseId: 'lease_123' },
      attempts: 5,
      lastError: 'Connection refused',
      createdAt: new Date().toISOString(),
      lastAttemptAt: new Date().toISOString(),
    }]),
    getWebhookStatus: vi.fn().mockImplementation((id: string) =>
      id === 'webhook_123'
        ? Promise.resolve({ id, status: 'in_dlq', url: 'https://example.com/webhook' })
        : Promise.resolve(null)
    ),
    retryDLQEntry: vi.fn().mockImplementation((id: string) =>
      Promise.resolve(id === 'webhook_123')
    ),
    deleteDLQEntry: vi.fn().mockImplementation((id: string) =>
      Promise.resolve(id === 'webhook_123')
    ),
    queueWebhook: vi.fn().mockResolvedValue('webhook_new_123'),
    purgeOldData: vi.fn().mockResolvedValue(15),
  },
}));

import { webhookAdminRoutes } from '../src/modules/admin/webhooks';

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

const mockRegularUser = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'user@example.com',
  role: 'investor',
};

describe('Webhook Admin API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // Mock auth
    app.decorate('authenticate', async (request: { user?: typeof mockAdminUser }) => {
      request.user = mockAdminUser;
    });

    app.decorate('authorize', (_request: unknown, reply: { code: (n: number) => { send: (obj: unknown) => void } }, opts: { roles: string[] }) => {
      const request = _request as { user?: { role: string } };
      if (!opts.roles.includes(request.user?.role || '')) {
        reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
      }
    });

    await app.register(webhookAdminRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /admin/webhooks/stats', () => {
    it('should return webhook statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.queue.pending).toBe(5);
      expect(body.data.queue.deadLetterQueue).toBe(3);
      expect(body.data.totals.delivered).toBe(90);
    });
  });

  describe('GET /admin/webhooks', () => {
    it('should list webhooks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });

    it('should list DLQ entries when status=dlq', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/?status=dlq',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe('webhook_123');
    });
  });

  describe('GET /admin/webhooks/:id', () => {
    it('should return webhook status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/webhook_123',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('webhook_123');
    });

    it('should return 404 for non-existent webhook', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /admin/webhooks/:id/retry', () => {
    it('should retry a DLQ webhook', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhook_123/retry',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent webhook', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/nonexistent/retry',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /admin/webhooks/:id', () => {
    it('should delete a DLQ webhook', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/webhook_123',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent webhook', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /admin/webhooks/queue', () => {
    it('should manually queue a webhook', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/queue',
        payload: {
          url: 'https://example.com/webhook',
          eventType: 'test.event',
          payload: { test: true },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.webhookId).toBe('webhook_new_123');
    });
  });

  describe('POST /admin/webhooks/purge', () => {
    it('should purge old DLQ entries', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/purge',
        payload: { olderThanDays: 7 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.removed).toBe(15);
    });
  });
});

describe('Webhook Admin API - Authorization', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    app.decorate('authenticate', async (request: { user?: typeof mockRegularUser }) => {
      request.user = mockRegularUser;
    });

    app.decorate('authorize', (_request: unknown, reply: { code: (n: number) => { send: (obj: unknown) => void } }, opts: { roles: string[] }) => {
      const request = _request as { user?: { role: string } };
      if (!opts.roles.includes(request.user?.role || '')) {
        reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
      }
    });

    await app.register(webhookAdminRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject non-admin users', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/stats',
    });

    expect(response.statusCode).toBe(403);
  });
});
