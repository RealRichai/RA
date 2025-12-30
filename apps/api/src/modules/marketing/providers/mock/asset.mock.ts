/**
 * Mock Asset Generation Provider
 *
 * Simulates marketing asset generation (flyers, brochures, etc.).
 * In production, would use:
 * - Puppeteer/Playwright for HTML to PDF
 * - Canvas API for image manipulation
 * - Template rendering engines
 */

import { generatePrefixedId } from '@realriches/utils';

import type {
  IAssetGenerationProvider,
  ProviderResult,
  AssetTemplate,
  AssetGenerationRequest,
  GeneratedAsset,
  AssetType,
} from '../provider.types';

// =============================================================================
// Mock Templates
// =============================================================================

const MOCK_TEMPLATES: AssetTemplate[] = [
  {
    id: 'tpl_flyer_modern',
    name: 'Modern Flyer',
    type: 'flyer',
    thumbnailUrl: 'https://templates.example.com/flyer-modern-thumb.jpg',
    htmlTemplate: `
      <div class="flyer modern">
        <img src="{{heroImage}}" class="hero" />
        <h1>{{title}}</h1>
        <p class="price">{{price}}</p>
        <p class="address">{{address}}</p>
        <div class="features">
          <span>{{bedrooms}} BR</span>
          <span>{{bathrooms}} BA</span>
          <span>{{squareFeet}} sq ft</span>
        </div>
      </div>
    `,
    cssStyles: '.flyer.modern { font-family: Inter, sans-serif; }',
    variables: ['heroImage', 'title', 'price', 'address', 'bedrooms', 'bathrooms', 'squareFeet'],
  },
  {
    id: 'tpl_flyer_luxury',
    name: 'Luxury Flyer',
    type: 'flyer',
    thumbnailUrl: 'https://templates.example.com/flyer-luxury-thumb.jpg',
    htmlTemplate: '<div class="flyer luxury">...</div>',
    cssStyles: '.flyer.luxury { font-family: Playfair Display, serif; }',
    variables: ['heroImage', 'title', 'price', 'address', 'bedrooms', 'bathrooms', 'squareFeet'],
  },
  {
    id: 'tpl_brochure_standard',
    name: 'Standard Brochure',
    type: 'brochure',
    thumbnailUrl: 'https://templates.example.com/brochure-standard-thumb.jpg',
    htmlTemplate: '<div class="brochure standard">...</div>',
    cssStyles: '.brochure.standard { }',
    variables: ['heroImage', 'title', 'price', 'address', 'description', 'features', 'images'],
  },
  {
    id: 'tpl_social_instagram',
    name: 'Instagram Post',
    type: 'social_post',
    thumbnailUrl: 'https://templates.example.com/social-instagram-thumb.jpg',
    htmlTemplate: '<div class="social instagram">...</div>',
    cssStyles: '.social.instagram { width: 1080px; height: 1080px; }',
    variables: ['heroImage', 'title', 'price', 'address'],
  },
  {
    id: 'tpl_social_facebook',
    name: 'Facebook Post',
    type: 'social_post',
    thumbnailUrl: 'https://templates.example.com/social-facebook-thumb.jpg',
    htmlTemplate: '<div class="social facebook">...</div>',
    cssStyles: '.social.facebook { width: 1200px; height: 630px; }',
    variables: ['heroImage', 'title', 'price', 'address'],
  },
  {
    id: 'tpl_email_listing',
    name: 'Listing Email',
    type: 'email',
    thumbnailUrl: 'https://templates.example.com/email-listing-thumb.jpg',
    htmlTemplate: '<div class="email listing">...</div>',
    cssStyles: '.email.listing { max-width: 600px; }',
    variables: ['heroImage', 'title', 'price', 'address', 'description', 'agentName', 'agentPhone'],
  },
  {
    id: 'tpl_deck_property',
    name: 'Property Deck',
    type: 'deck',
    thumbnailUrl: 'https://templates.example.com/deck-property-thumb.jpg',
    htmlTemplate: '<div class="deck property">...</div>',
    cssStyles: '.deck.property { }',
    variables: ['heroImage', 'title', 'price', 'address', 'description', 'features', 'images', 'floorPlan'],
  },
];

// =============================================================================
// Mock Asset Generation Provider
// =============================================================================

class MockAssetGenerationProvider implements IAssetGenerationProvider {
  providerId = 'mock-asset';

  private createMeta() {
    return {
      provider: this.providerId,
      requestId: generatePrefixedId('req'),
      isMock: true,
      timestamp: new Date(),
    };
  }

  async getTemplates(type?: AssetType): Promise<ProviderResult<AssetTemplate[]>> {
    let templates = MOCK_TEMPLATES;

    if (type) {
      templates = templates.filter((t) => t.type === type);
    }

    return {
      success: true,
      data: templates,
      meta: this.createMeta(),
    };
  }

  async generateAsset(request: AssetGenerationRequest): Promise<ProviderResult<GeneratedAsset>> {
    // Find template
    const template = request.templateId
      ? MOCK_TEMPLATES.find((t) => t.id === request.templateId)
      : MOCK_TEMPLATES.find((t) => t.type === request.type);

    if (!template) {
      return {
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: `No template found for type ${request.type}`,
        },
        meta: this.createMeta(),
      };
    }

    // Validate required listing data
    if (!request.listingData.title || !request.listingData.address) {
      return {
        success: false,
        error: {
          code: 'MISSING_LISTING_DATA',
          message: 'Listing title and address are required',
        },
        meta: this.createMeta(),
      };
    }

    // Generate mock asset
    const assetId = generatePrefixedId('ast');
    const mimeType = request.outputFormat === 'pdf' ? 'application/pdf' : `image/${request.outputFormat}`;
    const extension = request.outputFormat;

    const asset: GeneratedAsset = {
      id: assetId,
      type: request.type,
      fileUrl: `https://storage.example.com/marketing/${assetId}.${extension}`,
      thumbnailUrl: `https://storage.example.com/marketing/${assetId}-thumb.jpg`,
      fileSize: this.estimateFileSize(request.type, request.outputFormat),
      mimeType,
      generatedAt: new Date(),
    };

    return {
      success: true,
      data: asset,
      meta: this.createMeta(),
    };
  }

  async getGenerationStatus(jobId: string): Promise<ProviderResult<{ status: string; url?: string }>> {
    // For mock, generation is synchronous, so always return completed
    return {
      success: true,
      data: {
        status: 'completed',
        url: `https://storage.example.com/marketing/${jobId}.pdf`,
      },
      meta: this.createMeta(),
    };
  }

  private estimateFileSize(type: AssetType, format: string): number {
    const baseSize: Record<AssetType, number> = {
      flyer: 500_000, // 500KB
      brochure: 2_000_000, // 2MB
      social_post: 300_000, // 300KB
      email: 100_000, // 100KB
      video: 50_000_000, // 50MB
      deck: 5_000_000, // 5MB
    };

    const formatMultiplier: Record<string, number> = {
      pdf: 1,
      png: 1.5,
      jpg: 0.7,
    };

    return Math.floor(baseSize[type] * (formatMultiplier[format] || 1));
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

let mockAssetProvider: MockAssetGenerationProvider | null = null;

export function getMockAssetProvider(): IAssetGenerationProvider {
  if (!mockAssetProvider) {
    mockAssetProvider = new MockAssetGenerationProvider();
  }
  return mockAssetProvider;
}
