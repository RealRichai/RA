/**
 * Shadow Discrepancy Verifier Job
 *
 * Scheduled job that compares primary and shadow stores for discrepancies.
 * STAGING-ONLY: Only runs when CHAOS_ENABLED=true or in development.
 */

import { logger } from '@realriches/utils';
import type { Job } from 'bullmq';

import {
  discrepancyVerifierJobHandler,
  type VerificationResult,
} from '../modules/shadow-write/index.js';

import type { JobDefinition } from './scheduler.js';

// =============================================================================
// Job Configuration
// =============================================================================

const JOB_NAME = 'shadow-discrepancy-verifier';

// Only run in staging/development
const IS_ENABLED =
  process.env.CHAOS_ENABLED === 'true' ||
  process.env.NODE_ENV === 'development' ||
  process.env.NODE_ENV === 'test';

// Cron: Every 15 minutes in staging
const CRON_SCHEDULE = '*/15 * * * *';

// =============================================================================
// Job Handler
// =============================================================================

async function handler(job: Job): Promise<VerificationResult | null> {
  if (!IS_ENABLED) {
    logger.debug(
      { jobId: job.id },
      'Shadow discrepancy verifier skipped (not enabled)'
    );
    return null;
  }

  logger.info({ jobId: job.id }, 'Starting shadow discrepancy verification');

  try {
    const result = await discrepancyVerifierJobHandler();

    logger.info(
      {
        jobId: job.id,
        runId: result.runId,
        entitiesChecked: result.entitiesChecked,
        discrepanciesFound: result.discrepanciesFound,
        timedOut: result.timedOut,
      },
      'Shadow discrepancy verification completed'
    );

    return result;
  } catch (error) {
    logger.error(
      { err: error, jobId: job.id },
      'Shadow discrepancy verification failed'
    );
    throw error;
  }
}

// =============================================================================
// Job Definition
// =============================================================================

export const ShadowDiscrepancyVerifierJob = {
  getDefinition(): JobDefinition {
    return {
      name: JOB_NAME,
      handler,
      cron: IS_ENABLED ? CRON_SCHEDULE : undefined,
      options: {
        attempts: 1, // Don't retry on failure
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    };
  },

  /**
   * Trigger job immediately (for testing)
   */
  async triggerNow(): Promise<VerificationResult | null> {
    return discrepancyVerifierJobHandler();
  },

  /**
   * Check if job is enabled
   */
  isEnabled(): boolean {
    return IS_ENABLED;
  },
};
