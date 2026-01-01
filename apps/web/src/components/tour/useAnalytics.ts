/**
 * Analytics Hooks for SplatViewer
 *
 * Tracks TTI (Time to Interactive) and engagement metrics.
 */

import { useCallback, useEffect, useRef } from 'react';

import type { AnalyticsEvent, EngagementMetrics, GraphicsDeviceType, PerformanceMetrics } from './types';

interface AnalyticsHookOptions {
  tourAssetId: string;
  sessionId?: string;
  onEvent?: (event: AnalyticsEvent) => void;
}

interface AnalyticsHook {
  /** Record when viewer becomes interactive */
  recordTTI: (metrics: PerformanceMetrics) => void;
  /** Record device info */
  recordDeviceInfo: (deviceType: GraphicsDeviceType, gpuInfo?: string) => void;
  /** Record an error */
  recordError: (error: Error) => void;
  /** Get current engagement metrics */
  getEngagementMetrics: () => EngagementMetrics;
  /** Record camera movement */
  recordCameraMovement: () => void;
  /** Record zoom interaction */
  recordZoomInteraction: () => void;
  /** Record touch interaction */
  recordTouchInteraction: () => void;
}

/**
 * Hook for tracking analytics in the SplatViewer
 */
export function useAnalytics(options: AnalyticsHookOptions): AnalyticsHook {
  const { tourAssetId, sessionId, onEvent } = options;

  const startTimeRef = useRef<number>(Date.now());
  const metricsRef = useRef({
    cameraMovements: 0,
    zoomInteractions: 0,
    touchInteractions: 0,
  });

  // Send event helper
  const sendEvent = useCallback(
    (event: Omit<AnalyticsEvent, 'timestamp' | 'tourAssetId' | 'sessionId'>) => {
      const fullEvent: AnalyticsEvent = {
        ...event,
        tourAssetId,
        sessionId,
        timestamp: Date.now(),
      };

      // Call the provided callback
      onEvent?.(fullEvent);

      // Also send to server (fire and forget)
      if (typeof fetch !== 'undefined') {
        fetch('/api/analytics/tour', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullEvent),
        }).catch(() => {
          // Silently fail - analytics should not break the viewer
        });
      }
    },
    [tourAssetId, sessionId, onEvent]
  );

  // Record TTI
  const recordTTI = useCallback(
    (metrics: PerformanceMetrics) => {
      sendEvent({
        type: 'tti',
        data: metrics,
      });
    },
    [sendEvent]
  );

  // Record device info
  const recordDeviceInfo = useCallback(
    (deviceType: GraphicsDeviceType, gpuInfo?: string) => {
      sendEvent({
        type: 'device_info',
        data: { deviceType, gpuInfo },
      });
    },
    [sendEvent]
  );

  // Record error
  const recordError = useCallback(
    (error: Error) => {
      sendEvent({
        type: 'error',
        data: { error: error.message },
      });
    },
    [sendEvent]
  );

  // Get engagement metrics
  const getEngagementMetrics = useCallback((): EngagementMetrics => {
    const viewTimeMs = Date.now() - startTimeRef.current;
    const completed = viewTimeMs > 30_000; // 30 seconds

    // Estimate exploration percentage based on interactions
    const totalInteractions =
      metricsRef.current.cameraMovements +
      metricsRef.current.zoomInteractions +
      metricsRef.current.touchInteractions;

    // Rough heuristic: 20+ interactions = 100% exploration
    const explorationPercentage = Math.min(100, (totalInteractions / 20) * 100);

    return {
      viewTimeMs,
      cameraMovements: metricsRef.current.cameraMovements,
      zoomInteractions: metricsRef.current.zoomInteractions,
      touchInteractions: metricsRef.current.touchInteractions,
      explorationPercentage,
      completed,
    };
  }, []);

  // Record camera movement
  const recordCameraMovement = useCallback(() => {
    metricsRef.current.cameraMovements++;
  }, []);

  // Record zoom interaction
  const recordZoomInteraction = useCallback(() => {
    metricsRef.current.zoomInteractions++;
  }, []);

  // Record touch interaction
  const recordTouchInteraction = useCallback(() => {
    metricsRef.current.touchInteractions++;
  }, []);

  // Send engagement metrics on unmount
  useEffect(() => {
    return () => {
      const metrics = getEngagementMetrics();
      sendEvent({
        type: 'engagement',
        data: metrics,
      });
    };
  }, [getEngagementMetrics, sendEvent]);

  return {
    recordTTI,
    recordDeviceInfo,
    recordError,
    getEngagementMetrics,
    recordCameraMovement,
    recordZoomInteraction,
    recordTouchInteraction,
  };
}

/**
 * Track FPS for performance metrics
 */
export function useFpsTracker(): {
  recordFrame: () => void;
  getMetrics: () => { avgFps: number; minFps: number; frameCount: number };
} {
  const framesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const frameCountRef = useRef<number>(0);

  const recordFrame = useCallback(() => {
    const now = performance.now();
    const delta = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;

    if (delta > 0) {
      const fps = 1000 / delta;
      framesRef.current.push(fps);
      frameCountRef.current++;

      // Keep only last 100 frames for average
      if (framesRef.current.length > 100) {
        framesRef.current.shift();
      }
    }
  }, []);

  const getMetrics = useCallback(() => {
    const frames = framesRef.current;
    if (frames.length === 0) {
      return { avgFps: 0, minFps: 0, frameCount: 0 };
    }

    const sum = frames.reduce((a, b) => a + b, 0);
    const avgFps = sum / frames.length;
    const minFps = Math.min(...frames);

    return {
      avgFps: Math.round(avgFps),
      minFps: Math.round(minFps),
      frameCount: frameCountRef.current,
    };
  }, []);

  return { recordFrame, getMetrics };
}
