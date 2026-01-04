/**
 * Vault Onboarding Tests
 *
 * Tests for vault onboarding service and folder structure.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  VAULT_FOLDERS,
  REQUIRED_DOCS,
  DEFAULT_ONBOARDING_STEPS,
  ALL_DOCUMENT_CATEGORIES,
  type PropertyType,
  type DocumentCategory,
  type VaultFolder,
} from '../vault-onboarding/types';

describe('Vault Onboarding', () => {
  describe('VAULT_FOLDERS', () => {
    it('should have OWNERSHIP folder with deed-related categories', () => {
      const ownership = VAULT_FOLDERS.OWNERSHIP;
      expect(ownership).toContain('DEED');
      expect(ownership).toContain('TITLE_INSURANCE');
      expect(ownership).toContain('SURVEY');
      expect(ownership).toContain('PLAT');
    });

    it('should have INSURANCE folder with insurance categories', () => {
      const insurance = VAULT_FOLDERS.INSURANCE;
      expect(insurance).toContain('PROPERTY_INSURANCE');
      expect(insurance).toContain('LIABILITY');
      expect(insurance).toContain('FLOOD');
    });

    it('should have PERMITS folder with permit categories', () => {
      const permits = VAULT_FOLDERS.PERMITS;
      expect(permits).toContain('BUILDING_PERMITS');
      expect(permits).toContain('ZONING');
      expect(permits).toContain('CO_CERTIFICATE');
    });

    it('should have LEASES folder with lease categories', () => {
      const leases = VAULT_FOLDERS.LEASES;
      expect(leases).toContain('ACTIVE_LEASES');
      expect(leases).toContain('AMENDMENTS');
      expect(leases).toContain('MOVE_IN_DOCS');
    });

    it('should have FINANCIALS folder with financial categories', () => {
      const financials = VAULT_FOLDERS.FINANCIALS;
      expect(financials).toContain('TAX_RECORDS');
      expect(financials).toContain('ASSESSMENTS');
      expect(financials).toContain('APPRAISALS');
    });

    it('should have MAINTENANCE folder with maintenance categories', () => {
      const maintenance = VAULT_FOLDERS.MAINTENANCE;
      expect(maintenance).toContain('WARRANTIES');
      expect(maintenance).toContain('SERVICE_RECORDS');
      expect(maintenance).toContain('INSPECTIONS');
    });

    it('should have 6 total folders', () => {
      const folders = Object.keys(VAULT_FOLDERS);
      expect(folders).toHaveLength(6);
    });
  });

  describe('REQUIRED_DOCS', () => {
    it('should require DEED for all property types', () => {
      const propertyTypes: PropertyType[] = [
        'SINGLE_FAMILY',
        'MULTI_FAMILY',
        'CONDO',
        'TOWNHOUSE',
        'COMMERCIAL',
        'INDUSTRIAL',
        'MIXED_USE',
        'LAND',
        'OTHER',
      ];

      for (const type of propertyTypes) {
        expect(REQUIRED_DOCS[type]).toContain('DEED');
      }
    });

    it('should require PROPERTY_INSURANCE for residential properties', () => {
      expect(REQUIRED_DOCS.SINGLE_FAMILY).toContain('PROPERTY_INSURANCE');
      expect(REQUIRED_DOCS.MULTI_FAMILY).toContain('PROPERTY_INSURANCE');
      expect(REQUIRED_DOCS.CONDO).toContain('PROPERTY_INSURANCE');
      expect(REQUIRED_DOCS.TOWNHOUSE).toContain('PROPERTY_INSURANCE');
    });

    it('should require BUILDING_PERMITS for multi-family', () => {
      expect(REQUIRED_DOCS.MULTI_FAMILY).toContain('BUILDING_PERMITS');
    });

    it('should require SURVEY for single-family', () => {
      expect(REQUIRED_DOCS.SINGLE_FAMILY).toContain('SURVEY');
    });

    it('should require ZONING for commercial properties', () => {
      expect(REQUIRED_DOCS.COMMERCIAL).toContain('ZONING');
      expect(REQUIRED_DOCS.INDUSTRIAL).toContain('ZONING');
      expect(REQUIRED_DOCS.MIXED_USE).toContain('ZONING');
      expect(REQUIRED_DOCS.LAND).toContain('ZONING');
    });

    it('should have different requirements for LAND', () => {
      const landDocs = REQUIRED_DOCS.LAND;
      expect(landDocs).toContain('DEED');
      expect(landDocs).toContain('SURVEY');
      expect(landDocs).toContain('ZONING');
      expect(landDocs).not.toContain('PROPERTY_INSURANCE');
    });

    it('should have CO_CERTIFICATE for commercial properties', () => {
      expect(REQUIRED_DOCS.COMMERCIAL).toContain('CO_CERTIFICATE');
      expect(REQUIRED_DOCS.MIXED_USE).toContain('CO_CERTIFICATE');
    });
  });

  describe('DEFAULT_ONBOARDING_STEPS', () => {
    it('should have 4 onboarding steps', () => {
      expect(DEFAULT_ONBOARDING_STEPS).toHaveLength(4);
    });

    it('should have ownership step first', () => {
      const firstStep = DEFAULT_ONBOARDING_STEPS[0];
      expect(firstStep.id).toBe('ownership');
      expect(firstStep.name).toBe('Ownership Documents');
      expect(firstStep.categories).toContain('DEED');
    });

    it('should have insurance step second', () => {
      const secondStep = DEFAULT_ONBOARDING_STEPS[1];
      expect(secondStep.id).toBe('insurance');
      expect(secondStep.name).toBe('Insurance Coverage');
      expect(secondStep.categories).toContain('PROPERTY_INSURANCE');
    });

    it('should have permits step third', () => {
      const thirdStep = DEFAULT_ONBOARDING_STEPS[2];
      expect(thirdStep.id).toBe('permits');
      expect(thirdStep.name).toBe('Permits & Compliance');
      expect(thirdStep.categories).toContain('BUILDING_PERMITS');
    });

    it('should have leases step fourth', () => {
      const fourthStep = DEFAULT_ONBOARDING_STEPS[3];
      expect(fourthStep.id).toBe('leases');
      expect(fourthStep.name).toBe('Lease Documents');
      expect(fourthStep.categories).toContain('ACTIVE_LEASES');
    });

    it('should have descriptions for all steps', () => {
      for (const step of DEFAULT_ONBOARDING_STEPS) {
        expect(step.description).toBeTruthy();
        expect(step.description.length).toBeGreaterThan(10);
      }
    });
  });

  describe('ALL_DOCUMENT_CATEGORIES', () => {
    it('should contain all categories from all folders', () => {
      const expectedCategories = [
        'DEED',
        'TITLE_INSURANCE',
        'SURVEY',
        'PLAT',
        'PROPERTY_INSURANCE',
        'LIABILITY',
        'FLOOD',
        'BUILDING_PERMITS',
        'ZONING',
        'CO_CERTIFICATE',
        'ACTIVE_LEASES',
        'AMENDMENTS',
        'MOVE_IN_DOCS',
        'TAX_RECORDS',
        'ASSESSMENTS',
        'APPRAISALS',
        'WARRANTIES',
        'SERVICE_RECORDS',
        'INSPECTIONS',
      ];

      for (const category of expectedCategories) {
        expect(ALL_DOCUMENT_CATEGORIES).toContain(category);
      }
    });

    it('should have unique categories', () => {
      const uniqueCategories = new Set(ALL_DOCUMENT_CATEGORIES);
      expect(uniqueCategories.size).toBe(ALL_DOCUMENT_CATEGORIES.length);
    });

    it('should have 19 total categories', () => {
      expect(ALL_DOCUMENT_CATEGORIES).toHaveLength(19);
    });
  });

  describe('Category to Folder Mapping', () => {
    it('should be able to find folder for each category', () => {
      const categoryToFolder: Record<string, VaultFolder> = {};

      for (const [folder, categories] of Object.entries(VAULT_FOLDERS)) {
        for (const category of categories) {
          categoryToFolder[category] = folder as VaultFolder;
        }
      }

      // Verify some mappings
      expect(categoryToFolder.DEED).toBe('OWNERSHIP');
      expect(categoryToFolder.PROPERTY_INSURANCE).toBe('INSURANCE');
      expect(categoryToFolder.BUILDING_PERMITS).toBe('PERMITS');
      expect(categoryToFolder.ACTIVE_LEASES).toBe('LEASES');
      expect(categoryToFolder.TAX_RECORDS).toBe('FINANCIALS');
      expect(categoryToFolder.WARRANTIES).toBe('MAINTENANCE');
    });
  });

  describe('Property Type Coverage', () => {
    it('should have 9 property types defined', () => {
      const propertyTypes = Object.keys(REQUIRED_DOCS);
      expect(propertyTypes).toHaveLength(9);
    });

    it('should have at least 2 required docs for each type', () => {
      for (const [type, docs] of Object.entries(REQUIRED_DOCS)) {
        expect(docs.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should have reasonable doc counts per type', () => {
      expect(REQUIRED_DOCS.SINGLE_FAMILY.length).toBeLessThanOrEqual(5);
      expect(REQUIRED_DOCS.COMMERCIAL.length).toBeLessThanOrEqual(10);
    });
  });
});
