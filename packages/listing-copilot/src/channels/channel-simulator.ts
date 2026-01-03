/**
 * Channel Simulator
 *
 * Simulates posting to external real estate channels without actually posting.
 * Used for dry-run mode (enabled by default).
 */

import type {
  ListingDraft,
  OptimizedListingCopy,
  GeneratedArtifacts,
  ChannelTarget,
  ChannelPayload,
  ChannelSimulationResult,
  ChannelPostResult,
} from '../types';

// ============================================================================
// Types
// ============================================================================

export interface ChannelSimulatorDeps {
  /**
   * Syndication service for actual posting (when not in dry-run mode)
   */
  syndicationService?: {
    syndicate: (params: {
      listingId: string;
      channels: ChannelTarget[];
      payload: Record<string, unknown>;
    }) => Promise<Array<{ channel: ChannelTarget; success: boolean; externalId?: string; error?: string }>>;
  };
}

export interface ListingWithArtifacts {
  listingId: string;
  listingDraft: ListingDraft;
  optimizedCopy: OptimizedListingCopy;
  artifacts?: GeneratedArtifacts;
  marketId: string;
}

// ============================================================================
// Channel Payload Builders
// ============================================================================

type ChannelPayloadBuilder = (listing: ListingWithArtifacts) => Record<string, unknown>;

const zillowPayloadBuilder: ChannelPayloadBuilder = (listing) => ({
  source: 'realriches',
  listingType: 'rental',
  propertyType: listing.listingDraft.propertyType,
  address: listing.listingDraft.address,
  price: listing.listingDraft.monthlyRent,
  bedrooms: listing.listingDraft.bedrooms,
  bathrooms: listing.listingDraft.bathrooms,
  squareFootage: listing.listingDraft.squareFeet,
  description: listing.optimizedCopy.description,
  title: listing.optimizedCopy.title,
  amenities: listing.listingDraft.amenities,
  images: listing.listingDraft.images,
  listingKey: listing.listingId,
});

const streetEasyPayloadBuilder: ChannelPayloadBuilder = (listing) => ({
  source: 'realriches',
  listing_type: 'rental',
  property_type: listing.listingDraft.propertyType,
  address: {
    street_address: listing.listingDraft.address.street,
    unit: listing.listingDraft.address.unit,
    city: listing.listingDraft.address.city,
    state: listing.listingDraft.address.state,
    zip: listing.listingDraft.address.zipCode,
  },
  monthly_rent: listing.listingDraft.monthlyRent,
  bedrooms: listing.listingDraft.bedrooms,
  bathrooms: listing.listingDraft.bathrooms,
  square_feet: listing.listingDraft.squareFeet,
  description: listing.optimizedCopy.description,
  headline: listing.optimizedCopy.title,
  features: listing.listingDraft.amenities,
  photos: listing.listingDraft.images,
  broker_fee: listing.listingDraft.hasBrokerFee ? listing.listingDraft.brokerFeeAmount : null,
  broker_fee_paid_by: listing.listingDraft.brokerFeePaidBy,
  external_id: listing.listingId,
});

const mlsResoPayloadBuilder: ChannelPayloadBuilder = (listing) => ({
  ListingKey: listing.listingId,
  StandardStatus: 'Active',
  PropertyType: listing.listingDraft.propertyType.toUpperCase(),
  PropertySubType: 'Apartment',
  UnparsedAddress: `${listing.listingDraft.address.street}, ${listing.listingDraft.address.city}, ${listing.listingDraft.address.state} ${listing.listingDraft.address.zipCode}`,
  City: listing.listingDraft.address.city,
  StateOrProvince: listing.listingDraft.address.state,
  PostalCode: listing.listingDraft.address.zipCode,
  ListPrice: listing.listingDraft.monthlyRent,
  BedroomsTotal: listing.listingDraft.bedrooms,
  BathroomsTotalInteger: Math.floor(listing.listingDraft.bathrooms),
  LivingArea: listing.listingDraft.squareFeet,
  PublicRemarks: listing.optimizedCopy.description,
  ListingRemarks: listing.optimizedCopy.title,
  PhotosCount: listing.listingDraft.images.length,
});

const defaultPayloadBuilder: ChannelPayloadBuilder = (listing) => ({
  listingId: listing.listingId,
  title: listing.optimizedCopy.title,
  description: listing.optimizedCopy.description,
  address: listing.listingDraft.address,
  price: listing.listingDraft.monthlyRent,
  bedrooms: listing.listingDraft.bedrooms,
  bathrooms: listing.listingDraft.bathrooms,
  squareFeet: listing.listingDraft.squareFeet,
  amenities: listing.listingDraft.amenities,
  images: listing.listingDraft.images,
});

const payloadBuilders: Record<ChannelTarget, ChannelPayloadBuilder> = {
  zillow: zillowPayloadBuilder,
  streeteasy: streetEasyPayloadBuilder,
  mls_reso: mlsResoPayloadBuilder,
  apartments_com: defaultPayloadBuilder,
  realtor_com: defaultPayloadBuilder,
  trulia: defaultPayloadBuilder,
};

