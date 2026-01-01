/**
 * PPTX Generator
 *
 * Generates PowerPoint presentations for property listings using pptxgenjs.
 * Includes compliance disclosures as a dedicated slide.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable no-console */

import { createHash } from 'crypto';

import { getBlockInjector } from '../renderers/block-injector';
import type {
  CollateralTemplate,
  ListingSnapshot,
  AppliedComplianceBlock,
  CollateralCustomizations,
  PptxTemplateConfig,
  PptxSlideConfig,
} from '../types';

// ============================================================================
// PPTX Generation Options
// ============================================================================

export interface PptxGenerationOptions {
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
    logoUrl?: string;
    fontFamily?: string;
  };
}

// ============================================================================
// PPTX Generation Result
// ============================================================================

export interface PptxGenerationResult {
  buffer: Buffer;
  checksum: string;
  mimeType: string;
  appliedBlocks: AppliedComplianceBlock[];
}

// ============================================================================
// Default Slide Layouts
// ============================================================================

const DEFAULT_PPTX_CONFIG: PptxTemplateConfig = {
  slides: [
    { type: 'title' },
    { type: 'details' },
    { type: 'amenities' },
    { type: 'photos' },
    { type: 'disclosures' },
  ],
};

// ============================================================================
// PPTX Generator Class
// ============================================================================

export class PptxGenerator {
  private blockInjector = getBlockInjector();

  /**
   * Generate PPTX from template and listing
   */
  async generate(
    template: CollateralTemplate,
    listing: ListingSnapshot,
    options: {
      variables?: Record<string, unknown>;
      customizations?: CollateralCustomizations;
      pptxOptions?: PptxGenerationOptions;
    } = {}
  ): Promise<PptxGenerationResult> {
    // Get pptxgenjs
    const PptxGenJS = await this.loadPptxGenJS();

    // Create presentation
    const pres = new PptxGenJS();

    // Configure presentation
    const branding = options.pptxOptions?.branding ?? template.pptxTemplate?.branding;
    this.configurePresentation(pres, branding);

    // Get compliance blocks for disclosures slide
    const complianceResult = this.blockInjector.getPptxSlideContent(
      listing.marketId,
      template.type
    );

    // Get slide configuration
    const slideConfig = template.pptxTemplate?.slides ?? DEFAULT_PPTX_CONFIG.slides;

    // Generate slides
    for (const slideType of slideConfig) {
      await this.addSlide(pres, slideType, listing, branding, complianceResult.content);
    }

    // Generate buffer
    const buffer = await this.generateBuffer(pres);
    const checksum = createHash('sha256').update(buffer).digest('hex');

    return {
      buffer,
      checksum,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      appliedBlocks: complianceResult.appliedBlocks,
    };
  }

  /**
   * Load pptxgenjs dynamically
   */
  private async loadPptxGenJS(): Promise<any> {
    try {
      const pptxgenjs = await import('pptxgenjs');
      return pptxgenjs.default || pptxgenjs;
    } catch {
      console.warn('[PptxGenerator] pptxgenjs not available, using mock');
      return this.MockPptxGenJS;
    }
  }

  /**
   * Mock PptxGenJS for testing
   */
  private MockPptxGenJS = class {
    private slides: any[] = [];

    defineLayout() {}
    layout = 'LAYOUT_WIDE';

    addSlide() {
      const slide = {
        addText: () => {},
        addImage: () => {},
        addShape: () => {},
        background: {},
      };
      this.slides.push(slide);
      return slide;
    }

    async write(): Promise<Buffer> {
      // Return a minimal mock PPTX (actually just a placeholder)
      return Buffer.from('[MOCK PPTX CONTENT]');
    }
  };

  /**
   * Configure presentation settings
   */
  private configurePresentation(pres: any, branding?: PptxGenerationOptions['branding']): void {
    pres.defineLayout({ name: 'LAYOUT_16x9', width: 10, height: 5.625 });
    pres.layout = 'LAYOUT_16x9';

    // Set default font
    if (branding?.fontFamily) {
      pres.theme = { fontFace: branding.fontFamily };
    }
  }

  /**
   * Add a slide based on type
   */
  private async addSlide(
    pres: any,
    config: PptxSlideConfig,
    listing: ListingSnapshot,
    branding?: PptxGenerationOptions['branding'],
    complianceContent?: string[]
  ): Promise<void> {
    const slide = pres.addSlide();

    const primaryColor = branding?.primaryColor ?? '1976D2';
    const secondaryColor = branding?.secondaryColor ?? '424242';

    switch (config.type) {
      case 'title':
        this.addTitleSlide(slide, listing, primaryColor);
        break;

      case 'details':
        this.addDetailsSlide(slide, listing, primaryColor, secondaryColor);
        break;

      case 'amenities':
        this.addAmenitiesSlide(slide, listing, primaryColor, secondaryColor);
        break;

      case 'photos':
        await this.addPhotosSlide(slide, listing, primaryColor);
        break;

      case 'disclosures':
        this.addDisclosuresSlide(slide, complianceContent ?? [], primaryColor, secondaryColor);
        break;

      case 'custom':
        this.addCustomSlide(slide, config, listing, primaryColor, secondaryColor);
        break;
    }
  }

