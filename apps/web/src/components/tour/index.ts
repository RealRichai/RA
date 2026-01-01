/**
 * Tour Components
 *
 * Exports for 3DGS tour viewing functionality.
 */

export { SplatViewer } from './SplatViewer';
export { useFeatureDetection, getQualitySettings } from './useFeatureDetection';
export { useAnalytics, useFpsTracker } from './useAnalytics';
export type {
  SplatViewerProps,
  SplatViewerState,
  GraphicsDeviceType,
  PerformanceMetrics,
  EngagementMetrics,
  AnalyticsEvent,
} from './types';
