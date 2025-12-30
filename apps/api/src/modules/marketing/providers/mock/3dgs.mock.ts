/**
 * Mock 3D Gaussian Splatting (3DGS) Provider
 *
 * Simulates 3DGS virtual tour generation.
 * In production, would integrate with services like:
 * - Luma AI
 * - Polycam
 * - Custom 3DGS pipeline (COLMAP + 3DGS training)
 */

import { generatePrefixedId } from '@realriches/utils';

import type {
  IThreeDGSProvider,
  ProviderResult,
  ThreeDGSGenerationRequest,
  ThreeDGSGenerationJob,
} from '../provider.types';

// =============================================================================
// Mock Data Store
// =============================================================================

const mockJobs = new Map<string, ThreeDGSGenerationJob>();
const mockTours = new Map<string, { tourUrl: string; embedCode: string }>();

// =============================================================================
// Mock 3DGS Provider
// =============================================================================

class MockThreeDGSProvider implements IThreeDGSProvider {
  providerId = 'mock-3dgs';

  private createMeta() {
    return {
      provider: this.providerId,
      requestId: generatePrefixedId('req'),
      isMock: true,
      timestamp: new Date(),
    };
  }

  async validateImages(imageUrls: string[]): Promise<ProviderResult<{
    valid: boolean;
    issues: string[];
    coverage: number;
  }>> {
    const issues: string[] = [];
    let valid = true;

    // Check minimum image count
    if (imageUrls.length < 20) {
      issues.push(`Minimum 20 images required for quality 3D reconstruction (found ${imageUrls.length})`);
      valid = false;
    }

    // Check for recommended count
    if (imageUrls.length < 50) {
      issues.push('Recommend 50+ images for best results');
    }

    // Estimate coverage based on image count
    const coverage = Math.min(100, Math.floor((imageUrls.length / 100) * 100));

    return {
      success: true,
      data: {
        valid,
        issues,
        coverage,
      },
      meta: this.createMeta(),
    };
  }

  async startGeneration(request: ThreeDGSGenerationRequest): Promise<ProviderResult<ThreeDGSGenerationJob>> {
    // Validate images first
    const validation = await this.validateImages(request.sourceImages);
    if (!validation.data?.valid) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: validation.data?.issues.join('; ') || 'Image validation failed',
        },
        meta: this.createMeta(),
      };
    }

    const jobId = generatePrefixedId('3dgs');

    // Calculate estimated completion time based on quality
    const qualityMultiplier = {
      standard: 1,
      high: 1.5,
      ultra: 2.5,
    };
    const baseMinutes = 20;
    const imageMinutes = Math.ceil(request.sourceImages.length / 10);
    const totalMinutes = (baseMinutes + imageMinutes) * qualityMultiplier[request.quality];
    const estimatedCompletionTime = new Date(Date.now() + totalMinutes * 60 * 1000);

    const job: ThreeDGSGenerationJob = {
      id: jobId,
      status: 'uploading',
      progress: 0,
      estimatedCompletionTime,
    };

    mockJobs.set(jobId, job);

    // Simulate async processing
    this.simulateProcessing(jobId, request);

    return {
      success: true,
      data: job,
      meta: this.createMeta(),
    };
  }

  async getJobStatus(jobId: string): Promise<ProviderResult<ThreeDGSGenerationJob>> {
    const job = mockJobs.get(jobId);

    if (!job) {
      return {
        success: false,
        error: {
          code: 'JOB_NOT_FOUND',
          message: `3DGS generation job ${jobId} not found`,
        },
        meta: this.createMeta(),
      };
    }

    return {
      success: true,
      data: job,
      meta: this.createMeta(),
    };
  }

  async getEmbedCode(
    tourId: string,
    options: { width?: number; height?: number } = {}
  ): Promise<ProviderResult<string>> {
    const tour = mockTours.get(tourId);

    if (!tour) {
      return {
        success: false,
        error: {
          code: 'TOUR_NOT_FOUND',
          message: `Tour ${tourId} not found`,
        },
        meta: this.createMeta(),
      };
    }

    const width = options.width || 800;
    const height = options.height || 600;

    const embedCode = `<iframe
  src="${tour.tourUrl}"
  width="${width}"
  height="${height}"
  frameborder="0"
  allow="xr-spatial-tracking; gyroscope; accelerometer"
  allowfullscreen
></iframe>`;

    return {
      success: true,
      data: embedCode,
      meta: this.createMeta(),
    };
  }

  private simulateProcessing(jobId: string, request: ThreeDGSGenerationRequest): void {
    const stages: Array<{ status: ThreeDGSGenerationJob['status']; progress: number; delay: number }> = [
      { status: 'uploading', progress: 5, delay: 500 },
      { status: 'processing', progress: 15, delay: 1500 },
      { status: 'processing', progress: 25, delay: 1500 },
      { status: 'training', progress: 40, delay: 2000 },
      { status: 'training', progress: 55, delay: 2000 },
      { status: 'training', progress: 70, delay: 2000 },
      { status: 'optimizing', progress: 85, delay: 1500 },
      { status: 'optimizing', progress: 95, delay: 1000 },
      { status: 'completed', progress: 100, delay: 500 },
    ];

    let totalDelay = 0;
    stages.forEach((stage) => {
      totalDelay += stage.delay;
      setTimeout(() => {
        const job = mockJobs.get(jobId);
        if (job && job.status !== 'failed') {
          job.status = stage.status;
          job.progress = stage.progress;

          if (stage.status === 'completed') {
            const tourId = generatePrefixedId('tour');
            job.tourUrl = `https://tours.example.com/${tourId}`;
            job.embedCode = `<iframe src="https://tours.example.com/${tourId}" width="800" height="600"></iframe>`;
            job.pointCount = Math.floor(request.sourceImages.length * 50000); // ~50k points per image
            job.fileSize = job.pointCount * 12; // ~12 bytes per point

            // Store tour for embed code retrieval
            mockTours.set(tourId, {
              tourUrl: job.tourUrl,
              embedCode: job.embedCode,
            });
          }

          mockJobs.set(jobId, job);
        }
      }, totalDelay);
    });
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

let mockThreeDGSProvider: MockThreeDGSProvider | null = null;

export function getMockThreeDGSProvider(): IThreeDGSProvider {
  if (!mockThreeDGSProvider) {
    mockThreeDGSProvider = new MockThreeDGSProvider();
  }
  return mockThreeDGSProvider;
}
