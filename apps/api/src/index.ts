/**
 * RealRiches API Server - Entry Point
 * Fastify v5, TypeScript, PostgreSQL, Redis
 * FARE Act + FCHA Compliance
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { authPlugin } from './http/plugins/auth.js';
import { errorHandler } from './lib/errors.js';

// Route imports
import { authRoutes } from './http/routes/auth.js';
import { userRoutes } from './http/routes/users.js';
import { listingRoutes } from './http/routes/listings.js';
import { applicationRoutes } from './http/routes/applications.js';
import { leaseRoutes } from './http/routes/leases.js';
import { paymentRoutes } from './http/routes/payments.js';
import { agentRoutes } from './http/routes/agents.js';
import { messageRoutes } from './http/routes/messages.js';
import { notificationRoutes } from './http/routes/notifications.js';
import { complianceRoutes } from './http/routes/compliance.js';
import { smartLockRoutes } from './http/routes/smart-locks.js';
import { adminRoutes } from './http/routes/admin.js';
import { marketRoutes } from './http/routes/markets.js';
import { webhookRoutes } from './http/routes/webhooks.js';

async function buildServer() {
  const server = Fastify({
    logger: (() => {
      const base: any = { level: env.LOG_LEVEL, redact: ['req.headers.authorization', 'req.body.password', 'req.body.ssn'] };
      if (env.NODE_ENV === 'development') {
        base.transport = { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } };
      }
      return base;
    })(),
    trustProxy: true,
    requestTimeout: 30000,
  });

  // Security plugins
  await server.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false
  });

  await server.register(cors, {
    origin: env.CORS_ORIGINS.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
  });

  await server.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    redis,
    keyGenerator: (req) => req.headers['x-forwarded-for'] as string || req.ip
  });

  // API Documentation
  if (env.NODE_ENV !== 'production') {
    await server.register(swagger, {
      openapi: {
        info: {
          title: 'RealRiches API',
          description: 'NYC Luxury Rental Platform - FARE Act & FCHA Compliant',
          version: '3.1.0'
        },
        servers: [{ url: `http://localhost:${env.PORT}` }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
          }
        }
      }
    });
    await server.register(swaggerUi, { routePrefix: '/docs' });
  }

  // Auth plugin
  await server.register(authPlugin);

  // Error handler
  server.setErrorHandler(errorHandler);

  // Health check
  server.get('/health', async () => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '3.1.0',
    database: await prisma.$queryRaw`SELECT 1`.then(() => 'connected').catch(() => 'disconnected'),
    redis: redis.status === 'ready' ? 'connected' : 'disconnected'
  }));

  // API routes
  await server.register(authRoutes, { prefix: '/api/v1/auth' });
  await server.register(userRoutes, { prefix: '/api/v1/users' });
  await server.register(listingRoutes, { prefix: '/api/v1/listings' });
  await server.register(applicationRoutes, { prefix: '/api/v1/applications' });
  await server.register(leaseRoutes, { prefix: '/api/v1/leases' });
  await server.register(paymentRoutes, { prefix: '/api/v1/payments' });
  await server.register(agentRoutes, { prefix: '/api/v1/agents' });
  await server.register(messageRoutes, { prefix: '/api/v1/messages' });
  await server.register(notificationRoutes, { prefix: '/api/v1/notifications' });
  await server.register(complianceRoutes, { prefix: '/api/v1/compliance' });
  await server.register(smartLockRoutes, { prefix: '/api/v1/smart-locks' });
  await server.register(adminRoutes, { prefix: '/api/v1/admin' });
  await server.register(marketRoutes, { prefix: '/api/v1/markets' });
  await server.register(webhookRoutes, { prefix: '/webhooks' });

  return server;
}

async function start() {
  try {
    const server = await buildServer();
    
    // Graceful shutdown
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        server.log.info(`Received ${signal}, shutting down...`);
        await server.close();
        await prisma.$disconnect();
        await redis.quit();
        process.exit(0);
      });
    });

    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    server.log.info(`🚀 RealRiches API v3.1.0 running on port ${env.PORT}`);
    server.log.info(`📊 Environment: ${env.NODE_ENV}`);
    server.log.info(`📋 FARE Act Compliance: Enabled`);
    server.log.info(`📋 FCHA Compliance: Enabled`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
