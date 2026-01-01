/**
 * Generation Evidence
 *
 * Emits evidence records for media generation events.
 * Integrates with the SOC2 evidence system.
 */

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-misused-promises */

import { createHash } from 'crypto';

import type {
  GenerationResult,
  CollateralTemplate,
  ListingSnapshot,
  AppliedComplianceBlock,
  OutputFormat,
} from '../types';

// ============================================================================
// Evidence Types
// ============================================================================

export interface GenerationEvidenceInput {
  generationId: string;
  listingId: string;
  templateId: string;
  templateVersion: string;
  format: OutputFormat;
  complianceBlocksApplied: AppliedComplianceBlock[];
  outputChecksum: string;
  listingSnapshot: Record<string, unknown>;
  marketPackId: string;
  marketPackVersion: string;
  generatedBy: string;
  generatedAt: Date;
}

export interface EvidenceRecord {
  id: string;
  controlId: string;
  eventType: string;
  timestamp: Date;
  actorId: string;
  details: Record<string, unknown>;
  inputHash: string;
  previousRecordHash?: string;
}

// ============================================================================
// Evidence Emitter
// ============================================================================

export class GenerationEvidenceEmitter {
  /**
   * Emit evidence for a generation event
   */
  async emit(input: GenerationEvidenceInput): Promise<string> {
    const evidenceRecord: EvidenceRecord = {
      id: crypto.randomUUID(),
      controlId: 'CC-6.1', // SOC2 change management control
      eventType: 'media_generation.collateral_generated',
      timestamp: input.generatedAt,
      actorId: input.generatedBy,
      details: {
        generationId: input.generationId,
        listingId: input.listingId,
        templateId: input.templateId,
        templateVersion: input.templateVersion,
        format: input.format,
        complianceBlocksApplied: input.complianceBlocksApplied,
        outputChecksum: input.outputChecksum,
        listingSnapshotHash: this.hashObject(input.listingSnapshot),
        marketPackId: input.marketPackId,
        marketPackVersion: input.marketPackVersion,
      },
      inputHash: this.hashObject({
        listingId: input.listingId,
        templateId: input.templateId,
        format: input.format,
        generatedAt: input.generatedAt.toISOString(),
      }),
    };

    // Fire-and-forget emission (async but don't await)
    this.emitAsync(evidenceRecord);

    return evidenceRecord.id;
  }

  /**
   * Create evidence input from generation result
   */
  createInput(
    result: GenerationResult,
    template: CollateralTemplate,
    listing: ListingSnapshot,
    generatedBy: string
  ): GenerationEvidenceInput {
    return {
      generationId: result.id,
      listingId: result.listingId,
      templateId: result.templateId,
      templateVersion: result.templateVersion,
      format: result.format,
      complianceBlocksApplied: result.complianceBlocksApplied,
      outputChecksum: result.checksum,
      listingSnapshot: this.createListingSnapshot(listing),
      marketPackId: result.marketId,
      marketPackVersion: result.marketPackVersion,
      generatedBy,
      generatedAt: result.generatedAt,
    };
  }

  /**
   * Hash an object for evidence
   */
  private hashObject(obj: Record<string, unknown>): string {
    const json = JSON.stringify(obj, Object.keys(obj).sort());
    return createHash('sha256').update(json).digest('hex');
  }

  /**
   * Create a frozen snapshot of listing data
   */
  private createListingSnapshot(listing: ListingSnapshot): Record<string, unknown> {
    return {
      id: listing.id,
      title: listing.title,
      address: { ...listing.address },
      rent: listing.rent,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      squareFeet: listing.squareFeet,
      availableDate: listing.availableDate?.toISOString(),
      marketId: listing.marketId,
      propertyType: listing.propertyType,
      yearBuilt: listing.yearBuilt,
      amenities: listing.amenities ? [...listing.amenities] : [],
      snapshotAt: new Date().toISOString(),
    };
  }

  /**
   * Fire-and-forget async emission
   */
  private emitAsync(record: EvidenceRecord): void {
    setImmediate(async () => {
      try {
        // In production, this would call the evidence service
        // For now, we log the record
        if (process.env.NODE_ENV !== 'test') {
          console.log('[GenerationEvidence] Emitted:', {
            id: record.id,
            controlId: record.controlId,
            eventType: record.eventType,
            timestamp: record.timestamp.toISOString(),
          });
        }

        // TODO: Call evidence service
        // await evidenceService.emit(record);
      } catch (error) {
        console.error('[GenerationEvidence] Failed to emit:', error);
      }
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let emitterInstance: GenerationEvidenceEmitter | null = null;

export function getGenerationEvidenceEmitter(): GenerationEvidenceEmitter {
  if (!emitterInstance) {
    emitterInstance = new GenerationEvidenceEmitter();
  }
  return emitterInstance;
}

// ============================================================================
// Convenience Function
// ============================================================================

export async function emitGenerationEvidence(
  result: GenerationResult,
  template: CollateralTemplate,
  listing: ListingSnapshot,
  generatedBy: string
): Promise<string> {
  const emitter = getGenerationEvidenceEmitter();
  const input = emitter.createInput(result, template, listing, generatedBy);
  return emitter.emit(input);
}
