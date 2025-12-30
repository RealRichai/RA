/**
 * Mock Video Generation Provider
 *
 * Simulates AI-powered cinematic video tour generation.
 * In production, would integrate with services like:
 * - Runway ML
 * - Synthesia
 * - D-ID
 * - Custom video generation pipeline
 */

import { generatePrefixedId } from '@realriches/utils';

import type {
  IVideoGenerationProvider,
  ProviderResult,
  VideoGenerationRequest,
  VideoGenerationJob,
} from '../provider.types';

// =============================================================================
// Mock Data
// =============================================================================

const MOCK_MUSIC_TRACKS = [
  { id: 'trk_upbeat', name: 'Urban Living', duration: 90, mood: 'upbeat' },
  { id: 'trk_elegant', name: 'Elegant Spaces', duration: 120, mood: 'sophisticated' },
  { id: 'trk_cozy', name: 'Warm Welcome', duration: 60, mood: 'cozy' },
  { id: 'trk_modern', name: 'Contemporary Beat', duration: 90, mood: 'modern' },
  { id: 'trk_luxury', name: 'Prestige', duration: 120, mood: 'luxury' },
  { id: 'trk_minimal', name: 'Clean Lines', duration: 60, mood: 'minimal' },
];

// In-memory job store for mock
const mockJobs = new Map<string, VideoGenerationJob>();

// =============================================================================
// Mock Video Provider
// =============================================================================

class MockVideoGenerationProvider implements IVideoGenerationProvider {
  providerId = 'mock-video';

  private createMeta() {
    return {
      provider: this.providerId,
      requestId: generatePrefixedId('req'),
      isMock: true,
      timestamp: new Date(),
    };
  }

  async getMusicTracks(): Promise<ProviderResult<Array<{ id: string; name: string; duration: number; mood: string }>>> {
    return {
      success: true,
      data: MOCK_MUSIC_TRACKS,
      meta: this.createMeta(),
    };
  }

  async startGeneration(request: VideoGenerationRequest): Promise<ProviderResult<VideoGenerationJob>> {
    const jobId = generatePrefixedId('vjob');

    // Validate minimum images
    if (request.sourceImages.length < 5) {
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_IMAGES',
          message: 'At least 5 source images are required for video generation',
        },
        meta: this.createMeta(),
      };
    }

    // Calculate estimated completion time based on duration
    const processingMinutes = Math.ceil(request.duration / 15) + 5;
    const estimatedCompletionTime = new Date(Date.now() + processingMinutes * 60 * 1000);

    const job: VideoGenerationJob = {
      id: jobId,
      status: 'queued',
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

  async getJobStatus(jobId: string): Promise<ProviderResult<VideoGenerationJob>> {
    const job = mockJobs.get(jobId);

    if (!job) {
      return {
        success: false,
        error: {
          code: 'JOB_NOT_FOUND',
          message: `Video generation job ${jobId} not found`,
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

  async cancelJob(jobId: string): Promise<ProviderResult<{ cancelled: boolean }>> {
    const job = mockJobs.get(jobId);

    if (!job) {
      return {
        success: false,
        error: {
          code: 'JOB_NOT_FOUND',
          message: `Video generation job ${jobId} not found`,
        },
        meta: this.createMeta(),
      };
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return {
        success: false,
        error: {
          code: 'JOB_ALREADY_FINISHED',
          message: 'Cannot cancel a completed or failed job',
        },
        meta: this.createMeta(),
      };
    }

    job.status = 'failed';
    job.errorMessage = 'Job cancelled by user';
    mockJobs.set(jobId, job);

    return {
      success: true,
      data: { cancelled: true },
      meta: this.createMeta(),
    };
  }

  private simulateProcessing(jobId: string, request: VideoGenerationRequest): void {
    const stages: Array<{ status: VideoGenerationJob['status']; progress: number; delay: number }> = [
      { status: 'processing', progress: 10, delay: 1000 },
      { status: 'processing', progress: 30, delay: 2000 },
      { status: 'rendering', progress: 50, delay: 2000 },
      { status: 'rendering', progress: 70, delay: 2000 },
      { status: 'rendering', progress: 90, delay: 1000 },
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
            job.videoUrl = `https://storage.example.com/videos/${jobId}.mp4`;
            job.thumbnailUrl = `https://storage.example.com/videos/${jobId}-thumb.jpg`;
            job.duration = request.duration;
            job.resolution = '1920x1080';
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

let mockVideoProvider: MockVideoGenerationProvider | null = null;

export function getMockVideoProvider(): IVideoGenerationProvider {
  if (!mockVideoProvider) {
    mockVideoProvider = new MockVideoGenerationProvider();
  }
  return mockVideoProvider;
}
