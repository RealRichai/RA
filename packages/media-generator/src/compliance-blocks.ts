/**
 * Compliance Blocks for Media Generation
 *
 * Defines market-specific compliance blocks that must be included in
 * generated collateral. Blocks marked as isRemovable: false CANNOT
 * be removed from templates.
 */

import type { ComplianceBlock, ComplianceBlockType, CollateralType, BlockPosition } from './types';

// ============================================================================
// NYC FARE Act Disclosure
// ============================================================================

const NYC_FARE_ACT_DISCLOSURE: ComplianceBlock = {
  id: 'nyc_fare_act_disclosure',
  type: 'fare_act_disclosure' as ComplianceBlockType,
  marketPackId: 'NYC_STRICT',
  requiredFor: ['flyer', 'brochure', 'listing_deck'] as CollateralType[],
  position: 'footer' as BlockPosition,
  priority: 100,
  isRemovable: false,
  htmlContent: `
<div class="compliance-block fare-act-disclosure" style="border-top: 1px solid #ccc; padding: 12px; margin-top: 24px; font-size: 10px; color: #666;">
  <p style="margin: 0 0 8px 0; font-weight: bold;">Fair And Reasonable Encounter (FARE) Act Notice</p>
  <p style="margin: 0;">
    Under NYC Local Law 32 (FARE Act), tenants are not responsible for paying
    broker fees unless they have signed a written agreement specifying such fees
    before touring the property. For more information, visit
    <a href="https://www1.nyc.gov/site/hpd/services-and-information/fare-act.page">NYC HPD</a>.
  </p>
</div>`,
  pptxContent: `FARE Act Notice: Under NYC Local Law 32, tenants are not responsible for paying broker fees unless they have signed a written agreement specifying such fees before touring the property.`,
  version: '1.0.0',
  effectiveDate: new Date('2024-11-20'),
};

// ============================================================================
// NYC Fee Disclosure
// ============================================================================

const NYC_FARE_FEE_DISCLOSURE: ComplianceBlock = {
  id: 'nyc_fare_fee_disclosure',
  type: 'fare_fee_disclosure' as ComplianceBlockType,
  marketPackId: 'NYC_STRICT',
  requiredFor: ['flyer', 'brochure', 'listing_deck'] as CollateralType[],
  position: 'footer' as BlockPosition,
  priority: 99,
  isRemovable: false,
  htmlContent: `
<div class="compliance-block fare-fee-disclosure" style="padding: 8px; font-size: 10px; color: #666;">
  <p style="margin: 0;">
    <strong>Fee Transparency:</strong> This listing is presented by a licensed real estate
    broker. Any broker fees are the responsibility of the landlord/owner unless otherwise
    agreed in writing prior to property viewing.
  </p>
</div>`,
  pptxContent: `Fee Transparency: Any broker fees are the responsibility of the landlord/owner unless otherwise agreed in writing prior to property viewing.`,
  version: '1.0.0',
  effectiveDate: new Date('2024-11-20'),
};

// ============================================================================
// NYC Lead Paint Disclosure
// ============================================================================

const NYC_LEAD_PAINT_DISCLOSURE: ComplianceBlock = {
  id: 'nyc_lead_paint_disclosure',
  type: 'lead_paint_disclosure' as ComplianceBlockType,
  marketPackId: 'NYC_STRICT',
  requiredFor: ['brochure', 'listing_deck'] as CollateralType[],
  position: 'dedicated_page' as BlockPosition,
  priority: 95,
  isRemovable: false,
  htmlContent: `
<div class="compliance-block lead-paint-disclosure" style="page-break-before: always; padding: 24px;">
  <h3 style="margin-top: 0; color: #333;">Lead Paint Disclosure</h3>
  <p style="font-size: 11px; line-height: 1.5;">
    <strong>Disclosure of Information on Lead-Based Paint and/or Lead-Based Paint Hazards</strong>
  </p>
  <p style="font-size: 10px; line-height: 1.5;">
    Housing built before 1978 may contain lead-based paint. Lead from paint, paint chips,
    and dust can pose health hazards if not managed properly. Lead exposure is especially
    harmful to young children and pregnant women.
  </p>
  <ul style="font-size: 10px; line-height: 1.5;">
    <li>Landlord must disclose known information concerning lead-based paint or lead-based paint hazards.</li>
    <li>Tenants have the right to conduct an independent inspection for lead-based paint.</li>
    <li>A copy of the EPA pamphlet "Protect Your Family From Lead in Your Home" must be provided.</li>
  </ul>
  <p style="font-size: 10px; color: #666;">
    For more information: NYC HPD Lead-Safe Housing or EPA Lead Paint Information.
  </p>
</div>`,
  pptxContent: `Lead Paint Disclosure: Housing built before 1978 may contain lead-based paint. Lead exposure is especially harmful to young children and pregnant women. Landlord must disclose known information concerning lead-based paint hazards.`,
  version: '1.0.0',
  effectiveDate: new Date('2024-01-01'),
};

// ============================================================================
// NYC Bedbug Disclosure
// ============================================================================

