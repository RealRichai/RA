/**
 * Syndication Provider Types
 *
 * Defines contracts for all syndication provider integrations:
 * - Zillow Group (Zillow, Trulia, HotPads)
 * - StreetEasy
 * - MLS RESO Web API
 * - Facebook Marketplace
 */

import { z } from 'zod';

// =============================================================================
// Common Types (reused from commerce pattern)
// =============================================================================

export interface ProviderMeta {
  provider: string;
  isMock: boolean;
  requestId: string;
  timestamp: Date;
}

export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
  meta?: ProviderMeta;
}

export function ok<T>(data: T, meta?: ProviderMeta): Result<T> {
  return { success: true, data, meta };
}

export function err<E>(error: E, meta?: ProviderMeta): Result<never, E> {
  return { success: false, error, meta };
}

// =============================================================================
// Syndication Portal Types
// =============================================================================

export const SyndicationPortalSchema = z.enum([
  'zillow',
  'trulia',
  'realtor',
  'apartments',
  'streeteasy',
  'hotpads',
  'rentals',
  'facebook',
  'mls_reso',
]);
export type SyndicationPortal = z.infer<typeof SyndicationPortalSchema>;

export const SyndicationStatusSchema = z.enum([
  'pending',    // Queued for syndication
  'syncing',    // Currently being pushed
  'active',     // Successfully published
  'error',      // Failed to syndicate
  'disabled',   // Manually disabled
  'expired',    // Portal listing expired
  'removed',    // Removed from portal
]);
export type SyndicationStatus = z.infer<typeof SyndicationStatusSchema>;

// Valid state transitions
export const SYNDICATION_TRANSITIONS: Record<SyndicationStatus, SyndicationStatus[]> = {
  pending: ['syncing', 'disabled'],
  syncing: ['active', 'error', 'pending'], // pending = retry
  active: ['syncing', 'expired', 'removed', 'disabled'],
  error: ['pending', 'syncing', 'disabled'],
  disabled: ['pending'],
  expired: ['pending', 'removed', 'disabled'],
  removed: ['pending', 'disabled'],
};

// =============================================================================
// Syndication Request/Response Types
// =============================================================================

export interface SyndicationListingData {
  listingId: string;
  externalListingId?: string; // Portal's ID for updates

  // Core listing data
  title: string;
  description: string;
  propertyType: string;
  listingType: 'rental' | 'sale';

  // Address
  address: {
    street1: string;
    street2?: string;
    city: string;
    state: string;
    postalCode: string;
    latitude?: number;
    longitude?: number;
  };

  // Pricing
  price: number;
  priceUnit: 'monthly' | 'annual' | 'total';
  securityDeposit?: number;

  // Details
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number;
  floor?: number;

  // Dates
  availableDate: Date;
  publishedAt: Date;

  // Media
  images: Array<{
    url: string;
    caption?: string;
    isPrimary: boolean;
    order: number;
  }>;
  virtualTourUrl?: string;
  videoUrl?: string;

  // Features
  amenities: string[];
  petsAllowed: boolean;
  petPolicy?: Record<string, unknown>;
  includedUtilities: string[];

  // Contact
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  companyName?: string;

  // Requirements
  requirements?: {
    minCreditScore?: number;
    minIncome?: number;
    incomeMultiplier?: number;
  };

  // Metadata for portal-specific fields
  metadata?: Record<string, unknown>;
}

export interface SyndicationError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface SyndicationResult {
  listingId: string;
  portal: SyndicationPortal;
  status: SyndicationStatus;
  externalListingId?: string;  // Portal's listing ID
  externalUrl?: string;        // URL on portal
  syncedAt: Date;
  expiresAt?: Date;            // When listing expires on portal
  error?: SyndicationError;
}

export interface SyndicationWebhookEvent {
  portal: SyndicationPortal;
  eventType: 'status_change' | 'listing_expired' | 'listing_removed' | 'error' | 'analytics';
  externalListingId: string;
  listingId?: string; // Our internal ID (if mapped)
  status?: SyndicationStatus;
  timestamp: Date;
  data?: Record<string, unknown>;
}

// =============================================================================
// Provider Interface
// =============================================================================

export interface ISyndicationProvider {
  readonly providerId: SyndicationPortal;
  readonly feedFormat: 'api' | 'xml_feed' | 'reso_webapi';

  // Push listing to portal
  publishListing(listing: SyndicationListingData): Promise<Result<SyndicationResult>>;

  // Update existing listing on portal
  updateListing(listing: SyndicationListingData): Promise<Result<SyndicationResult>>;

  // Remove listing from portal
  removeListing(listingId: string, externalListingId: string): Promise<Result<{ removed: boolean }>>;

  // Get current status from portal
  getListingStatus(externalListingId: string): Promise<Result<SyndicationResult | null>>;

  // Batch operations (for feeds)
  batchPublish?(listings: SyndicationListingData[]): Promise<Result<SyndicationResult[]>>;

  // Webhook processing
  processWebhook?(payload: string, signature: string): Promise<{
    valid: boolean;
    event?: SyndicationWebhookEvent;
  }>;

  // Health check
  healthCheck?(): Promise<{ healthy: boolean; latencyMs?: number }>;
}

// =============================================================================
// Rate Limiting Configuration
// =============================================================================

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  burstLimit: number;
  retryAfterMs: number;
}

export const PORTAL_RATE_LIMITS: Record<SyndicationPortal, RateLimitConfig> = {
  zillow: { requestsPerMinute: 60, requestsPerHour: 1000, burstLimit: 10, retryAfterMs: 60000 },
  trulia: { requestsPerMinute: 60, requestsPerHour: 1000, burstLimit: 10, retryAfterMs: 60000 },
  realtor: { requestsPerMinute: 30, requestsPerHour: 500, burstLimit: 5, retryAfterMs: 120000 },
  apartments: { requestsPerMinute: 100, requestsPerHour: 2000, burstLimit: 20, retryAfterMs: 30000 },
  streeteasy: { requestsPerMinute: 30, requestsPerHour: 500, burstLimit: 5, retryAfterMs: 120000 },
  hotpads: { requestsPerMinute: 60, requestsPerHour: 1000, burstLimit: 10, retryAfterMs: 60000 },
  rentals: { requestsPerMinute: 60, requestsPerHour: 1000, burstLimit: 10, retryAfterMs: 60000 },
  facebook: { requestsPerMinute: 20, requestsPerHour: 200, burstLimit: 3, retryAfterMs: 180000 },
  mls_reso: { requestsPerMinute: 100, requestsPerHour: 5000, burstLimit: 20, retryAfterMs: 30000 },
};

// =============================================================================
// State Store Types (for ID mapping)
// =============================================================================

export interface ListingStateRecord {
  internalId: string;
  externalId: string;
  portal: SyndicationPortal;
  status: SyndicationStatus;
  externalUrl?: string;
  lastSyncedAt: Date;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Service Response Types
// =============================================================================

export interface SyndicationServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  meta?: {
    provider: string;
    isMock: boolean;
    requestId: string;
  };
}
