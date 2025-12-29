import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { FastifyInstance } from 'fastify';

export function setupGracefulShutdown(app: FastifyInstance): void {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

  let isShuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown...');

    // Set a timeout for forceful shutdown
    const forceShutdownTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 30000);

    try {
      // Stop accepting new connections
      logger.info('Closing HTTP server...');
      await app.close();
      logger.info('HTTP server closed');

      // Close database connection
      logger.info('Closing database connection...');
      await prisma.$disconnect();
      logger.info('Database connection closed');

      clearTimeout(forceShutdownTimeout);
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during graceful shutdown');
      clearTimeout(forceShutdownTimeout);
      process.exit(1);
    }
  };

  signals.forEach((signal) => {
    process.on(signal, () => shutdown(signal));
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    shutdown('SIGTERM');
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    shutdown('SIGTERM');
  });
}
