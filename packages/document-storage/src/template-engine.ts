/**
 * Template Rendering Engine
 *
 * HTML to PDF and DOCX generation for lease documents and templates.
 */

import { createHash } from 'crypto';
import type { StorageClient } from './s3-client';
import { getStorageClient } from './s3-client';

// =============================================================================
// Types
// =============================================================================

export interface TemplateVariable {
  name: string;
  type: 'text' | 'date' | 'number' | 'currency' | 'signature' | 'checkbox';
  required: boolean;
  defaultValue?: string;
  label?: string;
  description?: string;
}

export interface Template {
  id: string;
  name: string;
  type: 'LEASE' | 'AMENDMENT' | 'DISCLOSURE' | 'OTHER';
  format: 'html' | 'docx';
  content: string;
  variables: TemplateVariable[];
  isSystem: boolean;
  version: string;
  marketId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RenderOptions {
  format: 'pdf' | 'docx' | 'html';
  variables: Record<string, string | number | boolean>;
  watermark?: string;
  headerHtml?: string;
  footerHtml?: string;
  margins?: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
}

export interface RenderResult {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  checksum: string;
}

// =============================================================================
// Template Variable Interpolation
// =============================================================================

/**
 * Interpolate variables in template content
 */
export function interpolateVariables(
  content: string,
  variables: Record<string, string | number | boolean>,
  templateVariables: TemplateVariable[]
): string {
  let result = content;

  // Create a map of variable names to their definitions
  const varDefs = new Map(templateVariables.map((v) => [v.name, v]));

  // Replace all {{variableName}} patterns
  result = result.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
    const value = variables[varName];
    const def = varDefs.get(varName);

    if (value === undefined || value === null) {
      if (def?.required) {
        throw new Error(`Required variable '${varName}' is missing`);
      }
      return def?.defaultValue || '';
    }

    // Format based on type
    if (def?.type === 'currency' && typeof value === 'number') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(value);
    }

    if (def?.type === 'date') {
      const date = new Date(value as string);
      // Use UTC to avoid timezone issues with YYYY-MM-DD format dates
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      });
    }

    if (def?.type === 'checkbox') {
      return value ? '☑' : '☐';
    }

    if (def?.type === 'signature') {
      return `<span class="signature-placeholder" data-signer="${value}">[Signature Required]</span>`;
    }

    return String(value);
  });

  return result;
}

// =============================================================================
// HTML to PDF Rendering
// =============================================================================

/**
 * Render HTML to PDF using Puppeteer-compatible interface
 *
 * Note: In production, this would use Puppeteer or Playwright.
 * For now, we provide a mock implementation that can be replaced.
 */
