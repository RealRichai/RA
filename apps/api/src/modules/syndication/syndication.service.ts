/**
 * Syndication Service
 *
 * Orchestrates listing syndication to external portals.
 * Handles rate limiting, locking, status persistence, and webhooks.
 */

import { prisma } from '@realriches/database';
import { generatePrefixedId, logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';

import { getSyndicationProvider, getSyndicationProviderRegistry } from './providers';
import type {
  SyndicationListingData,
  SyndicationPortal,
  SyndicationResult,
  SyndicationServiceResponse,
  SyndicationWebhookEvent,
  PORTAL_RATE_LIMITS,
} from './providers/provider.types';

// =============================================================================
// Constants
// =============================================================================

const RATE_LIMIT_PREFIX = 'syndication:ratelimit:';
const SYNC_LOCK_PREFIX = 'syndication:lock:';
const LOCK_TTL = 300; // 5 minutes

// =============================================================================
// Service Implementation
// =============================================================================

export class SyndicationService {
  private redis: Redis;

  constructor(private app: FastifyInstance) {
    this.redis = app.redis;
  }

  // ===========================================================================
  // Rate Limiting
  // ===========================================================================

  private async checkRateLimit(portal: SyndicationPortal): Promise<boolean> {
    const minuteKey = `${RATE_LIMIT_PREFIX}${portal}:${Math.floor(Date.now() / 60000)}`;
    const count = await this.redis.incr(minuteKey);

    if (count === 1) {
      await this.redis.expire(minuteKey, 120); // 2 minute TTL
    }

    const limits: Record<SyndicationPortal, number> = {
      zillow: 60, trulia: 60, hotpads: 60,
      streeteasy: 30, mls_reso: 100,
      realtor: 30, apartments: 100, rentals: 60, facebook: 20,
    };

    return count <= (limits[portal] || 60);
  }

  // ===========================================================================
  // Locking for Idempotency
  // ===========================================================================

  private async acquireLock(listingId: string, portal: SyndicationPortal): Promise<boolean> {
    const key = `${SYNC_LOCK_PREFIX}${listingId}:${portal}`;
    const result = await this.redis.set(key, Date.now().toString(), 'EX', LOCK_TTL, 'NX');
    return result === 'OK';
  }

  private async releaseLock(listingId: string, portal: SyndicationPortal): Promise<void> {
    const key = `${SYNC_LOCK_PREFIX}${listingId}:${portal}`;
    await this.redis.del(key);
  }

  // ===========================================================================
  // Core Syndication Operations
  // ===========================================================================

  async syndicateListing(
    request: FastifyRequest,
    listingId: string,
    portals: SyndicationPortal[]
  ): Promise<SyndicationServiceResponse<Record<SyndicationPortal, SyndicationResult>>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    // Fetch listing with all required data
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        unit: { include: { property: true } },
        media: { orderBy: { order: 'asc' } },
        agent: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
    });

    if (!listing) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Listing not found' } };
    }

    // Verify ownership
    if (
      listing.unit.property.ownerId !== request.user.id &&
      listing.agentId !== request.user.id &&
      request.user.role !== 'admin'
    ) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    // Verify listing is published
    if (!listing.isPublished || listing.status !== 'active') {
      return {
        success: false,
        error: { code: 'NOT_PUBLISHED', message: 'Listing must be published before syndication' },
      };
    }

    // Transform to syndication data
    const syndicationData = this.transformListing(listing);
    const results: Record<string, SyndicationResult> = {};

    // Syndicate to each portal
    for (const portal of portals) {
      // Check rate limit
      if (!(await this.checkRateLimit(portal))) {
        results[portal] = {
          listingId,
          portal,
          status: 'error',
          syncedAt: new Date(),
          error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded', retryable: true },
        };
        continue;
      }

      // Acquire lock for idempotency
      if (!(await this.acquireLock(listingId, portal))) {
        results[portal] = {
          listingId,
          portal,
          status: 'syncing',
          syncedAt: new Date(),
          error: { code: 'SYNC_IN_PROGRESS', message: 'Syndication already in progress', retryable: true },
        };
        continue;
      }

      try {
        const provider = getSyndicationProvider(portal);
        const existingStatus = await this.getExistingSyndicationStatus(listingId, portal);

        let result: SyndicationResult;
        if (existingStatus?.externalListingId) {
          // Update existing
          syndicationData.externalListingId = existingStatus.externalListingId;
          const updateResult = await provider.updateListing(syndicationData);
          if (updateResult.success && updateResult.data) {
            result = updateResult.data;
          } else {
            result = {
              listingId,
              portal,
              status: 'error',
              syncedAt: new Date(),
              error: {
                code: 'UPDATE_FAILED',
                message: updateResult.error?.message || 'Update failed',
                retryable: true,
              },
            };
          }
        } else {
          // New publish
          const publishResult = await provider.publishListing(syndicationData);
          if (publishResult.success && publishResult.data) {
            result = publishResult.data;
          } else {
            result = {
              listingId,
              portal,
              status: 'error',
              syncedAt: new Date(),
              error: {
                code: 'PUBLISH_FAILED',
                message: publishResult.error?.message || 'Publish failed',
                retryable: true,
              },
            };
          }
        }

        results[portal] = result;

        // Persist status to database
        await this.persistSyndicationStatus(listingId, portal, result);

      } finally {
        await this.releaseLock(listingId, portal);
      }
    }

    // Update syndicateTo array
    await this.updateSyndicateToArray(listingId, portals);

    // Audit log
    await this.audit(request, 'listing_syndicated', 'listing', listingId, {
      portals,
      results: Object.fromEntries(
        Object.entries(results).map(([p, r]) => [p, { status: r.status, externalId: r.externalListingId }])
      ),
    });

    return {
      success: true,
      data: results as Record<SyndicationPortal, SyndicationResult>,
      meta: { provider: 'syndication-service', isMock: false, requestId: generatePrefixedId('req') },
    };
  }

  async removeSyndication(
    request: FastifyRequest,
    listingId: string,
    portals: SyndicationPortal[]
  ): Promise<SyndicationServiceResponse<Record<SyndicationPortal, { removed: boolean }>>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    // Verify listing exists and user has access
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: { unit: { include: { property: true } } },
    });

    if (!listing) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Listing not found' } };
    }

    if (
      listing.unit.property.ownerId !== request.user.id &&
      listing.agentId !== request.user.id &&
      request.user.role !== 'admin'
    ) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    const results: Record<string, { removed: boolean }> = {};

    for (const portal of portals) {
      const existingStatus = await this.getExistingSyndicationStatus(listingId, portal);

      if (!existingStatus?.externalListingId) {
        results[portal] = { removed: true }; // Nothing to remove
        continue;
      }

      try {
        const provider = getSyndicationProvider(portal);
        const removeResult = await provider.removeListing(listingId, existingStatus.externalListingId);

        results[portal] = removeResult.success ? { removed: true } : { removed: false };

        if (removeResult.success) {
          await this.persistSyndicationStatus(listingId, portal, {
            listingId,
            portal,
            status: 'removed',
            externalListingId: existingStatus.externalListingId,
            syncedAt: new Date(),
          });
        }
      } catch (error) {
        results[portal] = { removed: false };
        logger.error({
          msg: 'syndication_remove_failed',
          listingId,
          portal,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Update syndicateTo array (remove portals)
    await this.removeSyndicateToPortals(listingId, portals);

    await this.audit(request, 'listing_unsyndicated', 'listing', listingId, { portals, results });

    return { success: true, data: results as Record<SyndicationPortal, { removed: boolean }> };
  }

  async getSyndicationStatus(
    listingId: string
  ): Promise<SyndicationServiceResponse<Record<SyndicationPortal, SyndicationResult | null>>> {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { syndicateTo: true, syndicationStatus: true },
    });

    if (!listing) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Listing not found' } };
    }

    const status = (listing.syndicationStatus as unknown as Record<string, SyndicationResult>) || {};
    const results: Record<string, SyndicationResult | null> = {};

    for (const portal of listing.syndicateTo) {
      results[portal] = status[portal] || null;
    }

    return { success: true, data: results as Record<SyndicationPortal, SyndicationResult | null> };
  }

  // ===========================================================================
  // Webhook Processing
  // ===========================================================================

  async processWebhook(
    portal: SyndicationPortal,
    payload: string,
    signature: string
  ): Promise<{ valid: boolean; event?: SyndicationWebhookEvent }> {
    const provider = getSyndicationProvider(portal);

    if (!provider.processWebhook) {
      logger.warn({ msg: 'webhook_not_supported', portal });
      return { valid: false };
    }

    const result = await provider.processWebhook(payload, signature);

    if (result.valid && result.event && result.event.listingId) {
      // Update status in database
      await this.persistSyndicationStatus(result.event.listingId, portal, {
        listingId: result.event.listingId,
        portal,
        status: result.event.status || 'active',
        externalListingId: result.event.externalListingId,
        syncedAt: result.event.timestamp,
      });

      logger.info({
        msg: 'syndication_webhook_processed',
        portal,
        eventType: result.event.eventType,
        listingId: result.event.listingId,
      });
    }

    return result;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private transformListing(listing: {
    id: string;
    title: string;
    description: string;
    propertyType: string;
    type: string;
    street1: string;
    street2: string | null;
    city: string;
    state: string;
    postalCode: string;
    priceAmount: number;
    rent: number | null;
    securityDepositAmount: number | null;
    bedrooms: number;
    bathrooms: number;
    squareFeet: number | null;
    floor: number | null;
    availableDate: Date;
    publishedAt: Date | null;
    amenities: string[];
    petsAllowed: boolean;
    petPolicy: unknown;
    includedUtilities: string[];
    metadata: unknown;
    unit: { property: { latitude: number | null; longitude: number | null } } | null;
    media: Array<{ url: string; caption: string | null; isPrimary: boolean; order: number }>;
    agent: { firstName: string; lastName: string; email: string; phone: string | null } | null;
    requirements: unknown;
  }): SyndicationListingData {
    return {
      listingId: listing.id,
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
      requirements: listing.requirements as SyndicationListingData['requirements'],
    };
  }

  private async getExistingSyndicationStatus(
    listingId: string,
    portal: SyndicationPortal
  ): Promise<SyndicationResult | null> {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { syndicationStatus: true },
    });

    const status = (listing?.syndicationStatus as unknown as Record<string, SyndicationResult>) || {};
    return status[portal] || null;
  }

  private async persistSyndicationStatus(
    listingId: string,
    portal: SyndicationPortal,
    result: SyndicationResult
  ): Promise<void> {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { syndicationStatus: true },
    });

    const currentStatus = (listing?.syndicationStatus as unknown as Record<string, unknown>) || {};
    currentStatus[portal] = result;

    await prisma.listing.update({
      where: { id: listingId },
      data: { syndicationStatus: currentStatus as object },
    });
  }

  private async updateSyndicateToArray(listingId: string, portals: SyndicationPortal[]): Promise<void> {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { syndicateTo: true },
    });

    const currentPortals = new Set(listing?.syndicateTo || []);
    for (const portal of portals) {
      currentPortals.add(portal);
    }

    await prisma.listing.update({
      where: { id: listingId },
      data: { syndicateTo: Array.from(currentPortals) },
    });
  }

  private async removeSyndicateToPortals(listingId: string, portals: SyndicationPortal[]): Promise<void> {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { syndicateTo: true },
    });

    const currentPortals = new Set(listing?.syndicateTo || []);
    for (const portal of portals) {
      currentPortals.delete(portal);
    }

    await prisma.listing.update({
      where: { id: listingId },
      data: { syndicateTo: Array.from(currentPortals) },
    });
  }

  // ===========================================================================
  // Provider Status
  // ===========================================================================

  getProviderStatus(): Record<SyndicationPortal, { provider: string; isMock: boolean; reason?: string }> {
    return getSyndicationProviderRegistry().getProviderStatus();
  }

  // ===========================================================================
  // Audit Logging
  // ===========================================================================

  private async audit(
    request: FastifyRequest,
    action: string,
    entityType: string,
    entityId: string,
    changes?: Record<string, unknown>
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: request.user?.id || null,
          action: `syndication.${action}`,
          entityType,
          entityId,
          changes: (changes || {}) as object,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] || null,
        },
      });
    } catch (error) {
      logger.error({
        msg: 'audit_log_failed',
        action,
        entityType,
        entityId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }
}
