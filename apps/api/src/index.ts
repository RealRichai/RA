import Fastify from 'fastify';
import { getConfig } from '@realriches/config';
import { logger } from '@realriches/utils';
import { prisma, checkConnection } from '@realriches/database';

import { registerPlugins } from './plugins';
import { registerModules } from './modules';
import { setupGracefulShutdown } from './lib/shutdown';

async function main() {
  const config = getConfig();

  // Create Fastify instance
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  try {
    // Check database connection
    logger.info('Checking database connection...');
    const dbConnected = await checkConnection();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }
    logger.info('Database connected successfully');

    // Register plugins
    await registerPlugins(app);

    // Register API modules
    await registerModules(app);

    // Setup graceful shutdown
    setupGracefulShutdown(app);

    // Start server
    const address = await app.listen({
      port: config.api.port,
      host: config.api.host,
    });

    logger.info(`🚀 Server running at ${address}`);
    logger.info(`📚 API docs at ${address}/docs`);
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    await prisma.$disconnect();
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error({ error }, 'Unhandled error during startup');
  process.exit(1);
});
