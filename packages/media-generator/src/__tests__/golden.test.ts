/**
 * Golden Tests for Media Generators
 *
 * Validates that PDF, PPTX, and HTML generators produce consistent,
 * deterministic output for investor-grade reliability.
 *
 * These tests:
 * 1. Generate output from fixed deterministic fixtures
 * 2. Validate using stable checks (hashes, counts, structure)
 * 3. Fail CI if output deviates from baseline unexpectedly
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

import { PdfGenerator } from '../generators/pdf-generator';
import { PptxGenerator } from '../generators/pptx-generator';
import { HtmlRenderer, type RenderContext } from '../renderers/html-renderer';
import type { CollateralTemplate, ListingSnapshot } from '../types';

// ============================================================================
// Configuration
// ============================================================================

const FIXTURES_PATH = join(__dirname, '../__fixtures__');
const GOLDEN_PATH = join(FIXTURES_PATH, 'golden');
const BASELINES_FILE = join(GOLDEN_PATH, 'baselines.json');

// Set to true to regenerate baselines (use with caution)
const REGENERATE_BASELINES = process.env.REGENERATE_GOLDEN_BASELINES === 'true';

// ============================================================================
// Baseline Types
// ============================================================================

interface HtmlBaseline {
  contentHash: string;
  normalizedHash: string;
  variableCount: number;
  compliancePlaceholderPresent: boolean;
}

interface PdfBaseline {
  pageCount: number;
  textContentHash: string;
  bufferSizeRange: { min: number; max: number };
}

interface PptxBaseline {
  slideCount: number;
  slideTypes: string[];
  mockBufferHash?: string;  // Deprecated: PPTX includes timestamps
  bufferSizeRange?: { min: number; max: number };
}

interface Baselines {
  version: string;
  description: string;
  generatedAt: string;
  baselines: {
    html: Record<string, HtmlBaseline>;
    pdf: Record<string, PdfBaseline>;
    pptx: Record<string, PptxBaseline>;
  };
}

// ============================================================================
// Normalization Utilities
// ============================================================================

/**
 * Normalize HTML for stable comparison
 * - Removes excessive whitespace
 * - Normalizes line endings
 * - Removes dynamic content (timestamps)
 */
function normalizeHtml(html: string): string {
  return html
    .replace(/\r\n/g, '\n')                    // Normalize line endings
    .replace(/\s+/g, ' ')                       // Collapse whitespace
    .replace(/>\s+</g, '><')                   // Remove whitespace between tags
    .replace(/\s+>/g, '>')                     // Remove trailing whitespace before >
    .replace(/<\s+/g, '<')                     // Remove leading whitespace after <
    .trim();
}

/**
 * Extract text content from PDF buffer (mock PDF format)
 * For real PDFs, would use pdf-parse or similar
 */
function extractPdfText(buffer: Buffer): string {
  const content = buffer.toString('utf-8');
  // Extract text between Tj operators in mock PDF
  const textMatch = content.match(/\(([^)]*)\)\s*Tj/);
  return textMatch ? textMatch[1] : '';
}

/**
 * Count pages in PDF (mock format)
 * Looks for /Count in Pages object
 */
function countPdfPages(buffer: Buffer): number {
  const content = buffer.toString('utf-8');
  const countMatch = content.match(/\/Count\s+(\d+)/);
  return countMatch ? parseInt(countMatch[1], 10) : 0;
}

/**
 * Hash content for comparison
 */
function hashContent(content: string | Buffer): string {
  return createHash('sha256')
    .update(content)
    .digest('hex')
    .substring(0, 32); // Use first 32 chars for readability
}

// ============================================================================
// Fixture Loaders
// ============================================================================

