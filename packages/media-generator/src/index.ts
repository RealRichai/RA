/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/restrict-template-expressions */

/**
 * Media Generator Package
 *
 * Real-estate media generation with compliance locks for PDF and PPTX collateral.
 *
 * @example
 * ```typescript
 * import {
 *   generateCollateral,
 *   validateTemplate,
 *   getBlockRegistry,
 * } from '@realriches/media-generator';
 *
 * // Generate PDF from listing
 * const result = await generateCollateral(template, listing, {
 *   format: 'pdf',
 *   variables: { agentName: 'John Smith' },
 * });
 *
 * // Validate template has required compliance blocks
 * const validation = validateTemplate(template, 'NYC_STRICT');
 * if (!validation.valid) {
 *   console.error('Missing blocks:', validation.errors);
 * }
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  CollateralType,
  OutputFormat,
  TemplateSource,
  TemplateVariable,
  CollateralTemplate,
  PptxSlideConfig,
  PptxTemplateConfig,
  BlockPosition,
  ComplianceBlockType,
  ComplianceBlock,
  AppliedComplianceBlock,
  GenerateCollateralRequest,
  CollateralCustomizations,
  GenerationResult,
  TemplateValidationError,
  TemplateValidationWarning,
  TemplateValidationResult,
  ListingSnapshot,
} from './types';

export {
  CollateralTypeSchema,
  OutputFormatSchema,
  TemplateVariableSchema,
  CollateralTemplateSchema,
  ComplianceBlockSchema,
  GenerateCollateralRequestSchema,
  GenerationResultSchema,
} from './types';

// ============================================================================
// Compliance Blocks
// ============================================================================

export {
  NYC_COMPLIANCE_BLOCKS,
  DEFAULT_COMPLIANCE_BLOCKS,
  MARKET_COMPLIANCE_BLOCKS,
  getMarketBlocks,
  getRequiredBlocksForType,
  getNonRemovableBlocks,
  isBlockRequired,
  getBlockById,
  sortBlocksByPriority,
  groupBlocksByPosition,
} from './compliance-blocks';

// ============================================================================
// Block Registry
// ============================================================================

export {
  BlockRegistry,
  getBlockRegistry,
} from './block-registry';

export type {
  BlockRequirement,
  BlockRequirementCheck,
} from './block-registry';

// ============================================================================
// Template Validator
// ============================================================================

export {
  TemplateValidator,
  getTemplateValidator,
  validateTemplate,
  canSaveTemplate,
} from './template-validator';

export type {
  TemplateValidationOptions,
} from './template-validator';

// ============================================================================
// Renderers
// ============================================================================

export {
  HtmlRenderer,
  getHtmlRenderer,
  renderHtml,
} from './renderers/html-renderer';

export type {
  RenderContext,
} from './renderers/html-renderer';

export {
  BlockInjector,
  getBlockInjector,
  injectComplianceBlocks,
} from './renderers/block-injector';

export type {
  InjectionResult,
} from './renderers/block-injector';

// ============================================================================
// Generators
// ============================================================================

export {
  PdfGenerator,
  getPdfGenerator,
  generatePdf,
} from './generators/pdf-generator';

export type {
  PdfGenerationOptions,
  PdfGenerationResult,
} from './generators/pdf-generator';

export {
  PptxGenerator,
  getPptxGenerator,
  generatePptx,
} from './generators/pptx-generator';

export type {
  PptxGenerationOptions,
  PptxGenerationResult,
} from './generators/pptx-generator';

// ============================================================================
// Evidence
// ============================================================================

export {
  GenerationEvidenceEmitter,
  getGenerationEvidenceEmitter,
  emitGenerationEvidence,
} from './evidence/generation-evidence';

export type {
  GenerationEvidenceInput,
  EvidenceRecord,
} from './evidence/generation-evidence';

// ============================================================================
// Main Generation Function
// ============================================================================

import { emitGenerationEvidence } from './evidence/generation-evidence';
import { generatePdf } from './generators/pdf-generator';
import { generatePptx } from './generators/pptx-generator';
import { validateTemplate } from './template-validator';
import type {
  CollateralTemplate,
  ListingSnapshot,
  OutputFormat,
  GenerationResult,
  CollateralCustomizations,
} from './types';

export interface GenerateCollateralOptions {
  format: OutputFormat;
  variables?: Record<string, unknown>;
  customizations?: CollateralCustomizations;
  userId: string;
  marketPackVersion?: string;
}

/**
 * Generate collateral from a template and listing
 *
 * This is the main entry point for generating PDF or PPTX collateral.
 * It handles:
 * - Template validation (ensures required compliance blocks)
 * - Variable interpolation
 * - Compliance block injection
 * - Output generation (PDF or PPTX)
 * - Evidence emission for SOC2 compliance
 */
