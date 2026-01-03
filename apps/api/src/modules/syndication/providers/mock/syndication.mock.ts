/**
 * Mock Syndication Provider
 *
 * In-memory implementation for testing and development.
 * Used when real API keys are not configured or feature flags are disabled.
 */

import { generatePrefixedId, logger } from '@realriches/utils';

import type {
  ISyndicationProvider,
  SyndicationListingData,
  SyndicationResult,
  SyndicationWebhookEvent,
  ProviderMeta,
  Result,
  SyndicationPortal,
  ListingStateRecord,
} from '../provider.types';
import { ok, err } from '../provider.types';

// In-memory stores
const listingStore = new Map<string, SyndicationListingData>();
const stateStore = new Map<string, ListingStateRecord>();

export class MockSyndicationProvider implements ISyndicationProvider {
  readonly providerId: SyndicationPortal;
  readonly feedFormat = 'api' as const;

  constructor(portal: SyndicationPortal) {
    this.providerId = portal;
  }

  private getMeta(requestId?: string): ProviderMeta {
    return {
      provider: this.providerId,
      isMock: true,
      requestId: requestId || generatePrefixedId('req'),
      timestamp: new Date(),
    };
  }

  private getStateKey(listingId: string): string {
    return `${this.providerId}:${listingId}`;
  }

  async publishListing(listing: SyndicationListingData): Promise<Result<SyndicationResult>> {
    const requestId = generatePrefixedId('req');

    // Simulate network delay
    await this.simulateDelay();

    // Simulate occasional failures (10% chance)
    if (Math.random() < 0.1) {
      logger.debug({
        msg: 'mock_syndication_simulated_failure',
        portal: this.providerId,
        listingId: listing.listingId,
      });

      return err(
        new Error('Simulated syndication failure'),
        this.getMeta(requestId)
      );
    }

    // Generate external ID
    const externalId = `${this.providerId}_${generatePrefixedId('ext')}`;
    const externalUrl = `https://${this.providerId}.com/listing/${externalId}`;

    // Store listing
    listingStore.set(listing.listingId, listing);

    // Store state
    const state: ListingStateRecord = {
      internalId: listing.listingId,
      externalId,
      portal: this.providerId,
      status: 'active',
      externalUrl,
      lastSyncedAt: new Date(),
    };
    stateStore.set(this.getStateKey(listing.listingId), state);

    const result: SyndicationResult = {
      listingId: listing.listingId,
      portal: this.providerId,
      status: 'active',
      externalListingId: externalId,
      externalUrl,
      syncedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };

    logger.info({
      msg: 'mock_syndication_published',
      portal: this.providerId,
      listingId: listing.listingId,
      externalId,
    });

    return ok(result, this.getMeta(requestId));
  }

  async updateListing(listing: SyndicationListingData): Promise<Result<SyndicationResult>> {
    const requestId = generatePrefixedId('req');
    const stateKey = this.getStateKey(listing.listingId);
    const existingState = stateStore.get(stateKey);

    // If no existing state, publish instead
    if (!existingState && !listing.externalListingId) {
      return this.publishListing(listing);
    }

    await this.simulateDelay();

    // Update listing store
    listingStore.set(listing.listingId, listing);

    // Update state
    const externalId = listing.externalListingId || existingState?.externalId || generatePrefixedId('ext');
    const state: ListingStateRecord = {
      internalId: listing.listingId,
      externalId,
      portal: this.providerId,
      status: 'active',
      externalUrl: existingState?.externalUrl || `https://${this.providerId}.com/listing/${externalId}`,
      lastSyncedAt: new Date(),
    };
    stateStore.set(stateKey, state);

    const result: SyndicationResult = {
      listingId: listing.listingId,
      portal: this.providerId,
      status: 'active',
      externalListingId: externalId,
      externalUrl: state.externalUrl,
      syncedAt: new Date(),
    };

    logger.info({
      msg: 'mock_syndication_updated',
      portal: this.providerId,
      listingId: listing.listingId,
      externalId,
    });

    return ok(result, this.getMeta(requestId));
  }

