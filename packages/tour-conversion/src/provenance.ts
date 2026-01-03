/**
 * Asset Provenance Service
 *
 * Handles provenance tracking and integrity verification for PLY/SOG assets.
 * Integrates with checksum module and evidence recording.
 *
 * SOC2 Control: PI1.2 - Processing integrity and completeness
 */

import { computeFileChecksum, computeFileMetadata, verifyChecksum } from './checksum';
import { logger } from '@realriches/utils';

// =============================================================================
// Types
// =============================================================================

export interface AssetProvenance {
  assetId: string;
  listingId: string;
  market: string;
  uploaderId?: string;
  uploaderEmail?: string;
  uploadedAt: Date;

  // PLY source
  plyS3Key: string;
  plyChecksum: string;
  plySizeBytes: number;

  // SOG output (optional - may not be converted yet)
  sogS3Key?: string;
  sogChecksum?: string;
  sogSizeBytes?: number;

  // Conversion metadata
  converterVersion?: string;
  iterations?: number;
  conversionParams?: Record<string, unknown>;
  convertedAt?: Date;

  // QA metadata
  qaScore?: number;
  qaPassedAt?: Date;
}

export interface ProvenanceRecord {
  type: 'upload' | 'conversion' | 'qa_pass' | 'integrity_check' | 'access';
  assetId: string;
  timestamp: Date;
  actorId?: string;
  actorEmail?: string;
  details: Record<string, unknown>;
}

export interface IntegrityCheckResult {
  valid: boolean;
  assetId: string;
  checksumMatch: boolean;
  expectedChecksum: string;
  actualChecksum?: string;
  error?: string;
  checkedAt: Date;
}

export interface ProvenanceVerificationResult {
  valid: boolean;
  assetId: string;
  checks: {
    plyIntegrity: IntegrityCheckResult | null;
    sogIntegrity: IntegrityCheckResult | null;
    provenanceComplete: boolean;
  };
  missingFields: string[];
  warnings: string[];
}

export interface ProvenanceEmitter {
  emit(record: ProvenanceRecord): void;
}

// =============================================================================
// Provenance Service
// =============================================================================

export class AssetProvenanceService {
  private emitter?: ProvenanceEmitter;

  constructor(emitter?: ProvenanceEmitter) {
    this.emitter = emitter;
  }

  /**
   * Record an upload event with provenance metadata
   */
  recordUpload(
    assetId: string,
    plyPath: string,
    metadata: {
      listingId: string;
      market: string;
      uploaderId?: string;
      uploaderEmail?: string;
    }
  ): Promise<{ checksum: string; sizeBytes: number }> {
    return this.recordUploadAsync(assetId, plyPath, metadata);
  }

  private async recordUploadAsync(
    assetId: string,
    plyPath: string,
    metadata: {
      listingId: string;
      market: string;
      uploaderId?: string;
      uploaderEmail?: string;
    }
  ): Promise<{ checksum: string; sizeBytes: number }> {
    const { checksum, sizeBytes } = await computeFileMetadata(plyPath);

    this.emitRecord({
      type: 'upload',
      assetId,
      timestamp: new Date(),
      actorId: metadata.uploaderId,
      actorEmail: metadata.uploaderEmail,
      details: {
        listingId: metadata.listingId,
        market: metadata.market,
        plyChecksum: checksum,
        plySizeBytes: sizeBytes,
      },
    });

    return { checksum, sizeBytes };
  }

  /**
   * Record a conversion event
   */
  recordConversion(
    assetId: string,
    result: {
      sogChecksum: string;
      sogSizeBytes: number;
      converterVersion: string;
      iterations: number;
      conversionParams?: Record<string, unknown>;
      conversionTimeMs: number;
    }
  ): void {
    this.emitRecord({
      type: 'conversion',
      assetId,
      timestamp: new Date(),
      details: {
        sogChecksum: result.sogChecksum,
        sogSizeBytes: result.sogSizeBytes,
        converterVersion: result.converterVersion,
        iterations: result.iterations,
        conversionParams: result.conversionParams,
        conversionTimeMs: result.conversionTimeMs,
      },
    });
  }

  /**
   * Record a QA pass event
   */
  recordQAPass(
    assetId: string,
    qaScore: number,
    qaReport: Record<string, unknown>
  ): void {
    this.emitRecord({
      type: 'qa_pass',
      assetId,
      timestamp: new Date(),
      details: {
        qaScore,
        qaReport,
      },
    });
  }

  /**
   * Verify integrity of a PLY file
   */
  async verifyPlyIntegrity(
    assetId: string,
    plyPath: string,
    expectedChecksum: string
  ): Promise<IntegrityCheckResult> {
    const checkedAt = new Date();

    try {
      const actualChecksum = await computeFileChecksum(plyPath);
      const valid = actualChecksum === expectedChecksum;

      const result: IntegrityCheckResult = {
        valid,
        assetId,
        checksumMatch: valid,
        expectedChecksum,
        actualChecksum,
        checkedAt,
      };

      this.emitRecord({
        type: 'integrity_check',
        assetId,
        timestamp: checkedAt,
        details: {
          fileType: 'ply',
          valid,
          checksumMatch: valid,
          expectedChecksum,
          actualChecksum,
        },
      });

      return result;
    } catch (err) {
      const result: IntegrityCheckResult = {
        valid: false,
        assetId,
        checksumMatch: false,
        expectedChecksum,
        error: err instanceof Error ? err.message : 'Unknown error',
        checkedAt,
      };

      this.emitRecord({
        type: 'integrity_check',
        assetId,
        timestamp: checkedAt,
        details: {
          fileType: 'ply',
          valid: false,
          error: result.error,
        },
      });

      return result;
    }
  }

