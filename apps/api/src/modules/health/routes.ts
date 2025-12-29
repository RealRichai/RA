import { prisma, checkConnection } from '@realriches/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: { status: 'up' | 'down'; latency?: number };
    redis: { status: 'up' | 'down'; latency?: number };
  };
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Basic health check
  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Detailed health check
  app.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const checks: HealthStatus['checks'] = {
      database: { status: 'down' },
      redis: { status: 'down' },
    };

    // Check database
    const dbStart = Date.now();
    try {
      const connected = await checkConnection();
      checks.database = {
        status: connected ? 'up' : 'down',
        latency: Date.now() - dbStart,
      };
    } catch {
      checks.database = { status: 'down', latency: Date.now() - dbStart };
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      await app.redis.ping();
      checks.redis = { status: 'up', latency: Date.now() - redisStart };
    } catch {
      checks.redis = { status: 'down', latency: Date.now() - redisStart };
    }

    const allUp = Object.values(checks).every((c) => c.status === 'up');
    const allDown = Object.values(checks).every((c) => c.status === 'down');

    const status: HealthStatus = {
      status: allUp ? 'healthy' : allDown ? 'unhealthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] || '1.0.0',
      uptime: process.uptime(),
      checks,
    };

    const statusCode = status.status === 'healthy' ? 200 : status.status === 'degraded' ? 200 : 503;
    return reply.status(statusCode).send(status);
  });

  // Liveness probe
  app.get('/health/live', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ status: 'alive', timestamp: new Date().toISOString() });
  });
}
