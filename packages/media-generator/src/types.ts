/**
 * Media Generator Types
 *
 * Core types for real-estate collateral generation with compliance locks.
 */

import { z } from 'zod';

// ============================================================================
// Collateral Types
// ============================================================================

export const CollateralType = {
  FLYER: 'flyer',
  BROCHURE: 'brochure',
  LISTING_DECK: 'listing_deck',
} as const;

export type CollateralType = (typeof CollateralType)[keyof typeof CollateralType];

export const CollateralTypeSchema = z.enum(['flyer', 'brochure', 'listing_deck']);

// ============================================================================
// Output Formats
// ============================================================================

export const OutputFormat = {
  PDF: 'pdf',
  PPTX: 'pptx',
} as const;

export type OutputFormat = (typeof OutputFormat)[keyof typeof OutputFormat];

export const OutputFormatSchema = z.enum(['pdf', 'pptx']);

// ============================================================================
// Social Crop Formats
// ============================================================================

export const SocialCropFormat = {
  INSTAGRAM_SQUARE: 'instagram_square',
  INSTAGRAM_STORY: 'instagram_story',
  FACEBOOK_POST: 'facebook_post',
  TWITTER_POST: 'twitter_post',
  LINKEDIN_POST: 'linkedin_post',
  PINTEREST_PIN: 'pinterest_pin',
  TIKTOK_VIDEO: 'tiktok_video',
} as const;

export type SocialCropFormat = (typeof SocialCropFormat)[keyof typeof SocialCropFormat];

export const SocialCropFormatSchema = z.enum([
  'instagram_square',
  'instagram_story',
  'facebook_post',
  'twitter_post',
  'linkedin_post',
  'pinterest_pin',
  'tiktok_video',
]);

export const SocialCropDimensions: Record<SocialCropFormat, { width: number; height: number }> = {
  instagram_square: { width: 1080, height: 1080 },
  instagram_story: { width: 1080, height: 1920 },
  facebook_post: { width: 1200, height: 630 },
  twitter_post: { width: 1200, height: 675 },
  linkedin_post: { width: 1200, height: 627 },
  pinterest_pin: { width: 1000, height: 1500 },
  tiktok_video: { width: 1080, height: 1920 },
};

// Combined format type for batch generation
export type AllOutputFormat = OutputFormat | SocialCropFormat;

export const AllOutputFormatSchema = z.union([OutputFormatSchema, SocialCropFormatSchema]);

// ============================================================================
// Template Source
// ============================================================================

export const TemplateSource = {
  SYSTEM: 'system',
  USER: 'user',
} as const;

export type TemplateSource = (typeof TemplateSource)[keyof typeof TemplateSource];

// ============================================================================
// Template Variable
// ============================================================================

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'currency' | 'image';
  required: boolean;
  defaultValue?: unknown;
  description?: string;
}

export const TemplateVariableSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'date', 'currency', 'image']),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
  description: z.string().optional(),
});

// ============================================================================
// Collateral Template
// ============================================================================

export interface CollateralTemplate {
  id: string;
  name: string;
  type: CollateralType;
  source: TemplateSource;
  version: string;
  htmlTemplate: string;
  pptxTemplate?: PptxTemplateConfig;
  variables: TemplateVariable[];
  requiredComplianceBlocks: string[];
  supportedFormats: OutputFormat[];
  marketId?: string;
  isActive: boolean;
  isSystem: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export const CollateralTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: CollateralTypeSchema,
  source: z.enum(['system', 'user']),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  htmlTemplate: z.string(),
  pptxTemplate: z.unknown().optional(),
  variables: z.array(TemplateVariableSchema),
  requiredComplianceBlocks: z.array(z.string()),
  supportedFormats: z.array(OutputFormatSchema),
  marketId: z.string().optional(),
  isActive: z.boolean(),
  isSystem: z.boolean(),
  createdBy: z.string().uuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ============================================================================
// PPTX Template Configuration
// ============================================================================

export interface PptxSlideConfig {
  type: 'title' | 'details' | 'amenities' | 'photos' | 'disclosures' | 'custom';
  title?: string;
  content?: string;
  variables?: string[];
  imageVariables?: string[];
}

export interface PptxTemplateConfig {
  slides: PptxSlideConfig[];
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
    logoUrl?: string;
    fontFamily?: string;
  };
}

