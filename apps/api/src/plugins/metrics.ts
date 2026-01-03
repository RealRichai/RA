/**
 * Prometheus Metrics Plugin
 *
 * Exposes application metrics in Prometheus format at /metrics.
 * Collects HTTP request metrics, business metrics, and system metrics.
 */

import { getConfig } from '@realriches/config';
import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import client from 'prom-client';

// =============================================================================
// Configuration
// =============================================================================

interface MetricsPluginOptions {
  /** Enable/disable metrics collection */
  enabled?: boolean;
  /** Prefix for all metric names */
  prefix?: string;
  /** Enable default Node.js metrics */
  collectDefaultMetrics?: boolean;
  /** Interval for collecting default metrics (ms) */
  defaultMetricsInterval?: number;
  /** Enable business metrics collection */
  collectBusinessMetrics?: boolean;
  /** Interval for business metrics refresh (ms) */
  businessMetricsInterval?: number;
}

// =============================================================================
// Metrics Registry
// =============================================================================

const register = new client.Registry();

// Add default labels
register.setDefaultLabels({
  app: 'realriches-api',
});

// =============================================================================
// HTTP Metrics
// =============================================================================

// Request counter
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// Request size histogram
const httpRequestSize = new client.Histogram({
  name: 'http_request_size_bytes',
  help: 'HTTP request size in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [register],
});

// Response size histogram
const httpResponseSize = new client.Histogram({
  name: 'http_response_size_bytes',
  help: 'HTTP response size in bytes',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [register],
});

// Active requests gauge
const httpActiveRequests = new client.Gauge({
  name: 'http_active_requests',
  help: 'Number of active HTTP requests',
  labelNames: ['method'],
  registers: [register],
});

// =============================================================================
// Error Metrics
// =============================================================================

const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'route', 'status_code', 'error_code'],
  registers: [register],
});

// =============================================================================
// Rate Limit Metrics
// =============================================================================

const rateLimitHits = new client.Counter({
  name: 'rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['category', 'tier'],
  registers: [register],
});

// =============================================================================
// Cache Metrics
// =============================================================================

const cacheHits = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['cache_type'],
  registers: [register],
});

const cacheMisses = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

