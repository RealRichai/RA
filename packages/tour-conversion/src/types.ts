import { z } from 'zod';

// =============================================================================
// Conversion Job Types
// =============================================================================

export const ConversionJobDataSchema = z.object({
  tourAssetId: z.string().uuid(),
  plyS3Key: z.string(),
  market: z.string(),
  iterations: z.number().int().positive().default(30000),
  qualityThreshold: z.number().min(0).max(1).default(0.85),
});

export type ConversionJobData = z.infer<typeof ConversionJobDataSchema>;

export interface ConversionResult {
  success: boolean;
  sogS3Key?: string;
  sogChecksum?: string;
  sogSizeBytes?: number;
  plyChecksum: string;
  plySizeBytes: number;
  converterVersion: string;
  iterations: number;
  conversionTimeMs: number;
  qaReport?: QAReport;
  error?: ConversionError;
  /** Provenance metadata for audit trail */
  provenance?: ConversionProvenance;
}

export interface ConversionProvenance {
  /** QA mode used (mock or real) */
  qaMode: QAMode;
  /** Binary invocation method (local or npx) */
  binaryMode: 'local' | 'npx';
  /** Path to binary used */
  binaryPath?: string;
  /** Environment info */
  environment: string;
  /** Timestamp of conversion start */
  startedAt: Date;
  /** Timestamp of conversion completion */
  completedAt: Date;
}

export interface ConversionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

// =============================================================================
// QA Types
// =============================================================================

/**
 * QA Mode indicates whether QA was performed with real rendering or mock
 * - 'mock': Deterministic mock rendering (fast, CI-safe)
 * - 'real': Actual GPU rendering (staging/production only)
 */
export type QAMode = 'mock' | 'real';

export interface QAReport {
  passed: boolean;
  score: number;
  frameScores: FrameScore[];
  metrics: QAMetrics;
  generatedAt: Date;
  duration: number;
  /** QA mode used for this report */
  mode: QAMode;
  /** Renderer info when mode is 'real' */
  rendererInfo?: string;
}

export interface FrameScore {
  frameIndex: number;
  cameraPosition: CameraPosition;
  ssimScore: number;
  pHashDistance: number;
  passed: boolean;
}

export interface CameraPosition {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
}

export interface QAMetrics {
  averageSSIM: number;
  minSSIM: number;
  maxSSIM: number;
  averagePHashDistance: number;
  framesRendered: number;
  framesPassed: number;
  renderTimeMs: number;
}

// =============================================================================
// CLI Types
// =============================================================================

export interface SplatTransformOptions {
  inputPath: string;
  outputPath: string;
  iterations: number;
  format: 'sog' | 'ply';
  verbose?: boolean;
}

export interface SplatTransformResult {
  success: boolean;
  outputPath: string;
  stderr: string;
  stdout: string;
  exitCode: number;
  durationMs: number;
}

// =============================================================================
// Worker Configuration
// =============================================================================

export interface WorkerConfig {
  redisUrl: string;
  queueName: string;
  concurrency: number;
  maxRetries: number;
  backoffDelay: number;
  workDir: string;
  s3Bucket: string;
  s3Region: string;
}

export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  redisUrl: process.env['REDIS_URL'] || 'redis://localhost:6379',
  queueName: 'tour-conversion',
  concurrency: 2,
  maxRetries: 3,
  backoffDelay: 5000,
  workDir: '/tmp/tour-conversion',
  s3Bucket: process.env['TOUR_S3_BUCKET'] || 'realriches-tours',
  s3Region: process.env['AWS_REGION'] || 'us-east-1',
};

// =============================================================================
// Constants
// =============================================================================

export const CANONICAL_CAMERA_PATH: CameraPosition[] = [
  { x: 0, y: 0, z: 5, pitch: 0, yaw: 0 },
  { x: 3, y: 0, z: 4, pitch: 0, yaw: 45 },
  { x: 5, y: 0, z: 0, pitch: 0, yaw: 90 },
  { x: 3, y: 0, z: -4, pitch: 0, yaw: 135 },
  { x: 0, y: 0, z: -5, pitch: 0, yaw: 180 },
  { x: -3, y: 0, z: -4, pitch: 0, yaw: 225 },
  { x: -5, y: 0, z: 0, pitch: 0, yaw: 270 },
  { x: -3, y: 0, z: 4, pitch: 0, yaw: 315 },
  { x: 0, y: 2, z: 5, pitch: -15, yaw: 0 },
  { x: 0, y: -2, z: 5, pitch: 15, yaw: 0 },
];

export const QA_THRESHOLDS = {
  MIN_SSIM: 0.85,
  MAX_PHASH_DISTANCE: 10,
  MIN_FRAMES_PASSED_RATIO: 0.8,
};

// =============================================================================
// Backpressure Configuration (RR-ENG-UPDATE-2026-002)
// =============================================================================

/**
 * Configuration for queue backpressure control.
 * Prevents queue overflow and enables graceful degradation under load.
 */
export interface BackpressureConfig {
  /** Maximum pending jobs before rejecting new submissions (default: 100) */
  maxPendingJobs: number;
  /** Number of consecutive failures before circuit breaker opens (default: 5) */
  circuitBreakerThreshold: number;
  /** Time in ms to wait before trying again after circuit opens (default: 60000) */
  circuitBreakerResetMs: number;
  /** Whether backpressure is enabled (default: true) */
  enabled: boolean;
}

export const DEFAULT_BACKPRESSURE_CONFIG: BackpressureConfig = {
  maxPendingJobs: 100,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000,
  enabled: true,
};

/**
 * Backpressure status for monitoring
 */
export interface BackpressureStatus {
  /** Current circuit breaker state */
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  /** Current queue depth (waiting + active) */
  queueDepth: number;
  /** Maximum allowed pending jobs */
  maxPendingJobs: number;
  /** Utilization percentage (0-100) */
  utilizationPercent: number;
  /** Whether new jobs are being accepted */
  acceptingJobs: boolean;
  /** Reason for rejection if not accepting */
  rejectionReason?: 'queue_full' | 'circuit_open';
}

/**
 * Error thrown when queue is at capacity
 */
export class BackpressureError extends Error {
  constructor(
    message: string,
    public readonly reason: 'queue_full' | 'circuit_open',
    public readonly status: BackpressureStatus
  ) {
    super(message);
    this.name = 'BackpressureError';
  }
}
