/**
 * Artifact Orchestrator
 *
 * Coordinates PDF and PPTX generation using the media-generator package,
 * and stores artifacts in the document vault.
 */

import { createHash, randomUUID } from 'crypto';

import type {
  ListingDraft,
  PropertyFacts,
  OptimizedListingCopy,
  ArtifactRef,
  GeneratedArtifacts,
} from '../types';
import { ArtifactGenerationError } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface ArtifactOrchestratorConfig {
  artifactsBucket: string;
  evidenceEnabled: boolean;
}

export interface ArtifactOrchestratorDeps {
  /**
   * PDF generator from @realriches/media-generator
   */
  pdfGenerator: {
    generate: (data: Record<string, unknown>, template: string) => Promise<Buffer>;
  };
  /**
   * PPTX generator from @realriches/media-generator
   */
  pptxGenerator: {
    generate: (data: Record<string, unknown>) => Promise<Buffer>;
  };
  /**
   * Document storage service
   */
  vaultService: {
    store: (params: {
      tenantId: string;
      bucket: string;
      path: string;
      data: Buffer;
      contentType: string;
    }) => Promise<{ vaultPath: string }>;
  };
  /**
   * Evidence emitter
   */
  emitEvidence?: (record: {
    controlId: string;
    action: string;
    entityType: string;
    entityId: string;
    details: Record<string, unknown>;
  }) => Promise<string>;
}

