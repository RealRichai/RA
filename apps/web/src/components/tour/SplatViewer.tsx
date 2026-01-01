'use client';

/**
 * SplatViewer Component
 *
 * Renders 3D Gaussian Splatting tours using PlayCanvas Engine.
 * Features:
 * - WebGPU-first with WebGL2 fallback
 * - Mobile touch controls
 * - Performance safeguards
 * - Analytics integration
 */

import * as pc from 'playcanvas';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { GraphicsDeviceType, PerformanceMetrics, SplatViewerProps, SplatViewerState } from './types';
import { useAnalytics, useFpsTracker } from './useAnalytics';
import { getQualitySettings, useFeatureDetection } from './useFeatureDetection';

// Performance safeguards
const MIN_FPS_THRESHOLD = 15;

export function SplatViewer({
  sogUrl,
  tourAssetId,
  sessionId,
  className,
  onReady,
  onProgress,
  onError,
  onViewProgress,
  autoRotate = false,
  initialPosition,
  enablePerformanceMonitoring = false,
}: SplatViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<pc.Application | null>(null);
  const loadStartTimeRef = useRef<number>(0);

  const [state, setState] = useState<SplatViewerState>({
    deviceType: 'unsupported',
    isLoading: true,
    loadProgress: 0,
    isReady: false,
    error: null,
    fps: 0,
    isMobile: false,
  });

  // Feature detection
  const { deviceType, isLoading: isDetecting, isMobile, gpuInfo } = useFeatureDetection();

  // Analytics
  const analytics = useAnalytics({
    tourAssetId,
    sessionId,
  });

  // FPS tracking
  const fpsTracker = useFpsTracker();

  // Update state when feature detection completes
  useEffect(() => {
    if (!isDetecting) {
      setState(prev => ({
        ...prev,
        deviceType,
        isMobile,
      }));
      analytics.recordDeviceInfo(deviceType, gpuInfo);
    }
  }, [isDetecting, deviceType, isMobile, gpuInfo, analytics]);

  // Initialize PlayCanvas
  const initializePlayCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || deviceType === 'unsupported') return;

    loadStartTimeRef.current = performance.now();

    try {
      // Get quality settings based on device
      const quality = getQualitySettings(deviceType, isMobile);

      // Create graphics device
      const device = await createGraphicsDevice(canvas, deviceType);

      // Create application
      const app = new pc.Application(canvas, {
        graphicsDevice: device,
        mouse: new pc.Mouse(canvas),
        touch: new pc.TouchDevice(canvas),
        keyboard: new pc.Keyboard(window),
      });

      appRef.current = app;

      // Configure canvas
      app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
      app.setCanvasResolution(pc.RESOLUTION_AUTO);

      // Apply resolution scaling for mobile
      if (quality.resolution < 1.0) {
        app.graphicsDevice.maxPixelRatio = quality.resolution;
      }

      // Start the application
      app.start();

      // Create camera
      const camera = new pc.Entity('camera');
      camera.addComponent('camera', {
        clearColor: new pc.Color(0.1, 0.1, 0.1),
        fov: 60,
      });

      // Set initial position
      if (initialPosition) {
        camera.setPosition(initialPosition.x, initialPosition.y, initialPosition.z);
      } else {
        camera.setPosition(0, 2, 5);
      }

      camera.lookAt(0, 0, 0);
      app.root.addChild(camera);

      // Add orbit controls
      addOrbitControls(app, camera, isMobile, {
        onCameraMove: analytics.recordCameraMovement,
        onZoom: analytics.recordZoomInteraction,
        onTouch: analytics.recordTouchInteraction,
      });

      // Add auto-rotate if enabled
      if (autoRotate) {
        addAutoRotate(app, camera);
      }

      // Load the GSplat asset
      await loadGSplatAsset(app, sogUrl, (progress) => {
        setState(prev => ({ ...prev, loadProgress: progress }));
        onProgress?.(progress);
      });

      // Record TTI
      const tti = performance.now() - loadStartTimeRef.current;
      const { avgFps, minFps, frameCount } = fpsTracker.getMetrics();

      const performanceMetrics: PerformanceMetrics = {
        tti,
        ttff: tti, // First frame time same as TTI for splat loading
        avgFps,
        minFps,
        frameCount,
        gpuType: gpuInfo,
      };

      analytics.recordTTI(performanceMetrics);

      // Mark as ready
      setState(prev => ({
        ...prev,
        isLoading: false,
        isReady: true,
        loadProgress: 100,
      }));

      onReady?.();

      // Set up FPS monitoring
      if (enablePerformanceMonitoring) {
        setupPerformanceMonitoring(app, (fps) => {
          setState(prev => ({ ...prev, fps }));
          fpsTracker.recordFrame();
        });
      }

      // Set up view progress tracking
      setupViewProgressTracking(camera, (percentage) => {
        onViewProgress?.(percentage);
      });

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to initialize viewer');
      setState(prev => ({
        ...prev,
        isLoading: false,
        error,
      }));
      analytics.recordError(error);
      onError?.(error);
    }
  }, [
    deviceType,
    isMobile,
    gpuInfo,
    sogUrl,
    initialPosition,
    autoRotate,
    enablePerformanceMonitoring,
    analytics,
    fpsTracker,
    onReady,
    onProgress,
    onError,
    onViewProgress,
  ]);

  // Initialize when device type is detected
  useEffect(() => {
    if (!isDetecting && deviceType !== 'unsupported') {
      void initializePlayCanvas();
    }

    return () => {
      if (appRef.current) {
        appRef.current.destroy();
        appRef.current = null;
      }
    };
  }, [isDetecting, deviceType, initializePlayCanvas]);

  // Handle unsupported device
  if (!isDetecting && deviceType === 'unsupported') {
    return (
      <div className={`flex items-center justify-center bg-gray-900 text-white p-8 ${className ?? ''}`}>
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-2">3D Tours Not Supported</h3>
          <p className="text-gray-400">
            Your browser does not support WebGPU or WebGL2.
            Please try a modern browser like Chrome, Edge, or Safari.
          </p>
        </div>
      </div>
    );
  }

  // Handle error
  if (state.error) {
    return (
      <div className={`flex items-center justify-center bg-gray-900 text-white p-8 ${className ?? ''}`}>
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-2">Failed to Load Tour</h3>
          <p className="text-gray-400">{state.error.message}</p>
          <button
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
            onClick={() => {
              setState(prev => ({ ...prev, error: null, isLoading: true }));
              void initializePlayCanvas();
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ touchAction: 'none' }}
      />

      {/* Loading overlay */}
      {state.isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
          <div className="text-center text-white">
            <div className="mb-4">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
            <p className="text-lg">Loading Tour...</p>
            <p className="text-sm text-gray-400">{state.loadProgress}%</p>
          </div>
        </div>
      )}

      {/* Performance indicator */}
      {enablePerformanceMonitoring && state.isReady && (
        <div className="absolute top-4 right-4 bg-black/50 text-white px-2 py-1 rounded text-sm">
          {state.fps} FPS | {state.deviceType.toUpperCase()}
        </div>
      )}

      {/* Mobile touch hint */}
      {state.isMobile && state.isReady && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-2 rounded text-sm animate-fade-out">
          Drag to rotate, pinch to zoom
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create graphics device with appropriate API
 */
async function createGraphicsDevice(
  canvas: HTMLCanvasElement,
  deviceType: GraphicsDeviceType
): Promise<pc.GraphicsDevice> {
  if (deviceType === 'webgpu') {
    const device = await pc.createGraphicsDevice(canvas, {
      deviceTypes: [pc.DEVICETYPE_WEBGPU],
    }) as pc.GraphicsDevice;
    return device;
  }

  // WebGL2 fallback
  const device = await pc.createGraphicsDevice(canvas, {
    deviceTypes: [pc.DEVICETYPE_WEBGL2],
  }) as pc.GraphicsDevice;
  return device;
}

/**
 * Load GSplat asset from URL
 */
async function loadGSplatAsset(
  app: pc.Application,
  url: string,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create asset
    const asset = new pc.Asset('gsplat', 'gsplat', { url });

    // Track progress
    asset.on('progress', (progress: number) => {
      onProgress(Math.round(progress * 100));
    });

    // Handle load complete
    asset.once('load', () => {
      try {
        // Create entity with gsplat component
        const entity = new pc.Entity('gsplat');
        entity.addComponent('gsplat', {
          asset: asset,
        });
        app.root.addChild(entity);
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    // Handle error
    asset.once('error', (err: string) => {
      reject(new Error(err));
    });

    // Add to registry and load
    app.assets.add(asset);
    app.assets.load(asset);
  });
}

/**
 * Add orbit controls to camera
 */
function addOrbitControls(
  app: pc.Application,
  camera: pc.Entity,
  isMobile: boolean,
  callbacks: {
    onCameraMove: () => void;
    onZoom: () => void;
    onTouch: () => void;
  }
) {
  let orbitSensitivity = 0.3;
  let distanceSensitivity = 0.5;
  let distance = camera.getPosition().length();
  let pitch = -Math.asin(camera.forward.y) * pc.math.RAD_TO_DEG;
  let yaw = Math.atan2(camera.forward.x, camera.forward.z) * pc.math.RAD_TO_DEG;

  // Increase sensitivity on mobile
  if (isMobile) {
    orbitSensitivity = 0.5;
    distanceSensitivity = 0.8;
  }

  let lastTouchDistance = 0;
  let isDragging = false;

  // Mouse controls
  if (app.mouse) {
    app.mouse.on(pc.EVENT_MOUSEDOWN, () => {
      isDragging = true;
    });

    app.mouse.on(pc.EVENT_MOUSEUP, () => {
      isDragging = false;
    });

    app.mouse.on(pc.EVENT_MOUSEMOVE, (event: pc.MouseEvent) => {
      if (isDragging) {
        yaw -= event.dx * orbitSensitivity;
        pitch -= event.dy * orbitSensitivity;
        pitch = pc.math.clamp(pitch, -90, 90);
        updateCamera();
        callbacks.onCameraMove();
      }
    });

    app.mouse.on(pc.EVENT_MOUSEWHEEL, (event: pc.MouseEvent) => {
      distance -= event.wheelDelta * distanceSensitivity;
      distance = pc.math.clamp(distance, 1, 50);
      updateCamera();
      callbacks.onZoom();
    });
  }

  // Touch controls
  let lastTouchX = 0;
  let lastTouchY = 0;

  if (app.touch) {
    app.touch.on(pc.EVENT_TOUCHSTART, (event: pc.TouchEvent) => {
      if (event.touches.length >= 1) {
        const touch = event.touches[0];
        if (touch) {
          lastTouchX = touch.x;
          lastTouchY = touch.y;
        }
      }
      if (event.touches.length === 2) {
        lastTouchDistance = getTouchDistance(event);
      }
      callbacks.onTouch();
    });

    app.touch.on(pc.EVENT_TOUCHMOVE, (event: pc.TouchEvent) => {
      if (event.touches.length === 1) {
        // Single finger - orbit
        const touch = event.touches[0];
        if (touch) {
          const dx = touch.x - lastTouchX;
          const dy = touch.y - lastTouchY;
          yaw -= dx * orbitSensitivity;
          pitch -= dy * orbitSensitivity;
          pitch = pc.math.clamp(pitch, -90, 90);
          lastTouchX = touch.x;
          lastTouchY = touch.y;
          updateCamera();
          callbacks.onCameraMove();
        }
      } else if (event.touches.length === 2) {
        // Two fingers - pinch zoom
        const touchDistance = getTouchDistance(event);
        if (lastTouchDistance > 0) {
          const pinchScale = lastTouchDistance / touchDistance;
          distance *= pinchScale;
          distance = pc.math.clamp(distance, 1, 50);
          updateCamera();
          callbacks.onZoom();
        }
        lastTouchDistance = touchDistance;
      }
    });
  }

  function getTouchDistance(event: pc.TouchEvent): number {
    const touch0 = event.touches[0];
    const touch1 = event.touches[1];
    if (!touch0 || !touch1) return 0;
    const dx = touch0.x - touch1.x;
    const dy = touch0.y - touch1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function updateCamera() {
    const y = Math.sin(pitch * pc.math.DEG_TO_RAD);
    const r = Math.cos(pitch * pc.math.DEG_TO_RAD);
    const x = Math.sin(yaw * pc.math.DEG_TO_RAD) * r;
    const z = Math.cos(yaw * pc.math.DEG_TO_RAD) * r;

    camera.setPosition(x * distance, y * distance, z * distance);
    camera.lookAt(0, 0, 0);
  }
}

/**
 * Add auto-rotate behavior
 */
function addAutoRotate(app: pc.Application, camera: pc.Entity) {
  let rotation = 0;
  const speed = 10; // degrees per second
  const distance = camera.getPosition().length();

  app.on('update', (dt: number) => {
    rotation += speed * dt;
    const rad = rotation * pc.math.DEG_TO_RAD;
    camera.setPosition(
      Math.sin(rad) * distance,
      camera.getPosition().y,
      Math.cos(rad) * distance
    );
    camera.lookAt(0, 0, 0);
  });
}

/**
 * Set up FPS monitoring with performance safeguards
 */
function setupPerformanceMonitoring(
  app: pc.Application,
  onFpsUpdate: (fps: number) => void
) {
  let frameCount = 0;
  let lastCheck = performance.now();
  let lowFpsCount = 0;

  app.on('update', () => {
    frameCount++;
    const now = performance.now();
    const elapsed = now - lastCheck;

    if (elapsed >= 1000) {
      const fps = Math.round((frameCount * 1000) / elapsed);
      onFpsUpdate(fps);

      // Performance safeguards
      if (fps < MIN_FPS_THRESHOLD) {
        lowFpsCount++;
        if (lowFpsCount >= 3) {
          // Reduce quality if consistently low FPS
          app.graphicsDevice.maxPixelRatio = Math.max(
            0.25,
            app.graphicsDevice.maxPixelRatio * 0.75
          );
          lowFpsCount = 0;
        }
      } else {
        lowFpsCount = 0;
      }

      frameCount = 0;
      lastCheck = now;
    }
  });
}

/**
 * Track view progress based on camera movement coverage
 */
function setupViewProgressTracking(
  camera: pc.Entity,
  onProgress: (percentage: number) => void
) {
  const visitedAngles = new Set<string>();
  let lastCheck = 0;

  // Check every 500ms
  const interval = setInterval(() => {
    const pos = camera.getPosition();
    const yaw = Math.round(Math.atan2(pos.x, pos.z) * (180 / Math.PI) / 15) * 15;
    const pitch = Math.round(Math.asin(pos.y / pos.length()) * (180 / Math.PI) / 15) * 15;

    visitedAngles.add(`${yaw},${pitch}`);

    // Estimate: 24 yaw angles * 7 pitch angles = 168 total positions
    const coverage = Math.min(100, (visitedAngles.size / 168) * 100);

    if (coverage !== lastCheck) {
      lastCheck = coverage;
      onProgress(Math.round(coverage));
    }
  }, 500);

  // Clean up on camera entity destroy
  camera.once('destroy', () => {
    clearInterval(interval);
  });
}

export default SplatViewer;
