/**
 * Compliance Blocks Tests
 */

import { describe, it, expect } from 'vitest';

import {
  NYC_COMPLIANCE_BLOCKS,
  DEFAULT_COMPLIANCE_BLOCKS,
  MARKET_COMPLIANCE_BLOCKS,
  getMarketBlocks,
  getRequiredBlocksForType,
  getNonRemovableBlocks,
  isBlockRequired,
  getBlockById,
  sortBlocksByPriority,
  groupBlocksByPosition,
} from './compliance-blocks';
import type { CollateralType } from './types';

describe('NYC Compliance Blocks', () => {
  it('should have required NYC blocks', () => {
    expect(NYC_COMPLIANCE_BLOCKS).toBeDefined();
    expect(NYC_COMPLIANCE_BLOCKS.length).toBeGreaterThan(0);

    // Check for FARE Act blocks
    const fareActBlock = NYC_COMPLIANCE_BLOCKS.find(
      (b) => b.id === 'nyc_fare_act_disclosure'
    );
    expect(fareActBlock).toBeDefined();
    expect(fareActBlock?.isRemovable).toBe(false);

    const fareFeeBlock = NYC_COMPLIANCE_BLOCKS.find(
      (b) => b.id === 'nyc_fare_fee_disclosure'
    );
    expect(fareFeeBlock).toBeDefined();
    expect(fareFeeBlock?.isRemovable).toBe(false);
  });

  it('should have lead paint disclosure', () => {
    const leadPaintBlock = NYC_COMPLIANCE_BLOCKS.find(
      (b) => b.id === 'nyc_lead_paint_disclosure'
    );
    expect(leadPaintBlock).toBeDefined();
    expect(leadPaintBlock?.isRemovable).toBe(false);
    expect(leadPaintBlock?.requiredFor).toContain('brochure');
    expect(leadPaintBlock?.requiredFor).toContain('listing_deck');
  });

  it('should have bedbug disclosure for NYC', () => {
    const bedbugBlock = NYC_COMPLIANCE_BLOCKS.find(
      (b) => b.id === 'nyc_bedbug_disclosure'
    );
    expect(bedbugBlock).toBeDefined();
    expect(bedbugBlock?.requiredFor).toContain('brochure');
    expect(bedbugBlock?.requiredFor).not.toContain('flyer');
  });

  it('should have fair housing notice', () => {
    const fairHousingBlock = NYC_COMPLIANCE_BLOCKS.find(
      (b) => b.id === 'fair_housing_notice'
    );
    expect(fairHousingBlock).toBeDefined();
    expect(fairHousingBlock?.isRemovable).toBe(false);
  });
});

describe('getMarketBlocks', () => {
  it('should return NYC blocks for NYC_STRICT', () => {
    const blocks = getMarketBlocks('NYC_STRICT');
    expect(blocks).toEqual(NYC_COMPLIANCE_BLOCKS);
  });

  it('should return default blocks for unknown market', () => {
    const blocks = getMarketBlocks('UNKNOWN_MARKET');
    expect(blocks).toEqual(DEFAULT_COMPLIANCE_BLOCKS);
  });

  it('should return default blocks for DEFAULT market', () => {
    const blocks = getMarketBlocks('DEFAULT');
    expect(blocks).toEqual(DEFAULT_COMPLIANCE_BLOCKS);
  });
});

describe('getRequiredBlocksForType', () => {
  it('should return FARE blocks for flyers in NYC', () => {
    const blocks = getRequiredBlocksForType('NYC_STRICT', 'flyer');

    expect(blocks.some((b) => b.id === 'nyc_fare_act_disclosure')).toBe(true);
    expect(blocks.some((b) => b.id === 'nyc_fare_fee_disclosure')).toBe(true);
    expect(blocks.some((b) => b.id === 'fair_housing_notice')).toBe(true);
  });

  it('should return more blocks for brochures in NYC', () => {
    const blocks = getRequiredBlocksForType('NYC_STRICT', 'brochure');

    expect(blocks.some((b) => b.id === 'nyc_fare_act_disclosure')).toBe(true);
    expect(blocks.some((b) => b.id === 'nyc_lead_paint_disclosure')).toBe(true);
    expect(blocks.some((b) => b.id === 'nyc_bedbug_disclosure')).toBe(true);
  });

  it('should not include bedbug disclosure for listing decks', () => {
    const blocks = getRequiredBlocksForType('NYC_STRICT', 'listing_deck');

    expect(blocks.some((b) => b.id === 'nyc_bedbug_disclosure')).toBe(false);
    expect(blocks.some((b) => b.id === 'nyc_fare_act_disclosure')).toBe(true);
  });
});