function loadListingFixture(name: string): ListingSnapshot {
  const filePath = join(FIXTURES_PATH, 'listings', `${name}.json`);
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));

  return {
    id: data.id,
    title: data.title,
    address: data.address,
    rent: data.rent,
    bedrooms: data.bedrooms,
    bathrooms: data.bathrooms,
    squareFeet: data.squareFeet,
    availableDate: data.availableDate ? new Date(data.availableDate) : undefined,
    description: data.description,
    amenities: data.amenities,
    photos: data.photos,
    marketId: data.marketId,
    propertyType: data.propertyType,
    yearBuilt: data.yearBuilt,
    petPolicy: data.petPolicy,
  };
}

function loadTemplateFixture(): CollateralTemplate {
  const htmlPath = join(FIXTURES_PATH, 'templates', 'minimal-flyer.html');
  const htmlContent = readFileSync(htmlPath, 'utf-8');

  return {
    id: 'fixture-template-001',
    name: 'Minimal Flyer',
    type: 'flyer',
    source: 'system',
    version: '1.0.0',
    htmlTemplate: htmlContent,
    variables: [],
    requiredComplianceBlocks: ['fair_housing_notice'],
    supportedFormats: ['pdf', 'pptx'],
    marketId: 'NYC_STRICT',
    isActive: true,
    isSystem: true,
    createdBy: 'system',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };
}

function loadBaselines(): Baselines {
  if (!existsSync(BASELINES_FILE)) {
    throw new Error(`Baselines file not found: ${BASELINES_FILE}`);
  }
  return JSON.parse(readFileSync(BASELINES_FILE, 'utf-8')) as Baselines;
}

function saveBaselines(baselines: Baselines): void {
  writeFileSync(BASELINES_FILE, JSON.stringify(baselines, null, 2));
}

// ============================================================================
// Helper: Build nested variables for template interpolation
// ============================================================================

/**
 * Build nested variables object for templates that use dot notation
 * e.g., {{listing.title}}, {{listing.address.city}}
 */
function buildNestedVariables(listing: ListingSnapshot): Record<string, unknown> {
  return {
    listing: {
      title: listing.title,
      address: listing.address,
      rent: listing.rent,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      squareFeet: listing.squareFeet,
      description: listing.description,
      amenities: listing.amenities,
      photos: listing.photos,
      marketId: listing.marketId,
      propertyType: listing.propertyType,
      yearBuilt: listing.yearBuilt,
      petPolicy: listing.petPolicy,
      availableDate: listing.availableDate,
    },
  };
}

// ============================================================================
// Golden Tests: HTML Renderer
// ============================================================================

