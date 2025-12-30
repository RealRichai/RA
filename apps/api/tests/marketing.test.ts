/**
 * Marketing Module Tests
 *
 * Tests for:
 * - Asset generation providers
 * - Video generation providers
 * - 3DGS generation providers
 * - Provider registry
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getMockAssetProvider,
  getMockVideoProvider,
  getMockThreeDGSProvider,
} from '../src/modules/marketing/providers/mock';

// Reset mock stores between tests
beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Asset Generation Provider Tests
// =============================================================================

describe('MockAssetGenerationProvider', () => {
  const provider = getMockAssetProvider();

  it('should return templates for all types', async () => {
    const result = await provider.getTemplates();

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.length).toBeGreaterThan(0);
    expect(result.meta?.isMock).toBe(true);
  });

  it('should filter templates by type', async () => {
    const result = await provider.getTemplates('flyer');

    expect(result.success).toBe(true);
    const templates = result.data!;
    expect(templates.every((t) => t.type === 'flyer')).toBe(true);
  });

  it('should generate asset from listing data', async () => {
    const result = await provider.generateAsset({
      type: 'flyer',
      listingData: {
        id: 'lst_test',
        title: 'Beautiful 2BR Apartment',
        description: 'Spacious apartment with great views',
        price: 2500,
        address: '123 Main St, New York, NY 10001',
        bedrooms: 2,
        bathrooms: 1,
        squareFeet: 1000,
        images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
        features: ['Dishwasher', 'In-unit laundry', 'Hardwood floors'],
        propertyType: 'APARTMENT',
      },
      outputFormat: 'pdf',
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.type).toBe('flyer');
    expect(result.data!.fileUrl).toContain('.pdf');
    expect(result.data!.mimeType).toBe('application/pdf');
  });

  it('should fail with missing listing data', async () => {
    const result = await provider.generateAsset({
      type: 'brochure',
      listingData: {
        id: 'lst_test',
        title: '',
        description: '',
        price: 0,
        address: '',
        bedrooms: 0,
        bathrooms: 0,
        images: [],
        features: [],
        propertyType: '',
      },
      outputFormat: 'pdf',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MISSING_LISTING_DATA');
  });

  it('should estimate file sizes based on asset type', async () => {
    const flyerResult = await provider.generateAsset({
      type: 'flyer',
      listingData: {
        id: 'lst_1',
        title: 'Test',
        description: '',
        price: 1000,
        address: '123 Test St',
        bedrooms: 1,
        bathrooms: 1,
        images: [],
        features: [],
        propertyType: 'APARTMENT',
      },
      outputFormat: 'pdf',
    });

    const brochureResult = await provider.generateAsset({
      type: 'brochure',
      listingData: {
        id: 'lst_2',
        title: 'Test',
        description: '',
        price: 1000,
        address: '123 Test St',
        bedrooms: 1,
        bathrooms: 1,
        images: [],
        features: [],
        propertyType: 'APARTMENT',
      },
      outputFormat: 'pdf',
    });

    // Brochure should be larger than flyer
    expect(brochureResult.data!.fileSize).toBeGreaterThan(flyerResult.data!.fileSize);
  });
});

// =============================================================================
// Video Generation Provider Tests
// =============================================================================

describe('MockVideoGenerationProvider', () => {
  const provider = getMockVideoProvider();

  it('should return available music tracks', async () => {
    const result = await provider.getMusicTracks();

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.length).toBeGreaterThan(0);

    const track = result.data![0];
    expect(track.id).toBeDefined();
    expect(track.name).toBeDefined();
    expect(track.duration).toBeGreaterThan(0);
    expect(track.mood).toBeDefined();
  });

  it('should start video generation job', async () => {
    const result = await provider.startGeneration({
      propertyId: 'prop_test',
      style: 'cinematic',
      duration: 60,
      sourceImages: [
        'img1.jpg',
        'img2.jpg',
        'img3.jpg',
        'img4.jpg',
        'img5.jpg',
        'img6.jpg',
      ],
      includeBranding: true,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.id).toBeDefined();
    expect(result.data!.status).toBe('queued');
    expect(result.data!.progress).toBe(0);
    expect(result.data!.estimatedCompletionTime).toBeDefined();
  });

  it('should reject with insufficient images', async () => {
    const result = await provider.startGeneration({
      propertyId: 'prop_test',
      style: 'modern',
      duration: 30,
      sourceImages: ['img1.jpg', 'img2.jpg'], // Only 2 images
      includeBranding: false,
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INSUFFICIENT_IMAGES');
  });

  it('should poll job status', async () => {
    const startResult = await provider.startGeneration({
      propertyId: 'prop_test',
      style: 'luxury',
      duration: 90,
      sourceImages: Array(10).fill('img.jpg'),
      includeBranding: true,
    });

    const jobId = startResult.data!.id;

    const statusResult = await provider.getJobStatus(jobId);

    expect(statusResult.success).toBe(true);
    expect(statusResult.data?.id).toBe(jobId);
  });

  it('should cancel a running job', async () => {
    const startResult = await provider.startGeneration({
      propertyId: 'prop_test',
      style: 'cozy',
      duration: 60,
      sourceImages: Array(8).fill('img.jpg'),
      includeBranding: false,
    });

    const jobId = startResult.data!.id;

    const cancelResult = await provider.cancelJob(jobId);

    expect(cancelResult.success).toBe(true);
    expect(cancelResult.data?.cancelled).toBe(true);

    // Verify job is now failed
    const statusResult = await provider.getJobStatus(jobId);
    expect(statusResult.data?.status).toBe('failed');
  });

  it('should return error for non-existent job', async () => {
    const result = await provider.getJobStatus('invalid-job-id');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('JOB_NOT_FOUND');
  });
});

// =============================================================================
// 3DGS Generation Provider Tests
// =============================================================================

describe('MockThreeDGSProvider', () => {
  const provider = getMockThreeDGSProvider();

  it('should validate images and return coverage estimate', async () => {
    const result = await provider.validateImages(Array(50).fill('img.jpg'));

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.valid).toBe(true);
    expect(result.data!.coverage).toBe(50);
    expect(result.data!.issues.length).toBe(0);
  });

  it('should reject with too few images', async () => {
    const result = await provider.validateImages(Array(10).fill('img.jpg'));

    expect(result.success).toBe(true);
    expect(result.data!.valid).toBe(false);
    expect(result.data!.issues.length).toBeGreaterThan(0);
    expect(result.data!.issues[0]).toContain('Minimum 20 images required');
  });

  it('should recommend more images for better quality', async () => {
    const result = await provider.validateImages(Array(30).fill('img.jpg'));

    expect(result.success).toBe(true);
    expect(result.data!.valid).toBe(true);
    expect(result.data!.issues.some((i) => i.includes('Recommend 50+'))).toBe(true);
  });

  it('should start 3DGS generation job', async () => {
    const result = await provider.startGeneration({
      propertyId: 'prop_test',
      sourceImages: Array(30).fill('img.jpg'),
      quality: 'standard',
      includeFloorPlan: false,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.id).toBeDefined();
    expect(result.data!.status).toBe('uploading');
    expect(result.data!.progress).toBe(0);
  });

  it('should reject generation with invalid images', async () => {
    const result = await provider.startGeneration({
      propertyId: 'prop_test',
      sourceImages: Array(5).fill('img.jpg'), // Too few
      quality: 'high',
      includeFloorPlan: true,
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_FAILED');
  });

  it('should poll job status', async () => {
    const startResult = await provider.startGeneration({
      propertyId: 'prop_test',
      sourceImages: Array(25).fill('img.jpg'),
      quality: 'ultra',
      includeFloorPlan: false,
    });

    const jobId = startResult.data!.id;

    const statusResult = await provider.getJobStatus(jobId);

    expect(statusResult.success).toBe(true);
    expect(statusResult.data?.id).toBe(jobId);
  });

  it('should calculate longer processing time for higher quality', async () => {
    const standardResult = await provider.startGeneration({
      propertyId: 'prop_1',
      sourceImages: Array(30).fill('img.jpg'),
      quality: 'standard',
      includeFloorPlan: false,
    });

    const ultraResult = await provider.startGeneration({
      propertyId: 'prop_2',
      sourceImages: Array(30).fill('img.jpg'),
      quality: 'ultra',
      includeFloorPlan: false,
    });

    const standardTime = standardResult.data!.estimatedCompletionTime!.getTime();
    const ultraTime = ultraResult.data!.estimatedCompletionTime!.getTime();

    expect(ultraTime).toBeGreaterThan(standardTime);
  });
});

// =============================================================================
// Provider Meta Tests
// =============================================================================

describe('Provider Meta', () => {
  it('should include isMock flag in asset provider responses', async () => {
    const provider = getMockAssetProvider();
    const result = await provider.getTemplates();

    expect(result.meta).toBeDefined();
    expect(result.meta!.isMock).toBe(true);
    expect(result.meta!.provider).toBe('mock-asset');
    expect(result.meta!.requestId).toBeDefined();
    expect(result.meta!.timestamp).toBeInstanceOf(Date);
  });

  it('should include isMock flag in video provider responses', async () => {
    const provider = getMockVideoProvider();
    const result = await provider.getMusicTracks();

    expect(result.meta).toBeDefined();
    expect(result.meta!.isMock).toBe(true);
    expect(result.meta!.provider).toBe('mock-video');
  });

  it('should include isMock flag in 3DGS provider responses', async () => {
    const provider = getMockThreeDGSProvider();
    const result = await provider.validateImages(Array(20).fill('img.jpg'));

    expect(result.meta).toBeDefined();
    expect(result.meta!.isMock).toBe(true);
    expect(result.meta!.provider).toBe('mock-3dgs');
  });
});