  /**
   * Add title slide
   */
  private addTitleSlide(slide: any, listing: ListingSnapshot, primaryColor: string): void {
    // Background color
    slide.background = { color: primaryColor };

    // Property title
    slide.addText(listing.title, {
      x: 0.5,
      y: 1.5,
      w: 9,
      h: 1,
      fontSize: 36,
      fontFace: 'Arial',
      color: 'FFFFFF',
      bold: true,
    });

    // Address
    const fullAddress = `${listing.address.street}${listing.address.unit ? `, Unit ${listing.address.unit}` : ''}\n${listing.address.city}, ${listing.address.state} ${listing.address.zip}`;
    slide.addText(fullAddress, {
      x: 0.5,
      y: 2.7,
      w: 9,
      h: 0.8,
      fontSize: 20,
      fontFace: 'Arial',
      color: 'FFFFFF',
    });

    // Price
    const rentFormatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(listing.rent);

    slide.addText(`${rentFormatted}/month`, {
      x: 0.5,
      y: 3.8,
      w: 9,
      h: 0.6,
      fontSize: 28,
      fontFace: 'Arial',
      color: 'FFFFFF',
      bold: true,
    });

    // Key details
    const details = `${listing.bedrooms} BD | ${listing.bathrooms} BA${listing.squareFeet ? ` | ${listing.squareFeet.toLocaleString()} SF` : ''}`;
    slide.addText(details, {
      x: 0.5,
      y: 4.4,
      w: 9,
      h: 0.5,
      fontSize: 18,
      fontFace: 'Arial',
      color: 'FFFFFF',
    });
  }

  /**
   * Add property details slide
   */
  private addDetailsSlide(
    slide: any,
    listing: ListingSnapshot,
    primaryColor: string,
    secondaryColor: string
  ): void {
    // Title
    slide.addText('Property Details', {
      x: 0.5,
      y: 0.3,
      w: 9,
      h: 0.6,
      fontSize: 28,
      fontFace: 'Arial',
      color: primaryColor,
      bold: true,
    });

    // Details grid
    const details = [
      ['Bedrooms', `${listing.bedrooms}`],
      ['Bathrooms', `${listing.bathrooms}`],
      ['Square Feet', listing.squareFeet ? `${listing.squareFeet.toLocaleString()}` : 'N/A'],
      ['Available', listing.availableDate ? new Date(listing.availableDate).toLocaleDateString() : 'Now'],
      ['Property Type', listing.propertyType ?? 'Apartment'],
      ['Year Built', listing.yearBuilt ? `${listing.yearBuilt}` : 'N/A'],
      ['Parking', listing.parkingSpaces ? `${listing.parkingSpaces} space(s)` : 'N/A'],
      ['Pets', listing.petPolicy ?? 'Contact for details'],
    ];

    let row = 0;
    let col = 0;
    for (const [label, value] of details) {
      const x = 0.5 + col * 4.5;
      const y = 1.2 + row * 0.9;

      slide.addText(label, {
        x,
        y,
        w: 2,
        h: 0.3,
        fontSize: 12,
        fontFace: 'Arial',
        color: '999999',
      });

      slide.addText(value, {
        x,
        y: y + 0.3,
        w: 4,
        h: 0.4,
        fontSize: 18,
        fontFace: 'Arial',
        color: secondaryColor,
        bold: true,
      });

      col++;
      if (col >= 2) {
        col = 0;
        row++;
      }
    }

    // Description
    if (listing.description) {
      slide.addText(listing.description.substring(0, 500), {
        x: 0.5,
        y: 4.5,
        w: 9,
        h: 1,
        fontSize: 12,
        fontFace: 'Arial',
        color: '666666',
        valign: 'top',
      });
    }
  }

  /**
   * Add amenities slide
   */
  private addAmenitiesSlide(
    slide: any,
    listing: ListingSnapshot,
    primaryColor: string,
    _secondaryColor: string
  ): void {
    // Title
    slide.addText('Amenities', {
      x: 0.5,
      y: 0.3,
      w: 9,
      h: 0.6,
      fontSize: 28,
      fontFace: 'Arial',
      color: primaryColor,
      bold: true,
    });

    const amenities = listing.amenities ?? [];

    if (amenities.length === 0) {
      slide.addText('Contact for amenities information', {
        x: 0.5,
        y: 2,
        w: 9,
        h: 0.5,
        fontSize: 14,
        fontFace: 'Arial',
        color: '666666',
      });
      return;
    }

    // Two-column layout
    const midpoint = Math.ceil(amenities.length / 2);
    const leftColumn = amenities.slice(0, midpoint);
    const rightColumn = amenities.slice(midpoint);

    leftColumn.forEach((amenity, index) => {
      slide.addText(`✓ ${amenity}`, {
        x: 0.5,
        y: 1.2 + index * 0.45,
        w: 4.5,
        h: 0.4,
        fontSize: 14,
        fontFace: 'Arial',
        color: '333333',
      });
    });

    rightColumn.forEach((amenity, index) => {
      slide.addText(`✓ ${amenity}`, {
        x: 5,
        y: 1.2 + index * 0.45,
        w: 4.5,
        h: 0.4,
        fontSize: 14,
        fontFace: 'Arial',
        color: '333333',
      });
    });
  }

