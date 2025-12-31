/**
 * Health Check Routes
 *
 * Kubernetes-compatible health endpoints with comprehensive dependency checks.
 * - /health - Basic liveness (is server running)
 * - /health/live - Liveness probe (is process alive)
 * - /health/ready - Readiness probe (are dependencies healthy)
 * - /health/detailed - Full system status with metrics
 * - /health/external - External API status (Stripe, partners)
 * - /health/cache - Cache statistics
 * - /health/queue - Job queue health
 */

import { checkConnection } from '@realriches/database';
import { logger } from '@realriches/utils';
import { Queue } from 'bullmq';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { PartnerHealthJob } from '../../jobs/partner-health';
import { isStripeConfigured, getStripe } from '../../lib/stripe';

// =============================================================================
// Types
// =============================================================================

type CheckStatus = 'up' | 'down' | 'degraded';

interface DependencyCheck {
  status: CheckStatus;
  latencyMs?: number;
  message?: string;
  lastChecked?: string;
}

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  uptimeFormatted: string;
}

interface ReadinessStatus extends HealthStatus {
  checks: {
    database: DependencyCheck;
    redis: DependencyCheck;
    memory: DependencyCheck;
  };
}

interface DetailedHealthStatus extends ReadinessStatus {
  system: {
    nodeVersion: string;
    platform: string;
    arch: string;
    pid: number;
    memory: {
      heapUsed: number;
      heapTotal: number;
      external: number;
      rss: number;
      heapUsedMB: number;
      heapTotalMB: number;
      rssMB: number;
    };
    cpu: {
      user: number;
      system: number;
    };
  };
  services: {
    emailQueue: DependencyCheck;
    jobScheduler: DependencyCheck;
    rateLimiter: DependencyCheck;
  };
  config: {
    apiPrefix: string;
    corsEnabled: boolean;
    rateLimitEnabled: boolean;
  };
}

// =============================================================================
// Health Check Timeouts
// =============================================================================

const CHECK_TIMEOUT_MS = 5000;

// =============================================================================
// Helper Functions
// =============================================================================

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

function bytesToMB(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

// =============================================================================
// Check Functions
// =============================================================================

async function checkDatabase(): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    const connected = await withTimeout(
      checkConnection(),
      CHECK_TIMEOUT_MS,
      false
    );
    return {
      status: connected ? 'up' : 'down',
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkRedis(app: FastifyInstance): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    if (!app.redis) {
      return {
        status: 'down',
        message: 'Redis not initialized',
        lastChecked: new Date().toISOString(),
      };
    }

    const result = await withTimeout(
      app.redis.ping(),
      CHECK_TIMEOUT_MS,
      null
    );

    return {
      status: result === 'PONG' ? 'up' : 'down',
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString(),
    };
  }
}

function checkMemory(): DependencyCheck {
  const memUsage = process.memoryUsage();
  const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

  // Degraded if heap usage > 80%, down if > 95%
  let status: CheckStatus = 'up';
  let message: string | undefined;

  if (heapUsedPercent > 95) {
    status = 'down';
    message = `Critical memory usage: ${heapUsedPercent.toFixed(1)}%`;
  } else if (heapUsedPercent > 80) {
    status = 'degraded';
    message = `High memory usage: ${heapUsedPercent.toFixed(1)}%`;
  }

  return {
    status,
    message,
    lastChecked: new Date().toISOString(),
  };
}

