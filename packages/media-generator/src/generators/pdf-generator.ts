/**
 * PDF Generator
 *
 * Generates PDF collateral from templates using Puppeteer.
 * Integrates with compliance block injection and evidence emission.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable no-console */

import { createHash } from 'crypto';

import { getBlockInjector } from '../renderers/block-injector';
import { getHtmlRenderer, type RenderContext } from '../renderers/html-renderer';
import type {
  CollateralTemplate,
  ListingSnapshot,
  AppliedComplianceBlock,
  CollateralCustomizations,
} from '../types';

// ============================================================================
// PDF Options
// ============================================================================

export interface PdfGenerationOptions {
  margins?: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  headerHtml?: string;
  footerHtml?: string;
  watermark?: string;
  landscape?: boolean;
  pageSize?: 'letter' | 'a4';
}

// ============================================================================
// PDF Generation Result
// ============================================================================

export interface PdfGenerationResult {
  buffer: Buffer;
  checksum: string;
  mimeType: string;
  appliedBlocks: AppliedComplianceBlock[];
}

// ============================================================================
// PDF Generator Class
// ============================================================================

export class PdfGenerator {
  private htmlRenderer = getHtmlRenderer();
  private blockInjector = getBlockInjector();

  /**
   * Generate PDF from template and listing
   */
  async generate(
    template: CollateralTemplate,
    listing: ListingSnapshot,
    options: {
      variables?: Record<string, unknown>;
      customizations?: CollateralCustomizations;
      pdfOptions?: PdfGenerationOptions;
    } = {}
  ): Promise<PdfGenerationResult> {
    // 1. Render HTML with variables
    const renderContext: RenderContext = {
      listing,
      variables: options.variables,
      customizations: options.customizations,
      generatedAt: new Date(),
    };

    let html = this.htmlRenderer.render(
      template.htmlTemplate,
      renderContext,
      template.variables
    );

    // 2. Inject compliance blocks
    const injectionResult = this.blockInjector.inject(
      html,
      listing.marketId,
      template.type
    );
    html = injectionResult.html;

    // 3. Wrap in full HTML document
    const fullHtml = this.wrapInDocument(html, template, options.pdfOptions);

    // 4. Render to PDF
    const buffer = await this.renderToPdf(fullHtml, options.pdfOptions);

    // 5. Calculate checksum
    const checksum = createHash('sha256').update(buffer).digest('hex');

    return {
      buffer,
      checksum,
      mimeType: 'application/pdf',
      appliedBlocks: injectionResult.appliedBlocks,
    };
  }

  /**
   * Wrap HTML content in a full document
   */
  private wrapInDocument(
    html: string,
    template: CollateralTemplate,
    options?: PdfGenerationOptions
  ): string {
    const margins = options?.margins ?? {
      top: '0.75in',
      right: '0.75in',
      bottom: '0.75in',
      left: '0.75in',
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${template.name}</title>
  <style>
    @page {
      size: ${options?.pageSize ?? 'letter'} ${options?.landscape ? 'landscape' : 'portrait'};
      margin: ${margins.top} ${margins.right} ${margins.bottom} ${margins.left};
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #333;
      margin: 0;
      padding: 0;
    }

    /* Collateral Styles */
    .collateral-header {
      text-align: center;
      margin-bottom: 24px;
    }

    .collateral-title {
      font-size: 24pt;
      font-weight: bold;
      margin-bottom: 8px;
    }

    .property-address {
      font-size: 16pt;
      color: #666;
    }

    .property-details {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin: 24px 0;
    }

    .detail-item {
      flex: 1 1 150px;
      padding: 12px;
      background: #f5f5f5;
      border-radius: 4px;
    }

    .detail-label {
      font-size: 10pt;
      color: #666;
      text-transform: uppercase;
    }

    .detail-value {
      font-size: 18pt;
      font-weight: bold;
    }

    .property-description {
      margin: 24px 0;
      line-height: 1.6;
    }

    .amenities-list {
      columns: 2;
      column-gap: 24px;
      list-style: none;
      padding: 0;
    }

    .amenities-list li {
      padding: 4px 0;
    }

    .amenities-list li::before {
      content: "✓ ";
      color: #4caf50;
    }

    /* Compliance Block Styles */
    .compliance-block {
      font-size: 9pt;
      color: #666;
      border-top: 1px solid #ddd;
      padding-top: 12px;
      margin-top: 24px;
    }

    .compliance-block a {
      color: #1976d2;
    }

    .compliance-page {
      page-break-before: always;
    }

    /* Photos */
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin: 24px 0;
    }

    .photo-grid img {
      width: 100%;
      height: auto;
      border-radius: 4px;
    }

    /* Watermark */
    ${options?.watermark ? `
    body::before {
      content: '${options.watermark}';
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 72pt;
      color: rgba(0, 0, 0, 0.05);
      z-index: -1;
      pointer-events: none;
    }
    ` : ''}
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
  }

  /**
   * Render HTML to PDF using Puppeteer
   */
  private async renderToPdf(
    html: string,
    options?: PdfGenerationOptions
  ): Promise<Buffer> {
    try {
      // Dynamic import to avoid bundling issues
      // Using template string to prevent static type resolution
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const moduleName = 'puppeteer';
      const puppeteer = await import(/* webpackIgnore: true */ moduleName).catch(() => null);

      if (puppeteer) {
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        try {
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'networkidle0' });

          const pdfBuffer = await page.pdf({
            format: options?.pageSize ?? 'letter',
            landscape: options?.landscape ?? false,
            printBackground: true,
            displayHeaderFooter: !!(options?.headerHtml || options?.footerHtml),
            headerTemplate: options?.headerHtml ?? '',
            footerTemplate: options?.footerHtml ?? `
              <div style="font-size: 9pt; width: 100%; text-align: center; color: #999;">
                Page <span class="pageNumber"></span> of <span class="totalPages"></span>
              </div>
            `,
            margin: options?.margins ?? {
              top: '0.75in',
              right: '0.75in',
              bottom: '0.75in',
              left: '0.75in',
            },
          });

          return Buffer.from(pdfBuffer);
        } finally {
          await browser.close();
        }
      }
    } catch {
      // Puppeteer not available
    }

    // Fallback: generate mock PDF for development/testing
    console.warn('[PdfGenerator] Puppeteer not available, generating mock PDF');
    return this.generateMockPdf(html);
  }

  /**
   * Generate mock PDF for testing
   */
  private generateMockPdf(html: string): Buffer {
    const textContent = html.replace(/<[^>]*>/g, ' ').trim().substring(0, 1000);

    // Minimal valid PDF structure
    const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${50 + textContent.length} >>
stream
BT
/F1 12 Tf
72 720 Td
(${textContent.replace(/[()\\]/g, '\\$&')}) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000${(366 + textContent.length).toString().padStart(3, '0')} 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${420 + textContent.length}
%%EOF`;

    return Buffer.from(pdf);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let generatorInstance: PdfGenerator | null = null;

export function getPdfGenerator(): PdfGenerator {
  if (!generatorInstance) {
    generatorInstance = new PdfGenerator();
  }
  return generatorInstance;
}

// ============================================================================
// Convenience Function
// ============================================================================

export async function generatePdf(
  template: CollateralTemplate,
  listing: ListingSnapshot,
  options?: {
    variables?: Record<string, unknown>;
    customizations?: CollateralCustomizations;
    pdfOptions?: PdfGenerationOptions;
  }
): Promise<PdfGenerationResult> {
  const generator = getPdfGenerator();
  return generator.generate(template, listing, options);
}
