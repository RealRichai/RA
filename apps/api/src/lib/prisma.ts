import { PrismaClient } from '@prisma/client';
import { env, isDevelopment } from '../config/env.js';

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = globalThis.prisma ?? new PrismaClient({
  log: isDevelopment ? ['query', 'info', 'warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
});

if (isDevelopment) {
  globalThis.prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log('📤 Database disconnected');
}
