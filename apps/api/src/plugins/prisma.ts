/**
 * Prisma Plugin
 *
 * Decorates FastifyInstance with prisma client for database access.
 */

import { prisma } from '@realriches/database';
import type { PrismaClient } from '@realriches/database';
import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';

const prismaPluginCallback: FastifyPluginCallback = (fastify, _opts, done) => {
  // Decorate fastify with prisma client
  fastify.decorate('prisma', prisma);

  // Close prisma connection on fastify close
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  done();
};

export const prismaPlugin = fp(prismaPluginCallback, {
  name: 'prisma',
});

// Type augmentation
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}
