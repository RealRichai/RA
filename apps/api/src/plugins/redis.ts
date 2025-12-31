import { getConfig } from '@realriches/config';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

const redisPluginCallback: FastifyPluginCallback = (fastify, _opts, done) => {
  const config = getConfig();

  const enableTls = config.redis.tls === true;
  const redis = new Redis(config.redis.url, {
    password: config.redis.password || undefined,
    ...(enableTls && { tls: {} }),
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 5) {
        logger.error('Redis connection failed after 5 retries');
        return null;
      }
      return Math.min(times * 100, 3000);
    },
  });

  redis.on('connect', () => {
    logger.info('Redis connected');
  });

  redis.on('error', (error) => {
    logger.error({ error }, 'Redis error');
  });

  redis.on('close', () => {
    logger.warn('Redis connection closed');
  });

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    await redis.quit();
  });

  done();
};

export const redisPlugin = fp(redisPluginCallback, {
  name: 'redis',
});