  /**
   * Verify integrity of a SOG file
   */
  async verifySogIntegrity(
    assetId: string,
    sogPath: string,
    expectedChecksum: string
  ): Promise<IntegrityCheckResult> {
    const checkedAt = new Date();

    try {
      const actualChecksum = await computeFileChecksum(sogPath);
      const valid = actualChecksum === expectedChecksum;

      const result: IntegrityCheckResult = {
        valid,
        assetId,
        checksumMatch: valid,
        expectedChecksum,
        actualChecksum,
        checkedAt,
      };

      this.emitRecord({
        type: 'integrity_check',
        assetId,
        timestamp: checkedAt,
        details: {
          fileType: 'sog',
          valid,
          checksumMatch: valid,
          expectedChecksum,
          actualChecksum,
        },
      });

      return result;
    } catch (err) {
      const result: IntegrityCheckResult = {
        valid: false,
        assetId,
        checksumMatch: false,
        expectedChecksum,
        error: err instanceof Error ? err.message : 'Unknown error',
        checkedAt,
      };

      this.emitRecord({
        type: 'integrity_check',
        assetId,
        timestamp: checkedAt,
        details: {
          fileType: 'sog',
          valid: false,
          error: result.error,
        },
      });

      return result;
    }
  }

  /**
   * Verify complete provenance of an asset
   */
  verifyProvenance(provenance: AssetProvenance): ProvenanceVerificationResult {
    const missingFields: string[] = [];
    const warnings: string[] = [];

    // Check required PLY fields
    if (!provenance.plyS3Key) missingFields.push('plyS3Key');
    if (!provenance.plyChecksum) missingFields.push('plyChecksum');
    if (!provenance.plySizeBytes) missingFields.push('plySizeBytes');

    // Check upload provenance
    if (!provenance.uploaderId) {
      warnings.push('No uploader ID recorded - provenance chain incomplete');
    }
    if (!provenance.uploadedAt) {
      warnings.push('No upload timestamp - provenance chain incomplete');
    }

    // Check conversion provenance if SOG exists
    if (provenance.sogS3Key) {
      if (!provenance.sogChecksum) missingFields.push('sogChecksum');
      if (!provenance.converterVersion) {
        warnings.push('No converter version for SOG - provenance incomplete');
      }
      if (!provenance.qaScore) {
        warnings.push('No QA score for SOG - quality not verified');
      }
    }

    const provenanceComplete =
      missingFields.length === 0 &&
      !!provenance.uploaderId &&
      !!provenance.uploadedAt;

    return {
      valid: missingFields.length === 0,
      assetId: provenance.assetId,
      checks: {
        plyIntegrity: null, // Would be filled by verifyPlyIntegrity
        sogIntegrity: null, // Would be filled by verifySogIntegrity
        provenanceComplete,
      },
      missingFields,
      warnings,
    };
  }

  /**
   * Record an access event (for audit trail)
   */
  recordAccess(
    assetId: string,
    actorId: string,
    actorEmail?: string,
    accessDetails?: { sessionId?: string; ipAddress?: string }
  ): void {
    this.emitRecord({
      type: 'access',
      assetId,
      timestamp: new Date(),
      actorId,
      actorEmail,
      details: {
        sessionId: accessDetails?.sessionId,
        ipAddress: accessDetails?.ipAddress,
      },
    });
  }

  /**
   * Emit a provenance record
   */
  private emitRecord(record: ProvenanceRecord): void {
    if (this.emitter) {
      try {
        this.emitter.emit(record);
      } catch (err) {
        logger.error({
          msg: 'provenance_emit_failed',
          assetId: record.assetId,
          type: record.type,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Always log for audit trail
    logger.info({
      msg: 'asset_provenance_event',
      ...record,
    });
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

let defaultService: AssetProvenanceService | null = null;

/**
 * Get the default provenance service singleton
 */
export function getAssetProvenanceService(): AssetProvenanceService {
  if (!defaultService) {
    defaultService = new AssetProvenanceService();
  }
  return defaultService;
}

/**
 * Create a provenance service with custom emitter
 */
export function createAssetProvenanceService(
  emitter?: ProvenanceEmitter
): AssetProvenanceService {
  return new AssetProvenanceService(emitter);
}

/**
 * Reset the default service (for testing)
 */
export function resetAssetProvenanceService(): void {
  defaultService = null;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Verify a file checksum matches expected value
 * Convenience wrapper around verifyChecksum from checksum module
 */
export async function verifyFileIntegrity(
  filePath: string,
  expectedChecksum: string
): Promise<boolean> {
  return verifyChecksum(filePath, expectedChecksum);
}
