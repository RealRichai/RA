/**
 * Template Loader
 *
 * Loads default and user-uploaded templates for PDF/PPTX generation.
 */

import type { TemplateType } from '../types';
import { TemplateValidationError } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface LoadedTemplate {
  id: string;
  type: TemplateType;
  content: string;
  isDefault: boolean;
  tenantId?: string;
}

export interface TemplateLoaderDeps {
  /**
   * Read file from filesystem (for default templates)
   */
  readFile?: (path: string) => Promise<string>;
  /**
   * Vault service for user-uploaded templates
   */
  vaultService?: {
    get: (params: { tenantId: string; path: string }) => Promise<Buffer>;
  };
  /**
   * Database for template metadata
   */
  prisma?: {
    copilotTemplate: {
      findUnique: (params: { where: { id: string } }) => Promise<{
        id: string;
        type: string;
        vaultPath: string;
        validated: boolean;
        tenantId: string;
      } | null>;
    };
  };
}

export interface TemplateLoaderConfig {
  defaultTemplatesPath: string;
}

// ============================================================================
// Default Templates
// ============================================================================

const DEFAULT_FLYER_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <title>{{listing.title}}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .price { font-size: 24px; color: #2563eb; font-weight: bold; }
    .details { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 20px 0; }
    .highlights { list-style: none; padding: 0; }
    .highlights li { padding: 5px 0; border-bottom: 1px solid #eee; }
    .disclosure { font-size: 12px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
    /* COMPLIANCE_BLOCK_PLACEHOLDER */
  </style>
</head>
<body>
  <div class="header">
    <h1>{{listing.title}}</h1>
    <p class="price">\${{listing.monthlyRent}}/month</p>
  </div>
  <div class="details">
    <div><strong>Beds:</strong> {{listing.bedrooms}}</div>
    <div><strong>Baths:</strong> {{listing.bathrooms}}</div>
    <div><strong>Sq Ft:</strong> {{listing.squareFeet}}</div>
  </div>
  <p>{{listing.description}}</p>
  <h3>Highlights</h3>
  <ul class="highlights">
    {{#each listing.highlights}}
    <li>{{this}}</li>
    {{/each}}
  </ul>
  {{#if listing.disclosureText}}
  <div class="disclosure">{{listing.disclosureText}}</div>
  {{/if}}
</body>
</html>
`;

const DEFAULT_BROCHURE_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <title>{{listing.title}} - Property Brochure</title>
  <style>
    body { font-family: Georgia, serif; max-width: 900px; margin: 0 auto; padding: 40px; }
    .cover { text-align: center; page-break-after: always; padding: 100px 0; }
    .cover h1 { font-size: 36px; margin-bottom: 20px; }
    .cover .address { color: #666; font-size: 18px; }
    .section { margin: 40px 0; }
    .section h2 { border-bottom: 2px solid #333; padding-bottom: 10px; }
    .property-details { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .amenities { column-count: 2; }
    .neighborhood { background: #f5f5f5; padding: 20px; border-radius: 8px; }
    .disclosure { font-size: 11px; color: #888; margin-top: 40px; }
    /* COMPLIANCE_BLOCK_PLACEHOLDER */
  </style>
</head>
<body>
  <div class="cover">
    <h1>{{listing.title}}</h1>
    <p class="address">{{listing.address.street}}, {{listing.address.city}}, {{listing.address.state}}</p>
    <p class="price" style="font-size: 28px; color: #2563eb; margin-top: 40px;">\${{listing.monthlyRent}}/month</p>
  </div>
  <div class="section">
    <h2>Property Overview</h2>
    <p>{{listing.description}}</p>
  </div>
  <div class="section">
    <h2>Property Details</h2>
    <div class="property-details">
      <div><strong>Property Type:</strong> {{listing.propertyType}}</div>
      <div><strong>Bedrooms:</strong> {{listing.bedrooms}}</div>
      <div><strong>Bathrooms:</strong> {{listing.bathrooms}}</div>
      <div><strong>Square Feet:</strong> {{listing.squareFeet}}</div>
      <div><strong>Year Built:</strong> {{property.yearBuilt}}</div>
      <div><strong>Parking:</strong> {{property.parkingSpaces}} spaces</div>
    </div>
  </div>
  <div class="section">
    <h2>Amenities & Features</h2>
    <div class="amenities">
      {{#each listing.amenities}}
      <p>{{this}}</p>
      {{/each}}
    </div>
  </div>
  <div class="section neighborhood">
    <h2>Neighborhood</h2>
    <p><strong>Nearby Transit:</strong> {{property.nearbyTransit}}</p>
    <p>{{property.neighborhoodHighlights}}</p>
  </div>
  {{#if listing.disclosureText}}
  <div class="disclosure">{{listing.disclosureText}}</div>
  {{/if}}
</body>
</html>
`;

const DEFAULT_DECK_CONFIG = {
  slides: [
    { type: 'title', content: '{{listing.title}}' },
    { type: 'details', content: 'Property Details' },
    { type: 'amenities', content: 'Amenities & Features' },
    { type: 'photos', content: 'Photo Gallery' },
    { type: 'disclosures', content: 'Disclosures' },
  ],
};

// ============================================================================
// Template Loader Interface
// ============================================================================

export interface TemplateLoader {
  load(templateId: string | undefined, type: TemplateType, tenantId: string): Promise<LoadedTemplate>;
  loadDefault(type: TemplateType): Promise<LoadedTemplate>;
}

// ============================================================================
// Default Template Loader
// ============================================================================

export class DefaultTemplateLoader implements TemplateLoader {
  private deps: TemplateLoaderDeps;
  private config: TemplateLoaderConfig;

  constructor(deps: TemplateLoaderDeps = {}, config?: Partial<TemplateLoaderConfig>) {
    this.deps = deps;
    this.config = {
      defaultTemplatesPath: config?.defaultTemplatesPath ?? 'packages/media-generator/src/__fixtures__/templates',
    };
  }

  /**
   * Load a template by ID, falling back to default if not found.
   */
  async load(
    templateId: string | undefined,
    type: TemplateType,
    tenantId: string
  ): Promise<LoadedTemplate> {
    // If no template ID, use default
    if (!templateId) {
      return this.loadDefault(type);
    }

    // Try to load user template
    try {
      return await this.loadUserTemplate(templateId, tenantId);
    } catch {
      // Fall back to default
      return this.loadDefault(type);
    }
  }

  /**
   * Load default template for a type.
   */
  async loadDefault(type: TemplateType): Promise<LoadedTemplate> {
    let content: string;

    switch (type) {
      case 'flyer':
        content = DEFAULT_FLYER_TEMPLATE;
        break;
      case 'brochure':
        content = DEFAULT_BROCHURE_TEMPLATE;
        break;
      case 'broker_deck':
        content = JSON.stringify(DEFAULT_DECK_CONFIG);
        break;
      default:
        throw new TemplateValidationError(`Unknown template type: ${type}`);
    }

    return {
      id: `default-${type}`,
      type,
      content,
      isDefault: true,
    };
  }

  /**
   * Load user-uploaded template.
   */
  private async loadUserTemplate(templateId: string, tenantId: string): Promise<LoadedTemplate> {
    if (!this.deps.prisma || !this.deps.vaultService) {
      throw new TemplateValidationError('Database and vault required for user templates');
    }

    // Get template metadata
    const template = await this.deps.prisma.copilotTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new TemplateValidationError(`Template not found: ${templateId}`);
    }

    // Verify tenant ownership
    if (template.tenantId !== tenantId) {
      throw new TemplateValidationError('Template access denied');
    }

    // Check validation status
    if (!template.validated) {
      throw new TemplateValidationError('Template has not been validated');
    }

    // Load from vault
    const buffer = await this.deps.vaultService.get({
      tenantId,
      path: template.vaultPath,
    });

    return {
      id: template.id,
      type: template.type as TemplateType,
      content: buffer.toString('utf-8'),
      isDefault: false,
      tenantId,
    };
  }
}