async function checkEmailQueue(app: FastifyInstance): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    if (!app.emailService) {
      return {
        status: 'degraded',
        message: 'Email service not initialized',
        lastChecked: new Date().toISOString(),
      };
    }

    // Check if email service is paused or has issues
    const isPaused = (app.emailService as unknown as { isPaused?: () => boolean })?.isPaused?.() ?? false;

    return {
      status: isPaused ? 'degraded' : 'up',
      latencyMs: Date.now() - start,
      message: isPaused ? 'Email queue is paused' : undefined,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkJobScheduler(app: FastifyInstance): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    if (!app.jobScheduler) {
      return {
        status: 'degraded',
        message: 'Job scheduler not initialized',
        lastChecked: new Date().toISOString(),
      };
    }

    const isRunning = (app.jobScheduler as unknown as { isRunning?: () => boolean })?.isRunning?.() ?? true;

    return {
      status: isRunning ? 'up' : 'degraded',
      latencyMs: Date.now() - start,
      message: isRunning ? undefined : 'Job scheduler is stopped',
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString(),
    };
  }
}

function checkRateLimiter(app: FastifyInstance): DependencyCheck {
  try {
    const hasRateLimiter = !!app.rateLimit;

    return {
      status: hasRateLimiter ? 'up' : 'degraded',
      message: hasRateLimiter ? undefined : 'Rate limiter not enabled',
      lastChecked: new Date().toISOString(),
    };
  } catch {
    return {
      status: 'degraded',
      message: 'Rate limiter check failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkStripe(): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    if (!isStripeConfigured()) {
      return {
        status: 'degraded',
        message: 'Stripe not configured',
        lastChecked: new Date().toISOString(),
      };
    }

    const stripe = getStripe();
    // Use a lightweight API call to verify connectivity
    await withTimeout(
      stripe.balance.retrieve(),
      CHECK_TIMEOUT_MS,
      null
    );

    return {
      status: 'up',
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Stripe check failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkCache(app: FastifyInstance): Promise<DependencyCheck & { stats?: Record<string, number> }> {
  try {
    if (!app.cache) {
      return {
        status: 'degraded',
        message: 'Cache not initialized',
        lastChecked: new Date().toISOString(),
      };
    }

    const stats = app.cache.getStats();
    const hitRate = stats.hits + stats.misses > 0
      ? Math.round((stats.hits / (stats.hits + stats.misses)) * 100)
      : 0;

    // Degraded if error rate is high
    let status: CheckStatus = 'up';
    if (stats.errors > 100) {
      status = 'degraded';
    }

    return {
      status,
      stats: {
        hits: stats.hits,
        misses: stats.misses,
        sets: stats.sets,
        deletes: stats.deletes,
        errors: stats.errors,
        hitRate,
      },
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'down',
      message: error instanceof Error ? error.message : 'Cache check failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkJobQueue(app: FastifyInstance): Promise<DependencyCheck & { stats?: Record<string, number> }> {
  try {
    const queue = new Queue('realriches:jobs', {
      connection: app.redis,
      prefix: 'rr',
    });

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    await queue.close();

    // Status based on queue health
    let status: CheckStatus = 'up';
    let message: string | undefined;

    if (failed > 100) {
      status = 'degraded';
      message = `High failure count: ${failed}`;
    }
    if (waiting > 1000) {
      status = 'degraded';
      message = `Queue backlog: ${waiting} waiting`;
    }

    return {
      status,
      message,
      stats: {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
      },
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'down',
      message: error instanceof Error ? error.message : 'Queue check failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

function determineOverallStatus(checks: Record<string, DependencyCheck>): 'healthy' | 'unhealthy' | 'degraded' {
  const statuses = Object.values(checks).map((c) => c.status);

  // If any critical dependency is down, system is unhealthy
  const criticalDown = statuses.includes('down');
  if (criticalDown) return 'unhealthy';

  // If any dependency is degraded, system is degraded
  const anyDegraded = statuses.includes('degraded');
  if (anyDegraded) return 'degraded';

  return 'healthy';
}

// =============================================================================
// Routes
// =============================================================================

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================================================
  // GET /health - Basic liveness check
  // ===========================================================================
  app.get(
    '/health',
    {
      schema: {
        description: 'Basic health check - returns 200 if server is running',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        status: 'ok',
        timestamp: new Date().toISOString(),
      });
    }
  );

  // ===========================================================================
  // GET /health/live - Liveness probe (Kubernetes)
  // ===========================================================================
  app.get(
    '/health/live',
    {
      schema: {
        description: 'Liveness probe - returns 200 if process is alive',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    }
  );

  // ===========================================================================
  // GET /health/ready - Readiness probe (Kubernetes)
  // ===========================================================================
  app.get(
    '/health/ready',
    {
      schema: {
        description: 'Readiness probe - checks if dependencies are healthy',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              version: { type: 'string' },
              environment: { type: 'string' },
              uptime: { type: 'number' },
              uptimeFormatted: { type: 'string' },
              checks: { type: 'object' },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              checks: { type: 'object' },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Run checks in parallel
      const [database, redis] = await Promise.all([
        checkDatabase(),
        checkRedis(app),
      ]);

      const memory = checkMemory();

      const checks = { database, redis, memory };
      const overallStatus = determineOverallStatus(checks);

      const uptime = process.uptime();

      const status: ReadinessStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] || '1.0.0',
        environment: process.env['NODE_ENV'] || 'development',
        uptime,
        uptimeFormatted: formatUptime(uptime),
        checks,
      };

      // Return 503 if unhealthy (Kubernetes will not route traffic)
      const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

      // Log if not healthy
      if (overallStatus !== 'healthy') {
        logger.warn({ status: overallStatus, checks }, 'Health check degraded or unhealthy');
      }

      return reply.status(statusCode).send(status);
    }
  );

  // ===========================================================================
  // GET /health/detailed - Comprehensive system status (admin only in prod)
  // ===========================================================================
  app.get(
    '/health/detailed',
    {
      schema: {
        description: 'Detailed health status with system metrics and all service checks',
        tags: ['Health'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // In production, require authentication for detailed health
      const isProd = process.env['NODE_ENV'] === 'production';
      if (isProd) {
        try {
          await app.authenticate(request, reply);
          app.authorize(request, reply, { roles: ['admin'] });
        } catch {
          return reply.status(401).send({
            success: false,
            error: {
              code: 'AUTH_REQUIRED',
              message: 'Authentication required for detailed health in production',
            },
          });
        }
      }

      // Run all checks in parallel
      const [database, redis, emailQueue, jobScheduler] = await Promise.all([
        checkDatabase(),
        checkRedis(app),
        checkEmailQueue(app),
        checkJobScheduler(app),
      ]);

      const memory = checkMemory();
      const rateLimiter = checkRateLimiter(app);

      const checks = { database, redis, memory };
      const services = { emailQueue, jobScheduler, rateLimiter };

      // Combine all checks for overall status
      const allChecks = { ...checks, ...services };
      const overallStatus = determineOverallStatus(allChecks);

      const uptime = process.uptime();
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      const status: DetailedHealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] || '1.0.0',
        environment: process.env['NODE_ENV'] || 'development',
        uptime,
        uptimeFormatted: formatUptime(uptime),
        checks,
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid,
          memory: {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            rss: memUsage.rss,
            heapUsedMB: bytesToMB(memUsage.heapUsed),
            heapTotalMB: bytesToMB(memUsage.heapTotal),
            rssMB: bytesToMB(memUsage.rss),
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system,
          },
        },
        services,
        config: {
          apiPrefix: '/api/v1',
          corsEnabled: true,
          rateLimitEnabled: !!app.rateLimit,
        },
      };

      const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
      return reply.status(statusCode).send(status);
    }
  );

  // ===========================================================================
  // GET /health/dependencies - Check specific dependencies
  // ===========================================================================
  app.get(
    '/health/dependencies/:dependency',
    {
      schema: {
        description: 'Check a specific dependency health',
        tags: ['Health'],
        params: {
          type: 'object',
          required: ['dependency'],
          properties: {
            dependency: {
              type: 'string',
              enum: ['database', 'redis', 'email', 'jobs', 'memory'],
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { dependency: string } }>,
      reply: FastifyReply
    ) => {
      const { dependency } = request.params;

      let check: DependencyCheck;

      switch (dependency) {
        case 'database':
          check = await checkDatabase();
          break;
        case 'redis':
          check = await checkRedis(app);
          break;
        case 'email':
          check = await checkEmailQueue(app);
          break;
        case 'jobs':
          check = await checkJobScheduler(app);
          break;
        case 'memory':
          check = checkMemory();
          break;
        default:
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INVALID_DEPENDENCY',
              message: `Unknown dependency: ${dependency}`,
            },
          });
      }

      const statusCode = check.status === 'down' ? 503 : 200;
      return reply.status(statusCode).send({
        dependency,
        ...check,
      });
    }
  );

  // ===========================================================================
  // GET /version - Version information
  // ===========================================================================
  app.get(
    '/version',
    {
      schema: {
        description: 'Get API version and build information',
        tags: ['Health'],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        version: process.env['npm_package_version'] || '1.0.0',
        name: 'RealRiches API',
        environment: process.env['NODE_ENV'] || 'development',
        nodeVersion: process.version,
        buildTime: process.env['BUILD_TIME'] || 'unknown',
        gitCommit: process.env['GIT_COMMIT'] || 'unknown',
      });
    }
  );

  // ===========================================================================
  // GET /health/external - External API health status
  // ===========================================================================
  app.get(
    '/health/external',
    {
      schema: {
        description: 'Check external API health (Stripe, partners)',
        tags: ['Health'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Require auth in production
      const isProd = process.env['NODE_ENV'] === 'production';
      if (isProd) {
        try {
          await app.authenticate(request, reply);
          app.authorize(request, reply, { roles: ['admin'] });
        } catch {
          return reply.status(401).send({
            success: false,
            error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
          });
        }
      }

      const [stripe, partnerStatuses] = await Promise.all([
        checkStripe(),
        PartnerHealthJob.getAllHealthStatus(),
      ]);

      // Build partner checks
      const partners: Record<string, DependencyCheck> = {};
      for (const status of partnerStatuses) {
        partners[status.provider] = {
          status: status.status === 'healthy' ? 'up' : status.status === 'degraded' ? 'degraded' : 'down',
          latencyMs: status.avgResponseTimeMs,
          message: status.consecutiveFailures > 0 ? `${status.consecutiveFailures} consecutive failures` : undefined,
          lastChecked: status.lastCheck,
        };
      }

      const allChecks = { stripe, ...partners };
      const overallStatus = determineOverallStatus(allChecks);

      return reply.send({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        services: {
          stripe,
          partners,
        },
        summary: {
          total: Object.keys(allChecks).length,
          healthy: Object.values(allChecks).filter((c) => c.status === 'up').length,
          degraded: Object.values(allChecks).filter((c) => c.status === 'degraded').length,
          down: Object.values(allChecks).filter((c) => c.status === 'down').length,
        },
      });
    }
  );

  // ===========================================================================
  // GET /health/cache - Cache health and statistics
  // ===========================================================================
  app.get(
    '/health/cache',
    {
      schema: {
        description: 'Get cache health and statistics',
        tags: ['Health'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Require auth in production
      const isProd = process.env['NODE_ENV'] === 'production';
      if (isProd) {
        try {
          await app.authenticate(request, reply);
          app.authorize(request, reply, { roles: ['admin'] });
        } catch {
          return reply.status(401).send({
            success: false,
            error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
          });
        }
      }

      const cacheCheck = await checkCache(app);

      return reply.send({
        status: cacheCheck.status,
        timestamp: new Date().toISOString(),
        ...cacheCheck,
        recommendations: cacheCheck.stats ? getRecommendations(cacheCheck.stats) : [],
      });
    }
  );

  // ===========================================================================
  // GET /health/queue - Job queue health and statistics
  // ===========================================================================
  app.get(
    '/health/queue',
    {
      schema: {
        description: 'Get job queue health and statistics',
        tags: ['Health'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Require auth in production
      const isProd = process.env['NODE_ENV'] === 'production';
      if (isProd) {
        try {
          await app.authenticate(request, reply);
          app.authorize(request, reply, { roles: ['admin'] });
        } catch {
          return reply.status(401).send({
            success: false,
            error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
          });
        }
      }

      const queueCheck = await checkJobQueue(app);

      // Build queue health summary
      const warnings: string[] = [];
      if (queueCheck.stats) {
        if (queueCheck.stats.failed > 50) {
          warnings.push(`High failure count (${queueCheck.stats.failed}). Review failed jobs.`);
        }
        if (queueCheck.stats.waiting > 500) {
          warnings.push(`Queue backlog detected (${queueCheck.stats.waiting} waiting). Consider scaling workers.`);
        }
        if (queueCheck.stats.delayed > 100) {
          warnings.push(`Many delayed jobs (${queueCheck.stats.delayed}). Check scheduling.`);
        }
      }

      return reply.send({
        status: queueCheck.status,
        timestamp: new Date().toISOString(),
        ...queueCheck,
        warnings,
      });
    }
  );

  // ===========================================================================
  // GET /health/all - Comprehensive health check (all systems)
  // ===========================================================================
  app.get(
    '/health/all',
    {
      schema: {
        description: 'Comprehensive health check of all systems',
        tags: ['Health'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Always require auth for comprehensive check
      try {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      } catch {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Admin authentication required' },
        });
      }

      const startTime = Date.now();

      // Run all checks in parallel
      const [
        database,
        redis,
        stripe,
        cache,
        queue,
        partnerStatuses,
        emailQueue,
        jobScheduler,
      ] = await Promise.all([
        checkDatabase(),
        checkRedis(app),
        checkStripe(),
        checkCache(app),
        checkJobQueue(app),
        PartnerHealthJob.getAllHealthStatus(),
        checkEmailQueue(app),
        checkJobScheduler(app),
      ]);

      const memory = checkMemory();
      const rateLimiter = checkRateLimiter(app);

      // Build partner summary
      const partners: Record<string, DependencyCheck> = {};
      for (const status of partnerStatuses) {
        partners[status.provider] = {
          status: status.status === 'healthy' ? 'up' : status.status === 'degraded' ? 'degraded' : 'down',
          latencyMs: status.avgResponseTimeMs,
          lastChecked: status.lastCheck,
        };
      }

      // Determine overall status
      const allChecks = {
        database,
        redis,
        memory,
        stripe,
        cache,
        queue,
        emailQueue,
        jobScheduler,
        rateLimiter,
        ...partners,
      };

      const overallStatus = determineOverallStatus(allChecks);
      const checkDuration = Date.now() - startTime;

      return reply.send({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        checkDurationMs: checkDuration,
        infrastructure: {
          database,
          redis,
          memory,
        },
        services: {
          cache: { ...cache },
          queue: { ...queue },
          emailQueue,
          jobScheduler,
          rateLimiter,
        },
        external: {
          stripe,
          partners,
        },
        summary: {
          total: Object.keys(allChecks).length,
          healthy: Object.values(allChecks).filter((c) => c.status === 'up').length,
          degraded: Object.values(allChecks).filter((c) => c.status === 'degraded').length,
          down: Object.values(allChecks).filter((c) => c.status === 'down').length,
        },
      });
    }
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function getRecommendations(stats: Record<string, number>): string[] {
  const recommendations: string[] = [];

  if (stats.hitRate < 50) {
    recommendations.push('Low cache hit rate. Consider caching more frequently accessed data.');
  }
  if (stats.errors > 10) {
    recommendations.push('Cache errors detected. Check Redis connection stability.');
  }
  if (stats.hitRate > 95 && stats.hits > 10000) {
    recommendations.push('Excellent cache performance!');
  }

  return recommendations;
}
