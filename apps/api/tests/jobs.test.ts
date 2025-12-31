/**
 * Job Queue Admin API Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { jobRoutes } from '../src/modules/admin/jobs';

// Mock BullMQ
const mockJob = {
  id: 'job_123',
  name: 'email-notification',
  data: { userId: 'usr_123', template: 'welcome' },
  progress: 0,
  attemptsMade: 0,
  processedOn: Date.now() - 1000,
  finishedOn: Date.now(),
  failedReason: undefined,
  returnvalue: { sent: true },
  timestamp: Date.now() - 5000,
  delay: 0,
  priority: 0,
  getState: vi.fn().mockResolvedValue('completed'),
  retry: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  stacktrace: [],
};

const mockFailedJob = {
  ...mockJob,
  id: 'job_456',
  failedReason: 'Connection timeout',
  getState: vi.fn().mockResolvedValue('failed'),
  retry: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
};

const mockQueue = {
  getWaitingCount: vi.fn().mockResolvedValue(5),
  getActiveCount: vi.fn().mockResolvedValue(2),
  getCompletedCount: vi.fn().mockResolvedValue(100),
  getFailedCount: vi.fn().mockResolvedValue(3),
  getDelayedCount: vi.fn().mockResolvedValue(1),
  getPausedCount: vi.fn().mockResolvedValue(0),
  getRepeatableJobs: vi.fn().mockResolvedValue([
    { key: 'policy-expiration:::0 0 * * *', name: 'policy-expiration', id: 'repeat_1', pattern: '0 0 * * *', next: Date.now() + 3600000 },
    { key: 'payment-reminder:::0 9 * * *', name: 'payment-reminder', id: 'repeat_2', pattern: '0 9 * * *', next: Date.now() + 7200000 },
  ]),
  getWaiting: vi.fn().mockResolvedValue([]),
  getActive: vi.fn().mockResolvedValue([]),
  getCompleted: vi.fn().mockResolvedValue([mockJob]),
  getFailed: vi.fn().mockResolvedValue([mockFailedJob]),
  getDelayed: vi.fn().mockResolvedValue([]),
  getJob: vi.fn(),
  getJobLogs: vi.fn().mockResolvedValue({ logs: ['Processing...', 'Complete'] }),
  add: vi.fn().mockResolvedValue({ id: 'new_job_123' }),
  clean: vi.fn().mockResolvedValue(['job_old_1', 'job_old_2']),
  pause: vi.fn().mockResolvedValue(undefined),
  resume: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => mockQueue),
  Worker: vi.fn(),
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

const mockRegularUser = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'user@example.com',
  role: 'investor',
};

describe('Job Admin API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // Mock Redis
    app.decorate('redis', {});

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

    await app.register(jobRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueue.getJob.mockReset();
  });

  describe('GET /admin/jobs/stats', () => {
    it('should return queue statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.stats).toBeDefined();
      expect(body.data.stats.waiting).toBe(5);
      expect(body.data.stats.active).toBe(2);
      expect(body.data.stats.completed).toBe(100);
      expect(body.data.stats.failed).toBe(3);
    });

    it('should include repeatable jobs info', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/stats',
      });

      const body = JSON.parse(response.payload);
      expect(body.data.repeatableJobs).toHaveLength(2);
      expect(body.data.repeatableJobs[0].name).toBe('policy-expiration');
    });

    it('should include job type breakdown', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/stats',
      });

      const body = JSON.parse(response.payload);
      expect(body.data.jobTypes).toBeDefined();
    });
  });

  describe('GET /admin/jobs', () => {
    it('should list jobs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.meta).toBeDefined();
    });

    it('should filter by status', async () => {
      mockQueue.getFailed.mockResolvedValueOnce([mockFailedJob]);

      const response = await app.inject({
        method: 'GET',
        url: '/?status=failed',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });

    it('should filter by job name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/?jobName=email-notification',
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

  describe('GET /admin/jobs/:id', () => {
    it('should return job details', async () => {
      mockQueue.getJob.mockResolvedValueOnce(mockJob);

      const response = await app.inject({
        method: 'GET',
        url: '/job_123',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('job_123');
      expect(body.data.state).toBe('completed');
      expect(body.data.logs).toBeDefined();
    });

    it('should return 404 for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /admin/jobs/:id/retry', () => {
    it('should retry a failed job', async () => {
      mockQueue.getJob.mockResolvedValueOnce(mockFailedJob);

      const response = await app.inject({
        method: 'POST',
        url: '/job_456/retry',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(mockFailedJob.retry).toHaveBeenCalled();
    });

    it('should reject retry for non-failed jobs', async () => {
      mockQueue.getJob.mockResolvedValueOnce(mockJob);

      const response = await app.inject({
        method: 'POST',
        url: '/job_123/retry',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('INVALID_STATE');
    });

    it('should return 404 for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'POST',
        url: '/nonexistent/retry',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /admin/jobs/retry-bulk', () => {
    it('should retry multiple failed jobs', async () => {
      mockQueue.getJob
        .mockResolvedValueOnce(mockFailedJob)
        .mockResolvedValueOnce({ ...mockFailedJob, id: 'job_789', getState: vi.fn().mockResolvedValue('failed'), retry: vi.fn() });

      const response = await app.inject({
        method: 'POST',
        url: '/retry-bulk',
        payload: { jobIds: ['job_456', 'job_789'] },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.success).toHaveLength(2);
    });

    it('should handle mixed success/failure', async () => {
      mockQueue.getJob
        .mockResolvedValueOnce(mockFailedJob)
        .mockResolvedValueOnce(null); // Job not found

      const response = await app.inject({
        method: 'POST',
        url: '/retry-bulk',
        payload: { jobIds: ['job_456', 'nonexistent'] },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.success).toHaveLength(1);
      expect(body.data.failed).toHaveLength(1);
    });
  });

  describe('DELETE /admin/jobs/:id', () => {
    it('should remove a job', async () => {
      mockQueue.getJob.mockResolvedValueOnce(mockJob);

      const response = await app.inject({
        method: 'DELETE',
        url: '/job_123',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should return 404 for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'DELETE',
        url: '/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /admin/jobs/clean', () => {
    it('should clean old completed jobs', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/clean',
        payload: { status: 'completed', olderThanMs: 86400000 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.removedCount).toBe(2);
    });

    it('should clean old failed jobs', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/clean',
        payload: { status: 'failed' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /admin/jobs/pause', () => {
    it('should pause the queue', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/pause',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(mockQueue.pause).toHaveBeenCalled();
    });
  });

  describe('POST /admin/jobs/resume', () => {
    it('should resume the queue', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/resume',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(mockQueue.resume).toHaveBeenCalled();
    });
  });

  describe('POST /admin/jobs/trigger/:jobName', () => {
    it('should trigger a job immediately', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trigger/email-notification',
        payload: { data: { userId: 'usr_123' } },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.jobId).toBe('new_job_123');
      expect(body.data.scheduledAt).toBe('immediate');
    });

    it('should trigger a delayed job', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trigger/payment-reminder',
        payload: { data: { leaseId: 'lease_123' }, delay: 60000 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.scheduledAt).not.toBe('immediate');
    });
  });
});

describe('Job Admin API - Authorization', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    app.decorate('redis', {});

    app.decorate('authenticate', async (request: { user?: typeof mockRegularUser }) => {
      request.user = mockRegularUser;
    });

    app.decorate('authorize', (_request: unknown, reply: { code: (n: number) => { send: (obj: unknown) => void } }, opts: { roles: string[] }) => {
      const request = _request as { user?: { role: string } };
      if (!opts.roles.includes(request.user?.role || '')) {
        reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
      }
    });

    await app.register(jobRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject non-admin users for stats', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/stats',
    });

    expect(response.statusCode).toBe(403);
  });

  it('should reject non-admin users for job list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(403);
  });

  it('should reject non-admin users for pause', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/pause',
    });

    expect(response.statusCode).toBe(403);
  });
});
