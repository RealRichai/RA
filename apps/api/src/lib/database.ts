/**
 * Database Client
 * Prisma client with soft delete middleware
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

  // Soft delete middleware
  client.$use(async (params, next) => {
    const softDeleteModels = ['User', 'Listing', 'Application', 'Lease', 'Payment', 'Lead'];
    
    if (softDeleteModels.includes(params.model ?? '')) {
      if (params.action === 'delete') {
        params.action = 'update';
        params.args.data = { deletedAt: new Date() };
      }
      if (params.action === 'deleteMany') {
        params.action = 'updateMany';
        params.args.data = { deletedAt: new Date() };
      }
      if (params.action === 'findUnique' || params.action === 'findFirst') {
        params.args.where = { ...params.args.where, deletedAt: null };
      }
      if (params.action === 'findMany') {
        params.args.where = { ...params.args.where, deletedAt: null };
      }
    }
    
    return next(params);
  });

  return client;
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    logger.error('Database health check failed');
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await db.$disconnect();
  logger.info('Database disconnected');
}