// ============================================================================
// Channel Validators
// ============================================================================

type ChannelValidator = (payload: Record<string, unknown>) => string[];

const validateZillow: ChannelValidator = (payload) => {
  const errors: string[] = [];
  if (!payload['listingType']) errors.push('Missing listingType');
  if (!payload['address']) errors.push('Missing address');
  if (!payload['price'] || (payload['price'] as number) <= 0) errors.push('Invalid price');
  if (!payload['listingKey']) errors.push('Missing listingKey');
  return errors;
};

const validateStreetEasy: ChannelValidator = (payload) => {
  const errors: string[] = [];
  if (!payload['listing_type']) errors.push('Missing listing_type');
  if (!payload['address']) errors.push('Missing address');
  if (!payload['monthly_rent'] || (payload['monthly_rent'] as number) <= 0) errors.push('Invalid monthly_rent');
  if (!payload['external_id']) errors.push('Missing external_id');
  // StreetEasy is NYC-specific
  const address = payload['address'] as { state?: string } | undefined;
  if (address?.state && address.state !== 'NY') {
    errors.push('StreetEasy only accepts NY listings');
  }
  return errors;
};

const validateMlsReso: ChannelValidator = (payload) => {
  const errors: string[] = [];
  if (!payload['ListingKey']) errors.push('Missing ListingKey');
  if (!payload['StandardStatus']) errors.push('Missing StandardStatus');
  if (!payload['PropertyType']) errors.push('Missing PropertyType');
  if (!payload['ListPrice'] || (payload['ListPrice'] as number) <= 0) errors.push('Invalid ListPrice');
  return errors;
};

const validateDefault: ChannelValidator = (payload) => {
  const errors: string[] = [];
  if (!payload['listingId']) errors.push('Missing listingId');
  if (!payload['title']) errors.push('Missing title');
  if (!payload['price'] || (payload['price'] as number) <= 0) errors.push('Invalid price');
  return errors;
};

const validators: Record<ChannelTarget, ChannelValidator> = {
  zillow: validateZillow,
  streeteasy: validateStreetEasy,
  mls_reso: validateMlsReso,
  apartments_com: validateDefault,
  realtor_com: validateDefault,
  trulia: validateDefault,
};

// ============================================================================
// Channel Simulator Class
// ============================================================================

export class ChannelSimulator {
  private deps: ChannelSimulatorDeps;

  constructor(deps: ChannelSimulatorDeps = {}) {
    this.deps = deps;
  }

  /**
   * Simulate posting to channels (dry-run mode).
   * Returns what would be posted without actually posting.
   */
  simulate(
    listing: ListingWithArtifacts,
    channels: ChannelTarget[]
  ): ChannelSimulationResult[] {
    const results: ChannelSimulationResult[] = [];
    const timestamp = new Date();

    for (const channel of channels) {
      const payload = this.buildPayload(listing, channel);
      results.push({
        channel,
        wouldPost: payload.isValid,
        simulatedPayload: payload,
        timestamp,
      });
    }

    return results;
  }

  /**
   * Actually publish to channels (when dry-run is disabled).
   */
  async publish(
    listing: ListingWithArtifacts,
    channels: ChannelTarget[]
  ): Promise<ChannelPostResult[]> {
    if (!this.deps.syndicationService) {
      throw new Error('Syndication service not configured - cannot publish');
    }

    // Build payloads for all channels
    const payloads: Record<string, Record<string, unknown>> = {};
    for (const channel of channels) {
      const payload = this.buildPayload(listing, channel);
      if (!payload.isValid) {
        throw new Error(
          `Invalid payload for ${channel}: ${payload.validationErrors?.join(', ')}`
        );
      }
      payloads[channel] = payload.payload;
    }

    // Call syndication service
    const results = await this.deps.syndicationService.syndicate({
      listingId: listing.listingId,
      channels,
      payload: payloads,
    });

    return results.map((r) => ({
      channel: r.channel,
      success: r.success,
      externalId: r.externalId,
      error: r.error,
      timestamp: new Date(),
    }));
  }

  /**
   * Build and validate payload for a specific channel.
   */
  buildPayload(listing: ListingWithArtifacts, channel: ChannelTarget): ChannelPayload {
    const builder = payloadBuilders[channel] ?? defaultPayloadBuilder;
    const validator = validators[channel] ?? validateDefault;

    const payload = builder(listing);
    const validationErrors = validator(payload);

    return {
      channel,
      payload,
      isValid: validationErrors.length === 0,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    };
  }

  /**
   * Get available channels for a market.
   */
  getAvailableChannels(marketId: string): ChannelTarget[] {
    // All markets get basic channels
    const channels: ChannelTarget[] = ['zillow', 'apartments_com', 'realtor_com', 'trulia'];

    // NYC gets StreetEasy
    if (marketId.toLowerCase().includes('nyc') || marketId.toLowerCase().includes('new_york')) {
      channels.push('streeteasy');
    }

    // MLS is available everywhere
    channels.push('mls_reso');

    return channels;
  }
}
