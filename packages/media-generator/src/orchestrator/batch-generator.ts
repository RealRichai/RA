/**
 * Batch Generator Orchestrator
 *
 * Coordinates parallel generation of multiple output formats:
 * - PDF, PPTX, and 7 social crop formats
 * - Target: < 60 seconds for full batch
 * - Evidence tracking for all outputs
 */

import { createHash } from 'crypto';

import { getGenerationEvidenceEmitter } from '../evidence/generation-evidence';
import { getPdfGenerator } from '../generators/pdf-generator';
import { getPptxGenerator } from '../generators/pptx-generator';
import { getImageGenerator } from '../generators/image-generator';
import type {
  BatchGenerationRequest,
  BatchGenerationResult,
  SingleGenerationResult,
  CollateralTemplate,
  ListingSnapshot,
  AllOutputFormat,
  OutputFormat,
  SocialCropFormat,
  AppliedComplianceBlock,
} from '../types';
import { OutputFormat as OutputFormatEnum, SocialCropFormat as SocialCropFormatEnum } from '../types';

// ============================================================================
// Types
// ============================================================================

interface GenerationOutcome {
  format: AllOutputFormat;
  success: boolean;
  result?: SingleGenerationResult;
  error?: string;
}

export interface BatchEvidenceRecord {
  batchId: string;
  inputHash: string;
  listingId: string;
  templateId: string;
  templateVersion: string;
  requestedFormats: AllOutputFormat[];
  completedFormats: AllOutputFormat[];
  failedFormats: AllOutputFormat[];
  totalDuration: number;
  generationRecords: Array<{
    format: AllOutputFormat;
    checksum: string;
    complianceBlocks: AppliedComplianceBlock[];
  }>;
  generatedBy: string;
  generatedAt: Date;
}

// ============================================================================
// Batch Generator Class
// ============================================================================

export class BatchGenerator {
  private pdfGenerator = getPdfGenerator();
  private pptxGenerator = getPptxGenerator();
  private imageGenerator = getImageGenerator();
  private evidenceEmitter = getGenerationEvidenceEmitter();

  /**
   * Generate all requested formats in parallel
   * Target: < 60 seconds for full batch
   */
  async generateBatch(
    request: BatchGenerationRequest,
    template: CollateralTemplate,
    listing: ListingSnapshot
  ): Promise<BatchGenerationResult> {
    const startTime = Date.now();
    const batchId = crypto.randomUUID();

    // Calculate input hash for determinism verification
    const inputHash = this.calculateInputHash(listing, template, request.variables);

    // Separate formats by type
    const pdfFormats = request.formats.filter(f => f === OutputFormatEnum.PDF);
    const pptxFormats = request.formats.filter(f => f === OutputFormatEnum.PPTX);
    const socialFormats = request.formats.filter(f =>
      Object.values(SocialCropFormatEnum).includes(f as SocialCropFormat)
    ) as SocialCropFormat[];

    // Generate all formats in parallel
    const generations: Promise<GenerationOutcome>[] = [];

    // Queue PDF generation
    for (const format of pdfFormats) {
      generations.push(this.generatePdf(template, listing, request, format));
    }

    // Queue PPTX generation
    for (const format of pptxFormats) {
      generations.push(this.generatePptx(template, listing, request, format));
    }

    // Queue social crop generation (single call for all formats)
    if (socialFormats.length > 0) {
      generations.push(this.generateSocialCrops(template, listing, request, socialFormats));
    }

    // Wait for all generations
    const outcomes = await Promise.all(generations);

    // Flatten social crop results
    const flattenedOutcomes = this.flattenOutcomes(outcomes);

    // Collect results
    const results = new Map<AllOutputFormat, SingleGenerationResult>();
    const failures: Array<{ format: AllOutputFormat; error: string }> = [];

    for (const outcome of flattenedOutcomes) {
      if (outcome.success && outcome.result) {
        results.set(outcome.format, outcome.result);
      } else {
        failures.push({
          format: outcome.format,
          error: outcome.error || 'Unknown error',
        });
      }
    }

    // Calculate duration
    const duration = Date.now() - startTime;

    // Emit batch evidence
    const evidenceRecordId = await this.emitBatchEvidence({
      batchId,
      inputHash,
      listingId: request.listingId,
      templateId: request.templateId,
      templateVersion: template.version,
      requestedFormats: request.formats,
      completedFormats: Array.from(results.keys()),
      failedFormats: failures.map(f => f.format),
      totalDuration: duration,
      generationRecords: Array.from(results.values()).map(r => ({
        format: r.format,
        checksum: r.checksum,
        complianceBlocks: r.complianceBlocksApplied,
      })),
      generatedBy: request.userId,
      generatedAt: new Date(),
    });

    // Determine overall status
    let status: 'completed' | 'partial_failure' | 'failed';
    if (failures.length === 0) {
      status = 'completed';
    } else if (results.size > 0) {
      status = 'partial_failure';
    } else {
      status = 'failed';
    }

    return {
      batchId,
      status,
      duration,
      inputHash,
      results,
      failures,
      evidenceRecordId,
    };
  }