export async function generateCollateral(
  template: CollateralTemplate,
  listing: ListingSnapshot,
  options: GenerateCollateralOptions
): Promise<GenerationResult> {
  // 1. Validate template
  const validation = validateTemplate(template, listing.marketId);
  if (!validation.valid) {
    const errorMessages = validation.errors.map((e) => e.message).join('; ');
    throw new Error(`Template validation failed: ${errorMessages}`);
  }

  // 2. Generate based on format
  let buffer: Buffer;
  let checksum: string;
  let mimeType: string;
  let appliedBlocks: GenerationResult['complianceBlocksApplied'];

  if (options.format === 'pdf') {
    const result = await generatePdf(template, listing, {
      variables: options.variables,
      customizations: options.customizations,
    });
    buffer = result.buffer;
    checksum = result.checksum;
    mimeType = result.mimeType;
    appliedBlocks = result.appliedBlocks;
  } else if (options.format === 'pptx') {
    const result = await generatePptx(template, listing, {
      variables: options.variables,
      customizations: options.customizations,
    });
    buffer = result.buffer;
    checksum = result.checksum;
    mimeType = result.mimeType;
    appliedBlocks = result.appliedBlocks;
  } else {
    throw new Error(`Unsupported format: ${options.format}`);
  }

  // 3. Create generation result
  const generationId = crypto.randomUUID();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${template.name.replace(/[^a-zA-Z0-9]/g, '_')}_${listing.id}_${timestamp}.${options.format}`;

  const result: GenerationResult = {
    id: generationId,
    listingId: listing.id,
    templateId: template.id,
    templateVersion: template.version,
    format: options.format,
    fileUrl: '', // Will be set after storage
    fileSize: buffer.length,
    checksum,
    complianceBlocksApplied: appliedBlocks,
    listingSnapshot: {
      id: listing.id,
      title: listing.title,
      address: listing.address,
      rent: listing.rent,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      marketId: listing.marketId,
    },
    marketId: listing.marketId,
    marketPackVersion: options.marketPackVersion ?? '1.0.0',
    generatedBy: options.userId,
    generatedAt: new Date(),
  };

  // 4. Emit evidence (fire-and-forget)
  const evidenceId = await emitGenerationEvidence(result, template, listing, options.userId);
  result.evidenceRecordId = evidenceId;

  // Note: The caller is responsible for storing the buffer and updating fileUrl

  return result;
}

/**
 * Get the generated buffer for a collateral
 *
 * This is a convenience function that generates the buffer without
 * the full result metadata. Useful for preview generation.
 */
export async function generateCollateralBuffer(
  template: CollateralTemplate,
  listing: ListingSnapshot,
  format: OutputFormat,
  options?: {
    variables?: Record<string, unknown>;
    customizations?: CollateralCustomizations;
  }
): Promise<{ buffer: Buffer; mimeType: string; checksum: string }> {
  if (format === 'pdf') {
    const result = await generatePdf(template, listing, options);
    return { buffer: result.buffer, mimeType: result.mimeType, checksum: result.checksum };
  } else if (format === 'pptx') {
    const result = await generatePptx(template, listing, options);
    return { buffer: result.buffer, mimeType: result.mimeType, checksum: result.checksum };
  }
  throw new Error(`Unsupported format: ${format}`);
}
