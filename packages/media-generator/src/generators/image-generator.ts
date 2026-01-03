/**
 * Image Generator (Social Crops)
 *
 * Generates social media crop images from listing data using sharp.
 * Supports multiple formats: Instagram, Facebook, Twitter, LinkedIn, Pinterest, TikTok.
 */

import { createHash } from 'crypto';

import { getBlockInjector } from '../renderers/block-injector';
import type {
  CollateralTemplate,
  ListingSnapshot,
  AppliedComplianceBlock,
  SocialCropFormat,
  ImageGenerationResult,
  ImageGenerationOptions,
  SocialCropLayout,
} from '../types';
import { SocialCropDimensions, DefaultSocialCropLayout } from '../types';

// ============================================================================
// Types
// ============================================================================

// TextOverlay interface reserved for future use with complex text positioning
// interface TextOverlay {
//   text: string;
//   x: number;
//   y: number;
//   fontSize: number;
//   color: string;
//   fontWeight?: 'normal' | 'bold';
// }

interface SharpModule {
  default: (input?: Buffer | string) => SharpInstance;
}

interface SharpInstance {
  resize(width: number, height: number, options?: { fit?: string; position?: string }): SharpInstance;
  composite(images: Array<{ input: Buffer; top?: number; left?: number }>): SharpInstance;
  jpeg(options?: { quality?: number }): SharpInstance;
  png(): SharpInstance;
  toBuffer(): Promise<Buffer>;
  metadata(): Promise<{ width?: number; height?: number }>;
}

// ============================================================================
// Image Generator Class
// ============================================================================

export class ImageGenerator {
  private blockInjector = getBlockInjector();
  private sharp: SharpModule['default'] | null = null;

