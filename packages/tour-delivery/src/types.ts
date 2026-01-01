import { z } from 'zod';

// =============================================================================
// Storage Provider Types
// =============================================================================

export interface StorageProviderConfig {
  /** Provider name for logging */
  name: string;
  /** AWS region or R2 account ID */
  region: string;
  /** Bucket name */
  bucket: string;
  /** Access key ID */
  accessKeyId: string;
  /** Secret access key */
  secretAccessKey: string;
  /** Custom endpoint (for R2) */
  endpoint?: string;
}

export interface SignedUrlOptions {
  /** Key/path in the bucket */
  key: string;
  /** TTL in seconds (default: 3600 = 1 hour) */
  expiresIn?: number;
  /** Content type for uploads */
  contentType?: string;
  /** Content disposition for downloads */
  contentDisposition?: string;
}

export interface SignedUrlResult {
  /** The signed URL */
  url: string;
  /** Expiration timestamp */
  expiresAt: Date;
  /** The bucket key */
  key: string;
}

export interface StorageProvider {
  /** Provider name */
  readonly name: string;

  /** Generate a signed URL for reading */
  getSignedReadUrl(options: SignedUrlOptions): Promise<SignedUrlResult>;

  /** Generate a signed URL for writing */
  getSignedWriteUrl(options: SignedUrlOptions): Promise<SignedUrlResult>;

  /** Check if an object exists */
  exists(key: string): Promise<boolean>;

  /** Delete an object */
  delete(key: string): Promise<void>;

  /** Get object metadata */
  getMetadata(key: string): Promise<{ size: number; lastModified: Date } | null>;
}

// =============================================================================
// Tour Delivery Types
// =============================================================================

export const TourAccessRequestSchema = z.object({
  tourAssetId: z.string().uuid(),
  userId: z.string().uuid(),
  market: z.string(),
  plan: z.string().optional().default('free'),
  sessionId: z.string().optional(),
});

export type TourAccessRequest = z.infer<typeof TourAccessRequestSchema>;

export interface TourAccessResult {
  /** Whether access was granted */
  granted: boolean;
  /** Denial reason if not granted */
  denialReason?: 'market_not_enabled' | 'plan_not_eligible' | 'asset_not_found' | 'asset_not_ready';
  /** Signed URL for the SOG file (if granted) */
  sogUrl?: string;
  /** URL expiration (if granted) */
  expiresAt?: Date;
  /** Session ID for metering */
  sessionId?: string;
}

export interface TourViewSession {
  id: string;
  tourAssetId: string;
  userId: string;
  market: string;
  plan: string;
  startedAt: Date;
  lastActivityAt: Date;
  completedAt?: Date;
  durationMs: number;
  viewPercentage: number;
}

// =============================================================================
// Usage Metering Types
// =============================================================================

export type MeteringEventType = 'view_start' | 'view_progress' | 'view_complete' | 'view_error';

export interface MeteringEvent {
  type: MeteringEventType;
  sessionId: string;
  tourAssetId: string;
  userId: string;
  market: string;
  timestamp: Date;
  metadata?: {
    durationMs?: number;
    viewPercentage?: number;
    errorCode?: string;
    errorMessage?: string;
  };
}

export interface MeteringHooks {
  /** Called when a tour view starts */
  onViewStart(session: TourViewSession): Promise<void>;

  /** Called periodically during viewing */
  onViewProgress(session: TourViewSession): Promise<void>;

  /** Called when a tour view completes */
  onViewComplete(session: TourViewSession): Promise<void>;

  /** Called on view error */
  onViewError(session: TourViewSession, error: Error): Promise<void>;
}

// =============================================================================
// Gating Types
// =============================================================================

export interface GatingConfig {
  /** Markets where 3DGS tours are enabled */
  enabledMarkets: string[];
  /** Plans that can access 3DGS tours */
  eligiblePlans: string[];
  /** Whether to use feature flags for dynamic gating */
  useFeatureFlags: boolean;
}

export const DEFAULT_GATING_CONFIG: GatingConfig = {
  enabledMarkets: [], // Deny by default
  eligiblePlans: ['pro', 'enterprise'],
  useFeatureFlags: true,
};

// =============================================================================
// Service Configuration
// =============================================================================

export interface TourDeliveryConfig {
  /** S3 config for PLY retention */
  plyStorage: StorageProviderConfig;
  /** R2 config for SOG distribution */
  sogStorage: StorageProviderConfig;
  /** Gating configuration */
  gating: GatingConfig;
  /** Signed URL TTL in seconds */
  signedUrlTtl: number;
  /** Whether to enable metering */
  enableMetering: boolean;
}

export const DEFAULT_SIGNED_URL_TTL = 3600; // 1 hour
