/**
 * Template Validator Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { TemplateValidator, getTemplateValidator, validateTemplate, canSaveTemplate } from './template-validator';
import type { CollateralTemplate, CollateralType, TemplateSource } from './types';

// Helper to create a mock template
function createMockTemplate(overrides: Partial<CollateralTemplate> = {}): CollateralTemplate {
  return {
    id: 'test-template-1',
    name: 'Test Template',
    type: 'flyer' as CollateralType,
    source: 'user' as TemplateSource,
    version: '1.0.0',
    htmlTemplate: '<html><body>{{listing_title}}</body></html>',
    variables: [
      { name: 'listing_title', type: 'string', required: true },
    ],
    requiredComplianceBlocks: [
      'nyc_fare_act_disclosure',
      'nyc_fare_fee_disclosure',
      'fair_housing_notice',
    ],
    supportedFormats: ['pdf'],
    isActive: true,
    isSystem: false,
    createdBy: 'user-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('TemplateValidator', () => {
  let validator: TemplateValidator;

  beforeEach(() => {
    validator = new TemplateValidator();
  });

  describe('validate', () => {
    it('should pass validation for template with all required blocks', () => {
      const template = createMockTemplate();
      const result = validator.validate(template, { marketPackId: 'NYC_STRICT' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when missing required non-removable block', () => {
      const template = createMockTemplate({
        requiredComplianceBlocks: ['fair_housing_notice'], // Missing FARE blocks
      });

      const result = validator.validate(template, { marketPackId: 'NYC_STRICT' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'COMPLIANCE_BLOCK_MISSING')).toBe(true);
      expect(result.errors.some((e) => e.blockId === 'nyc_fare_act_disclosure')).toBe(true);
    });

    it('should fail when user removes non-removable block from parent template', () => {
      const parentTemplate = createMockTemplate();
      const childTemplate = createMockTemplate({
        requiredComplianceBlocks: ['fair_housing_notice'], // Removed FARE blocks
      });

      const result = validator.validate(childTemplate, {
        marketPackId: 'NYC_STRICT',
        parentTemplate,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'COMPLIANCE_BLOCK_REMOVED')).toBe(true);
    });

    it('should warn about missing injection points', () => {
      const template = createMockTemplate({
        htmlTemplate: '<html><body>No injection points</body></html>',
      });

      const result = validator.validate(template, {
        marketPackId: 'NYC_STRICT',
        checkInjectionPoints: true,
      });

      expect(result.warnings.some((w) => w.code === 'MISSING_INJECTION_POINT')).toBe(true);
    });

    it('should fail for empty HTML template', () => {
      const template = createMockTemplate({
        htmlTemplate: '',
      });

      const result = validator.validate(template, { marketPackId: 'NYC_STRICT' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_HTML')).toBe(true);
    });

    it('should fail for undefined variables used in template', () => {
      const template = createMockTemplate({
        htmlTemplate: '<html><body>{{undefined_variable}}</body></html>',
        variables: [],
      });

      const result = validator.validate(template, { marketPackId: 'NYC_STRICT' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_VARIABLE')).toBe(true);
    });

    it('should warn about unused defined variables', () => {
      const template = createMockTemplate({
        htmlTemplate: '<html><body>No variables used</body></html>',
        variables: [
          { name: 'unused_var', type: 'string', required: false },
        ],
      });

      const result = validator.validate(template, { marketPackId: 'NYC_STRICT' });

      expect(result.warnings.some((w) => w.code === 'VARIABLE_UNUSED')).toBe(true);
    });

    it('should pass for brochure with all required NYC blocks', () => {
      const template = createMockTemplate({
        type: 'brochure',
        requiredComplianceBlocks: [
          'nyc_fare_act_disclosure',
          'nyc_fare_fee_disclosure',
          'nyc_lead_paint_disclosure',
          'nyc_bedbug_disclosure',
          'fair_housing_notice',
        ],
      });

      const result = validator.validate(template, { marketPackId: 'NYC_STRICT' });

      expect(result.valid).toBe(true);
    });

    it('should fail for brochure missing lead paint disclosure', () => {
      const template = createMockTemplate({
        type: 'brochure',
        requiredComplianceBlocks: [
          'nyc_fare_act_disclosure',
          'nyc_fare_fee_disclosure',
          // Missing nyc_lead_paint_disclosure
          'nyc_bedbug_disclosure',
          'fair_housing_notice',
        ],
      });

      const result = validator.validate(template, { marketPackId: 'NYC_STRICT' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.blockId === 'nyc_lead_paint_disclosure')).toBe(true);
    });
  });

  describe('canSave', () => {
    it('should return true when all required blocks present', () => {
      const template = createMockTemplate();
      expect(validator.canSave(template, 'NYC_STRICT')).toBe(true);
    });

    it('should return false when missing required blocks', () => {
      const template = createMockTemplate({
        requiredComplianceBlocks: [],
      });
      expect(validator.canSave(template, 'NYC_STRICT')).toBe(false);
    });
  });

  describe('getMissingBlocks', () => {
    it('should return missing blocks', () => {
      const template = createMockTemplate({
        requiredComplianceBlocks: ['fair_housing_notice'],
      });

      const result = validator.getMissingBlocks(template, 'NYC_STRICT');

      expect(result.valid).toBe(false);
      expect(result.missingBlocks.length).toBeGreaterThan(0);
      expect(result.missingBlocks.some((b) => b.id === 'nyc_fare_act_disclosure')).toBe(true);
    });

    it('should return empty when all blocks present', () => {
      const template = createMockTemplate();
      const result = validator.getMissingBlocks(template, 'NYC_STRICT');

      expect(result.valid).toBe(true);
      expect(result.missingBlocks).toHaveLength(0);
    });
  });

  describe('ensureRequiredBlocks', () => {
    it('should add missing required blocks', () => {
      const template = createMockTemplate({
        requiredComplianceBlocks: [],
      });

      const updated = validator.ensureRequiredBlocks(template, 'NYC_STRICT');

      expect(updated.requiredComplianceBlocks).toContain('nyc_fare_act_disclosure');
      expect(updated.requiredComplianceBlocks).toContain('nyc_fare_fee_disclosure');
      expect(updated.requiredComplianceBlocks).toContain('fair_housing_notice');
    });

    it('should not duplicate existing blocks', () => {
      const template = createMockTemplate({
        requiredComplianceBlocks: ['nyc_fare_act_disclosure'],
      });

      const updated = validator.ensureRequiredBlocks(template, 'NYC_STRICT');

      const fareActCount = updated.requiredComplianceBlocks.filter(
        (id) => id === 'nyc_fare_act_disclosure'
      ).length;
      expect(fareActCount).toBe(1);
    });
  });
});

describe('Convenience functions', () => {
  describe('validateTemplate', () => {
    it('should validate using default validator', () => {
      const template = createMockTemplate();
      const result = validateTemplate(template, 'NYC_STRICT');

      expect(result.valid).toBe(true);
    });
  });

  describe('canSaveTemplate', () => {
    it('should check if template can be saved', () => {
      const template = createMockTemplate();
      expect(canSaveTemplate(template, 'NYC_STRICT')).toBe(true);
    });
  });

  describe('getTemplateValidator', () => {
    it('should return singleton instance', () => {
      const v1 = getTemplateValidator();
      const v2 = getTemplateValidator();
      expect(v1).toBe(v2);
    });
  });
});
