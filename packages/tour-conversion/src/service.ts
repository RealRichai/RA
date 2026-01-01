import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

import { computeFileMetadata } from './checksum';
import { runQA, meetsQualityThreshold, getQAMode } from './qa';
import { convertPlyToSog, getSplatTransformVersion, getBinaryInfo } from './splat-transform';
import type {
  ConversionJobData,
  ConversionResult,
  ConversionError,
  ConversionProvenance,
  WorkerConfig,
} from './types';
import { DEFAULT_WORKER_CONFIG } from './types';

/**
 * Tour Conversion Service
 *
 * Handles the full PLY -> SOG conversion pipeline:
 * 1. Download PLY from S3
 * 2. Compute PLY checksum
 * 3. Run splat-transform CLI
 * 4. Compute SOG checksum
 * 5. Run QA comparison
 * 6. Upload SOG to S3
 * 7. Update database with provenance
 */
export class TourConversionService {
  private config: WorkerConfig;
  private converterVersion: string | null = null;

  constructor(config: Partial<WorkerConfig> = {}) {
    this.config = { ...DEFAULT_WORKER_CONFIG, ...config };
  }

  /**
   * Get the converter version (cached)
   */
  async getConverterVersion(): Promise<string> {
    if (!this.converterVersion) {
      try {
        this.converterVersion = await getSplatTransformVersion();
      } catch {
        this.converterVersion = 'mock-1.0.0';
      }
    }
    return this.converterVersion;
  }

  /**
   * Process a conversion job
   */
  async processJob(
    jobData: ConversionJobData,
    useMock = false
  ): Promise<ConversionResult> {
    const startTime = Date.now();
    const startedAt = new Date();
    const workDir = join(this.config.workDir, jobData.tourAssetId);

    // Get binary info for provenance
    const binaryInfo = getBinaryInfo();
    const qaMode = getQAMode();

    try {
      // Create work directory
      await mkdir(workDir, { recursive: true });

      const plyPath = join(workDir, 'input.ply');
      const sogPath = join(workDir, 'output.sog');

      // Step 1: Download PLY from S3 (mocked for now)
      await this.downloadFromS3(jobData.plyS3Key, plyPath, useMock);

      // Step 2: Compute PLY checksum and size
      const plyMetadata = await computeFileMetadata(plyPath);

      // Step 3: Run conversion
      const converterVersion = await this.getConverterVersion();
      const conversionResult = await convertPlyToSog(
        {
          inputPath: plyPath,
          outputPath: sogPath,
          iterations: jobData.iterations,
          format: 'sog',
          verbose: false,
        },
        useMock
      );

      // Build provenance metadata
      const provenance: ConversionProvenance = {
        qaMode,
        binaryMode: conversionResult.binaryMode,
        binaryPath: conversionResult.binaryPath,
        environment: `${process.platform}/${process.arch}/node-${process.version}`,
        startedAt,
        completedAt: new Date(),
      };

      if (!conversionResult.success) {
        return this.createErrorResult(
          plyMetadata.checksum,
          plyMetadata.sizeBytes,
          converterVersion,
          jobData.iterations,
          startTime,
          {
            code: 'CONVERSION_FAILED',
            message: `Splat transform failed: ${conversionResult.stderr}`,
            details: { exitCode: conversionResult.exitCode },
            retryable: true,
          },
          provenance
        );
      }

      // Step 4: Compute SOG checksum and size
      const sogMetadata = await computeFileMetadata(sogPath);

      // Step 5: Run QA comparison
      const qaReport = await runQA(plyPath, sogPath);

      // Update provenance with completion time
      provenance.completedAt = new Date();

      if (!meetsQualityThreshold(qaReport, jobData.qualityThreshold)) {
        return this.createErrorResult(
          plyMetadata.checksum,
          plyMetadata.sizeBytes,
          converterVersion,
          jobData.iterations,
          startTime,
          {
            code: 'QA_FAILED',
            message: `QA score ${qaReport.score.toFixed(3)} below threshold ${jobData.qualityThreshold}`,
            details: { qaReport },
            retryable: false,
          },
          provenance
        );
      }

      // Step 6: Upload SOG to S3 (mocked for now)
      const sogS3Key = await this.uploadToS3(sogPath, jobData, useMock);

      // Cleanup work directory
      await this.cleanup(workDir);

      return {
        success: true,
        sogS3Key,
        sogChecksum: sogMetadata.checksum,
        sogSizeBytes: sogMetadata.sizeBytes,
        plyChecksum: plyMetadata.checksum,
        plySizeBytes: plyMetadata.sizeBytes,
        converterVersion,
        iterations: jobData.iterations,
        conversionTimeMs: Date.now() - startTime,
        qaReport,
        provenance,
      };
    } catch (err) {
      // Cleanup on error
      await this.cleanup(workDir).catch(() => {});

      const provenance: ConversionProvenance = {
        qaMode,
        binaryMode: binaryInfo.mode,
        binaryPath: binaryInfo.path,
        environment: `${process.platform}/${process.arch}/node-${process.version}`,
        startedAt,
        completedAt: new Date(),
      };

      return this.createErrorResult(
        '',
        0,
        await this.getConverterVersion(),
        jobData.iterations,
        startTime,
        {
          code: 'UNEXPECTED_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
          retryable: true,
        },
        provenance
      );
    }
  }

  /**
   * Download file from S3 to local path
   */
  private async downloadFromS3(
    _s3Key: string,
    localPath: string,
    useMock: boolean
  ): Promise<void> {
    if (useMock || process.env['NODE_ENV'] === 'test') {
      // Create a minimal PLY file for testing
      const mockPly = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
end_header
0 0 0
1 0 0
0 1 0
`;
      await writeFile(localPath, mockPly);
      return;
    }

    // In production, use AWS SDK to download
    // This would be implemented with @aws-sdk/client-s3
    throw new Error('S3 download not implemented for production');
  }

  /**
   * Upload file to S3
   */
  private uploadToS3(
    _localPath: string,
    jobData: ConversionJobData,
    useMock: boolean
  ): Promise<string> {
    const sogS3Key = `tours/${jobData.market}/${jobData.tourAssetId}/output.sog`;

    if (useMock || process.env['NODE_ENV'] === 'test') {
      // Just return the key without actually uploading
      return Promise.resolve(sogS3Key);
    }

    // In production, use AWS SDK to upload
    // This would be implemented with @aws-sdk/client-s3
    return Promise.reject(new Error('S3 upload not implemented for production'));
  }

  /**
   * Cleanup work directory
   */
  private async cleanup(workDir: string): Promise<void> {
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Create an error result
   */
  private createErrorResult(
    plyChecksum: string,
    plySizeBytes: number,
    converterVersion: string,
    iterations: number,
    startTime: number,
    error: ConversionError,
    provenance?: ConversionProvenance
  ): ConversionResult {
    return {
      success: false,
      plyChecksum,
      plySizeBytes,
      converterVersion,
      iterations,
      conversionTimeMs: Date.now() - startTime,
      error,
      provenance,
    };
  }
}

// Singleton instance
let serviceInstance: TourConversionService | null = null;

export function getTourConversionService(
  config?: Partial<WorkerConfig>
): TourConversionService {
  if (!serviceInstance) {
    serviceInstance = new TourConversionService(config);
  }
  return serviceInstance;
}

export function resetTourConversionService(): void {
  serviceInstance = null;
}
