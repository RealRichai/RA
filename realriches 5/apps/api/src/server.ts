/**
 * HTTP Server Configuration
 * Fastify server with security, logging, and error handling
 */

import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env, isDev } from './config/env.js';
import { logger, createRequestLogger } from './lib/logger.js';
import { AppError, ErrorCode } from './lib/errors.js';
import { checkDatabaseHealth, disconnectDatabase } from './lib/database.js';
import { checkCacheHealth, disconnectCache } from './lib/cache.js';
import { registerAuthHooks } from './modules/auth/auth.middleware.js';
import { authRoutes } from './modules/auth/auth.routes.js';

export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    trustProxy: true,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(helmet, { contentSecurityPolicy: isDev ? false : undefined });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    errorResponseBuilder: (request, context) => ({
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      },
    }),
  });

  registerAuthHooks(app);

  app.addHook('onRequest', async (request) => {
    const log = createRequestLogger(request.id, request.auth?.userId);
    log.info({ method: request.method, url: request.url }, 'Incoming request');
  });

  app.addHook('onResponse', async (request, reply) => {
    const log = createRequestLogger(request.id, request.auth?.userId);
    log.info({ method: request.method, url: request.url, statusCode: reply.statusCode }, 'Request completed');
  });

  app.setErrorHandler(async (error: FastifyError | AppError, request, reply) => {
    const log = createRequestLogger(request.id, request.auth?.userId);

    if (error instanceof AppError) {
      log.warn({ code: error.code, message: error.message }, 'Application error');
      return reply.status(error.httpStatus).send(error.toJSON());
    }

    if (error.validation) {
      return reply.status(400).send({
        error: { code: ErrorCode.VALIDATION_FAILED, message: 'Validation failed', details: { validation: error.validation } },
      });
    }

    log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send({
      error: { code: ErrorCode.SYSTEM_ERROR, message: isDev ? error.message : 'Internal server error' },
    });
  });

  app.get('/health', async (request, reply) => {
    const [dbHealth, cacheHealth] = await Promise.all([checkDatabaseHealth(), checkCacheHealth()]);
    const status = dbHealth ? 'healthy' : 'degraded';
    return reply.status(dbHealth ? 200 : 503).send({
      status,
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      checks: { database: dbHealth ? 'ok' : 'error', cache: cacheHealth ? 'ok' : 'unavailable' },
    });
  });

  app.get('/ready', async (request, reply) => {
    const dbHealth = await checkDatabaseHealth();
    return reply.status(dbHealth ? 200 : 503).send({ ready: dbHealth });
  });

  app.get('/live', async (request, reply) => reply.send({ alive: true }));

  // Register API routes
  await app.register(async (api) => {
    await api.register(authRoutes, { prefix: '/auth' });
    // Additional routes would be registered here
  }, { prefix: '/api/v1' });

  return app;
}

export async function startServer(): Promise<FastifyInstance> {
  const app = await createServer();

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
    logger.info({ host: env.HOST, port: env.PORT, env: env.NODE_ENV }, 'Server started');

    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutdown signal received');
      try {
        await app.close();
        await disconnectDatabase();
        await disconnectCache();
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error({ err: error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return app;
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}
