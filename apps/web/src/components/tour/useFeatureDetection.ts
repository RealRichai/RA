/**
 * WebGPU/WebGL2 Feature Detection Hook
 *
 * Detects graphics API support using actual feature detection,
 * not user agent sniffing.
 */

import { useEffect, useState } from 'react';

import type { GraphicsDeviceType } from './types';

interface FeatureDetectionResult {
  deviceType: GraphicsDeviceType;
  isLoading: boolean;
  isMobile: boolean;
  gpuInfo?: string;
}

// WebGPU types (not yet in lib.dom)
interface GPUAdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
}

interface GPUAdapter {
  requestAdapterInfo?: () => Promise<GPUAdapterInfo>;
}

interface GPUNavigator {
  gpu?: {
    requestAdapter: () => Promise<GPUAdapter | null>;
  };
}

/**
 * Detect if WebGPU is available
 */
async function detectWebGPU(): Promise<{ supported: boolean; gpuInfo?: string }> {
  if (typeof navigator === 'undefined') {
    return { supported: false };
  }

  // Check if WebGPU API is available
  const gpuNav = navigator as unknown as GPUNavigator;
  if (!gpuNav.gpu) {
    return { supported: false };
  }

  try {
    const adapter = await gpuNav.gpu.requestAdapter();

    if (!adapter) {
      return { supported: false };
    }

    // Get GPU info if available
    const info = await adapter.requestAdapterInfo?.();
    const gpuInfo = info
      ? `${info.vendor || 'Unknown'} ${info.architecture || ''} ${info.device || ''}`.trim()
      : undefined;

    return { supported: true, gpuInfo };
  } catch {
    return { supported: false };
  }
}

/**
 * Detect if WebGL2 is available
 */
function detectWebGL2(): { supported: boolean; gpuInfo?: string } {
  if (typeof document === 'undefined') {
    return { supported: false };
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');

    if (!gl) {
      return { supported: false };
    }

    // Get GPU info from WebGL debug extension
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    let gpuInfo: string | undefined;

    if (debugInfo) {
      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string;
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
      gpuInfo = `${vendor} ${renderer}`.trim();
    }

    return { supported: true, gpuInfo };
  } catch {
    return { supported: false };
  }
}

/**
 * Detect if device is mobile
 */
function detectMobile(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Use pointer coarse detection (more reliable than user agent)
  if (window.matchMedia) {
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const touchPoints = navigator.maxTouchPoints > 0;
    return coarsePointer && touchPoints;
  }

  // Fallback to touch points
  return navigator.maxTouchPoints > 0;
}

/**
 * Hook for detecting graphics API support
 *
 * Performs WebGPU detection first, falls back to WebGL2.
 * Uses actual feature detection, not user agent sniffing.
 */
export function useFeatureDetection(): FeatureDetectionResult {
  const [result, setResult] = useState<FeatureDetectionResult>({
    deviceType: 'unsupported',
    isLoading: true,
    isMobile: false,
  });

  useEffect(() => {
    let mounted = true;

    async function detect() {
      const isMobile = detectMobile();

      // Try WebGPU first
      const webgpu = await detectWebGPU();
      if (webgpu.supported && mounted) {
        setResult({
          deviceType: 'webgpu',
          isLoading: false,
          isMobile,
          gpuInfo: webgpu.gpuInfo,
        });
        return;
      }

      // Fall back to WebGL2
      const webgl2 = detectWebGL2();
      if (webgl2.supported && mounted) {
        setResult({
          deviceType: 'webgl2',
          isLoading: false,
          isMobile,
          gpuInfo: webgl2.gpuInfo,
        });
        return;
      }

      // Neither supported
      if (mounted) {
        setResult({
          deviceType: 'unsupported',
          isLoading: false,
          isMobile,
        });
      }
    }

    void detect();

    return () => {
      mounted = false;
    };
  }, []);

  return result;
}

/**
 * Get recommended quality settings based on device
 */
export function getQualitySettings(deviceType: GraphicsDeviceType, isMobile: boolean): {
  maxSplats: number;
  targetFps: number;
  enableShadows: boolean;
  resolution: number;
} {
  if (deviceType === 'webgpu' && !isMobile) {
    return {
      maxSplats: 5_000_000,
      targetFps: 60,
      enableShadows: true,
      resolution: 1.0,
    };
  }

  if (deviceType === 'webgpu' && isMobile) {
    return {
      maxSplats: 2_000_000,
      targetFps: 30,
      enableShadows: false,
      resolution: 0.75,
    };
  }

  if (deviceType === 'webgl2' && !isMobile) {
    return {
      maxSplats: 3_000_000,
      targetFps: 60,
      enableShadows: false,
      resolution: 1.0,
    };
  }

  // WebGL2 mobile or fallback
  return {
    maxSplats: 1_000_000,
    targetFps: 30,
    enableShadows: false,
    resolution: 0.5,
  };
}
