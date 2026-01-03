/**
 * Syndication Sync Job
 *
 * Background job that syncs listings to external portals.
 * Runs every 15 minutes to process pending/error syndications.
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';

import { getSyndicationProvider } from '../modules/syndication/providers';
import type {
  SyndicationListingData,
  SyndicationPortal,
  SyndicationResult,
} from '../modules/syndication/providers/provider.types';

import type { JobDefinition } from './scheduler';

// =============================================================================
// Types
// =============================================================================

let redisClient: Redis | null = null;

// =============================================================================
// Job Implementation
// =============================================================================

export class SyndicationSyncJob {
  /**
   * Get job definition for the scheduler.
   * Runs every 15 minutes.
   */
  static getDefinition(): JobDefinition {
    return {
      name: 'syndication-sync',
      handler: (job: Job) => SyndicationSyncJob.execute(job),
      cron: '*/15 * * * *', // Every 15 minutes
      options: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    };
  }

  static initializeRedis(redis: Redis): void {
    redisClient = redis;
  }

  static async execute(job: Job): Promise<void> {
    const startTime = Date.now();
    let processed = 0;
    let synced = 0;
    let failed = 0;
    let skipped = 0;

    logger.info({ jobId: job.id }, 'Starting syndication sync');

    try {
      // Find listings that need sync:
      // 1. Published and active with syndicateTo configured
      // 2. With pending/error status OR recently updated
      const listings = await prisma.listing.findMany({
        where: {
          isPublished: true,
          status: 'active',
          syndicateTo: { isEmpty: false },
        },
        include: {
          unit: { include: { property: true } },
          media: { orderBy: { order: 'asc' } },
          agent: { select: { firstName: true, lastName: true, email: true, phone: true } },
        },
        take: 100, // Process in batches
      });

      logger.info({ jobId: job.id, count: listings.length }, 'Found listings to sync');

      for (const listing of listings) {
        processed++;
        const syndicateTo = listing.syndicateTo as SyndicationPortal[];
        const currentStatus = (listing.syndicationStatus as unknown as Record<string, SyndicationResult>) || {};

        for (const portal of syndicateTo) {
          const portalStatus = currentStatus[portal];

          // Skip if recently synced and active (within last 6 hours)
          if (portalStatus?.status === 'active') {
            const syncedAt = new Date(portalStatus.syncedAt);
            if (Date.now() - syncedAt.getTime() < 6 * 60 * 60 * 1000) {
              skipped++;
              continue;
            }
          }

          // Skip disabled
          if (portalStatus?.status === 'disabled') {
            skipped++;
            continue;
          }

          try {
            const provider = getSyndicationProvider(portal);

            // Transform listing data
            const syndicationData: SyndicationListingData = {
              listingId: listing.id,
              externalListingId: portalStatus?.externalListingId,
              title: listing.title,
              description: listing.description || '',
              propertyType: listing.propertyType,
              listingType: listing.type === 'sale' ? 'sale' : 'rental',
              address: {
                street1: listing.street1,
                street2: listing.street2 || undefined,
                city: listing.city,
                state: listing.state,
                postalCode: listing.postalCode,
                latitude: listing.unit?.property?.latitude || undefined,
                longitude: listing.unit?.property?.longitude || undefined,
              },
              price: listing.priceAmount || listing.rent || 0,
              priceUnit: listing.type === 'sale' ? 'total' : 'monthly',
              securityDeposit: listing.securityDepositAmount || undefined,
              bedrooms: listing.bedrooms,
              bathrooms: listing.bathrooms,
              squareFeet: listing.squareFeet || undefined,
              floor: listing.floor || undefined,
              availableDate: listing.availableDate,
              publishedAt: listing.publishedAt || new Date(),
              images: (listing.media || []).map((m) => ({
                url: m.url,
                caption: m.caption || undefined,
                isPrimary: m.isPrimary,
                order: m.order,
              })),
              virtualTourUrl: (listing.metadata as Record<string, unknown>)?.virtualTourUrl as string | undefined,
              amenities: listing.amenities || [],
              petsAllowed: listing.petsAllowed,
              petPolicy: listing.petPolicy as Record<string, unknown> | undefined,
              includedUtilities: listing.includedUtilities || [],
              agentName: listing.agent
                ? `${listing.agent.firstName} ${listing.agent.lastName}`
                : undefined,
              agentEmail: listing.agent?.email,
              agentPhone: listing.agent?.phone || undefined,
            };

            let result: SyndicationResult;

            if (portalStatus?.externalListingId) {
              // Update existing
              const updateResult = await provider.updateListing(syndicationData);
              if (updateResult.success && updateResult.data) {
                result = updateResult.data;
                synced++;
              } else {
                result = {
                  listingId: listing.id,
                  portal,
                  status: 'error',
                  syncedAt: new Date(),
                  externalListingId: portalStatus.externalListingId,
                  error: {
                    code: 'SYNC_FAILED',
                    message: updateResult.error?.message || 'Sync failed',
                    retryable: true,
                  },
                };
                failed++;
              }
            } else {
              // New publish
              const publishResult = await provider.publishListing(syndicationData);
              if (publishResult.success && publishResult.data) {
                result = publishResult.data;
                synced++;
              } else {
                result = {
                  listingId: listing.id,
                  portal,
                  status: 'error',
                  syncedAt: new Date(),
                  error: {
                    code: 'PUBLISH_FAILED',
                    message: publishResult.error?.message || 'Publish failed',
                    retryable: true,
                  },
                };
                failed++;
              }
            }

            // Update status for this portal
            currentStatus[portal] = result;

          } catch (error) {
            failed++;
            currentStatus[portal] = {
              listingId: listing.id,
              portal,
              status: 'error',
              syncedAt: new Date(),
              error: {
                code: 'SYNC_EXCEPTION',
                message: error instanceof Error ? error.message : 'Unknown error',
                retryable: true,
              },
            };

            logger.error({
              jobId: job.id,
              listingId: listing.id,
              portal,
              error: error instanceof Error ? error.message : 'Unknown',
            }, 'Syndication sync error');
          }
        }

        // Update listing with all portal statuses
        await prisma.listing.update({
          where: { id: listing.id },
          data: { syndicationStatus: currentStatus as object },
        });
      }

      // Store stats in Redis for monitoring
      if (redisClient) {
        const statsKey = 'syndication:sync:stats';
        await redisClient.hset(statsKey, {
          lastRun: new Date().toISOString(),
          processed: String(processed),
          synced: String(synced),
          failed: String(failed),
          skipped: String(skipped),
          duration: String(Date.now() - startTime),
        });
        await redisClient.expire(statsKey, 86400); // 24h TTL
      }

      logger.info({
        jobId: job.id,
        duration: Date.now() - startTime,
        processed,
        synced,
        failed,
        skipped,
      }, 'Syndication sync completed');

    } catch (error) {
      logger.error({ jobId: job.id, error }, 'Syndication sync failed');
      throw error;
    }
  }

  /**
   * Get sync stats (for admin dashboard).
   */
  static async getStats(): Promise<{
    lastRun: string | null;
    processed: number;
    synced: number;
    failed: number;
    skipped: number;
    duration: number;
  } | null> {
    if (!redisClient) return null;

    const stats = await redisClient.hgetall('syndication:sync:stats');
    if (!stats.lastRun) return null;

    return {
      lastRun: stats.lastRun,
      processed: parseInt(stats.processed || '0', 10),
      synced: parseInt(stats.synced || '0', 10),
      failed: parseInt(stats.failed || '0', 10),
      skipped: parseInt(stats.skipped || '0', 10),
      duration: parseInt(stats.duration || '0', 10),
    };
  }
}
