/**
 * Tour Delivery Service
 *
 * Orchestrates tour access with:
 * - Market + plan gating
 * - Signed URL generation
 * - Usage metering
 *
 * IMPORTANT: PLY files are never exposed directly.
 * Only SOG files are served via signed URLs.
 */

import { createGatingService, type GatingService } from './gating';
import { createMeteringService, type MeteringService } from './metering';
import type {
  StorageProvider,
  TourAccessRequest,
  TourAccessResult,
  GatingConfig,
} from './types';
import { DEFAULT_SIGNED_URL_TTL, TourAccessRequestSchema } from './types';

export interface TourDeliveryServiceOptions {
  /** Storage provider for PLY files (source of truth) */
  plyStorage: StorageProvider;
  /** Storage provider for SOG files (distribution) */
  sogStorage: StorageProvider;
  /** Gating service for access control */
  gatingService?: GatingService;
  /** Metering service for usage tracking */
  meteringService?: MeteringService;
  /** Signed URL TTL in seconds */
  signedUrlTtl?: number;
  /** Whether metering is enabled */
  enableMetering?: boolean;
}

export class TourDeliveryService {
  private plyStorage: StorageProvider;
  private sogStorage: StorageProvider;
  private gatingService: GatingService;
  private meteringService: MeteringService;
  private signedUrlTtl: number;
  private enableMetering: boolean;

  constructor(options: TourDeliveryServiceOptions) {
    this.plyStorage = options.plyStorage;
    this.sogStorage = options.sogStorage;
    this.gatingService = options.gatingService ?? createGatingService();
    this.meteringService = options.meteringService ?? createMeteringService();
    this.signedUrlTtl = options.signedUrlTtl ?? DEFAULT_SIGNED_URL_TTL;
    this.enableMetering = options.enableMetering ?? true;
  }

  /**
   * Request access to a tour
   *
   * This method:
   * 1. Validates the request
   * 2. Checks gating (market + plan)
   * 3. Verifies the asset exists
   * 4. Generates a signed URL for the SOG file
   * 5. Starts a metering session
   */
  async requestAccess(request: TourAccessRequest): Promise<TourAccessResult> {
    // Validate request
    const validated = TourAccessRequestSchema.parse(request);

    // Check gating
    const gatingResult = await this.gatingService.checkAccess(validated);
    if (!gatingResult.allowed) {
      return {
        granted: false,
        denialReason: gatingResult.reason,
      };
    }

    // Build SOG key from tour asset ID
    const sogKey = this.getSogKey(validated.tourAssetId, validated.market);

    // Check if SOG file exists
    const sogExists = await this.sogStorage.exists(sogKey);
    if (!sogExists) {
      return {
        granted: false,
        denialReason: 'asset_not_ready',
      };
    }

    // Generate signed URL
    const signedUrl = await this.sogStorage.getSignedReadUrl({
      key: sogKey,
      expiresIn: this.signedUrlTtl,
      contentDisposition: 'inline',
    });

    // Start metering session
    let sessionId = validated.sessionId;
    if (this.enableMetering && !sessionId) {
      const session = this.meteringService.startSession(
        validated.tourAssetId,
        validated.userId,
        validated.market,
        validated.plan
      );
      sessionId = session.id;
    }

    return {
      granted: true,
      sogUrl: signedUrl.url,
      expiresAt: signedUrl.expiresAt,
      sessionId,
    };
  }

  /**
   * Record view progress
   */
  recordProgress(sessionId: string, viewPercentage: number): void {
    if (this.enableMetering) {
      this.meteringService.recordProgress(sessionId, viewPercentage);
    }
  }

  /**
   * Complete a view session
   */
  completeSession(sessionId: string): void {
    if (this.enableMetering) {
      this.meteringService.completeSession(sessionId);
    }
  }

  /**
   * Record a view error
   */
  recordError(sessionId: string, error: Error): void {
    if (this.enableMetering) {
      this.meteringService.recordError(sessionId, error);
    }
  }

  /**
   * Get the SOG key for a tour asset
   *
   * Format: tours/{market}/{tourAssetId}/output.sog
   */
  private getSogKey(tourAssetId: string, market: string): string {
    return `tours/${market}/${tourAssetId}/output.sog`;
  }

  /**
   * Check if a market has 3DGS tours enabled
   */
  async isMarketEnabled(market: string): Promise<boolean> {
    return this.gatingService.isMarketEnabled(market);
  }

  /**
   * Check if a plan can access 3DGS tours
   */
  async isPlanEligible(plan: string): Promise<boolean> {
    return this.gatingService.isPlanEligible(plan);
  }

  /**
   * Get gating configuration
   */
  getGatingConfig(): GatingConfig {
    return this.gatingService.getConfig();
  }

  /**
   * Update gating configuration
   */
  updateGatingConfig(config: Partial<GatingConfig>): void {
    this.gatingService.updateConfig(config);
  }

  /**
   * Get storage providers (for internal use)
   *
   * NOTE: PLY storage should NEVER be exposed to clients.
   * This method is for internal operations only.
   */
  getStorageProviders(): {
    ply: StorageProvider;
    sog: StorageProvider;
  } {
    return {
      ply: this.plyStorage,
      sog: this.sogStorage,
    };
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

let tourDeliveryServiceInstance: TourDeliveryService | null = null;

/**
 * Get or create the tour delivery service singleton
 */
export function getTourDeliveryService(
  options?: TourDeliveryServiceOptions
): TourDeliveryService {
  if (!tourDeliveryServiceInstance && options) {
    tourDeliveryServiceInstance = new TourDeliveryService(options);
  }
  if (!tourDeliveryServiceInstance) {
    throw new Error('TourDeliveryService not initialized. Call with options first.');
  }
  return tourDeliveryServiceInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetTourDeliveryService(): void {
  tourDeliveryServiceInstance = null;
}