// ============================================================================
// Compliance Block Position
// ============================================================================

export const BlockPosition = {
  HEADER: 'header',
  FOOTER: 'footer',
  SIDEBAR: 'sidebar',
  INLINE: 'inline',
  DEDICATED_PAGE: 'dedicated_page',
  DEDICATED_SLIDE: 'dedicated_slide',
} as const;

export type BlockPosition = (typeof BlockPosition)[keyof typeof BlockPosition];

// ============================================================================
// Compliance Block Type
// ============================================================================

export const ComplianceBlockType = {
  FARE_ACT_DISCLOSURE: 'fare_act_disclosure',
  FARE_FEE_DISCLOSURE: 'fare_fee_disclosure',
  LEAD_PAINT_DISCLOSURE: 'lead_paint_disclosure',
  BEDBUG_DISCLOSURE: 'bedbug_disclosure',
  RENT_STABILIZATION: 'rent_stabilization',
  FAIR_HOUSING: 'fair_housing',
  ADA_ACCESSIBILITY: 'ada_accessibility',
} as const;

export type ComplianceBlockType = (typeof ComplianceBlockType)[keyof typeof ComplianceBlockType];

// ============================================================================
// Compliance Block
// ============================================================================

export interface ComplianceBlock {
  id: string;
  type: ComplianceBlockType;
  marketPackId: string;
  requiredFor: CollateralType[];
  position: BlockPosition;
  priority: number;
  isRemovable: boolean;
  htmlContent: string;
  pptxContent?: string;
  version: string;
  effectiveDate: Date;
  expirationDate?: Date;
}

export const ComplianceBlockSchema = z.object({
  id: z.string(),
  type: z.string(),
  marketPackId: z.string(),
  requiredFor: z.array(CollateralTypeSchema),
  position: z.enum(['header', 'footer', 'sidebar', 'inline', 'dedicated_page', 'dedicated_slide']),
  priority: z.number().int().min(0).max(1000),
  isRemovable: z.boolean(),
  htmlContent: z.string(),
  pptxContent: z.string().optional(),
  version: z.string(),
  effectiveDate: z.coerce.date(),
  expirationDate: z.coerce.date().optional(),
});

// ============================================================================
// Applied Compliance Block (for evidence)
// ============================================================================

export interface AppliedComplianceBlock {
  blockId: string;
  blockType: ComplianceBlockType;
  version: string;
  position: BlockPosition;
}

// ============================================================================
// Generation Request
// ============================================================================

export interface GenerateCollateralRequest {
  listingId: string;
  templateId: string;
  format: OutputFormat;
  variables?: Record<string, unknown>;
  customizations?: CollateralCustomizations;
}

export const GenerateCollateralRequestSchema = z.object({
  listingId: z.string().uuid(),
  templateId: z.string().uuid(),
  format: OutputFormatSchema,
  variables: z.record(z.unknown()).optional(),
  customizations: z.object({
    colorScheme: z.string().optional(),
    logoUrl: z.string().url().optional(),
    footerText: z.string().optional(),
  }).optional(),
});

// ============================================================================
// Customizations
// ============================================================================

export interface CollateralCustomizations {
  colorScheme?: string;
  logoUrl?: string;
  footerText?: string;
}

// ============================================================================
// Generation Result
// ============================================================================

export interface GenerationResult {
  id: string;
  listingId: string;
  templateId: string;
  templateVersion: string;
  format: OutputFormat;
  fileUrl: string;
  fileSize: number;
  checksum: string;
  complianceBlocksApplied: AppliedComplianceBlock[];
  listingSnapshot: Record<string, unknown>;
  marketId: string;
  marketPackVersion: string;
  evidenceRecordId?: string;
  generatedBy: string;
  generatedAt: Date;
}