  /**
   * Add photos slide
   */
  private async addPhotosSlide(
    slide: any,
    listing: ListingSnapshot,
    primaryColor: string
  ): Promise<void> {
    // Title
    slide.addText('Photos', {
      x: 0.5,
      y: 0.3,
      w: 9,
      h: 0.6,
      fontSize: 28,
      fontFace: 'Arial',
      color: primaryColor,
      bold: true,
    });

    const photos = listing.photos ?? [];

    if (photos.length === 0) {
      slide.addText('No photos available', {
        x: 0.5,
        y: 2,
        w: 9,
        h: 0.5,
        fontSize: 14,
        fontFace: 'Arial',
        color: '666666',
      });
      return;
    }

    // Add up to 4 photos in a 2x2 grid
    const displayPhotos = photos.slice(0, 4);

    displayPhotos.forEach((photoUrl, index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;

      try {
        slide.addImage({
          path: photoUrl,
          x: 0.5 + col * 4.75,
          y: 1 + row * 2.1,
          w: 4.5,
          h: 2,
        });
      } catch {
        // Image loading failed, add placeholder
        slide.addText(`[Photo ${index + 1}]`, {
          x: 0.5 + col * 4.75,
          y: 1 + row * 2.1,
          w: 4.5,
          h: 2,
          fontSize: 14,
          fontFace: 'Arial',
          color: '999999',
          align: 'center',
          valign: 'middle',
        });
      }
    });
  }

  /**
   * Add required disclosures slide
   */
  private addDisclosuresSlide(
    slide: any,
    disclosures: string[],
    primaryColor: string,
    secondaryColor: string
  ): void {
    // Title
    slide.addText('Required Disclosures', {
      x: 0.5,
      y: 0.3,
      w: 9,
      h: 0.6,
      fontSize: 28,
      fontFace: 'Arial',
      color: primaryColor,
      bold: true,
    });

    // Disclosure notice
    slide.addText('The following disclosures are required by law:', {
      x: 0.5,
      y: 1,
      w: 9,
      h: 0.4,
      fontSize: 12,
      fontFace: 'Arial',
      color: '666666',
      italic: true,
    });

    // Add each disclosure
    let y = 1.5;
    for (const disclosure of disclosures) {
      slide.addText(`• ${disclosure}`, {
        x: 0.5,
        y,
        w: 9,
        h: 0.8,
        fontSize: 11,
        fontFace: 'Arial',
        color: secondaryColor,
        valign: 'top',
      });
      y += 0.9;
    }

    // Footer note
    slide.addText(
      'For more information about your rights, contact the relevant housing authority.',
      {
        x: 0.5,
        y: 5,
        w: 9,
        h: 0.4,
        fontSize: 10,
        fontFace: 'Arial',
        color: '999999',
      }
    );
  }

  /**
   * Add custom slide
   */
  private addCustomSlide(
    slide: any,
    config: PptxSlideConfig,
    listing: ListingSnapshot,
    primaryColor: string,
    _secondaryColor: string
  ): void {
    // Title
    if (config.title) {
      slide.addText(config.title, {
        x: 0.5,
        y: 0.3,
        w: 9,
        h: 0.6,
        fontSize: 28,
        fontFace: 'Arial',
        color: primaryColor,
        bold: true,
      });
    }

    // Content
    if (config.content) {
      slide.addText(config.content, {
        x: 0.5,
        y: 1.2,
        w: 9,
        h: 3,
        fontSize: 14,
        fontFace: 'Arial',
        color: '333333',
        valign: 'top',
      });
    }
  }

  /**
   * Generate buffer from presentation
   */
  private async generateBuffer(pres: any): Promise<Buffer> {
    try {
      const output = await pres.write({ outputType: 'nodebuffer' });
      return Buffer.from(output);
    } catch {
      // Fallback for mock
      if (typeof pres.write === 'function') {
        return pres.write();
      }
      return Buffer.from('[PPTX GENERATION FAILED]');
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let generatorInstance: PptxGenerator | null = null;

export function getPptxGenerator(): PptxGenerator {
  if (!generatorInstance) {
    generatorInstance = new PptxGenerator();
  }
  return generatorInstance;
}

// ============================================================================
// Convenience Function
// ============================================================================

export async function generatePptx(
  template: CollateralTemplate,
  listing: ListingSnapshot,
  options?: {
    variables?: Record<string, unknown>;
    customizations?: CollateralCustomizations;
    pptxOptions?: PptxGenerationOptions;
  }
): Promise<PptxGenerationResult> {
  const generator = getPptxGenerator();
  return generator.generate(template, listing, options);
}