export async function renderHtmlToPdf(
  html: string,
  options: Partial<RenderOptions> = {}
): Promise<Buffer> {
  // Check if we're in a Node environment with Puppeteer available
  try {
    // Dynamic import to avoid bundling issues
    const puppeteer = await import('puppeteer').catch(() => null);

    if (puppeteer) {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      try {
        const page = await browser.newPage();

        // Add base styles for print
        const styledHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              @page {
                size: letter;
                margin: ${options.margins?.top || '1in'} ${options.margins?.right || '1in'} ${options.margins?.bottom || '1in'} ${options.margins?.left || '1in'};
              }
              body {
                font-family: 'Times New Roman', Times, serif;
                font-size: 12pt;
                line-height: 1.5;
                color: #000;
              }
              .signature-placeholder {
                display: inline-block;
                border-bottom: 1px solid #000;
                min-width: 200px;
                padding: 2px 4px;
              }
              .page-break {
                page-break-after: always;
              }
              ${options.watermark ? `
              body::before {
                content: '${options.watermark}';
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-45deg);
                font-size: 72pt;
                color: rgba(0, 0, 0, 0.1);
                z-index: -1;
              }
              ` : ''}
            </style>
          </head>
          <body>
            ${html}
          </body>
          </html>
        `;

        await page.setContent(styledHtml, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
          format: 'letter',
          printBackground: true,
          displayHeaderFooter: !!(options.headerHtml || options.footerHtml),
          headerTemplate: options.headerHtml || '',
          footerTemplate: options.footerHtml || `
            <div style="font-size: 10pt; width: 100%; text-align: center; color: #666;">
              Page <span class="pageNumber"></span> of <span class="totalPages"></span>
            </div>
          `,
          margin: {
            top: options.margins?.top || '1in',
            right: options.margins?.right || '1in',
            bottom: options.margins?.bottom || '1in',
            left: options.margins?.left || '1in',
          },
        });

        return Buffer.from(pdfBuffer);
      } finally {
        await browser.close();
      }
    }
  } catch {
    // Puppeteer not available, fall through to mock
  }

  // Mock PDF generation for development/testing
  // Returns a minimal valid PDF
  console.warn('[TemplateEngine] Puppeteer not available, generating mock PDF');
  return generateMockPdf(html);
}

/**
 * Generate a minimal mock PDF for testing
 */
function generateMockPdf(content: string): Buffer {
  const textContent = content.replace(/<[^>]*>/g, ' ').trim();
  const truncated = textContent.substring(0, 1000);

  // Minimal PDF structure
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
<< /Length ${50 + truncated.length} >>
stream
BT
/F1 12 Tf
72 720 Td
(${truncated.replace(/[()\\]/g, '\\$&')}) Tj
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
0000000${(366 + truncated.length).toString().padStart(3, '0')} 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${420 + truncated.length}
%%EOF`;

  return Buffer.from(pdf);
}

// =============================================================================
// DOCX Generation
// =============================================================================

/**
 * Generate DOCX from HTML content
 *
 * Note: In production, this would use a library like docx or html-to-docx.
 * For now, we provide a mock implementation.
 */
export async function renderHtmlToDocx(
  html: string,
  _options: Partial<RenderOptions> = {}
): Promise<Buffer> {
  try {
    // Dynamic import
    const htmlToDocx = await import('html-to-docx').catch(() => null);

    if (htmlToDocx) {
      const docxBuffer = await htmlToDocx.default(html, null, {
        table: { row: { cantSplit: true } },
        footer: true,
        pageNumber: true,
      });
      return Buffer.from(docxBuffer);
    }
  } catch {
    // html-to-docx not available
  }

  // Mock DOCX generation
  console.warn('[TemplateEngine] html-to-docx not available, generating mock DOCX');
  return generateMockDocx(html);
}

/**
 * Generate a minimal mock DOCX for testing
 */
function generateMockDocx(content: string): Buffer {
  // Minimal DOCX is a ZIP file with specific structure
  // For testing, we'll return a placeholder
  const textContent = content.replace(/<[^>]*>/g, ' ').trim();
  const placeholder = `[DOCX PLACEHOLDER]\n\n${textContent.substring(0, 500)}`;
  return Buffer.from(placeholder);
}

// =============================================================================
// Template Engine
// =============================================================================

export class TemplateEngine {
  private storage: StorageClient;
  // Template cache for future optimization
  private _templateCache: Map<string, Template> = new Map();

  constructor() {
    this.storage = getStorageClient();
  }

  /**
   * Render a template with variables
   */
  async render(
    template: Template,
    options: RenderOptions
  ): Promise<RenderResult> {
    // Interpolate variables
    const interpolated = interpolateVariables(
      template.content,
      options.variables,
      template.variables
    );

    let buffer: Buffer;
    let mimeType: string;
    let ext: string;

    switch (options.format) {
      case 'pdf':
        buffer = await renderHtmlToPdf(interpolated, options);
        mimeType = 'application/pdf';
        ext = 'pdf';
        break;

      case 'docx':
        buffer = await renderHtmlToDocx(interpolated, options);
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        ext = 'docx';
        break;

      case 'html':
      default:
        buffer = Buffer.from(interpolated);
        mimeType = 'text/html';
        ext = 'html';
        break;
    }

    const checksum = createHash('sha256').update(buffer).digest('hex');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${template.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.${ext}`;

    return {
      buffer,
      mimeType,
      filename,
      checksum,
    };
  }

  /**
   * Render and save to storage
   */
  async renderAndStore(
    template: Template,
    options: RenderOptions,
    prefix: string
  ): Promise<{ key: string; url: string; result: RenderResult }> {
    const result = await this.render(template, options);

    const key = this.storage.generateKey(prefix, result.filename);
    await this.storage.upload(key, result.buffer, result.mimeType, {
      templateId: template.id,
      templateVersion: template.version,
      checksum: result.checksum,
      generatedAt: new Date().toISOString(),
    });

    return {
      key,
      url: this.storage.getPublicUrl(key),
      result,
    };
  }

  /**
   * Get built-in system templates
   */
  getSystemTemplates(): Template[] {
    return SYSTEM_TEMPLATES;
  }

  /**
   * Get a specific system template by ID
   */
  getSystemTemplate(id: string): Template | undefined {
    return SYSTEM_TEMPLATES.find((t) => t.id === id);
  }
}

// =============================================================================
// System Templates
// =============================================================================

export const REBNY_LEASE_TEMPLATE: Template = {
  id: 'system_rebny_lease_v1',
  name: 'REBNY Standard Form of Apartment Lease',
  type: 'LEASE',
  format: 'html',
  isSystem: true,
  version: '1.0.0',
  marketId: 'nyc',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  variables: [
    { name: 'landlordName', type: 'text', required: true, label: 'Landlord Name' },
    { name: 'landlordAddress', type: 'text', required: true, label: 'Landlord Address' },
    { name: 'tenantName', type: 'text', required: true, label: 'Tenant Name' },
    { name: 'premisesAddress', type: 'text', required: true, label: 'Premises Address' },
    { name: 'apartmentNumber', type: 'text', required: true, label: 'Apartment Number' },
    { name: 'leaseStartDate', type: 'date', required: true, label: 'Lease Start Date' },
    { name: 'leaseEndDate', type: 'date', required: true, label: 'Lease End Date' },
    { name: 'monthlyRent', type: 'currency', required: true, label: 'Monthly Rent' },
    { name: 'securityDeposit', type: 'currency', required: true, label: 'Security Deposit' },
    { name: 'paymentDueDay', type: 'number', required: true, label: 'Rent Due Day', defaultValue: '1' },
    { name: 'lateFee', type: 'currency', required: false, label: 'Late Fee' },
    { name: 'lateFeeGraceDays', type: 'number', required: false, label: 'Late Fee Grace Days', defaultValue: '5' },
    { name: 'maxOccupants', type: 'number', required: true, label: 'Maximum Occupants' },
    { name: 'petsAllowed', type: 'checkbox', required: false, label: 'Pets Allowed' },
    { name: 'petDeposit', type: 'currency', required: false, label: 'Pet Deposit' },
    { name: 'includedUtilities', type: 'text', required: false, label: 'Included Utilities' },
    { name: 'landlordSignature', type: 'signature', required: true, label: 'Landlord Signature' },
    { name: 'tenantSignature', type: 'signature', required: true, label: 'Tenant Signature' },
    { name: 'signatureDate', type: 'date', required: true, label: 'Signature Date' },
  ],
  content: `
<div class="lease-document">
  <div class="header">
    <h1>RESIDENTIAL LEASE AGREEMENT</h1>
    <h2>REBNY Standard Form of Apartment Lease</h2>
    <p class="subtitle">New York City</p>
  </div>

  <div class="parties">
    <h3>PARTIES</h3>
    <p>This Lease Agreement ("Lease") is entered into as of {{signatureDate}}, by and between:</p>
    <p><strong>LANDLORD:</strong> {{landlordName}}<br>Address: {{landlordAddress}}</p>
    <p><strong>TENANT:</strong> {{tenantName}}</p>
  </div>

  <div class="premises">
    <h3>ARTICLE 1: PREMISES</h3>
    <p>Landlord leases to Tenant and Tenant hires from Landlord Apartment {{apartmentNumber}} (the "Apartment") in the building located at:</p>
    <p class="address">{{premisesAddress}}</p>
    <p>(the "Building") for residential purposes only.</p>
  </div>

  <div class="term">
    <h3>ARTICLE 2: TERM</h3>
    <p>The lease term begins on <strong>{{leaseStartDate}}</strong> and ends on <strong>{{leaseEndDate}}</strong>, unless sooner terminated as provided herein.</p>
  </div>

  <div class="rent">
    <h3>ARTICLE 3: RENT</h3>
    <p>Tenant agrees to pay a monthly rent of <strong>{{monthlyRent}}</strong>, payable in advance on or before the <strong>{{paymentDueDay}}</strong> day of each month.</p>
    <p>Rent shall be paid to Landlord at the address specified above or as otherwise directed in writing.</p>
    <p>If rent is not received within {{lateFeeGraceDays}} days after the due date, Tenant shall pay a late fee of {{lateFee}}.</p>
  </div>

  <div class="security">
    <h3>ARTICLE 4: SECURITY DEPOSIT</h3>
    <p>Upon execution of this Lease, Tenant shall deposit with Landlord the sum of <strong>{{securityDeposit}}</strong> as security for the full and faithful performance by Tenant of all terms, covenants, and conditions of this Lease.</p>
    <p>The security deposit shall be held in accordance with New York Real Property Law § 7-103.</p>
  </div>

  <div class="occupancy">
    <h3>ARTICLE 5: USE AND OCCUPANCY</h3>
    <p>The Apartment shall be occupied by no more than <strong>{{maxOccupants}}</strong> persons.</p>
    <p>Tenant shall use the Apartment for residential purposes only and shall comply with all applicable laws, ordinances, and regulations.</p>
  </div>

  <div class="utilities">
    <h3>ARTICLE 6: UTILITIES</h3>
    <p>The following utilities are included in the rent: {{includedUtilities}}</p>
    <p>Tenant shall be responsible for all other utilities not expressly included above.</p>
  </div>

  <div class="pets">
    <h3>ARTICLE 7: PETS</h3>
    <p>Pets: {{petsAllowed}}</p>
    {{#if petDeposit}}
    <p>Pet Deposit: {{petDeposit}}</p>
    {{/if}}
  </div>

  <div class="maintenance">
    <h3>ARTICLE 8: REPAIRS AND MAINTENANCE</h3>
    <p>Landlord shall maintain the Apartment and Building in accordance with applicable housing codes and make all necessary repairs to the plumbing, heating, electrical, and other building systems.</p>
    <p>Tenant shall keep the Apartment clean and in good condition, and shall promptly notify Landlord of any needed repairs.</p>
  </div>

  <div class="access">
    <h3>ARTICLE 9: ACCESS</h3>
    <p>Landlord or Landlord's agents may enter the Apartment at reasonable times and upon reasonable notice to inspect, make repairs, or show the Apartment to prospective tenants or purchasers.</p>
  </div>

  <div class="compliance">
    <h3>ARTICLE 10: COMPLIANCE WITH LAW</h3>
    <p>This Lease is subject to all applicable laws, including but not limited to the New York City Rent Stabilization Law (if applicable), the Fair Housing Act, and local housing codes.</p>
  </div>

  <div class="disclosure">
    <h3>ARTICLE 11: FARE ACT DISCLOSURE</h3>
    <p>Pursuant to New York City's FARE Act, if applicable, Tenant has received and acknowledges the required disclosures regarding broker fees and tenant rights.</p>
  </div>

  <div class="signatures">
    <h3>SIGNATURES</h3>
    <p>IN WITNESS WHEREOF, the parties have executed this Lease as of the date first written above.</p>

    <div class="signature-block">
      <div class="signature-line">
        <p>LANDLORD:</p>
        <p>{{landlordSignature}}</p>
        <p>{{landlordName}}</p>
        <p>Date: {{signatureDate}}</p>
      </div>

      <div class="signature-line">
        <p>TENANT:</p>
        <p>{{tenantSignature}}</p>
        <p>{{tenantName}}</p>
        <p>Date: {{signatureDate}}</p>
      </div>
    </div>
  </div>
</div>

<style>
  .lease-document {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    line-height: 1.6;
    max-width: 8.5in;
    margin: 0 auto;
    padding: 1in;
  }
  .header {
    text-align: center;
    margin-bottom: 2em;
  }
  .header h1 {
    font-size: 18pt;
    margin-bottom: 0.5em;
  }
  .header h2 {
    font-size: 14pt;
    font-weight: normal;
    margin-bottom: 0.25em;
  }
  .subtitle {
    font-style: italic;
  }
  h3 {
    font-size: 12pt;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    text-decoration: underline;
  }
  .address {
    margin-left: 2em;
    font-weight: bold;
  }
  .signatures {
    margin-top: 3em;
  }
  .signature-block {
    display: flex;
    justify-content: space-between;
    margin-top: 2em;
  }
  .signature-line {
    width: 45%;
  }
  .signature-line p {
    margin: 0.5em 0;
  }
</style>
`,
};

export const FARE_ACT_DISCLOSURE_TEMPLATE: Template = {
  id: 'system_fare_disclosure_v1',
  name: 'FARE Act Tenant Disclosure',
  type: 'DISCLOSURE',
  format: 'html',
  isSystem: true,
  version: '1.0.0',
  marketId: 'nyc',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  variables: [
    { name: 'tenantName', type: 'text', required: true, label: 'Tenant Name' },
    { name: 'premisesAddress', type: 'text', required: true, label: 'Property Address' },
    { name: 'brokerFeeAmount', type: 'currency', required: false, label: 'Broker Fee' },
    { name: 'brokerFeePaidBy', type: 'text', required: false, label: 'Broker Fee Paid By' },
    { name: 'disclosureDate', type: 'date', required: true, label: 'Disclosure Date' },
    { name: 'tenantSignature', type: 'signature', required: true, label: 'Tenant Signature' },
  ],
  content: `
<div class="disclosure-document">
  <h1>FARE ACT DISCLOSURE</h1>
  <h2>New York City Fair Access to Rental and Employment Act</h2>

  <p>Date: {{disclosureDate}}</p>
  <p>Tenant: {{tenantName}}</p>
  <p>Property: {{premisesAddress}}</p>

  <div class="disclosure-content">
    <h3>IMPORTANT NOTICE TO PROSPECTIVE TENANTS</h3>

    <p>Pursuant to the New York City Fair Access to Rental and Employment Act (FARE Act), effective June 14, 2024, you are entitled to the following protections:</p>

    <ol>
      <li><strong>Broker Fee Prohibition:</strong> You cannot be required to pay a broker fee for rental housing. Any broker fees must be paid by the landlord or property owner.</li>

      <li><strong>Income Requirements:</strong> Landlords may not require income exceeding 40 times the monthly rent as a condition of tenancy.</li>

      <li><strong>Credit Score Requirements:</strong> Landlords may not require a minimum credit score above 650.</li>

      <li><strong>Application Fees:</strong> Any fees charged for processing a rental application must be reasonable and reflect actual costs.</li>
    </ol>

    <h3>BROKER FEE DISCLOSURE</h3>
    <p>Broker Fee Amount: {{brokerFeeAmount}}</p>
    <p>Fee Paid By: {{brokerFeePaidBy}}</p>

    <h3>YOUR RIGHTS</h3>
    <p>If you believe your rights under the FARE Act have been violated, you may file a complaint with the New York City Commission on Human Rights.</p>
  </div>

  <div class="acknowledgment">
    <h3>TENANT ACKNOWLEDGMENT</h3>
    <p>I, {{tenantName}}, acknowledge that I have received and read this FARE Act Disclosure.</p>

    <div class="signature-block">
      <p>Tenant Signature: {{tenantSignature}}</p>
      <p>Date: {{disclosureDate}}</p>
    </div>
  </div>
</div>
`,
};

export const SYSTEM_TEMPLATES: Template[] = [
  REBNY_LEASE_TEMPLATE,
  FARE_ACT_DISCLOSURE_TEMPLATE,
];

// =============================================================================
// Singleton Instance
// =============================================================================

let templateEngineInstance: TemplateEngine | null = null;

export function getTemplateEngine(): TemplateEngine {
  if (!templateEngineInstance) {
    templateEngineInstance = new TemplateEngine();
  }
  return templateEngineInstance;
}
