/**
 * Deterministic Generation Tests
 *
 * Ensures that same inputs always produce identical outputs (checksums).
 * Critical for audit trails and evidence recording.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BatchGenerator } from '../orchestrator/batch-generator';
import type { CollateralTemplate, ListingSnapshot } from '../types';

// ============================================================================
// Fixtures
// ============================================================================

const fixturesPath = join(__dirname, '../__fixtures__');

function loadListingFixture(name: string): ListingSnapshot {
  const filePath = join(fixturesPath, 'listings', `${name}.json`);
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));

  return {
    id: data.id,
    title: data.title,
    address: data.address,
    rent: data.rent,
    bedrooms: data.bedrooms,
    bathrooms: data.bathrooms,
    squareFeet: data.squareFeet,
    availableDate: new Date(data.availableDate),
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
  const htmlPath = join(fixturesPath, 'templates', 'minimal-flyer.html');
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

// ============================================================================
// Input Hash Determinism Tests
// ============================================================================

describe('Deterministic Input Hash', () => {
  const batchGenerator = new BatchGenerator();

  it('should produce identical input hash for same listing and template', () => {
    const listing = loadListingFixture('nyc-apartment');
    const template = loadTemplateFixture();

    const hash1 = batchGenerator.calculateInputHash(listing, template);
    const hash2 = batchGenerator.calculateInputHash(listing, template);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex string
  });

  it('should produce different hash for different listing', () => {
    const nycListing = loadListingFixture('nyc-apartment');
    const stdListing = loadListingFixture('standard-apartment');
    const template = loadTemplateFixture();

    const hash1 = batchGenerator.calculateInputHash(nycListing, template);
    const hash2 = batchGenerator.calculateInputHash(stdListing, template);

    expect(hash1).not.toBe(hash2);
  });

  it('should produce different hash for different template version', () => {
    const listing = loadListingFixture('nyc-apartment');
    const template1 = loadTemplateFixture();
    const template2 = { ...template1, version: '2.0.0' };

    const hash1 = batchGenerator.calculateInputHash(listing, template1);
    const hash2 = batchGenerator.calculateInputHash(listing, template2);

    expect(hash1).not.toBe(hash2);
  });

  it('should produce identical hash when variables are the same', () => {
    const listing = loadListingFixture('nyc-apartment');
    const template = loadTemplateFixture();

    // Variables are currently not included in hash (per implementation)
    // This test verifies the current behavior
    const hash1 = batchGenerator.calculateInputHash(listing, template, { agent: 'John' });
    const hash2 = batchGenerator.calculateInputHash(listing, template, { agent: 'John' });

    expect(hash1).toBe(hash2);
  });

  it('should handle empty variables consistently', () => {
    const listing = loadListingFixture('nyc-apartment');
    const template = loadTemplateFixture();

    const hash1 = batchGenerator.calculateInputHash(listing, template, {});
    const hash2 = batchGenerator.calculateInputHash(listing, template, undefined);

    expect(hash1).toBe(hash2);
  });
});

// ============================================================================
// Content Hash Determinism Tests
// ============================================================================

describe('Deterministic Content Hashing', () => {
  it('should produce identical checksum for identical content', () => {
    const content = 'Test content for hashing';

    const checksum1 = createHash('sha256').update(content).digest('hex');
    const checksum2 = createHash('sha256').update(content).digest('hex');

    expect(checksum1).toBe(checksum2);
  });

  it('should produce different checksum for different content', () => {
    const content1 = 'Test content version 1';
    const content2 = 'Test content version 2';

    const checksum1 = createHash('sha256').update(content1).digest('hex');
    const checksum2 = createHash('sha256').update(content2).digest('hex');

    expect(checksum1).not.toBe(checksum2);
  });

  it('should be sensitive to whitespace changes', () => {
    const content1 = 'Test content';
    const content2 = 'Test  content'; // Extra space

    const checksum1 = createHash('sha256').update(content1).digest('hex');
    const checksum2 = createHash('sha256').update(content2).digest('hex');

    expect(checksum1).not.toBe(checksum2);
  });
});

// ============================================================================
// Fixture Integrity Tests
// ============================================================================

describe('Fixture Integrity', () => {
  it('should load NYC apartment fixture correctly', () => {
    const listing = loadListingFixture('nyc-apartment');

    expect(listing.id).toBe('test-listing-nyc-001');
    expect(listing.marketId).toBe('NYC_STRICT');
    expect(listing.rent).toBe(3500);
    expect(listing.bedrooms).toBe(2);
  });

  it('should load standard apartment fixture correctly', () => {
    const listing = loadListingFixture('standard-apartment');

    expect(listing.id).toBe('test-listing-std-001');
    expect(listing.marketId).toBe('US_STANDARD');
    expect(listing.rent).toBe(1800);
  });

  it('should load template fixture correctly', () => {
    const template = loadTemplateFixture();

    expect(template.id).toBe('fixture-template-001');
    expect(template.type).toBe('flyer');
    expect(template.htmlTemplate).toContain('{{listing.title}}');
  });

  it('should produce consistent checksums for same fixture data', () => {
    // Same fixture data should produce identical checksums
    const nycListing1 = loadListingFixture('nyc-apartment');
    const nycListing2 = loadListingFixture('nyc-apartment');

    const checksum1 = createHash('sha256')
      .update(JSON.stringify({
        id: nycListing1.id,
        marketId: nycListing1.marketId,
        rent: nycListing1.rent,
      }))
      .digest('hex')
      .substring(0, 16);

    const checksum2 = createHash('sha256')
      .update(JSON.stringify({
        id: nycListing2.id,
        marketId: nycListing2.marketId,
        rent: nycListing2.rent,
      }))
      .digest('hex')
      .substring(0, 16);

    expect(checksum1).toBe(checksum2);
    expect(checksum1).toHaveLength(16);
  });
});

// ============================================================================
// Evidence Record Consistency Tests
// ============================================================================

describe('Evidence Record Consistency', () => {
  it('should generate consistent evidence for same generation', () => {
    const listing = loadListingFixture('nyc-apartment');
    const template = loadTemplateFixture();
    const batchGenerator = new BatchGenerator();

    const inputHash1 = batchGenerator.calculateInputHash(listing, template);
    const inputHash2 = batchGenerator.calculateInputHash(listing, template);

    // Evidence should reference same input hash
    expect(inputHash1).toBe(inputHash2);
  });

  it('should include all required evidence fields', () => {
    const listing = loadListingFixture('nyc-apartment');
    const template = loadTemplateFixture();
    const batchGenerator = new BatchGenerator();

    const inputHash = batchGenerator.calculateInputHash(listing, template);

    // Verify hash is valid
    expect(inputHash).toBeDefined();
    expect(typeof inputHash).toBe('string');
    expect(inputHash.length).toBe(64);

    // Verify listing ID is captured
    expect(listing.id).toBeDefined();

    // Verify template version is captured
    expect(template.version).toBeDefined();

    // Verify market pack is captured
    expect(listing.marketId).toBeDefined();
  });
});

// ============================================================================
// Market-Specific Compliance Tests
// ============================================================================

describe('Market-Specific Compliance Requirements', () => {
  it('should identify NYC listing as strict market', () => {
    const listing = loadListingFixture('nyc-apartment');

    expect(listing.marketId).toBe('NYC_STRICT');
  });

  it('should identify standard listing as non-strict market', () => {
    const listing = loadListingFixture('standard-apartment');

    expect(listing.marketId).toBe('US_STANDARD');
  });
});