  /**
   * Generate PDF
   */
  private async generatePdf(
    template: CollateralTemplate,
    listing: ListingSnapshot,
    request: BatchGenerationRequest,
    format: AllOutputFormat
  ): Promise<GenerationOutcome> {
    try {
      const result = await this.pdfGenerator.generate(template, listing, {
        variables: request.variables,
        customizations: request.customizations,
      });

      return {
        format,
        success: true,
        result: {
          format,
          fileUrl: '', // URL will be set after upload to storage
          fileSize: result.buffer.length,
          checksum: result.checksum,
          complianceBlocksApplied: result.appliedBlocks,
        },
      };
    } catch (error) {
      return {
        format,
        success: false,
        error: error instanceof Error ? error.message : 'PDF generation failed',
      };
    }
  }

  /**
   * Generate PPTX
   */
  private async generatePptx(
    template: CollateralTemplate,
    listing: ListingSnapshot,
    request: BatchGenerationRequest,
    format: AllOutputFormat
  ): Promise<GenerationOutcome> {
    try {
      const result = await this.pptxGenerator.generate(template, listing, {
        variables: request.variables,
        customizations: request.customizations,
      });

      return {
        format,
        success: true,
        result: {
          format,
          fileUrl: '',
          fileSize: result.buffer.length,
          checksum: result.checksum,
          complianceBlocksApplied: result.appliedBlocks,
        },
      };
    } catch (error) {
      return {
        format,
        success: false,
        error: error instanceof Error ? error.message : 'PPTX generation failed',
      };
    }
  }

  /**
   * Generate social crops (returns multiple outcomes)
   */
  private async generateSocialCrops(
    template: CollateralTemplate,
    listing: ListingSnapshot,
    request: BatchGenerationRequest,
    formats: SocialCropFormat[]
  ): Promise<GenerationOutcome> {
    try {
      const results = await this.imageGenerator.generateAll(template, listing, formats, {
        watermark: request.customizations?.footerText,
      });

      // Return a placeholder outcome - we'll flatten this later
      return {
        format: formats[0], // Placeholder
        success: true,
        result: undefined, // Will be expanded in flattenOutcomes
        // Store the actual results for later extraction
        _socialResults: results,
      } as GenerationOutcome & { _socialResults: Map<SocialCropFormat, unknown> };
    } catch (error) {
      // Return failure for all requested formats
      return {
        format: formats[0],
        success: false,
        error: error instanceof Error ? error.message : 'Social crop generation failed',
        _failedFormats: formats,
      } as GenerationOutcome & { _failedFormats: SocialCropFormat[] };
    }
  }

  /**
   * Flatten social crop outcomes into individual results
   */
  private flattenOutcomes(outcomes: GenerationOutcome[]): GenerationOutcome[] {
    const flattened: GenerationOutcome[] = [];

    for (const outcome of outcomes) {
      const socialResults = (outcome as GenerationOutcome & { _socialResults?: Map<SocialCropFormat, { buffer: Buffer; checksum: string; appliedBlocks: AppliedComplianceBlock[] }> })._socialResults;
      const failedFormats = (outcome as GenerationOutcome & { _failedFormats?: SocialCropFormat[] })._failedFormats;

      if (socialResults) {
        // Expand social results
        for (const [format, result] of socialResults) {
          flattened.push({
            format,
            success: true,
            result: {
              format,
              fileUrl: '',
              fileSize: result.buffer.length,
              checksum: result.checksum,
              complianceBlocksApplied: result.appliedBlocks,
            },
          });
        }
      } else if (failedFormats) {
        // Expand failed formats
        for (const format of failedFormats) {
          flattened.push({
            format,
            success: false,
            error: outcome.error,
          });
        }
      } else {
        // Regular outcome
        flattened.push(outcome);
      }
    }

    return flattened;
  }

  /**
   * Calculate deterministic input hash
   */
  calculateInputHash(
    listing: ListingSnapshot,
    template: CollateralTemplate,
    variables?: Record<string, unknown>
  ): string {
    const input = {
      listingId: listing.id,
      listingData: {
        title: listing.title,
        address: listing.address,
        rent: listing.rent,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        marketId: listing.marketId,
      },
      templateId: template.id,
      templateVersion: template.version,
      variables: variables || {},
    };

    const json = JSON.stringify(input, Object.keys(input).sort());
    return createHash('sha256').update(json).digest('hex');
  }

  /**
   * Emit batch evidence record
   */
  private async emitBatchEvidence(record: BatchEvidenceRecord): Promise<string> {
    // In production, this would call the evidence service
    // For now, we generate an ID and log
    const evidenceId = crypto.randomUUID();

    if (process.env.NODE_ENV !== 'test') {
      console.log('[BatchGenerator] Evidence:', {
        evidenceId,
        batchId: record.batchId,
        duration: `${record.totalDuration}ms`,
        completed: record.completedFormats.length,
        failed: record.failedFormats.length,
      });
    }

    return evidenceId;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let batchGeneratorInstance: BatchGenerator | null = null;

export function getBatchGenerator(): BatchGenerator {
  if (!batchGeneratorInstance) {
    batchGeneratorInstance = new BatchGenerator();
  }
  return batchGeneratorInstance;
}