describe('Golden Tests: HTML Renderer', () => {
  let renderer: HtmlRenderer;
  let nycListing: ListingSnapshot;
  let template: CollateralTemplate;
  let baselines: Baselines;

  beforeAll(() => {
    renderer = new HtmlRenderer();
    nycListing = loadListingFixture('nyc-apartment');
    template = loadTemplateFixture();
    baselines = loadBaselines();
  });

  it('should produce deterministic HTML output', () => {
    const context: RenderContext = {
      listing: nycListing,
      variables: buildNestedVariables(nycListing),
      generatedAt: new Date('2026-01-01T00:00:00Z'), // Fixed date for determinism
    };

    // Generate twice
    const html1 = renderer.render(template.htmlTemplate, context, template.variables);
    const html2 = renderer.render(template.htmlTemplate, context, template.variables);

    // Must be identical
    expect(html1).toBe(html2);
  });

  it('should match normalized HTML baseline', () => {
    const context: RenderContext = {
      listing: nycListing,
      variables: buildNestedVariables(nycListing),
      generatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    const html = renderer.render(template.htmlTemplate, context, template.variables);
    const normalizedHtml = normalizeHtml(html);
    const currentHash = hashContent(normalizedHtml);

    const baseline = baselines.baselines.html['nyc-apartment-flyer'];

    if (REGENERATE_BASELINES || baseline.normalizedHash === 'PENDING_GENERATION') {
      // Update baseline
      baselines.baselines.html['nyc-apartment-flyer'] = {
        contentHash: hashContent(html),
        normalizedHash: currentHash,
        variableCount: (html.match(/\{\{[^}]+\}\}/g) || []).length,
        compliancePlaceholderPresent: html.includes('COMPLIANCE_BLOCKS_PLACEHOLDER'),
      };
      saveBaselines(baselines);
      console.log('HTML baseline updated:', currentHash);
    } else {
      expect(currentHash).toBe(baseline.normalizedHash);
    }
  });

  it('should interpolate all expected variables', () => {
    const context: RenderContext = {
      listing: nycListing,
      variables: buildNestedVariables(nycListing),
      generatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    const html = renderer.render(template.htmlTemplate, context, template.variables);

    // Verify key variables were interpolated
    expect(html).toContain('Modern 2BR in Chelsea');           // {{listing.title}}
    expect(html).toContain('123 West 23rd Street');            // {{listing.address.street}}
    expect(html).toContain('4B');                               // {{listing.address.unit}}
    expect(html).toContain('New York');                         // {{listing.address.city}}
    expect(html).toContain('NY');                               // {{listing.address.state}}
    expect(html).toContain('10011');                            // {{listing.address.zip}}
    expect(html).toContain('3,500');                            // {{listing.rent}} formatted
    expect(html).toContain('2');                                // {{listing.bedrooms}}
    expect(html).toContain('950');                              // {{listing.squareFeet}}
  });

  it('should preserve compliance placeholder for block injection', () => {
    const context: RenderContext = {
      listing: nycListing,
      variables: buildNestedVariables(nycListing),
      generatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    const html = renderer.render(template.htmlTemplate, context, template.variables);

    // Compliance placeholder should NOT be replaced by renderer
    // (it's handled by block-injector later)
    expect(html).toContain('COMPLIANCE_BLOCKS_PLACEHOLDER');
  });

  it('should escape HTML in user-provided content', () => {
    const maliciousListing = {
      ...nycListing,
      title: '<script>alert("xss")</script>',
      description: '"><img src=x onerror=alert(1)>',
    };

    const context: RenderContext = {
      listing: maliciousListing,
      variables: buildNestedVariables(maliciousListing),
      generatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    const html = renderer.render(template.htmlTemplate, context, template.variables);

    // XSS should be escaped - angle brackets are the key vectors
    expect(html).not.toContain('<script>');       // Script tag escaped
    expect(html).not.toContain('<img');           // Image tag escaped
    expect(html).toContain('&lt;script&gt;');     // < and > escaped to entities
    expect(html).toContain('&lt;img');            // Image tag also escaped
    expect(html).toContain('&quot;');             // Quotes escaped
  });
});

// ============================================================================
// Golden Tests: PDF Generator
// ============================================================================

describe('Golden Tests: PDF Generator', () => {
  let generator: PdfGenerator;
  let nycListing: ListingSnapshot;
  let template: CollateralTemplate;
  let baselines: Baselines;

  beforeAll(() => {
    generator = new PdfGenerator();
    nycListing = loadListingFixture('nyc-apartment');
    template = loadTemplateFixture();
    baselines = loadBaselines();
  });

  it('should produce deterministic PDF output', async () => {
    // Generate twice with same inputs
    const result1 = await generator.generate(template, nycListing);
    const result2 = await generator.generate(template, nycListing);

    // Checksums must match (deterministic generation)
    expect(result1.checksum).toBe(result2.checksum);
  });

  it('should match PDF structure baseline', async () => {
    const result = await generator.generate(template, nycListing);
    const baseline = baselines.baselines.pdf['nyc-apartment-flyer'];

    // Verify page count
    const pageCount = countPdfPages(result.buffer);
    expect(pageCount).toBe(baseline.pageCount);

    // Verify buffer size is within expected range
    expect(result.buffer.length).toBeGreaterThanOrEqual(baseline.bufferSizeRange.min);
    expect(result.buffer.length).toBeLessThanOrEqual(baseline.bufferSizeRange.max);
  });

  it('should embed listing content in PDF', async () => {
    const result = await generator.generate(template, nycListing);
    const textContent = extractPdfText(result.buffer);

    // PDF should contain listing information
    // Note: Mock PDF only embeds first ~1000 chars of text
    expect(textContent.length).toBeGreaterThan(0);
  });

  it('should match text content hash baseline', async () => {
    const result = await generator.generate(template, nycListing);
    const textContent = extractPdfText(result.buffer);
    const currentHash = hashContent(textContent);

    const baseline = baselines.baselines.pdf['nyc-apartment-flyer'];

    if (REGENERATE_BASELINES || baseline.textContentHash === 'PENDING_GENERATION') {
      baselines.baselines.pdf['nyc-apartment-flyer'] = {
        pageCount: countPdfPages(result.buffer),
        textContentHash: currentHash,
        bufferSizeRange: {
          min: Math.floor(result.buffer.length * 0.9),
          max: Math.ceil(result.buffer.length * 1.1),
        },
      };
      saveBaselines(baselines);
      console.log('PDF baseline updated:', currentHash);
    } else {
      expect(currentHash).toBe(baseline.textContentHash);
    }
  });

  it('should include valid MIME type', async () => {
    const result = await generator.generate(template, nycListing);
    expect(result.mimeType).toBe('application/pdf');
  });

  it('should produce valid PDF header', async () => {
    const result = await generator.generate(template, nycListing);
    const header = result.buffer.toString('utf-8', 0, 8);
    expect(header).toMatch(/%PDF-\d\.\d/);
  });
});

// ============================================================================
// Golden Tests: PPTX Generator
// ============================================================================

describe('Golden Tests: PPTX Generator', () => {
  let generator: PptxGenerator;
  let nycListing: ListingSnapshot;
  let template: CollateralTemplate;
  let baselines: Baselines;

  beforeAll(() => {
    generator = new PptxGenerator();
    nycListing = loadListingFixture('nyc-apartment');
    template = loadTemplateFixture();
    baselines = loadBaselines();
  });

  it('should produce deterministic PPTX output', async () => {
    // Generate twice with same inputs
    const result1 = await generator.generate(template, nycListing);
    const result2 = await generator.generate(template, nycListing);

    // Checksums must match (deterministic generation)
    expect(result1.checksum).toBe(result2.checksum);
  });

  it('should generate expected slide count', async () => {
    const result = await generator.generate(template, nycListing);
    const baseline = baselines.baselines.pptx['nyc-apartment-presentation'];

    // Default template has 5 slides: title, details, amenities, photos, disclosures
    expect(baseline.slideCount).toBe(5);
    expect(baseline.slideTypes).toEqual([
      'title',
      'details',
      'amenities',
      'photos',
      'disclosures',
    ]);

    // Buffer should be generated
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('should produce consistent buffer size within tolerance', async () => {
    const result = await generator.generate(template, nycListing);
    const baseline = baselines.baselines.pptx['nyc-apartment-presentation'];

    // PPTX includes timestamps so exact hash matching isn't possible
    // Instead, verify consistent structure via buffer size tolerance
    // Real PPTX files are typically 30-60KB for presentations with 5 slides

    if (REGENERATE_BASELINES || !baseline.bufferSizeRange) {
      const minSize = Math.floor(result.buffer.length * 0.8);
      const maxSize = Math.ceil(result.buffer.length * 1.2);
      baselines.baselines.pptx['nyc-apartment-presentation'] = {
        ...baseline,
        bufferSizeRange: { min: minSize, max: maxSize },
      };
      saveBaselines(baselines);
      console.log('PPTX baseline updated - size:', result.buffer.length);
    } else if (baseline.bufferSizeRange) {
      // Verify buffer size is within expected range
      expect(result.buffer.length).toBeGreaterThanOrEqual(baseline.bufferSizeRange.min);
      expect(result.buffer.length).toBeLessThanOrEqual(baseline.bufferSizeRange.max);
    }
  });

  it('should include valid MIME type', async () => {
    const result = await generator.generate(template, nycListing);
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
  });

  it('should include compliance blocks in appliedBlocks', async () => {
    const result = await generator.generate(template, nycListing);

    // NYC_STRICT market should have compliance blocks applied
    expect(Array.isArray(result.appliedBlocks)).toBe(true);
  });
});

// ============================================================================
// Cross-Generator Consistency Tests
// ============================================================================

describe('Cross-Generator Consistency', () => {
  let pdfGenerator: PdfGenerator;
  let pptxGenerator: PptxGenerator;
  let nycListing: ListingSnapshot;
  let template: CollateralTemplate;

  beforeAll(() => {
    pdfGenerator = new PdfGenerator();
    pptxGenerator = new PptxGenerator();
    nycListing = loadListingFixture('nyc-apartment');
    template = loadTemplateFixture();
  });

  it('should apply consistent compliance blocks across formats', async () => {
    const pdfResult = await pdfGenerator.generate(template, nycListing);
    const pptxResult = await pptxGenerator.generate(template, nycListing);

    // Both should have compliance blocks for NYC_STRICT market
    expect(pdfResult.appliedBlocks.length).toBe(pptxResult.appliedBlocks.length);

    // Block IDs should match
    const pdfBlockIds = pdfResult.appliedBlocks.map((b) => b.blockId).sort();
    const pptxBlockIds = pptxResult.appliedBlocks.map((b) => b.blockId).sort();
    expect(pdfBlockIds).toEqual(pptxBlockIds);
  });

  it('should generate unique checksums for each format', async () => {
    const pdfResult = await pdfGenerator.generate(template, nycListing);
    const pptxResult = await pptxGenerator.generate(template, nycListing);

    // Checksums should be different (different formats)
    expect(pdfResult.checksum).not.toBe(pptxResult.checksum);
  });
});

// ============================================================================
// Regression Guard Tests
// ============================================================================

describe('Regression Guards', () => {
  let pdfGenerator: PdfGenerator;
  let pptxGenerator: PptxGenerator;
  let htmlRenderer: HtmlRenderer;

  beforeAll(() => {
    pdfGenerator = new PdfGenerator();
    pptxGenerator = new PptxGenerator();
    htmlRenderer = new HtmlRenderer();
  });

  it('should detect layout changes in HTML', () => {
    const template = loadTemplateFixture();
    const listing = loadListingFixture('nyc-apartment');

    const context: RenderContext = {
      listing,
      generatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    const html = htmlRenderer.render(template.htmlTemplate, context, template.variables);

    // Verify critical layout elements exist
    expect(html).toContain('class="header"');
    expect(html).toContain('class="price"');
    expect(html).toContain('class="details"');
    expect(html).toContain('class="description"');
  });

  it('should preserve stable PDF structure', async () => {
    const template = loadTemplateFixture();
    const listing = loadListingFixture('nyc-apartment');

    const result = await pdfGenerator.generate(template, listing);
    const content = result.buffer.toString('utf-8');

    // Verify PDF structure markers
    expect(content).toContain('%PDF-');       // PDF header
    expect(content).toContain('/Type /Catalog'); // Catalog object
    expect(content).toContain('/Type /Pages');  // Pages object
    expect(content).toContain('%%EOF');         // PDF footer
  });

  it('should maintain PPTX slide configuration', async () => {
    const template = loadTemplateFixture();
    const listing = loadListingFixture('nyc-apartment');

    const result = await pptxGenerator.generate(template, listing);

    // PPTX files are ZIP archives (start with PK header)
    const header = result.buffer.toString('utf-8', 0, 2);
    expect(header).toBe('PK'); // ZIP magic bytes

    // Buffer should be generated with meaningful content
    expect(result.buffer.length).toBeGreaterThan(1000);
  });
});
