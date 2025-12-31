import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { getConfig } from '@realriches/config';
import type { FastifyInstance } from 'fastify';

import { aiPlugin } from './ai';
import { auditPlugin } from './audit';
import { authPlugin } from './auth';
import { cachePlugin } from './cache';
import { emailPlugin } from './email';
import { errorHandler } from './error-handler';
import { jobsPlugin } from './jobs';
import { metricsPlugin } from './metrics';
import { rateLimitPlugin } from './rate-limit';
import rawBodyPlugin from './raw-body';
import { redisPlugin } from './redis';
import { tracingPlugin } from './tracing';

export async function registerPlugins(app: FastifyInstance): Promise<void> {
  const config = getConfig();

  // Raw body parser (for webhook signature verification)
  // Must be registered before other content type parsers
  await app.register(rawBodyPlugin);

  // Request tracing (early registration for trace context availability)
  await app.register(tracingPlugin, {
    enabled: true,
    serviceName: 'realriches-api',
    includeResponseHeaders: true,
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  // CORS
  await app.register(cors, {
    origin: config.api.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Trace-ID',
      'X-Span-ID',
      'X-Parent-Span-ID',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-RateLimit-Category',
      'X-DailyQuota-Limit',
      'X-DailyQuota-Remaining',
      'Retry-After',
      'X-Trace-ID',
      'X-Span-ID',
      'X-Parent-Span-ID',
    ],
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
    keyGenerator: (request) => {
      return request.headers['x-forwarded-for']?.toString() || request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
        details: {
          limit: context.max,
          remaining: 0,
          retryAfter: Math.ceil(context.ttl / 1000),
        },
      },
    }),
  });

  // Sensible defaults (not found, bad request helpers)
  await app.register(sensible);

  // JWT
  await app.register(jwt, {
    secret: config.jwt.secret,
    sign: {
      expiresIn: config.jwt.accessExpiresIn,
    },
  });

  // File uploads
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 10,
    },
  });

  // Redis
  await app.register(redisPlugin);

  // Cache layer (depends on Redis)
  await app.register(cachePlugin, {
    enabled: true,
    prefix: 'cache',
    defaultTtl: 300, // 5 minutes
    collectMetrics: true,
  });

  // Enhanced rate limiting (depends on Redis)
  await app.register(rateLimitPlugin, {
    enabled: true,
    redisPrefix: 'rl',
    includeHeaders: true,
    logExceeded: true,
  });

  // Prometheus metrics
  await app.register(metricsPlugin, {
    enabled: true,
    collectDefaultMetrics: true,
    collectBusinessMetrics: true,
    businessMetricsInterval: 60000, // Refresh business metrics every minute
  });

  // Email service (depends on Redis)
  await app.register(emailPlugin);

  // Background jobs (depends on Redis)
  await app.register(jobsPlugin);

  // AI client (Claude/OpenAI with fallback)
  await app.register(aiPlugin);

  // Auth decorators
  await app.register(authPlugin);

  // Audit logging (non-blocking, records all write operations)
  await app.register(auditPlugin);

  // Swagger documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'RealRiches API',
        description: 'AI-Powered Real Estate Platform API',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${config.api.port}${config.api.prefix}`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Global error handler
  app.setErrorHandler(errorHandler);

  // Request logging (trace context added by tracing plugin)
  app.addHook('onRequest', async (request) => {
    const trace = (request as any).trace;
    request.log.info({
      msg: 'request_start',
      method: request.method,
      url: request.url,
      requestId: request.id,
      ...(trace && { traceId: trace.traceId, spanId: trace.spanId }),
    });
  });

  // Response logging
  app.addHook('onResponse', async (request, reply) => {
    const trace = (request as any).trace;
    request.log.info({
      msg: 'request_complete',
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
      ...(trace && { traceId: trace.traceId, spanId: trace.spanId }),
    });
  });
}
