/**
 * Background Jobs Plugin
 *
 * Initializes and manages background job processing.
 */

import { logger } from '@realriches/utils';
import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';

import { setupJobs, stopJobs, getJobScheduler, type JobScheduler } from '../jobs';

declare module 'fastify' {
  interface FastifyInstance {
    jobScheduler: JobScheduler | null;
  }
}

const jobsPluginCallback: FastifyPluginCallback = async (fastify, _opts) => {
  // Only start jobs if enabled (disabled in test mode)
  const shouldStartJobs = process.env.NODE_ENV !== 'test' &&
    process.env.DISABLE_BACKGROUND_JOBS !== 'true';

  if (!shouldStartJobs) {
    logger.info('Background jobs disabled');
    fastify.decorate('jobScheduler', null);
    return;
  }

  try {
    // Set up jobs with Redis connection
    const scheduler = await setupJobs(fastify.redis);
    fastify.decorate('jobScheduler', scheduler);

    logger.info('Background jobs plugin initialized');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize background jobs');
    fastify.decorate('jobScheduler', null);
  }

  // Clean up on close
  fastify.addHook('onClose', async () => {
    await stopJobs();
  });
};

export const jobsPlugin = fp(jobsPluginCallback, {
  name: 'jobs',
  dependencies: ['redis'],
});