  async removeListing(listingId: string, externalListingId: string): Promise<Result<{ removed: boolean }>> {
    const requestId = generatePrefixedId('req');

    await this.simulateDelay();

    const stateKey = this.getStateKey(listingId);
    const existingState = stateStore.get(stateKey);

    if (existingState) {
      existingState.status = 'removed';
      existingState.lastSyncedAt = new Date();
      stateStore.set(stateKey, existingState);
    }

    logger.info({
      msg: 'mock_syndication_removed',
      portal: this.providerId,
      listingId,
      externalId: externalListingId,
    });

    return ok({ removed: true }, this.getMeta(requestId));
  }

  async getListingStatus(externalListingId: string): Promise<Result<SyndicationResult | null>> {
    const requestId = generatePrefixedId('req');

    await this.simulateDelay(50);

    // Find by external ID
    let foundState: ListingStateRecord | undefined;
    for (const [_, state] of stateStore.entries()) {
      if (state.externalId === externalListingId && state.portal === this.providerId) {
        foundState = state;
        break;
      }
    }

    if (!foundState) {
      return ok(null, this.getMeta(requestId));
    }

    return ok({
      listingId: foundState.internalId,
      portal: this.providerId,
      status: foundState.status,
      externalListingId: foundState.externalId,
      externalUrl: foundState.externalUrl,
      syncedAt: foundState.lastSyncedAt,
    }, this.getMeta(requestId));
  }

  async batchPublish(listings: SyndicationListingData[]): Promise<Result<SyndicationResult[]>> {
    const requestId = generatePrefixedId('req');
    const results: SyndicationResult[] = [];

    for (const listing of listings) {
      const result = await this.publishListing(listing);
      if (result.success && result.data) {
        results.push(result.data);
      } else {
        results.push({
          listingId: listing.listingId,
          portal: this.providerId,
          status: 'error',
          syncedAt: new Date(),
          error: {
            code: 'BATCH_ITEM_FAILED',
            message: result.error?.message || 'Failed to publish',
            retryable: true,
          },
        });
      }
    }

    return ok(results, this.getMeta(requestId));
  }

  async processWebhook(payload: string, signature: string): Promise<{
    valid: boolean;
    event?: SyndicationWebhookEvent;
  }> {
    // Mock always accepts webhooks with 'mock' signature
    if (signature !== 'mock' && signature !== 'test') {
      return { valid: false };
    }

    try {
      const data = JSON.parse(payload) as {
        event_type: string;
        listing_id: string;
        status?: string;
        timestamp?: string;
      };

      // Find internal listing ID
      let internalListingId: string | undefined;
      for (const [_, state] of stateStore.entries()) {
        if (state.externalId === data.listing_id && state.portal === this.providerId) {
          internalListingId = state.internalId;
          break;
        }
      }

      const event: SyndicationWebhookEvent = {
        portal: this.providerId,
        eventType: this.mapWebhookEventType(data.event_type),
        externalListingId: data.listing_id,
        listingId: internalListingId,
        status: data.status as SyndicationResult['status'] | undefined,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      };

      return { valid: true, event };
    } catch {
      return { valid: false };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs?: number }> {
    const start = Date.now();
    await this.simulateDelay(10);
    return {
      healthy: true,
      latencyMs: Date.now() - start,
    };
  }

  private async simulateDelay(ms: number = 100): Promise<void> {
    const delay = ms + Math.random() * 50;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private mapWebhookEventType(eventType: string): SyndicationWebhookEvent['eventType'] {
    switch (eventType) {
      case 'listing.status_changed':
      case 'status_change':
        return 'status_change';
      case 'listing.expired':
        return 'listing_expired';
      case 'listing.removed':
        return 'listing_removed';
      case 'listing.analytics':
        return 'analytics';
      default:
        return 'status_change';
    }
  }
}

// Factory function
export function getMockSyndicationProvider(portal: SyndicationPortal): MockSyndicationProvider {
  return new MockSyndicationProvider(portal);
}

// Helper to reset stores (for testing)
export function resetMockStores(): void {
  listingStore.clear();
  stateStore.clear();
}

// Helper to get state (for testing)
export function getMockState(portal: SyndicationPortal, listingId: string): ListingStateRecord | undefined {
  return stateStore.get(`${portal}:${listingId}`);
}
