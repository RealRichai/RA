/**
 * Health Check Routes
 *
 * Kubernetes-compatible health endpoints with comprehensive dependency checks.
 * - /health - Basic liveness (is server running)
 * - /health/live - Liveness probe (is process alive)
 * - /health/ready - Readiness probe (are dependencies healthy)
 * - /health/detailed - Full system status with metrics
 */

import { checkConnection } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

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
    const isPaused = app.emailService.isPaused?.() ?? false;

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

    const isRunning = app.jobScheduler.isRunning?.() ?? true;

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
}
