/**
 * Channel Simulator Tests
 *
 * Tests for the ChannelSimulator dry-run mode.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelSimulator } from '../channels/channel-simulator';

describe('ChannelSimulator', () => {
  let channelSimulator: ChannelSimulator;

  const createTestListing = () => ({
    listingId: 'listing-123',
    listingDraft: {
      propertyType: 'apartment' as const,
      bedrooms: 2,
      bathrooms: 1,
      monthlyRent: 3500,
      address: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
      },
      amenities: ['Dishwasher', 'Hardwood floors'],
      images: ['https://example.com/image1.jpg'],
      hasBrokerFee: true,
      brokerFeeAmount: 3500,
      brokerFeePaidBy: 'tenant' as const,
    },
    optimizedCopy: {
      title: 'Beautiful 2BR Apartment',
      description: 'A stunning apartment in the heart of Manhattan.',
      highlights: ['Modern kitchen', 'City views'],
      seoKeywords: ['apartment', 'nyc'],
      disclosureText: 'Broker fee applies.',
      promptHash: 'abc123',
      tokensUsed: 1500,
    },
    marketId: 'nyc',
  });

  beforeEach(() => {
    channelSimulator = new ChannelSimulator();
  });

  describe('simulate', () => {
    it('should simulate posting to multiple channels', async () => {
      const listing = createTestListing();
      const results = await channelSimulator.simulate(listing, ['zillow', 'streeteasy']);

      expect(results).toHaveLength(2);
      expect(results[0].channel).toBe('zillow');
      expect(results[1].channel).toBe('streeteasy');
    });

    it('should indicate whether posting would succeed', async () => {
      const listing = createTestListing();
      const results = await channelSimulator.simulate(listing, ['zillow']);

      expect(results[0].wouldPost).toBe(true);
      expect(results[0].simulatedPayload.isValid).toBe(true);
    });

    it('should include timestamp in results', async () => {
      const listing = createTestListing();
      const results = await channelSimulator.simulate(listing, ['zillow']);

      expect(results[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('buildPayload', () => {
    it('should build Zillow-specific payload', () => {
      const listing = createTestListing();
      const payload = channelSimulator.buildPayload(listing, 'zillow');

      expect(payload.payload).toMatchObject({
        source: 'realriches',
        listingType: 'rental',
        propertyType: 'apartment',
        price: 3500,
        bedrooms: 2,
        bathrooms: 1,
        listingKey: 'listing-123',
      });
    });

    it('should build StreetEasy-specific payload', () => {
      const listing = createTestListing();
      const payload = channelSimulator.buildPayload(listing, 'streeteasy');

      expect(payload.payload).toMatchObject({
        source: 'realriches',
        listing_type: 'rental',
        property_type: 'apartment',
        monthly_rent: 3500,
        broker_fee: 3500,
        broker_fee_paid_by: 'tenant',
      });
    });

    it('should build MLS RESO-specific payload', () => {
      const listing = createTestListing();
      const payload = channelSimulator.buildPayload(listing, 'mls_reso');

      expect(payload.payload).toMatchObject({
        ListingKey: 'listing-123',
        StandardStatus: 'Active',
        PropertyType: 'APARTMENT',
        ListPrice: 3500,
        BedroomsTotal: 2,
      });
    });
  });

  describe('validation', () => {
    it('should validate Zillow payload', () => {
      const listing = createTestListing();
      const payload = channelSimulator.buildPayload(listing, 'zillow');

      expect(payload.isValid).toBe(true);
      expect(payload.validationErrors).toBeUndefined();
    });

    it('should fail StreetEasy validation for non-NY listings', () => {
      const listing = {
        ...createTestListing(),
        listingDraft: {
          ...createTestListing().listingDraft,
          address: {
            street: '123 Main St',
            city: 'Los Angeles',
            state: 'CA',
            zipCode: '90001',
          },
        },
      };

      const payload = channelSimulator.buildPayload(listing, 'streeteasy');

      expect(payload.isValid).toBe(false);
      expect(payload.validationErrors).toContain('StreetEasy only accepts NY listings');
    });

    it('should fail validation for missing required fields', () => {
      const listing = {
        ...createTestListing(),
        listingId: '',
      };

      const payload = channelSimulator.buildPayload(listing, 'zillow');

      expect(payload.isValid).toBe(false);
      expect(payload.validationErrors).toContain('Missing listingKey');
    });
  });

  describe('getAvailableChannels', () => {
    it('should include StreetEasy for NYC', () => {
      const channels = channelSimulator.getAvailableChannels('nyc');

      expect(channels).toContain('streeteasy');
      expect(channels).toContain('zillow');
      expect(channels).toContain('mls_reso');
    });

    it('should not include StreetEasy for non-NYC markets', () => {
      const channels = channelSimulator.getAvailableChannels('la');

      expect(channels).not.toContain('streeteasy');
      expect(channels).toContain('zillow');
    });

    it('should always include basic channels', () => {
      const channels = channelSimulator.getAvailableChannels('chicago');

      expect(channels).toContain('zillow');
      expect(channels).toContain('apartments_com');
      expect(channels).toContain('realtor_com');
      expect(channels).toContain('trulia');
      expect(channels).toContain('mls_reso');
    });
  });

  describe('publish', () => {
    it('should throw when syndication service is not configured', async () => {
      const listing = createTestListing();

      await expect(
        channelSimulator.publish(listing, ['zillow'])
      ).rejects.toThrow('Syndication service not configured');
    });

    it('should call syndication service when configured', async () => {
      const mockSyndicationService = {
        syndicate: vi.fn().mockResolvedValue([
          { channel: 'zillow', success: true, externalId: 'zil-123' },
        ]),
      };

      const simulatorWithService = new ChannelSimulator({
        syndicationService: mockSyndicationService,
      });

      const listing = createTestListing();
      const results = await simulatorWithService.publish(listing, ['zillow']);

      expect(mockSyndicationService.syndicate).toHaveBeenCalled();
      expect(results[0].success).toBe(true);
      expect(results[0].externalId).toBe('zil-123');
    });

    it('should throw when payload validation fails', async () => {
      const mockSyndicationService = {
        syndicate: vi.fn(),
      };

      const simulatorWithService = new ChannelSimulator({
        syndicationService: mockSyndicationService,
      });

      const invalidListing = {
        ...createTestListing(),
        listingId: '',
      };

      await expect(
        simulatorWithService.publish(invalidListing, ['zillow'])
      ).rejects.toThrow('Invalid payload');
    });
  });
});
