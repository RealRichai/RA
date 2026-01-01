/**
 * SplatViewer Types
 */

export type GraphicsDeviceType = 'webgpu' | 'webgl2' | 'unsupported';

export interface SplatViewerProps {
  /** URL to the SOG file */
  sogUrl: string;
  /** Tour asset ID for analytics */
  tourAssetId: string;
  /** Session ID for metering */
  sessionId?: string;
  /** Optional className for the container */
  className?: string;
  /** Called when the viewer is ready */
  onReady?: () => void;
  /** Called on load progress (0-100) */
  onProgress?: (progress: number) => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** Called when view percentage changes */
  onViewProgress?: (percentage: number) => void;
  /** Auto-rotate the scene */
  autoRotate?: boolean;
  /** Initial camera position */
  initialPosition?: { x: number; y: number; z: number };
  /** Enable performance monitoring */
  enablePerformanceMonitoring?: boolean;
}

export interface SplatViewerState {
  /** Current graphics device type */
  deviceType: GraphicsDeviceType;
  /** Whether the viewer is loading */
  isLoading: boolean;
  /** Load progress (0-100) */
  loadProgress: number;
  /** Whether the viewer is ready */
  isReady: boolean;
  /** Current error, if any */
  error: Error | null;
  /** Current FPS */
  fps: number;
  /** Whether on mobile device */
  isMobile: boolean;
}

export interface PerformanceMetrics {
  /** Time to interactive in ms */
  tti: number;
  /** Time to first frame in ms */
  ttff: number;
  /** Average FPS over the session */
  avgFps: number;
  /** Minimum FPS recorded */
  minFps: number;
  /** Total frames rendered */
  frameCount: number;
  /** Memory usage in MB (if available) */
  memoryUsage?: number;
  /** GPU type detected */
  gpuType?: string;
}

export interface EngagementMetrics {
  /** Total view time in ms */
  viewTimeMs: number;
  /** Number of camera movements */
  cameraMovements: number;
  /** Number of zoom interactions */
  zoomInteractions: number;
  /** Number of touch interactions */
  touchInteractions: number;
  /** Percentage of scene explored (estimated) */
  explorationPercentage: number;
  /** Whether user completed viewing (stayed > 30s) */
  completed: boolean;
}

export interface AnalyticsEvent {
  type: 'tti' | 'engagement' | 'error' | 'device_info';
  tourAssetId: string;
  sessionId?: string;
  timestamp: number;
  data: PerformanceMetrics | EngagementMetrics | { error: string } | { deviceType: GraphicsDeviceType; gpuInfo?: string };
}
