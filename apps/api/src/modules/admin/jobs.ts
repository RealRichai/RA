/**
 * Job Queue Admin API
 *
 * Provides admin endpoints for monitoring and managing background jobs.
 * All endpoints require admin role.
 */

import { logger } from '@realriches/utils';
import { Queue, type Job } from 'bullmq';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Schemas
// =============================================================================

const JobListQuerySchema = z.object({
  status: z.enum(['waiting', 'active', 'completed', 'failed', 'delayed', 'paused']).optional(),
  jobName: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const RetryJobSchema = z.object({
  jobId: z.string(),
});

const BulkRetrySchema = z.object({
  jobIds: z.array(z.string()).min(1).max(100),
});

const CleanJobsSchema = z.object({
  status: z.enum(['completed', 'failed']),
  olderThanMs: z.coerce.number().int().min(0).default(86400000), // 24 hours default
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
});

// =============================================================================
// Types
// =============================================================================

interface JobSummary {
  id: string;
  name: string;
  data: unknown;
  progress: number | object | string | boolean;
  attemptsMade: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
  returnvalue?: unknown;
  timestamp: number;
  delay?: number;
  priority?: number;
}

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  repeatableCount: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getQueue(app: FastifyInstance): Queue {
  // Access the queue from the scheduler or create a reference
  return new Queue('realriches:jobs', {
    connection: app.redis,
    prefix: 'rr',
  });
}

function formatJob(job: Job): JobSummary {
  return {
    id: job.id || '',
    name: job.name,
    data: job.data,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason,
    returnvalue: job.returnvalue,
    timestamp: job.timestamp,
    delay: job.delay,
    priority: job.priority,
  };
}

async function getJobsByStatus(
  queue: Queue,
  status: string,
  start: number,
  end: number
): Promise<Job[]> {
  switch (status) {
    case 'waiting':
      return queue.getWaiting(start, end);
    case 'active':
      return queue.getActive(start, end);
    case 'completed':
      return queue.getCompleted(start, end);
    case 'failed':
      return queue.getFailed(start, end);
    case 'delayed':
      return queue.getDelayed(start, end);
    case 'paused':
      return queue.getWaiting(start, end); // Paused jobs are in waiting
    default:
      return [];
  }
}

// =============================================================================
// Routes
// =============================================================================

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================================================
  // GET /admin/jobs/stats - Get queue statistics
  // ===========================================================================
  app.get(
    '/stats',
    {
      schema: {
        description: 'Get job queue statistics',
        tags: ['Admin', 'Jobs'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const queue = getQueue(app);

        const [waiting, active, completed, failed, delayed, repeatableJobs] =
          await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount(),
            queue.getRepeatableJobs(),
          ]);
        const paused = 0; // getPausedCount not available in this BullMQ version

        const stats: QueueStats = {
          name: 'realriches:jobs',
          waiting,
          active,
          completed,
          failed,
          delayed,
          paused,
          repeatableCount: repeatableJobs.length,
        };

        // Get job type breakdown
        const jobTypeStats: Record<string, { completed: number; failed: number }> = {};

        // Sample recent jobs to get type breakdown
        const recentCompleted = await queue.getCompleted(0, 100);
        const recentFailed = await queue.getFailed(0, 100);

        for (const job of recentCompleted) {
          if (!jobTypeStats[job.name]) {
            jobTypeStats[job.name] = { completed: 0, failed: 0 };
          }
          jobTypeStats[job.name].completed++;
        }

        for (const job of recentFailed) {
          if (!jobTypeStats[job.name]) {
            jobTypeStats[job.name] = { completed: 0, failed: 0 };
          }
          jobTypeStats[job.name].failed++;
        }

        await queue.close();

        return reply.send({
          success: true,
          data: {
            stats,
            jobTypes: jobTypeStats,
            repeatableJobs: repeatableJobs.map((r) => ({
              key: r.key,
              name: r.name,
              id: r.id,
              cron: r.pattern,
              next: r.next,
            })),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get job stats');
        return reply.status(500).send({
          success: false,
          error: { code: 'STATS_ERROR', message: 'Failed to get job statistics' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/jobs - List jobs with filtering
  // ===========================================================================
  app.get(
    '/',
    {
      schema: {
        description: 'List jobs with filtering and pagination',
        tags: ['Admin', 'Jobs'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'],
            },
            jobName: { type: 'string' },
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
        const params = JobListQuerySchema.parse(request.query);
        const queue = getQueue(app);

        const start = (params.page - 1) * params.limit;
        const end = start + params.limit - 1;

        let jobs: Job[] = [];
        let total = 0;

        if (params.status) {
          jobs = await getJobsByStatus(queue, params.status, start, end);

          // Get total count for the status
          switch (params.status) {
            case 'waiting':
              total = await queue.getWaitingCount();
              break;
            case 'active':
              total = await queue.getActiveCount();
              break;
            case 'completed':
              total = await queue.getCompletedCount();
              break;
            case 'failed':
              total = await queue.getFailedCount();
              break;
            case 'delayed':
              total = await queue.getDelayedCount();
              break;
          }
        } else {
          // Get all jobs (combine statuses)
          const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaiting(0, 50),
            queue.getActive(0, 50),
            queue.getCompleted(0, 50),
            queue.getFailed(0, 50),
            queue.getDelayed(0, 50),
          ]);

          const allJobs = [...waiting, ...active, ...completed, ...failed, ...delayed];
          allJobs.sort((a, b) => b.timestamp - a.timestamp);

          total = allJobs.length;
          jobs = allJobs.slice(start, start + params.limit);
        }

        // Filter by job name if specified
        if (params.jobName) {
          jobs = jobs.filter((job) => job.name === params.jobName);
        }

        await queue.close();

        return reply.send({
          success: true,
          data: jobs.map(formatJob),
          meta: {
            page: params.page,
            limit: params.limit,
            total,
            totalPages: Math.ceil(total / params.limit),
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list jobs');
        return reply.status(500).send({
          success: false,
          error: { code: 'LIST_ERROR', message: 'Failed to list jobs' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/jobs/:id - Get specific job details
  // ===========================================================================
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get details of a specific job',
        tags: ['Admin', 'Jobs'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
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
        const queue = getQueue(app);
        const job = await queue.getJob(request.params.id);

        if (!job) {
          await queue.close();
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Job not found' },
          });
        }

        const state = await job.getState();
        const logs = await queue.getJobLogs(job.id || '', 0, 100);

        await queue.close();

        return reply.send({
          success: true,
          data: {
            ...formatJob(job),
            state,
            logs: logs.logs,
            stacktrace: job.stacktrace,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get job');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get job details' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/jobs/:id/retry - Retry a failed job
  // ===========================================================================
  app.post(
    '/:id/retry',
    {
      schema: {
        description: 'Retry a failed job',
        tags: ['Admin', 'Jobs'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
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
        const queue = getQueue(app);
        const job = await queue.getJob(request.params.id);

        if (!job) {
          await queue.close();
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Job not found' },
          });
        }

        const state = await job.getState();
        if (state !== 'failed') {
          await queue.close();
          return reply.status(400).send({
            success: false,
            error: { code: 'INVALID_STATE', message: `Cannot retry job in ${state} state` },
          });
        }

        await job.retry();

        logger.info({
          msg: 'job_retried',
          userId: request.user?.id,
          jobId: job.id,
          jobName: job.name,
        });

        await queue.close();

        return reply.send({
          success: true,
          message: 'Job queued for retry',
          data: { jobId: job.id },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to retry job');
        return reply.status(500).send({
          success: false,
          error: { code: 'RETRY_ERROR', message: 'Failed to retry job' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/jobs/retry-bulk - Retry multiple failed jobs
  // ===========================================================================
  app.post(
    '/retry-bulk',
    {
      schema: {
        description: 'Retry multiple failed jobs',
        tags: ['Admin', 'Jobs'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['jobIds'],
          properties: {
            jobIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Body: { jobIds: string[] } }>, reply: FastifyReply) => {
      try {
        const { jobIds } = BulkRetrySchema.parse(request.body);
        const queue = getQueue(app);

        const results: { success: string[]; failed: string[] } = {
          success: [],
          failed: [],
        };

        for (const jobId of jobIds) {
          try {
            const job = await queue.getJob(jobId);
            if (job) {
              const state = await job.getState();
              if (state === 'failed') {
                await job.retry();
                results.success.push(jobId);
              } else {
                results.failed.push(jobId);
              }
            } else {
              results.failed.push(jobId);
            }
          } catch {
            results.failed.push(jobId);
          }
        }

        logger.info({
          msg: 'jobs_bulk_retried',
          userId: request.user?.id,
          successCount: results.success.length,
          failedCount: results.failed.length,
        });

        await queue.close();

        return reply.send({
          success: true,
          data: results,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to bulk retry jobs');
        return reply.status(500).send({
          success: false,
          error: { code: 'BULK_RETRY_ERROR', message: 'Failed to bulk retry jobs' },
        });
      }
    }
  );

  // ===========================================================================
  // DELETE /admin/jobs/:id - Remove a job
  // ===========================================================================
  app.delete(
    '/:id',
    {
      schema: {
        description: 'Remove a job from the queue',
        tags: ['Admin', 'Jobs'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
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
        const queue = getQueue(app);
        const job = await queue.getJob(request.params.id);

        if (!job) {
          await queue.close();
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Job not found' },
          });
        }

        await job.remove();

        logger.info({
          msg: 'job_removed',
          userId: request.user?.id,
          jobId: request.params.id,
        });

        await queue.close();

        return reply.send({
          success: true,
          message: 'Job removed',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to remove job');
        return reply.status(500).send({
          success: false,
          error: { code: 'REMOVE_ERROR', message: 'Failed to remove job' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/jobs/clean - Clean old jobs
  // ===========================================================================
  app.post(
    '/clean',
    {
      schema: {
        description: 'Clean old completed or failed jobs',
        tags: ['Admin', 'Jobs'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['completed', 'failed'] },
            olderThanMs: { type: 'integer', default: 86400000 },
            limit: { type: 'integer', default: 1000 },
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
        const params = CleanJobsSchema.parse(request.body);
        const queue = getQueue(app);

        const removed = await queue.clean(params.olderThanMs, params.limit, params.status);

        logger.info({
          msg: 'jobs_cleaned',
          userId: request.user?.id,
          status: params.status,
          removedCount: removed.length,
        });

        await queue.close();

        return reply.send({
          success: true,
          data: {
            removedCount: removed.length,
            removedJobIds: removed,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to clean jobs');
        return reply.status(500).send({
          success: false,
          error: { code: 'CLEAN_ERROR', message: 'Failed to clean jobs' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/jobs/pause - Pause the queue
  // ===========================================================================
  app.post(
    '/pause',
    {
      schema: {
        description: 'Pause job processing',
        tags: ['Admin', 'Jobs'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const queue = getQueue(app);
        await queue.pause();

        logger.warn({
          msg: 'queue_paused',
          userId: request.user?.id,
        });

        await queue.close();

        return reply.send({
          success: true,
          message: 'Job queue paused',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to pause queue');
        return reply.status(500).send({
          success: false,
          error: { code: 'PAUSE_ERROR', message: 'Failed to pause queue' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/jobs/resume - Resume the queue
  // ===========================================================================
  app.post(
    '/resume',
    {
      schema: {
        description: 'Resume job processing',
        tags: ['Admin', 'Jobs'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const queue = getQueue(app);
        await queue.resume();

        logger.info({
          msg: 'queue_resumed',
          userId: request.user?.id,
        });

        await queue.close();

        return reply.send({
          success: true,
          message: 'Job queue resumed',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to resume queue');
        return reply.status(500).send({
          success: false,
          error: { code: 'RESUME_ERROR', message: 'Failed to resume queue' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/jobs/trigger/:jobName - Manually trigger a job
  // ===========================================================================
  app.post(
    '/trigger/:jobName',
    {
      schema: {
        description: 'Manually trigger a job',
        tags: ['Admin', 'Jobs'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['jobName'],
          properties: {
            jobName: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            data: { type: 'object' },
            delay: { type: 'integer', description: 'Delay in milliseconds' },
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
        Params: { jobName: string };
        Body: { data?: Record<string, unknown>; delay?: number };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { jobName } = request.params;
        const { data = {}, delay } = request.body || {};

        const queue = getQueue(app);
        const job = await queue.add(jobName, data, { delay });

        logger.info({
          msg: 'job_triggered_manually',
          userId: request.user?.id,
          jobName,
          jobId: job.id,
          hasDelay: !!delay,
        });

        await queue.close();

        return reply.send({
          success: true,
          data: {
            jobId: job.id,
            jobName,
            scheduledAt: delay ? new Date(Date.now() + delay).toISOString() : 'immediate',
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to trigger job');
        return reply.status(500).send({
          success: false,
          error: { code: 'TRIGGER_ERROR', message: 'Failed to trigger job' },
        });
      }
    }
  );
}
