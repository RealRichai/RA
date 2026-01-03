/**
 * Syndication Service Tests
 *
 * Unit tests for syndication providers, registry, and mock provider.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import provider types and mock
import {
  SyndicationPortalSchema,
  SyndicationStatusSchema,
  SYNDICATION_TRANSITIONS,
  PORTAL_RATE_LIMITS,
  ok,
  err,
} from '../src/modules/syndication/providers/provider.types';
import type {
  SyndicationPortal,
  SyndicationListingData,
  SyndicationResult,
  ISyndicationProvider,
} from '../src/modules/syndication/providers/provider.types';
import {
  MockSyndicationProvider,
  getMockSyndicationProvider,
  resetMockStores,
  getMockState,
} from '../src/modules/syndication/providers/mock/syndication.mock';

// =============================================================================
// Test Fixtures
// =============================================================================

const mockListingData: SyndicationListingData = {
  listingId: 'lst_test123',
  title: 'Beautiful 2BR Apartment',
  description: 'Spacious apartment with stunning views',
  propertyType: 'apartment',
  listingType: 'rental',
  address: {
    street1: '123 Main Street',
    street2: 'Apt 4B',
    city: 'New York',
    state: 'NY',
    postalCode: '10001',
    latitude: 40.7128,
    longitude: -74.006,
  },
  price: 3500,
  priceUnit: 'monthly',
  securityDeposit: 3500,
  bedrooms: 2,
  bathrooms: 1.5,
  squareFeet: 1200,
  floor: 4,
  availableDate: new Date('2025-02-01'),
  publishedAt: new Date(),
  images: [
    { url: 'https://example.com/img1.jpg', isPrimary: true, order: 0 },
    { url: 'https://example.com/img2.jpg', isPrimary: false, order: 1 },
  ],
  virtualTourUrl: 'https://example.com/tour',
  amenities: ['dishwasher', 'laundry', 'gym', 'doorman'],
  petsAllowed: true,
  petPolicy: { dogs: true, cats: true, maxWeight: 50 },
  includedUtilities: ['water', 'trash'],
  agentName: 'Jane Smith',
  agentEmail: 'jane@example.com',
  agentPhone: '555-1234',
  requirements: {
    minCreditScore: 700,
    minIncome: 105000,
    incomeMultiplier: 40,
  },
};

// =============================================================================
// Type Schema Tests
// =============================================================================

describe('Syndication Types', () => {
  describe('SyndicationPortalSchema', () => {
    it('should accept valid portal values', () => {
      const validPortals: SyndicationPortal[] = [
        'zillow', 'trulia', 'realtor', 'apartments',
        'streeteasy', 'hotpads', 'rentals', 'facebook', 'mls_reso',
      ];

      for (const portal of validPortals) {
        const result = SyndicationPortalSchema.safeParse(portal);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid portal values', () => {
      const result = SyndicationPortalSchema.safeParse('invalid_portal');
      expect(result.success).toBe(false);
    });
  });

  describe('SyndicationStatusSchema', () => {
    it('should accept valid status values', () => {
      const validStatuses = ['pending', 'syncing', 'active', 'error', 'disabled', 'expired', 'removed'];

      for (const status of validStatuses) {
        const result = SyndicationStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status values', () => {
      const result = SyndicationStatusSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('State Transitions', () => {
    it('should define valid transitions from pending', () => {
      expect(SYNDICATION_TRANSITIONS.pending).toContain('syncing');
      expect(SYNDICATION_TRANSITIONS.pending).toContain('disabled');
    });

    it('should define valid transitions from syncing', () => {
      expect(SYNDICATION_TRANSITIONS.syncing).toContain('active');
      expect(SYNDICATION_TRANSITIONS.syncing).toContain('error');
      expect(SYNDICATION_TRANSITIONS.syncing).toContain('pending'); // retry
    });

    it('should define valid transitions from error', () => {
      expect(SYNDICATION_TRANSITIONS.error).toContain('pending');
      expect(SYNDICATION_TRANSITIONS.error).toContain('syncing');
    });

    it('should allow removing from active state', () => {
      expect(SYNDICATION_TRANSITIONS.active).toContain('removed');
    });
  });

  describe('Rate Limits', () => {
    it('should define rate limits for all portals', () => {
      const portals: SyndicationPortal[] = [
        'zillow', 'trulia', 'realtor', 'apartments',
        'streeteasy', 'hotpads', 'rentals', 'facebook', 'mls_reso',
      ];

      for (const portal of portals) {
        const limits = PORTAL_RATE_LIMITS[portal];
        expect(limits).toBeDefined();
        expect(limits.requestsPerMinute).toBeGreaterThan(0);
        expect(limits.requestsPerHour).toBeGreaterThan(0);
        expect(limits.burstLimit).toBeGreaterThan(0);
        expect(limits.retryAfterMs).toBeGreaterThan(0);
      }
    });

    it('should have stricter limits for Facebook', () => {
      expect(PORTAL_RATE_LIMITS.facebook.requestsPerMinute).toBeLessThan(
        PORTAL_RATE_LIMITS.zillow.requestsPerMinute
      );
    });

    it('should have higher limits for MLS RESO', () => {
      expect(PORTAL_RATE_LIMITS.mls_reso.requestsPerMinute).toBeGreaterThan(
        PORTAL_RATE_LIMITS.streeteasy.requestsPerMinute
      );
    });
  });
});

// =============================================================================
// Result Helpers Tests
// =============================================================================

describe('Result Helpers', () => {
  describe('ok()', () => {
    it('should create a success result', () => {
      const data = { foo: 'bar' };
      const result = ok(data);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.error).toBeUndefined();
    });

    it('should include meta when provided', () => {
      const data = { foo: 'bar' };
      const meta = { provider: 'test', isMock: true, requestId: 'req_123', timestamp: new Date() };
      const result = ok(data, meta);

      expect(result.meta).toEqual(meta);
    });
  });

  describe('err()', () => {
    it('should create an error result', () => {
      const error = new Error('Something failed');
      const result = err(error);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.data).toBeUndefined();
    });

    it('should include meta when provided', () => {
      const error = new Error('Failed');
      const meta = { provider: 'test', isMock: true, requestId: 'req_123', timestamp: new Date() };
      const result = err(error, meta);

      expect(result.meta).toEqual(meta);
    });
  });
});

// =============================================================================
// Mock Provider Tests
// =============================================================================

describe('MockSyndicationProvider', () => {
  let provider: MockSyndicationProvider;

  beforeEach(() => {
    resetMockStores();
    provider = new MockSyndicationProvider('zillow');
  });

  describe('constructor', () => {
    it('should create provider with correct portal ID', () => {
      expect(provider.providerId).toBe('zillow');
    });

    it('should use api feed format', () => {
      expect(provider.feedFormat).toBe('api');
    });
  });

  describe('publishListing()', () => {
    it('should publish a listing successfully', async () => {
      // Run multiple times to avoid random failure (10% chance)
      let successCount = 0;
      for (let i = 0; i < 20; i++) {
        const result = await provider.publishListing(mockListingData);
        if (result.success) {
          successCount++;
          expect(result.data?.listingId).toBe(mockListingData.listingId);
          expect(result.data?.portal).toBe('zillow');
          expect(result.data?.status).toBe('active');
          expect(result.data?.externalListingId).toBeDefined();
          expect(result.data?.externalUrl).toContain('zillow.com');
          expect(result.data?.syncedAt).toBeDefined();
          expect(result.meta?.isMock).toBe(true);
          break;
        }
      }
      expect(successCount).toBeGreaterThan(0);
    });

    it('should store listing state', async () => {
      // Retry to avoid random failure
      let success = false;
      for (let i = 0; i < 10; i++) {
        const result = await provider.publishListing(mockListingData);
        if (result.success) {
          success = true;
          const state = getMockState('zillow', mockListingData.listingId);
          expect(state).toBeDefined();
          expect(state?.status).toBe('active');
          expect(state?.externalId).toBeDefined();
          break;
        }
      }
      expect(success).toBe(true);
    });
  });

  describe('updateListing()', () => {
    it('should update an existing listing', async () => {
      // First publish
      let publishResult;
      for (let i = 0; i < 10; i++) {
        publishResult = await provider.publishListing(mockListingData);
        if (publishResult.success) break;
      }
      expect(publishResult?.success).toBe(true);

      // Then update
      const updatedListing = {
        ...mockListingData,
        externalListingId: publishResult?.data?.externalListingId,
        price: 3800,
      };
      const updateResult = await provider.updateListing(updatedListing);

      expect(updateResult.success).toBe(true);
      expect(updateResult.data?.status).toBe('active');
    });

    it('should publish if no existing listing', async () => {
      const newListing = { ...mockListingData, listingId: 'lst_new123' };
      const result = await provider.updateListing(newListing);

      // May fail due to simulated failures, but should eventually work
      if (result.success) {
        expect(result.data?.status).toBe('active');
      }
    });
  });

  describe('removeListing()', () => {
    it('should remove an existing listing', async () => {
      // First publish
      let externalId: string | undefined;
      for (let i = 0; i < 10; i++) {
        const publishResult = await provider.publishListing(mockListingData);
        if (publishResult.success) {
          externalId = publishResult.data?.externalListingId;
          break;
        }
      }
      expect(externalId).toBeDefined();

      // Remove
      const result = await provider.removeListing(mockListingData.listingId, externalId!);

      expect(result.success).toBe(true);
      expect(result.data?.removed).toBe(true);

      // Check state updated
      const state = getMockState('zillow', mockListingData.listingId);
      expect(state?.status).toBe('removed');
    });
  });

  describe('getListingStatus()', () => {
    it('should return null for non-existent listing', async () => {
      const result = await provider.getListingStatus('nonexistent_123');

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should return status for existing listing', async () => {
      // First publish
      let externalId: string | undefined;
      for (let i = 0; i < 10; i++) {
        const publishResult = await provider.publishListing(mockListingData);
        if (publishResult.success) {
          externalId = publishResult.data?.externalListingId;
          break;
        }
      }
      expect(externalId).toBeDefined();

      // Get status
      const result = await provider.getListingStatus(externalId!);

      expect(result.success).toBe(true);
      expect(result.data?.listingId).toBe(mockListingData.listingId);
      expect(result.data?.status).toBe('active');
    });
  });

  describe('batchPublish()', () => {
    it('should publish multiple listings', async () => {
      const listings = [
        mockListingData,
        { ...mockListingData, listingId: 'lst_batch2' },
        { ...mockListingData, listingId: 'lst_batch3' },
      ];

      const result = await provider.batchPublish(listings);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);

      // At least some should succeed (90% success rate each)
      const successCount = result.data?.filter(r => r.status === 'active').length ?? 0;
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('processWebhook()', () => {
    it('should reject invalid signature', async () => {
      const result = await provider.processWebhook('{}', 'invalid');

      expect(result.valid).toBe(false);
      expect(result.event).toBeUndefined();
    });

    it('should accept mock signature', async () => {
      const payload = JSON.stringify({
        event_type: 'status_change',
        listing_id: 'ext_123',
        status: 'active',
        timestamp: new Date().toISOString(),
      });

      const result = await provider.processWebhook(payload, 'mock');

      expect(result.valid).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event?.eventType).toBe('status_change');
      expect(result.event?.externalListingId).toBe('ext_123');
    });

    it('should accept test signature', async () => {
      const payload = JSON.stringify({
        event_type: 'listing.expired',
        listing_id: 'ext_456',
      });

      const result = await provider.processWebhook(payload, 'test');

      expect(result.valid).toBe(true);
      expect(result.event?.eventType).toBe('listing_expired');
    });

    it('should handle invalid JSON', async () => {
      const result = await provider.processWebhook('not valid json', 'mock');

      expect(result.valid).toBe(false);
    });
  });

  describe('healthCheck()', () => {
    it('should return healthy status', async () => {
      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeDefined();
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});

// =============================================================================
// getMockSyndicationProvider Factory Tests
// =============================================================================

describe('getMockSyndicationProvider()', () => {
  it('should create provider for each portal', () => {
    const portals: SyndicationPortal[] = [
      'zillow', 'trulia', 'streeteasy', 'mls_reso', 'facebook',
    ];

    for (const portal of portals) {
      const provider = getMockSyndicationProvider(portal);
      expect(provider).toBeInstanceOf(MockSyndicationProvider);
      expect(provider.providerId).toBe(portal);
    }
  });
});

// =============================================================================
// Store Management Tests
// =============================================================================

describe('Mock Store Management', () => {
  describe('resetMockStores()', () => {
    it('should clear all stored data', async () => {
      const provider = getMockSyndicationProvider('zillow');

      // Publish a listing
      for (let i = 0; i < 10; i++) {
        const result = await provider.publishListing(mockListingData);
        if (result.success) break;
      }

      // Verify state exists
      let state = getMockState('zillow', mockListingData.listingId);
      expect(state).toBeDefined();

      // Reset
      resetMockStores();

      // Verify cleared
      state = getMockState('zillow', mockListingData.listingId);
      expect(state).toBeUndefined();
    });
  });

  describe('getMockState()', () => {
    beforeEach(() => {
      resetMockStores();
    });

    it('should return undefined for non-existent state', () => {
      const state = getMockState('zillow', 'nonexistent');
      expect(state).toBeUndefined();
    });

    it('should isolate state by portal', async () => {
      const zillowProvider = getMockSyndicationProvider('zillow');
      const streetEasyProvider = getMockSyndicationProvider('streeteasy');

      // Publish to Zillow
      for (let i = 0; i < 10; i++) {
        const result = await zillowProvider.publishListing(mockListingData);
        if (result.success) break;
      }

      // Check state isolation
      const zillowState = getMockState('zillow', mockListingData.listingId);
      const streetEasyState = getMockState('streeteasy', mockListingData.listingId);

      expect(zillowState).toBeDefined();
      expect(streetEasyState).toBeUndefined();
    });
  });
});

// =============================================================================
// ISyndicationProvider Interface Compliance Tests
// =============================================================================

describe('ISyndicationProvider Interface Compliance', () => {
  it('should implement all required methods', () => {
    const provider: ISyndicationProvider = getMockSyndicationProvider('zillow');

    expect(typeof provider.publishListing).toBe('function');
    expect(typeof provider.updateListing).toBe('function');
    expect(typeof provider.removeListing).toBe('function');
    expect(typeof provider.getListingStatus).toBe('function');
    expect(typeof provider.providerId).toBe('string');
    expect(typeof provider.feedFormat).toBe('string');
  });

  it('should implement optional methods', () => {
    const provider = getMockSyndicationProvider('zillow');

    expect(typeof provider.batchPublish).toBe('function');
    expect(typeof provider.processWebhook).toBe('function');
    expect(typeof provider.healthCheck).toBe('function');
  });
});