export const GenerationResultSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  templateId: z.string().uuid(),
  templateVersion: z.string(),
  format: OutputFormatSchema,
  fileUrl: z.string().url(),
  fileSize: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  complianceBlocksApplied: z.array(z.object({
    blockId: z.string(),
    blockType: z.string(),
    version: z.string(),
    position: z.string(),
  })),
  listingSnapshot: z.record(z.unknown()),
  marketId: z.string(),
  marketPackVersion: z.string(),
  evidenceRecordId: z.string().uuid().optional(),
  generatedBy: z.string().uuid(),
  generatedAt: z.coerce.date(),
});

// ============================================================================
// Template Validation
// ============================================================================

export interface TemplateValidationError {
  code: 'COMPLIANCE_BLOCK_MISSING' | 'COMPLIANCE_BLOCK_REMOVED' | 'INVALID_HTML' | 'INVALID_VARIABLE';
  message: string;
  blockId?: string;
  field?: string;
}

export interface TemplateValidationWarning {
  code: 'MISSING_INJECTION_POINT' | 'DEPRECATED_BLOCK' | 'VARIABLE_UNUSED';
  message: string;
  details?: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: TemplateValidationError[];
  warnings: TemplateValidationWarning[];
}

// ============================================================================
// Listing Snapshot (minimal fields needed for generation)
// ============================================================================

export interface ListingSnapshot {
  id: string;
  title: string;
  address: {
    street: string;
    unit?: string;
    city: string;
    state: string;
    zip: string;
  };
  rent: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number;
  availableDate?: Date;
  description?: string;
  amenities?: string[];
  photos?: string[];
  marketId: string;
  propertyType?: string;
  yearBuilt?: number;
  petPolicy?: string;
  utilities?: string[];
  parkingSpaces?: number;
}

// ============================================================================
// Batch Generation Types
// ============================================================================

export interface BatchGenerationRequest {
  listingId: string;
  templateId: string;
  formats: AllOutputFormat[];
  variables?: Record<string, unknown>;
  customizations?: CollateralCustomizations;
  userId: string;
}

export const BatchGenerationRequestSchema = z.object({
  listingId: z.string().uuid(),
  templateId: z.string().uuid(),
  formats: z.array(AllOutputFormatSchema).min(1),
  variables: z.record(z.unknown()).optional(),
  customizations: z.object({
    colorScheme: z.string().optional(),
    logoUrl: z.string().url().optional(),
    footerText: z.string().optional(),
  }).optional(),
  userId: z.string().uuid(),
});

export interface BatchGenerationResult {
  batchId: string;
  status: 'completed' | 'partial_failure' | 'failed';
  duration: number;
  inputHash: string;
  results: Map<AllOutputFormat, SingleGenerationResult>;
  failures: Array<{ format: AllOutputFormat; error: string }>;
  evidenceRecordId: string;
}

export interface SingleGenerationResult {
  format: AllOutputFormat;
  fileUrl: string;
  fileSize: number;
  checksum: string;
  complianceBlocksApplied: AppliedComplianceBlock[];
}

// ============================================================================
// Image Generation Types (Social Crops)
// ============================================================================

export interface ImageGenerationOptions {
  quality?: number; // 1-100, default 90
  watermark?: string;
  includeComplianceFooter?: boolean;
  complianceFooterHeight?: number;
}

export interface ImageGenerationResult {
  buffer: Buffer;
  checksum: string;
  format: SocialCropFormat;
  width: number;
  height: number;
  mimeType: 'image/png' | 'image/jpeg';
  appliedBlocks: AppliedComplianceBlock[];
}

export interface SocialCropLayout {
  photoAreaPercent: number;
  textPosition: 'top' | 'bottom' | 'overlay';
  includeComplianceFooter: boolean;
  complianceFooterHeight: number;
  fontSize: {
    title: number;
    price: number;
    details: number;
  };
}

export const DefaultSocialCropLayout: SocialCropLayout = {
  photoAreaPercent: 75,
  textPosition: 'bottom',
  includeComplianceFooter: true,
  complianceFooterHeight: 60,
  fontSize: {
    title: 32,
    price: 48,
    details: 24,
  },
};