export interface ArtifactInput {
  listingDraft: ListingDraft;
  propertyFacts: PropertyFacts;
  optimizedCopy: OptimizedListingCopy;
  marketId: string;
  tenantId: string;
  templates: {
    flyer?: string;
    brochure?: string;
    deck?: string;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildTemplateData(input: ArtifactInput): Record<string, unknown> {
  const { listingDraft, propertyFacts, optimizedCopy } = input;

  return {
    listing: {
      title: optimizedCopy.title,
      description: optimizedCopy.description,
      highlights: optimizedCopy.highlights,
      seoKeywords: optimizedCopy.seoKeywords,
      disclosureText: optimizedCopy.disclosureText,
      propertyType: listingDraft.propertyType,
      bedrooms: listingDraft.bedrooms,
      bathrooms: listingDraft.bathrooms,
      squareFeet: listingDraft.squareFeet,
      monthlyRent: listingDraft.monthlyRent,
      address: listingDraft.address,
      amenities: listingDraft.amenities,
      images: listingDraft.images,
      hasBrokerFee: listingDraft.hasBrokerFee,
      brokerFeeAmount: listingDraft.brokerFeeAmount,
      brokerFeePaidBy: listingDraft.brokerFeePaidBy,
    },
    property: {
      yearBuilt: propertyFacts.yearBuilt,
      lotSize: propertyFacts.lotSize,
      parkingSpaces: propertyFacts.parkingSpaces,
      heatingType: propertyFacts.heatingType,
      coolingType: propertyFacts.coolingType,
      laundryType: propertyFacts.laundryType,
      petPolicy: propertyFacts.petPolicy,
      utilities: propertyFacts.utilities,
      nearbyTransit: propertyFacts.nearbyTransit,
      neighborhoodHighlights: propertyFacts.neighborhoodHighlights,
      securityDeposit: propertyFacts.securityDeposit,
      leaseTermMonths: propertyFacts.leaseTermMonths,
      availableDate: propertyFacts.availableDate,
    },
    market: {
      id: input.marketId,
    },
    generatedAt: new Date().toISOString(),
  };
}

function computeChecksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// ============================================================================
// Artifact Orchestrator Class
// ============================================================================

export class ArtifactOrchestrator {
  private config: ArtifactOrchestratorConfig;
  private deps: ArtifactOrchestratorDeps;

  constructor(deps: ArtifactOrchestratorDeps, config?: Partial<ArtifactOrchestratorConfig>) {
    this.deps = deps;
    this.config = {
      artifactsBucket: config?.artifactsBucket ?? 'copilot-artifacts',
      evidenceEnabled: config?.evidenceEnabled ?? true,
    };
  }

  /**
   * Generate all artifacts (flyer PDF, brochure PDF, broker deck PPTX).
   */
  async generateAll(input: ArtifactInput): Promise<GeneratedArtifacts> {
    const templateData = buildTemplateData(input);
    const artifacts: GeneratedArtifacts = {};

    // Generate flyer PDF
    if (input.templates.flyer) {
      artifacts.flyerPdf = await this.generateAndStore(
        input,
        templateData,
        'flyer_pdf',
        input.templates.flyer,
        'application/pdf'
      );
    }

    // Generate brochure PDF
    if (input.templates.brochure) {
      artifacts.brochurePdf = await this.generateAndStore(
        input,
        templateData,
        'brochure_pdf',
        input.templates.brochure,
        'application/pdf'
      );
    }

    // Generate broker deck PPTX
    if (input.templates.deck) {
      artifacts.brokerDeckPptx = await this.generatePptxAndStore(
        input,
        templateData
      );
    }

    return artifacts;
  }

  /**
   * Generate a single PDF artifact.
   */
  async generatePdf(
    input: ArtifactInput,
    type: 'flyer_pdf' | 'brochure_pdf',
    template: string
  ): Promise<ArtifactRef> {
    const templateData = buildTemplateData(input);
    return this.generateAndStore(input, templateData, type, template, 'application/pdf');
  }

  /**
   * Generate broker deck PPTX.
   */
  async generatePptx(input: ArtifactInput): Promise<ArtifactRef> {
    const templateData = buildTemplateData(input);
    return this.generatePptxAndStore(input, templateData);
  }

  private async generateAndStore(
    input: ArtifactInput,
    templateData: Record<string, unknown>,
    type: 'flyer_pdf' | 'brochure_pdf',
    template: string,
    contentType: string
  ): Promise<ArtifactRef> {
    const id = randomUUID();
    const timestamp = new Date();

    try {
      // Generate the PDF
      const buffer = await this.deps.pdfGenerator.generate(templateData, template);
      const checksum = computeChecksum(buffer);
      const extension = contentType === 'application/pdf' ? 'pdf' : 'bin';
      const path = `${input.tenantId}/${type}/${id}.${extension}`;

      // Store in vault
      const { vaultPath } = await this.deps.vaultService.store({
        tenantId: input.tenantId,
        bucket: this.config.artifactsBucket,
        path,
        data: buffer,
        contentType,
      });

      // Emit evidence
      let evidenceId = '';
      if (this.config.evidenceEnabled && this.deps.emitEvidence) {
        evidenceId = await this.deps.emitEvidence({
          controlId: 'CC7.3',
          action: 'artifact_generated',
          entityType: 'copilot_artifact',
          entityId: id,
          details: {
            type,
            checksum,
            sizeBytes: buffer.length,
            tenantId: input.tenantId,
            marketId: input.marketId,
          },
        });
      }

      return {
        id,
        type,
        vaultPath,
        contentType,
        checksum,
        sizeBytes: buffer.length,
        generatedAt: timestamp,
        evidenceId,
      };
    } catch (error) {
      throw new ArtifactGenerationError(
        `Failed to generate ${type}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { type, tenantId: input.tenantId }
      );
    }
  }

  private async generatePptxAndStore(
    input: ArtifactInput,
    templateData: Record<string, unknown>
  ): Promise<ArtifactRef> {
    const id = randomUUID();
    const timestamp = new Date();
    const type = 'broker_deck_pptx' as const;
    const contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

    try {
      // Generate the PPTX
      const buffer = await this.deps.pptxGenerator.generate(templateData);
      const checksum = computeChecksum(buffer);
      const path = `${input.tenantId}/${type}/${id}.pptx`;

      // Store in vault
      const { vaultPath } = await this.deps.vaultService.store({
        tenantId: input.tenantId,
        bucket: this.config.artifactsBucket,
        path,
        data: buffer,
        contentType,
      });

      // Emit evidence
      let evidenceId = '';
      if (this.config.evidenceEnabled && this.deps.emitEvidence) {
        evidenceId = await this.deps.emitEvidence({
          controlId: 'CC7.3',
          action: 'artifact_generated',
          entityType: 'copilot_artifact',
          entityId: id,
          details: {
            type,
            checksum,
            sizeBytes: buffer.length,
            tenantId: input.tenantId,
            marketId: input.marketId,
          },
        });
      }

      return {
        id,
        type,
        vaultPath,
        contentType,
        checksum,
        sizeBytes: buffer.length,
        generatedAt: timestamp,
        evidenceId,
      };
    } catch (error) {
      throw new ArtifactGenerationError(
        `Failed to generate PPTX: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { type, tenantId: input.tenantId }
      );
    }
  }
}
