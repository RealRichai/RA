/**
 * Job Setup
 *
 * Initializes and configures all background jobs.
 */

import { logger } from '@realriches/utils';
import type { Redis } from 'ioredis';

import { AgentUsageAggregationJob } from './agent-usage-aggregation';
import { AnalyticsAggregationJob } from './analytics-aggregation';
import { ComplianceAuditJob } from './compliance-audit';
import { DataCleanupJob } from './data-cleanup';
import { DocumentExpirationJob } from './document-expiration';
import { EmailNotificationJob } from './email-notification';
import { LeaseRenewalJob } from './lease-renewal';
import { PartnerHealthJob } from './partner-health';
import { PaymentReminderJob } from './payment-reminder';
import { PolicyExpirationJob } from './policy-expiration';
import { JobScheduler } from './scheduler';
import { SyndicationSyncJob } from './syndication-sync';
import { WebhookRetryJob } from './webhook-retry';

let scheduler: JobScheduler | null = null;

/**
 * Set up and start all background jobs.
 */
export async function setupJobs(redis: Redis): Promise<JobScheduler> {
  if (scheduler) {
    logger.warn('Job scheduler already initialized');
    return scheduler;
  }

  // Initialize services that jobs depend on
  EmailNotificationJob.initializeEmailService(redis);
  PartnerHealthJob.initializeRedis(redis);
  WebhookRetryJob.initializeRedis(redis);
  DataCleanupJob.initializeRedis(redis);
  AnalyticsAggregationJob.initializeRedis(redis);
  AgentUsageAggregationJob.initializeRedis(redis);
  ComplianceAuditJob.initializeRedis(redis);
  DocumentExpirationJob.initializeRedis(redis);
  SyndicationSyncJob.initializeRedis(redis);

  // Create scheduler with Redis connection
  scheduler = new JobScheduler({
    connection: redis,
    prefix: 'rr', // RealRiches prefix
    concurrency: 5,
  });

  // Register all jobs
  scheduler.register(PolicyExpirationJob.getDefinition());
  scheduler.register(PaymentReminderJob.getDefinition());
  scheduler.register(LeaseRenewalJob.getDefinition());
  scheduler.register(EmailNotificationJob.getDefinition());
  scheduler.register(PartnerHealthJob.getDefinition());
  scheduler.register(WebhookRetryJob.getDefinition());
  scheduler.register(DataCleanupJob.getDefinition());
  scheduler.register(AnalyticsAggregationJob.getDefinition());
  scheduler.register(AgentUsageAggregationJob.getDefinition());
  scheduler.register(ComplianceAuditJob.getDefinition());
  scheduler.register(DocumentExpirationJob.getDefinition());
  scheduler.register(SyndicationSyncJob.getDefinition());

  // Start the scheduler
  await scheduler.start();

  logger.info('Background jobs initialized');

  return scheduler;
}

/**
 * Get the current scheduler instance.
 */
export function getJobScheduler(): JobScheduler | null {
  return scheduler;
}

/**
 * Stop the job scheduler.
 */
export async function stopJobs(): Promise<void> {
  if (scheduler) {
    await scheduler.stop();
    scheduler = null;
    logger.info('Background jobs stopped');
  }
}
