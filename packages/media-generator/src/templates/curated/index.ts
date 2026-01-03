/**
 * Curated System Templates
 *
 * Pre-designed templates for common use cases.
 * These templates are maintained by the platform and include
 * proper compliance block placeholders.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import type { CollateralTemplate, CollateralType } from '../../types';

// ============================================================================
// Template Metadata
// ============================================================================

export interface CuratedTemplateConfig {
  id: string;
  name: string;
  description: string;
  type: CollateralType;
  filename: string;
  version: string;
  variables: string[];
  supportedMarkets: string[];
  thumbnailUrl?: string;
}

export const CURATED_TEMPLATES: CuratedTemplateConfig[] = [
  {
    id: 'modern-flyer',
    name: 'Modern Flyer',
    description: 'Clean, contemporary single-page flyer with hero image and stats grid',
    type: 'flyer',
    filename: 'modern-flyer.html',
    version: '1.0.0',
    variables: ['listing', 'agent', 'brokerage'],
    supportedMarkets: ['*'],
    thumbnailUrl: '/templates/thumbnails/modern-flyer.png',
  },
  {
    id: 'professional-brochure',
    name: 'Professional Brochure',
    description: 'Multi-page brochure with cover, details, and compliance pages',
    type: 'brochure',
    filename: 'professional-brochure.html',
    version: '1.0.0',
    variables: ['listing', 'agent', 'brokerage'],
    supportedMarkets: ['*'],
    thumbnailUrl: '/templates/thumbnails/professional-brochure.png',
  },
  {
    id: 'listing-deck',
    name: 'Listing Deck',
    description: 'Presentation-style deck with 7 slides for formal showings',
    type: 'listing_deck',
    filename: 'listing-deck.html',
    version: '1.0.0',
    variables: ['listing', 'agent', 'brokerage'],
    supportedMarkets: ['*'],
    thumbnailUrl: '/templates/thumbnails/listing-deck.png',
  },
];

// ============================================================================
// Template Loading
// ============================================================================

const templatesPath = __dirname;

/**
 * Load a curated template by ID
 */
export function loadCuratedTemplate(templateId: string): CollateralTemplate | null {
  const config = CURATED_TEMPLATES.find(t => t.id === templateId);

  if (!config) {
    return null;
  }

  const htmlContent = readFileSync(join(templatesPath, config.filename), 'utf-8');

  return {
    id: `curated-${config.id}`,
    name: config.name,
    type: config.type,
    version: config.version,
    htmlTemplate: htmlContent,
    variables: config.variables.map(v => ({
      name: v,
      type: 'object',
      required: true,
    })),
    marketPackId: '*', // Supports all markets
    isActive: true,
    source: 'system',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };
}

/**
 * Load all curated templates
 */
export function loadAllCuratedTemplates(): CollateralTemplate[] {
  return CURATED_TEMPLATES.map(config => {
    const template = loadCuratedTemplate(config.id);
    if (!template) {
      throw new Error(`Failed to load curated template: ${config.id}`);
    }
    return template;
  });
}

/**
 * Get curated templates for a specific collateral type
 */
export function getCuratedTemplatesForType(type: CollateralType): CuratedTemplateConfig[] {
  return CURATED_TEMPLATES.filter(t => t.type === type);
}

/**
 * Check if a template ID is a curated template
 */
export function isCuratedTemplate(templateId: string): boolean {
  return templateId.startsWith('curated-') ||
    CURATED_TEMPLATES.some(t => t.id === templateId);
}