  /**
   * Generate social crop images for all requested formats
   */
  async generateAll(
    template: CollateralTemplate,
    listing: ListingSnapshot,
    formats: SocialCropFormat[],
    options: ImageGenerationOptions = {}
  ): Promise<Map<SocialCropFormat, ImageGenerationResult>> {
    const results = new Map<SocialCropFormat, ImageGenerationResult>();

    // Generate all formats in parallel
    const generations = formats.map(async (format) => {
      const result = await this.generate(template, listing, format, options);
      return { format, result };
    });

    const settled = await Promise.allSettled(generations);

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.set(outcome.value.format, outcome.value.result);
      }
    }

    return results;
  }

  /**
   * Generate a single social crop image
   */
  async generate(
    template: CollateralTemplate,
    listing: ListingSnapshot,
    format: SocialCropFormat,
    options: ImageGenerationOptions = {}
  ): Promise<ImageGenerationResult> {
    const dimensions = SocialCropDimensions[format];
    const layout = this.getLayoutForFormat(format);

    // Get compliance blocks for this market
    const injectionResult = this.blockInjector.inject(
      '', // We don't need HTML for images
      listing.marketId,
      template.type
    );

    // Create the image
    const buffer = await this.createImage(listing, dimensions, layout, options, injectionResult.appliedBlocks);

    // Calculate checksum
    const checksum = createHash('sha256').update(buffer).digest('hex');

    return {
      buffer,
      checksum,
      format,
      width: dimensions.width,
      height: dimensions.height,
      mimeType: 'image/jpeg',
      appliedBlocks: injectionResult.appliedBlocks,
    };
  }

  /**
   * Get layout configuration for a specific format
   */
  private getLayoutForFormat(format: SocialCropFormat): SocialCropLayout {
    // Customize layout based on format aspect ratio
    switch (format) {
      case 'instagram_square':
        return {
          ...DefaultSocialCropLayout,
          photoAreaPercent: 70,
          textPosition: 'bottom',
        };
      case 'instagram_story':
      case 'tiktok_video':
      case 'pinterest_pin':
        return {
          ...DefaultSocialCropLayout,
          photoAreaPercent: 65,
          textPosition: 'bottom',
          fontSize: { title: 40, price: 56, details: 28 },
        };
      case 'facebook_post':
      case 'twitter_post':
      case 'linkedin_post':
        return {
          ...DefaultSocialCropLayout,
          photoAreaPercent: 75,
          textPosition: 'bottom',
          complianceFooterHeight: 50,
          fontSize: { title: 28, price: 40, details: 20 },
        };
      default:
        return DefaultSocialCropLayout;
    }
  }

  /**
   * Create the image using sharp
   */
  private async createImage(
    listing: ListingSnapshot,
    dimensions: { width: number; height: number },
    layout: SocialCropLayout,
    options: ImageGenerationOptions,
    appliedBlocks: AppliedComplianceBlock[]
  ): Promise<Buffer> {
    const sharp = await this.getSharp();

    if (!sharp) {
      // Fallback: create a mock image for testing
      return this.createMockImage(listing, dimensions, layout, appliedBlocks);
    }

    // Calculate areas
    const photoHeight = Math.floor(dimensions.height * (layout.photoAreaPercent / 100));
    const textHeight = dimensions.height - photoHeight - (layout.includeComplianceFooter ? layout.complianceFooterHeight : 0);
    const complianceHeight = layout.includeComplianceFooter ? layout.complianceFooterHeight : 0;

    // Create base image (gradient background if no photo)
    let image: SharpInstance;

    if (listing.photos && listing.photos.length > 0) {
      try {
        // Fetch and resize the first photo
        const photoUrl = listing.photos[0];
        if (!photoUrl) {
          throw new Error('Photo URL is undefined');
        }
        const photoBuffer = await this.fetchImage(photoUrl);
        image = sharp(photoBuffer).resize(dimensions.width, photoHeight, {
          fit: 'cover',
          position: 'center',
        });
      } catch {
        // Fallback to gradient if photo fetch fails
        image = this.createGradientBackground(sharp, dimensions.width, dimensions.height);
      }
    } else {
      // Create gradient background
      image = this.createGradientBackground(sharp, dimensions.width, dimensions.height);
    }

    // Create text overlay
    const textOverlay = this.createTextOverlaySvg(listing, dimensions.width, textHeight, layout);

    // Create compliance footer if required
    const complianceOverlay = layout.includeComplianceFooter && appliedBlocks.length > 0
      ? this.createComplianceFooterSvg(appliedBlocks, dimensions.width, complianceHeight)
      : null;

    // Composite layers
    const overlays: Array<{ input: Buffer; top?: number; left?: number }> = [];

    // Add text overlay
    overlays.push({
      input: Buffer.from(textOverlay),
      top: photoHeight,
      left: 0,
    });

    // Add compliance footer
    if (complianceOverlay) {
      overlays.push({
        input: Buffer.from(complianceOverlay),
        top: dimensions.height - complianceHeight,
        left: 0,
      });
    }

    // Add watermark if specified
    if (options.watermark) {
      const watermarkSvg = this.createWatermarkSvg(options.watermark, dimensions.width, dimensions.height);
      overlays.push({
        input: Buffer.from(watermarkSvg),
        top: 0,
        left: 0,
      });
    }

    // Extend canvas to full size and composite
    const photoBuffer = await image.toBuffer();
    const fullImage = sharp(photoBuffer)
      .resize(dimensions.width, dimensions.height, { fit: 'contain', position: 'top' });

    if (overlays.length > 0) {
      return fullImage.composite(overlays).jpeg({ quality: options.quality ?? 90 }).toBuffer();
    }

    return fullImage.jpeg({ quality: options.quality ?? 90 }).toBuffer();
  }

  /**
   * Create gradient background
   */
  private createGradientBackground(
    sharp: SharpModule['default'],
    width: number,
    height: number
  ): SharpInstance {
    const svg = `
      <svg width="${width}" height="${height}">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1a365d;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#2c5282;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
      </svg>
    `;
    return sharp(Buffer.from(svg));
  }

  /**
   * Create text overlay SVG
   */
  private createTextOverlaySvg(
    listing: ListingSnapshot,
    width: number,
    height: number,
    layout: SocialCropLayout
  ): string {
    const padding = 20;
    const address = `${listing.address.street}${listing.address.unit ? ` #${listing.address.unit}` : ''}`;
    const location = `${listing.address.city}, ${listing.address.state} ${listing.address.zip}`;
    const price = `$${listing.rent.toLocaleString()}/mo`;
    const details = `${listing.bedrooms} BR | ${listing.bathrooms} BA${listing.squareFeet ? ` | ${listing.squareFeet.toLocaleString()} sqft` : ''}`;

    return `
      <svg width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <text x="${padding}" y="${layout.fontSize.title + padding}"
              font-family="Arial, sans-serif" font-size="${layout.fontSize.title}" font-weight="bold" fill="#1a202c">
          ${this.escapeXml(address)}
        </text>
        <text x="${padding}" y="${layout.fontSize.title + layout.fontSize.details + padding + 8}"
              font-family="Arial, sans-serif" font-size="${layout.fontSize.details}" fill="#718096">
          ${this.escapeXml(location)}
        </text>
        <text x="${padding}" y="${layout.fontSize.title + layout.fontSize.details * 2 + padding + 24}"
              font-family="Arial, sans-serif" font-size="${layout.fontSize.price}" font-weight="bold" fill="#2b6cb0">
          ${this.escapeXml(price)}
        </text>
        <text x="${padding}" y="${height - padding}"
              font-family="Arial, sans-serif" font-size="${layout.fontSize.details}" fill="#4a5568">
          ${this.escapeXml(details)}
        </text>
      </svg>
    `;
  }

  /**
   * Create compliance footer SVG
   */
  private createComplianceFooterSvg(
    appliedBlocks: AppliedComplianceBlock[],
    width: number,
    height: number
  ): string {
    const blockNames = appliedBlocks
      .map(b => b.blockType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
      .slice(0, 2)
      .join(' | ');

    return `
      <svg width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="#f7fafc"/>
        <line x1="0" y1="0" x2="${width}" y2="0" stroke="#e2e8f0" stroke-width="1"/>
        <text x="${width / 2}" y="${height / 2 + 5}"
              font-family="Arial, sans-serif" font-size="12" fill="#718096" text-anchor="middle">
          ${this.escapeXml(blockNames)} • Equal Housing Opportunity
        </text>
      </svg>
    `;
  }

  /**
   * Create watermark SVG
   */
  private createWatermarkSvg(text: string, width: number, height: number): string {
    return `
      <svg width="${width}" height="${height}">
        <text x="${width / 2}" y="${height / 2}"
              font-family="Arial, sans-serif" font-size="48" fill="rgba(0,0,0,0.15)"
              text-anchor="middle" transform="rotate(-30 ${width / 2} ${height / 2})">
          ${this.escapeXml(text)}
        </text>
      </svg>
    `;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Fetch image from URL
   */
  private async fetchImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Get sharp module (dynamic import)
   */
  private async getSharp(): Promise<SharpModule['default'] | null> {
    if (this.sharp) {
      return this.sharp;
    }

    try {
      const sharpModule = await import('sharp') as SharpModule;
      this.sharp = sharpModule.default;
      return this.sharp;
    } catch {
      // Sharp not available - will use mock image generation
      return null;
    }
  }

  /**
   * Create mock image for testing (when sharp is not available)
   */
  private createMockImage(
    listing: ListingSnapshot,
    dimensions: { width: number; height: number },
    layout: SocialCropLayout,
    appliedBlocks: AppliedComplianceBlock[]
  ): Buffer {
    const svg = `
      <svg width="${dimensions.width}" height="${dimensions.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1a365d"/>
            <stop offset="100%" style="stop-color:#2c5282"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
        <rect y="${dimensions.height * 0.7}" width="100%" height="${dimensions.height * 0.3}" fill="#ffffff"/>
        <text x="20" y="${dimensions.height * 0.75}" font-family="Arial" font-size="${layout.fontSize.title}" font-weight="bold" fill="#1a202c">
          ${this.escapeXml(listing.address.street)}
        </text>
        <text x="20" y="${dimensions.height * 0.82}" font-family="Arial" font-size="${layout.fontSize.price}" font-weight="bold" fill="#2b6cb0">
          $${listing.rent.toLocaleString()}/mo
        </text>
        <text x="20" y="${dimensions.height * 0.90}" font-family="Arial" font-size="${layout.fontSize.details}" fill="#4a5568">
          ${listing.bedrooms} BR | ${listing.bathrooms} BA
        </text>
        ${layout.includeComplianceFooter && appliedBlocks.length > 0 ? `
          <rect y="${dimensions.height - layout.complianceFooterHeight}" width="100%" height="${layout.complianceFooterHeight}" fill="#f7fafc"/>
          <text x="${dimensions.width / 2}" y="${dimensions.height - layout.complianceFooterHeight / 2 + 5}"
                font-family="Arial" font-size="12" fill="#718096" text-anchor="middle">
            Equal Housing Opportunity
          </text>
        ` : ''}
      </svg>
    `;

    // Convert SVG to buffer (for mock, we just return the SVG as a buffer)
    // In production, sharp would convert this to JPEG
    return Buffer.from(svg);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let imageGeneratorInstance: ImageGenerator | null = null;

export function getImageGenerator(): ImageGenerator {
  if (!imageGeneratorInstance) {
    imageGeneratorInstance = new ImageGenerator();
  }
  return imageGeneratorInstance;
}