describe('getNonRemovableBlocks', () => {
  it('should only return non-removable blocks', () => {
    const blocks = getNonRemovableBlocks('NYC_STRICT', 'flyer');

    for (const block of blocks) {
      expect(block.isRemovable).toBe(false);
    }
  });

  it('should return FARE blocks as non-removable for NYC flyers', () => {
    const blocks = getNonRemovableBlocks('NYC_STRICT', 'flyer');
    const blockIds = blocks.map((b) => b.id);

    expect(blockIds).toContain('nyc_fare_act_disclosure');
    expect(blockIds).toContain('nyc_fare_fee_disclosure');
  });
});

describe('isBlockRequired', () => {
  it('should return true for required blocks', () => {
    expect(isBlockRequired('nyc_fare_act_disclosure', 'NYC_STRICT', 'flyer')).toBe(true);
    expect(isBlockRequired('nyc_fare_fee_disclosure', 'NYC_STRICT', 'brochure')).toBe(true);
  });

  it('should return false for non-required blocks', () => {
    expect(isBlockRequired('nyc_bedbug_disclosure', 'NYC_STRICT', 'flyer')).toBe(false);
    expect(isBlockRequired('unknown_block', 'NYC_STRICT', 'flyer')).toBe(false);
  });
});

describe('getBlockById', () => {
  it('should return block by ID', () => {
    const block = getBlockById('nyc_fare_act_disclosure');
    expect(block).toBeDefined();
    expect(block?.id).toBe('nyc_fare_act_disclosure');
    expect(block?.type).toBe('fare_act_disclosure');
  });

  it('should return undefined for unknown block', () => {
    const block = getBlockById('unknown_block');
    expect(block).toBeUndefined();
  });
});

describe('sortBlocksByPriority', () => {
  it('should sort blocks by priority (highest first)', () => {
    const blocks = getRequiredBlocksForType('NYC_STRICT', 'brochure');
    const sorted = sortBlocksByPriority(blocks);

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev && curr) {
        expect(prev.priority).toBeGreaterThanOrEqual(curr.priority);
      }
    }
  });

  it('should not mutate original array', () => {
    const blocks = getRequiredBlocksForType('NYC_STRICT', 'flyer');
    const originalOrder = blocks.map((b) => b.id);
    sortBlocksByPriority(blocks);

    expect(blocks.map((b) => b.id)).toEqual(originalOrder);
  });
});

describe('groupBlocksByPosition', () => {
  it('should group blocks by position', () => {
    const blocks = getRequiredBlocksForType('NYC_STRICT', 'brochure');
    const grouped = groupBlocksByPosition(blocks);

    expect(grouped).toHaveProperty('footer');
    expect(grouped).toHaveProperty('dedicated_page');
  });

  it('should have sorted blocks within each group', () => {
    const blocks = getRequiredBlocksForType('NYC_STRICT', 'brochure');
    const grouped = groupBlocksByPosition(blocks);

    for (const position of Object.keys(grouped)) {
      const positionBlocks = grouped[position];
      if (positionBlocks) {
        for (let i = 1; i < positionBlocks.length; i++) {
          const prev = positionBlocks[i - 1];
          const curr = positionBlocks[i];
          if (prev && curr) {
            expect(prev.priority).toBeGreaterThanOrEqual(curr.priority);
          }
        }
      }
    }
  });
});