const cacheOperations = new client.Counter({
  name: 'cache_operations_total',
  help: 'Total cache operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

const cacheSize = new client.Gauge({
  name: 'cache_keys_count',
  help: 'Number of keys in cache',
  registers: [register],
});

// =============================================================================
// Authentication Metrics
// =============================================================================

const authAttempts = new client.Counter({
  name: 'auth_attempts_total',
  help: 'Total authentication attempts',
  labelNames: ['type', 'status'],
  registers: [register],
});

// =============================================================================
// Business Metrics
// =============================================================================

const activeUsers = new client.Gauge({
  name: 'business_active_users',
  help: 'Number of active users by role',
  labelNames: ['role'],
  registers: [register],
});

const totalListings = new client.Gauge({
  name: 'business_listings_total',
  help: 'Total number of listings by status',
  labelNames: ['status'],
  registers: [register],
});

const totalLeases = new client.Gauge({
  name: 'business_leases_total',
  help: 'Total number of leases by status',
  labelNames: ['status'],
  registers: [register],
});

const totalProperties = new client.Gauge({
  name: 'business_properties_total',
  help: 'Total number of properties',
  registers: [register],
});

const pendingPayments = new client.Gauge({
  name: 'business_pending_payments',
  help: 'Number of pending payments',
  registers: [register],
});

const aiConversations = new client.Gauge({
  name: 'business_ai_conversations_active',
  help: 'Number of active AI conversations',
  registers: [register],
});

// =============================================================================
// Job Metrics
// =============================================================================

const jobsProcessed = new client.Counter({
  name: 'jobs_processed_total',
  help: 'Total number of background jobs processed',
  labelNames: ['job_name', 'status'],
  registers: [register],
});

const jobDuration = new client.Histogram({
  name: 'job_duration_seconds',
  help: 'Background job duration in seconds',
  labelNames: ['job_name'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
  registers: [register],
});

// =============================================================================
// Database Metrics
// =============================================================================

const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

const dbConnectionPool = new client.Gauge({
  name: 'db_connection_pool_size',
  help: 'Database connection pool metrics',
  labelNames: ['state'],
  registers: [register],
});

// =============================================================================
// Redis Metrics
// =============================================================================

const redisOperations = new client.Counter({
  name: 'redis_operations_total',
  help: 'Total Redis operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

// =============================================================================
// Helper Functions
// =============================================================================

function normalizeRoute(url: string): string {
  // Replace UUIDs and IDs with placeholders
  return url
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    .replace(/\?.*$/, ''); // Remove query string
}

async function collectBusinessMetrics(): Promise<void> {
  try {
    // User counts by role
    const usersByRole = await prisma.user.groupBy({
      by: ['role'],
      _count: true,
      where: { status: 'active' },
    });

    for (const { role, _count } of usersByRole) {
      activeUsers.labels(role).set(_count);
    }

    // Listing counts by status
    const listingsByStatus = await prisma.listing.groupBy({
      by: ['status'],
      _count: true,
    });

    for (const { status, _count } of listingsByStatus) {
      totalListings.labels(status).set(_count);
    }

    // Lease counts by status
    const leasesByStatus = await prisma.lease.groupBy({
      by: ['status'],
      _count: true,
    });

    for (const { status, _count } of leasesByStatus) {
      totalLeases.labels(status).set(_count);
    }

    // Total properties
    const propertyCount = await prisma.property.count();
    totalProperties.set(propertyCount);

    // Pending payments
    const pendingPaymentCount = await prisma.payment.count({
      where: { status: 'pending' },
    });
    pendingPayments.set(pendingPaymentCount);

    // Active AI conversations
    const activeConversations = await prisma.aIConversation.count({
      where: { status: 'active' },
    });
    aiConversations.set(activeConversations);
  } catch (error) {
    logger.error({ error }, 'Failed to collect business metrics');
  }
}

// =============================================================================
// Plugin
// =============================================================================

const metricsPluginCallback: FastifyPluginCallback<MetricsPluginOptions> = (
  fastify,
  opts,
  done
) => {
  const {
    enabled = true,
    prefix = '',
    collectDefaultMetrics = true,
    defaultMetricsInterval = 10000,
    collectBusinessMetrics: shouldCollectBusiness = true,
    businessMetricsInterval = 60000,
  } = opts;

  if (!enabled) {
    logger.info('Metrics collection disabled');
    done();
    return;
  }

  // Collect default Node.js metrics
  if (collectDefaultMetrics) {
    client.collectDefaultMetrics({
      register,
      prefix,
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
    });
  }

  // Business metrics collection interval
  let businessMetricsTimer: NodeJS.Timeout | null = null;
  if (shouldCollectBusiness) {
    // Initial collection
    collectBusinessMetrics();

    // Periodic collection
    businessMetricsTimer = setInterval(() => {
      collectBusinessMetrics();
    }, businessMetricsInterval);
  }

  // Track active requests
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    httpActiveRequests.labels(request.method).inc();

    // Track request size
    const contentLength = request.headers['content-length'];
    if (contentLength) {
      const route = normalizeRoute(request.url);
      httpRequestSize.labels(request.method, route).observe(parseInt(contentLength, 10));
    }
  });

  // Record request metrics on response
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const route = normalizeRoute(request.url);
    const statusCode = String(reply.statusCode);
    const method = request.method;

    // Decrement active requests
    httpActiveRequests.labels(method).dec();

    // Increment request counter
    httpRequestsTotal.labels(method, route, statusCode).inc();

    // Record duration
    const duration = reply.elapsedTime / 1000; // Convert to seconds
    httpRequestDuration.labels(method, route, statusCode).observe(duration);

    // Track response size
    const responseSize = reply.getHeader('content-length');
    if (responseSize) {
      httpResponseSize
        .labels(method, route, statusCode)
        .observe(parseInt(String(responseSize), 10));
    }

    // Track errors
    if (reply.statusCode >= 400) {
      const errorCode = reply.statusCode >= 500 ? 'server_error' : 'client_error';
      httpErrorsTotal.labels(method, route, statusCode, errorCode).inc();
    }
  });

  // Decorate fastify with metrics helpers
  fastify.decorate('metrics', {
    register,
    httpRequestsTotal,
    httpRequestDuration,
    httpErrorsTotal,
    rateLimitHits,
    authAttempts,
    jobsProcessed,
    jobDuration,
    dbQueryDuration,
    redisOperations,
    cacheHits,
    cacheMisses,
    cacheOperations,
    cacheSize,
  });

  // Cleanup on close
  fastify.addHook('onClose', async () => {
    if (businessMetricsTimer) {
      clearInterval(businessMetricsTimer);
    }
    register.clear();
  });

  logger.info('Prometheus metrics collection enabled');
  done();
};

export const metricsPlugin = fp(metricsPluginCallback, {
  name: 'metrics',
});

// =============================================================================
// Metrics Routes
// =============================================================================

/**
 * Metrics authentication hook.
 * Allows access if:
 * 1. User is authenticated with ADMIN role via JWT, OR
 * 2. X-Metrics-Token header matches METRICS_TOKEN env var
 */
async function metricsAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  app: FastifyInstance
): Promise<void> {
  const config = getConfig();
  const metricsToken = config.observability?.metricsToken;

  // Check X-Metrics-Token header first (for Prometheus scraping)
  const headerToken = request.headers['x-metrics-token'] as string | undefined;
  if (metricsToken && headerToken === metricsToken) {
    return; // Token auth successful
  }

  // Fall back to JWT auth with ADMIN role
  try {
    await app.authenticate(request, reply);
    if (reply.sent) return; // Auth failed, response already sent

    if (request.user?.role !== 'ADMIN') {
      reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required for metrics endpoint',
        },
      });
      return;
    }
  } catch {
    // No valid auth method
    reply.status(401).send({
      success: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required. Provide X-Metrics-Token header or valid JWT.',
      },
    });
  }
}

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  // GET /metrics - Prometheus metrics endpoint (protected)
  app.get(
    '/metrics',
    {
      schema: {
        description: 'Prometheus metrics endpoint (requires ADMIN role or X-Metrics-Token)',
        tags: ['Metrics'],
        produces: ['text/plain'],
        security: [{ bearerAuth: [] }],
        headers: {
          type: 'object',
          properties: {
            'x-metrics-token': { type: 'string', description: 'Metrics access token' },
          },
        },
        response: {
          401: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          403: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
      preHandler: async (request, reply) => {
        await metricsAuth(request, reply, app);
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (reply.sent) return; // Auth failed

      try {
        const metrics = await register.metrics();
        reply.header('Content-Type', register.contentType);
        return reply.send(metrics);
      } catch (error) {
        logger.error({ error }, 'Failed to generate metrics');
        return reply.status(500).send('Error generating metrics');
      }
    }
  );

  // GET /metrics/json - Metrics as JSON (for debugging, protected)
  app.get(
    '/metrics/json',
    {
      schema: {
        description: 'Metrics as JSON for debugging (requires ADMIN role or X-Metrics-Token)',
        tags: ['Metrics'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await metricsAuth(request, reply, app);
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (reply.sent) return; // Auth failed

      try {
        const metrics = await register.getMetricsAsJSON();
        return reply.send({
          success: true,
          data: metrics,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to generate JSON metrics');
        return reply.status(500).send({
          success: false,
          error: { code: 'METRICS_ERROR', message: 'Failed to generate metrics' },
        });
      }
    }
  );
}

// =============================================================================
// Type Augmentation
// =============================================================================

declare module 'fastify' {
  interface FastifyInstance {
    metrics: {
      register: typeof register;
      httpRequestsTotal: typeof httpRequestsTotal;
      httpRequestDuration: typeof httpRequestDuration;
      httpErrorsTotal: typeof httpErrorsTotal;
      rateLimitHits: typeof rateLimitHits;
      authAttempts: typeof authAttempts;
      jobsProcessed: typeof jobsProcessed;
      jobDuration: typeof jobDuration;
      dbQueryDuration: typeof dbQueryDuration;
      redisOperations: typeof redisOperations;
      cacheHits: typeof cacheHits;
      cacheMisses: typeof cacheMisses;
      cacheOperations: typeof cacheOperations;
      cacheSize: typeof cacheSize;
    };
  }
}

// =============================================================================
// Exports
// =============================================================================

export {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  httpErrorsTotal,
  rateLimitHits,
  authAttempts,
  jobsProcessed,
  jobDuration,
  dbQueryDuration,
  redisOperations,
  activeUsers,
  totalListings,
  totalLeases,
  totalProperties,
  cacheHits,
  cacheMisses,
  cacheOperations,
  cacheSize,
};