const NYC_BEDBUG_DISCLOSURE: ComplianceBlock = {
  id: 'nyc_bedbug_disclosure',
  type: 'bedbug_disclosure' as ComplianceBlockType,
  marketPackId: 'NYC_STRICT',
  requiredFor: ['brochure'] as CollateralType[],
  position: 'inline' as BlockPosition,
  priority: 90,
  isRemovable: false,
  htmlContent: `
<div class="compliance-block bedbug-disclosure" style="background: #fff8e1; border: 1px solid #ffc107; padding: 12px; margin: 16px 0; font-size: 10px;">
  <p style="margin: 0 0 8px 0; font-weight: bold; color: #856404;">Bedbug History Disclosure (NYC Local Law 69)</p>
  <p style="margin: 0; color: #856404;">
    Under NYC Local Law 69, landlords must disclose the bedbug infestation history
    of the building and specific unit for the past year. Ask the landlord for the
    bedbug history form before signing a lease.
  </p>
</div>`,
  pptxContent: `Bedbug Disclosure (NYC LL69): Landlords must disclose bedbug infestation history of the building and unit for the past year.`,
  version: '1.0.0',
  effectiveDate: new Date('2024-01-01'),
};

// ============================================================================
// Fair Housing Notice (Federal)
// ============================================================================

const FAIR_HOUSING_NOTICE: ComplianceBlock = {
  id: 'fair_housing_notice',
  type: 'fair_housing' as ComplianceBlockType,
  marketPackId: 'DEFAULT',
  requiredFor: ['flyer', 'brochure', 'listing_deck'] as CollateralType[],
  position: 'footer' as BlockPosition,
  priority: 80,
  isRemovable: false,
  htmlContent: `
<div class="compliance-block fair-housing" style="text-align: center; padding: 8px; font-size: 9px; color: #666;">
  <img src="/images/equal-housing-logo.png" alt="Equal Housing Opportunity" style="height: 24px; vertical-align: middle; margin-right: 8px;" />
  <span>Equal Housing Opportunity. We do not discriminate based on race, color, religion,
  national origin, sex, familial status, or disability.</span>
</div>`,
  pptxContent: `Equal Housing Opportunity. We do not discriminate based on race, color, religion, national origin, sex, familial status, or disability.`,
  version: '1.0.0',
  effectiveDate: new Date('2020-01-01'),
};

// ============================================================================
// Block Registry by Market
// ============================================================================

export const NYC_COMPLIANCE_BLOCKS: ComplianceBlock[] = [
  NYC_FARE_ACT_DISCLOSURE,
  NYC_FARE_FEE_DISCLOSURE,
  NYC_LEAD_PAINT_DISCLOSURE,
  NYC_BEDBUG_DISCLOSURE,
  FAIR_HOUSING_NOTICE,
];

export const DEFAULT_COMPLIANCE_BLOCKS: ComplianceBlock[] = [
  FAIR_HOUSING_NOTICE,
];

// ============================================================================
// Market Pack to Blocks Mapping
// ============================================================================

export const MARKET_COMPLIANCE_BLOCKS: Record<string, ComplianceBlock[]> = {
  NYC_STRICT: NYC_COMPLIANCE_BLOCKS,
  NYC_STANDARD: [
    NYC_FARE_ACT_DISCLOSURE,
    NYC_FARE_FEE_DISCLOSURE,
    FAIR_HOUSING_NOTICE,
  ],
  DEFAULT: DEFAULT_COMPLIANCE_BLOCKS,
  // Add other markets as needed:
  // LA_STANDARD: [...],
  // SF_STRICT: [...],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all compliance blocks for a market
 */
export function getMarketBlocks(marketPackId: string): ComplianceBlock[] {
  return MARKET_COMPLIANCE_BLOCKS[marketPackId] ?? MARKET_COMPLIANCE_BLOCKS.DEFAULT ?? [];
}

/**
 * Get compliance blocks required for a specific collateral type in a market
 */
export function getRequiredBlocksForType(
  marketPackId: string,
  collateralType: CollateralType
): ComplianceBlock[] {
  const blocks = getMarketBlocks(marketPackId);
  return blocks.filter((block) => block.requiredFor.includes(collateralType));
}

/**
 * Get non-removable compliance blocks for a market and collateral type
 */
export function getNonRemovableBlocks(
  marketPackId: string,
  collateralType: CollateralType
): ComplianceBlock[] {
  return getRequiredBlocksForType(marketPackId, collateralType).filter(
    (block) => !block.isRemovable
  );
}

/**
 * Check if a specific block is required for a collateral type
 */
export function isBlockRequired(
  blockId: string,
  marketPackId: string,
  collateralType: CollateralType
): boolean {
  const requiredBlocks = getRequiredBlocksForType(marketPackId, collateralType);
  return requiredBlocks.some((b) => b.id === blockId);
}

/**
 * Get a specific block by ID
 */
export function getBlockById(blockId: string): ComplianceBlock | undefined {
  for (const blocks of Object.values(MARKET_COMPLIANCE_BLOCKS)) {
    const found = blocks.find((b) => b.id === blockId);
    if (found) return found;
  }
  return undefined;
}

/**
 * Sort blocks by priority (highest first)
 */
export function sortBlocksByPriority(blocks: ComplianceBlock[]): ComplianceBlock[] {
  return [...blocks].sort((a, b) => b.priority - a.priority);
}

/**
 * Group blocks by position
 */
export function groupBlocksByPosition(
  blocks: ComplianceBlock[]
): Record<string, ComplianceBlock[]> {
  const grouped: Record<string, ComplianceBlock[]> = {};

  for (const block of blocks) {
    const position = block.position;
    if (!grouped[position]) {
      grouped[position] = [];
    }
    const positionBlocks = grouped[position];
    if (positionBlocks) {
      positionBlocks.push(block);
    }
  }

  // Sort each group by priority
  for (const position of Object.keys(grouped)) {
    const positionBlocks = grouped[position];
    if (positionBlocks) {
      grouped[position] = sortBlocksByPriority(positionBlocks);
    }
  }

  return grouped;
}
