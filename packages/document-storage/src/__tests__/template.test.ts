/**
 * Template Engine Tests
 *
 * Tests for template variable interpolation and document generation.
 */

import { describe, it, expect } from 'vitest';
import {
  interpolateVariables,
  getTemplateEngine,
  REBNY_LEASE_TEMPLATE,
  FARE_ACT_DISCLOSURE_TEMPLATE,
  SYSTEM_TEMPLATES,
  type Template,
  type TemplateVariable,
} from '../template-engine';

describe('Variable Interpolation', () => {
  const variables: TemplateVariable[] = [
    { name: 'name', type: 'text', required: true },
    { name: 'amount', type: 'currency', required: true },
    { name: 'date', type: 'date', required: true },
    { name: 'agreed', type: 'checkbox', required: false },
    { name: 'optional', type: 'text', required: false, defaultValue: 'default' },
  ];

  it('should interpolate text variables', () => {
    const content = 'Hello {{name}}!';
    const result = interpolateVariables(content, { name: 'John' }, variables);
    expect(result).toBe('Hello John!');
  });

  it('should interpolate multiple variables', () => {
    const content = '{{name}} owes {{amount}} due on {{date}}';
    const result = interpolateVariables(
      content,
      {
        name: 'John',
        amount: 1500,
        date: '2024-03-15',
      },
      variables
    );

    expect(result).toContain('John');
    expect(result).toContain('$1,500.00');
    expect(result).toContain('March 15, 2024');
  });

  it('should format currency values', () => {
    const content = 'Total: {{amount}}';
    const result = interpolateVariables(content, { amount: 2500.50 }, variables);
    expect(result).toBe('Total: $2,500.50');
  });

  it('should format date values', () => {
    const content = 'Date: {{date}}';
    const result = interpolateVariables(content, { date: '2024-06-15' }, variables);
    expect(result).toContain('June');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('should format checkbox as checked/unchecked', () => {
    const content = 'Agreed: {{agreed}}';

    const checkedResult = interpolateVariables(content, { agreed: true }, variables);
    expect(checkedResult).toBe('Agreed: ☑');

    const uncheckedResult = interpolateVariables(content, { agreed: false }, variables);
    expect(uncheckedResult).toBe('Agreed: ☐');
  });

  it('should use default value for missing optional variables', () => {
    const content = 'Value: {{optional}}';
    const result = interpolateVariables(content, {}, variables);
    expect(result).toBe('Value: default');
  });

  it('should throw for missing required variables', () => {
    const content = 'Hello {{name}}!';
    expect(() => {
      interpolateVariables(content, {}, variables);
    }).toThrow("Required variable 'name' is missing");
  });

  it('should handle signature placeholders', () => {
    const sigVariables: TemplateVariable[] = [
      { name: 'signerName', type: 'signature', required: true },
    ];
    const content = 'Sign here: {{signerName}}';
    const result = interpolateVariables(content, { signerName: 'John Doe' }, sigVariables);
    expect(result).toContain('signature-placeholder');
    expect(result).toContain('John Doe');
  });
});

describe('Template Engine', () => {
  const engine = getTemplateEngine();

  describe('System Templates', () => {
    it('should return all system templates', () => {
      const templates = engine.getSystemTemplates();
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every((t) => t.isSystem)).toBe(true);
    });

    it('should find REBNY lease template by ID', () => {
      const template = engine.getSystemTemplate('system_rebny_lease_v1');
      expect(template).toBeDefined();
      expect(template?.name).toContain('REBNY');
      expect(template?.type).toBe('LEASE');
    });

    it('should find FARE disclosure template by ID', () => {
      const template = engine.getSystemTemplate('system_fare_disclosure_v1');
      expect(template).toBeDefined();
      expect(template?.type).toBe('DISCLOSURE');
    });

    it('should return undefined for unknown template ID', () => {
      const template = engine.getSystemTemplate('unknown_id');
      expect(template).toBeUndefined();
    });
  });

  describe('Template Rendering', () => {
    it('should render template to HTML', async () => {
      const template: Template = {
        id: 'test_template',
        name: 'Test Template',
        type: 'OTHER',
        format: 'html',
        isSystem: false,
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        variables: [
          { name: 'title', type: 'text', required: true },
          { name: 'content', type: 'text', required: true },
        ],
        content: '<h1>{{title}}</h1><p>{{content}}</p>',
      };

      const result = await engine.render(template, {
        format: 'html',
        variables: {
          title: 'Test Document',
          content: 'This is test content.',
        },
      });

      expect(result.mimeType).toBe('text/html');
      expect(result.buffer.toString()).toContain('<h1>Test Document</h1>');
      expect(result.buffer.toString()).toContain('<p>This is test content.</p>');
      expect(result.checksum).toBeDefined();
      expect(result.filename).toContain('Test_Template');
      expect(result.filename.endsWith('.html')).toBe(true);
    });

    it('should render template to PDF (mock)', async () => {
      const template: Template = {
        id: 'test_pdf',
        name: 'PDF Test',
        type: 'OTHER',
        format: 'html',
        isSystem: false,
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        variables: [{ name: 'text', type: 'text', required: true }],
        content: '<p>{{text}}</p>',
      };

      const result = await engine.render(template, {
        format: 'pdf',
        variables: { text: 'PDF content' },
      });

      expect(result.mimeType).toBe('application/pdf');
      expect(result.filename.endsWith('.pdf')).toBe(true);
      expect(result.buffer.length).toBeGreaterThan(0);
      // Mock PDF should contain %PDF header
      expect(result.buffer.toString().startsWith('%PDF')).toBe(true);
    });
  });
});

describe('REBNY Lease Template', () => {
  it('should have all required variables', () => {
    const requiredVars = [
      'landlordName',
      'tenantName',
      'premisesAddress',
      'leaseStartDate',
      'leaseEndDate',
      'monthlyRent',
      'securityDeposit',
    ];

    for (const varName of requiredVars) {
      const variable = REBNY_LEASE_TEMPLATE.variables.find((v) => v.name === varName);
      expect(variable).toBeDefined();
      expect(variable?.required).toBe(true);
    }
  });

  it('should have signature fields', () => {
    const signatures = REBNY_LEASE_TEMPLATE.variables.filter((v) => v.type === 'signature');
    expect(signatures.length).toBeGreaterThanOrEqual(2);
    expect(signatures.some((s) => s.name === 'landlordSignature')).toBe(true);
    expect(signatures.some((s) => s.name === 'tenantSignature')).toBe(true);
  });

  it('should be marked as system template', () => {
    expect(REBNY_LEASE_TEMPLATE.isSystem).toBe(true);
  });

  it('should be NYC market specific', () => {
    expect(REBNY_LEASE_TEMPLATE.marketId).toBe('nyc');
  });

  it('should contain lease sections', () => {
    const content = REBNY_LEASE_TEMPLATE.content;
    expect(content).toContain('PREMISES');
    expect(content).toContain('TERM');
    expect(content).toContain('RENT');
    expect(content).toContain('SECURITY');
    expect(content).toContain('SIGNATURES');
  });
});

describe('FARE Act Disclosure Template', () => {
  it('should have required variables', () => {
    const requiredVars = ['tenantName', 'premisesAddress', 'disclosureDate'];

    for (const varName of requiredVars) {
      const variable = FARE_ACT_DISCLOSURE_TEMPLATE.variables.find((v) => v.name === varName);
      expect(variable).toBeDefined();
      expect(variable?.required).toBe(true);
    }
  });

  it('should be disclosure type', () => {
    expect(FARE_ACT_DISCLOSURE_TEMPLATE.type).toBe('DISCLOSURE');
  });

  it('should contain FARE Act information', () => {
    const content = FARE_ACT_DISCLOSURE_TEMPLATE.content;
    expect(content).toContain('FARE');
    expect(content).toContain('broker fee');
    expect(content).toContain('income');
  });
});

describe('System Templates Collection', () => {
  it('should have at least 2 templates', () => {
    expect(SYSTEM_TEMPLATES.length).toBeGreaterThanOrEqual(2);
  });

  it('should all be marked as system', () => {
    expect(SYSTEM_TEMPLATES.every((t) => t.isSystem)).toBe(true);
  });

  it('should have unique IDs', () => {
    const ids = SYSTEM_TEMPLATES.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should all have version strings', () => {
    expect(SYSTEM_TEMPLATES.every((t) => t.version.match(/^\d+\.\d+\.\d+$/))).toBe(true);
  });
});
