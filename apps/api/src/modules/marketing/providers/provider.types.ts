/**
 * Marketing Provider Types
 *
 * Interfaces for marketing service providers:
 * - Asset generation (flyers, brochures, etc.)
 * - Video generation (AI cinematic tours)
 * - 3DGS generation (Gaussian Splatting virtual tours)
 */

// =============================================================================
// Result Pattern
// =============================================================================

export interface ProviderResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  meta?: {
    provider: string;
    requestId: string;
    isMock: boolean;
    timestamp: Date;
  };
}

// =============================================================================
// Asset Generation Types
// =============================================================================

export type AssetType = 'flyer' | 'brochure' | 'social_post' | 'email' | 'video' | 'deck';

export interface AssetTemplate {
  id: string;
  name: string;
  type: AssetType;
  thumbnailUrl: string;
  htmlTemplate: string;
  cssStyles: string;
  variables: string[];
}

export interface AssetGenerationRequest {
  type: AssetType;
  templateId?: string;
  listingData: {
    id: string;
    title: string;
    description: string;
    price: number;
    address: string;
    bedrooms: number;
    bathrooms: number;
    squareFeet?: number;
    images: string[];
    features: string[];
    propertyType: string;
  };
  customizations?: Record<string, unknown>;
  outputFormat: 'pdf' | 'png' | 'jpg';
}

export interface GeneratedAsset {
  id: string;
  type: AssetType;
  fileUrl: string;
  thumbnailUrl: string;
  fileSize: number;
  mimeType: string;
  generatedAt: Date;
}

// =============================================================================
// Video Generation Types
// =============================================================================

export type VideoStyle = 'cinematic' | 'modern' | 'luxury' | 'cozy' | 'minimal';

export interface VideoGenerationRequest {
  propertyId: string;
  style: VideoStyle;
  duration: number; // seconds (30, 60, 90)
  sourceImages: string[];
  sourceVideos?: string[];
  musicTrack?: string;
  voiceoverScript?: string;
  includeBranding: boolean;
}

export interface VideoGenerationJob {
  id: string;
  status: 'queued' | 'processing' | 'rendering' | 'completed' | 'failed';
  progress: number; // 0-100
  estimatedCompletionTime?: Date;
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  resolution?: string;
  errorMessage?: string;
}

// =============================================================================
// 3DGS Generation Types
// =============================================================================

export interface ThreeDGSGenerationRequest {
  propertyId: string;
  sourceImages: string[];
  quality: 'standard' | 'high' | 'ultra';
  includeFloorPlan: boolean;
  hotspots?: Array<{
    position: { x: number; y: number; z: number };
    label: string;
    description?: string;
  }>;
}

export interface ThreeDGSGenerationJob {
  id: string;
  status: 'uploading' | 'processing' | 'training' | 'optimizing' | 'completed' | 'failed';
  progress: number;
  estimatedCompletionTime?: Date;
  tourUrl?: string;
  embedCode?: string;
  pointCount?: number;
  fileSize?: number;
  errorMessage?: string;
}

// =============================================================================
// Provider Interfaces
// =============================================================================

export interface IAssetGenerationProvider {
  providerId: string;

  /**
   * Get available templates for asset generation
   */
  getTemplates(type?: AssetType): Promise<ProviderResult<AssetTemplate[]>>;

  /**
   * Generate a marketing asset from template + listing data
   */
  generateAsset(request: AssetGenerationRequest): Promise<ProviderResult<GeneratedAsset>>;

  /**
   * Check generation status (for async operations)
   */
  getGenerationStatus(jobId: string): Promise<ProviderResult<{ status: string; url?: string }>>;
}

export interface IVideoGenerationProvider {
  providerId: string;

  /**
   * Get available music tracks
   */
  getMusicTracks(): Promise<ProviderResult<Array<{ id: string; name: string; duration: number; mood: string }>>>;

  /**
   * Start video generation job
   */
  startGeneration(request: VideoGenerationRequest): Promise<ProviderResult<VideoGenerationJob>>;

  /**
   * Poll job status
   */
  getJobStatus(jobId: string): Promise<ProviderResult<VideoGenerationJob>>;

  /**
   * Cancel a running job
   */
  cancelJob(jobId: string): Promise<ProviderResult<{ cancelled: boolean }>>;
}

export interface IThreeDGSProvider {
  providerId: string;

  /**
   * Validate source images meet requirements
   */
  validateImages(imageUrls: string[]): Promise<ProviderResult<{
    valid: boolean;
    issues: string[];
    coverage: number; // estimated scene coverage percentage
  }>>;

  /**
   * Start 3DGS generation
   */
  startGeneration(request: ThreeDGSGenerationRequest): Promise<ProviderResult<ThreeDGSGenerationJob>>;

  /**
   * Poll job status
   */
  getJobStatus(jobId: string): Promise<ProviderResult<ThreeDGSGenerationJob>>;

  /**
   * Get embed code for completed tour
   */
  getEmbedCode(tourId: string, options?: { width?: number; height?: number }): Promise<ProviderResult<string>>;
}

// =============================================================================
// Service Response Types
// =============================================================================

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  meta?: Record<string, unknown>;
}
