import type { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { env, isDevelopment } from '../../config/env.js';
import { redis } from '../../lib/redis.js';
import { authPlugin } from './auth.js';

export async function registerPlugins(fastify: FastifyInstance): Promise<void> {
  // Security headers
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: !isDevelopment,
  });

  // CORS
  await fastify.register(fastifyCors, {
    origin: env.CORS_ORIGINS.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

  // Rate limiting with Redis
  await fastify.register(fastifyRateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    redis,
    keyGenerator: (request) => {
      return request.user?.userId || request.ip;
    },
    skipOnError: true,
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  // File uploads
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 10,
    },
  });

  // Swagger documentation
  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'RealRiches API',
        description: 'NYC Luxury Rental Platform API - FARE Act & FCHA Compliant',
        version: '3.1.0',
        contact: {
          name: 'RealRiches Support',
          email: 'api@realriches.com',
        },
      },
      servers: [
        {
          url: isDevelopment ? 'http://localhost:3001' : 'https://api.realriches.com',
          description: isDevelopment ? 'Development' : 'Production',
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
      tags: [
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'Users', description: 'User management' },
        { name: 'Listings', description: 'Property listings' },
        { name: 'Applications', description: 'Rental applications' },
        { name: 'Leases', description: 'Lease management' },
        { name: 'Payments', description: 'Payment processing' },
        { name: 'Agents', description: 'Agent profiles and reviews' },
        { name: 'Messages', description: 'Messaging system' },
        { name: 'Compliance', description: 'FARE Act & FCHA compliance' },
        { name: 'Admin', description: 'Admin operations' },
      ],
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
  });

  // Authentication plugin
  await fastify.register(authPlugin);
}
