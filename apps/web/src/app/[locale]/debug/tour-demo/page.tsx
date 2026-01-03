'use client';

/**
 * 3DGS Tour Demo Page
 *
 * Feature-flagged demo page for testing the SplatViewer component
 * in staging environments.
 */

import { useState } from 'react';

import { SplatViewer, useFeatureDetection } from '@/components/tour';

// Demo tour type
interface DemoTour {
  id: string;
  name: string;
  url: string;
}

// Demo SOG URLs (can be overridden via query params in staging)
const DEMO_SOG_URLS: DemoTour[] = [
  {
    id: 'demo-apartment-1',
    name: 'Modern Apartment',
    url: 'https://realriches-sog-demo.r2.cloudflarestorage.com/tours/demo/apartment-1.sog',
  },
  {
    id: 'demo-house-1',
    name: 'Suburban House',
    url: 'https://realriches-sog-demo.r2.cloudflarestorage.com/tours/demo/house-1.sog',
  },
];

// Default tour (always defined)
const DEFAULT_TOUR: DemoTour = DEMO_SOG_URLS[0] ?? {
  id: 'default',
  name: 'Default',
  url: '',
};

// Feature flag check - in production this would be server-side
const IS_STAGING = process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' ||
  process.env.NODE_ENV === 'development';

export default function TourDemoPage() {
  const [selectedTour, setSelectedTour] = useState<DemoTour>(DEFAULT_TOUR);
  const [customUrl, setCustomUrl] = useState('');
  const [showPerformance, setShowPerformance] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [viewProgress, setViewProgress] = useState(0);

  const featureDetection = useFeatureDetection();

  // Check feature flag - demo only available in staging/dev
  if (!IS_STAGING) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-gray-400">
            This demo is only available in staging environments.
          </p>
        </div>
      </div>
    );
  }

  const activeUrl = customUrl || selectedTour.url;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">3DGS Tour Viewer Demo</h1>
            <p className="text-sm text-gray-400">
              PlayCanvas Engine | {featureDetection.deviceType.toUpperCase()} |
              {featureDetection.isMobile ? ' Mobile' : ' Desktop'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              Exploration: {viewProgress}%
            </span>
            <span className={`px-2 py-1 rounded text-xs ${
              featureDetection.deviceType === 'webgpu'
                ? 'bg-green-500/20 text-green-400'
                : featureDetection.deviceType === 'webgl2'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-red-500/20 text-red-400'
            }`}>
              {featureDetection.deviceType.toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="border-b border-gray-800 p-4">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-4 items-end">
          {/* Tour Selector */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-gray-400 mb-1">Demo Tour</label>
            <select
              value={selectedTour.id}
              onChange={(e) => {
                const tour = DEMO_SOG_URLS.find(t => t.id === e.target.value);
                if (tour) {
                  setSelectedTour(tour);
                  setCustomUrl('');
                  setError(null);
                }
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
              disabled={!!customUrl}
            >
              {DEMO_SOG_URLS.map(tour => (
                <option key={tour.id} value={tour.id}>{tour.name}</option>
              ))}
            </select>
          </div>

          {/* Custom URL */}
          <div className="flex-1 min-w-[300px]">
            <label className="block text-sm text-gray-400 mb-1">Custom SOG URL</label>
            <input
              type="text"
              value={customUrl}
              onChange={(e) => {
                setCustomUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://..."
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500"
            />
          </div>

          {/* Options */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showPerformance}
                onChange={(e) => setShowPerformance(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500"
              />
              <span className="text-sm">Show FPS</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRotate}
                onChange={(e) => setAutoRotate(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500"
              />
              <span className="text-sm">Auto Rotate</span>
            </label>
          </div>
        </div>
      </div>

      {/* Viewer */}
      <div className="relative" style={{ height: 'calc(100vh - 160px)' }}>
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-lg">Loading Tour...</p>
              <div className="w-48 bg-gray-700 rounded-full h-2 mt-2 mx-auto">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-400 mt-1">{progress}%</p>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
            <div className="text-center max-w-md">
              <div className="text-red-500 text-4xl mb-4">!</div>
              <h3 className="text-xl font-bold mb-2">Error Loading Tour</h3>
              <p className="text-gray-400 mb-4">{error}</p>
              <button
                onClick={() => setError(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <SplatViewer
          key={activeUrl} // Force remount on URL change
          sogUrl={activeUrl}
          tourAssetId={selectedTour.id}
          sessionId={`demo-${Date.now()}`}
          className="w-full h-full"
          autoRotate={autoRotate}
          enablePerformanceMonitoring={showPerformance}
          onReady={() => setIsLoading(false)}
          onProgress={(p) => {
            setProgress(p);
            if (p < 100) setIsLoading(true);
          }}
          onError={(err) => {
            setError(err.message);
            setIsLoading(false);
          }}
          onViewProgress={(p) => setViewProgress(p)}
        />
      </div>

      {/* Footer with debug info */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/90 border-t border-gray-800 p-2 text-xs text-gray-500">
        <div className="max-w-7xl mx-auto flex justify-between">
          <span>
            GPU: {featureDetection.gpuInfo || 'Unknown'}
          </span>
          <span>
            URL: {activeUrl}
          </span>
        </div>
      </div>
    </div>
  );
}
