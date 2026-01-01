/**
 * Block Registry
 *
 * Central registry for managing compliance block requirements per market
 * and collateral type. Enforces that non-removable blocks are always present.
 */

import {
  getMarketBlocks,
  getRequiredBlocksForType,
  getNonRemovableBlocks,
  getBlockById,
  groupBlocksByPosition,
} from './compliance-blocks';
import type { ComplianceBlock, CollateralType, BlockPosition } from './types';

// ============================================================================
// Block Requirement Result
// ============================================================================

export interface BlockRequirement {
  block: ComplianceBlock;
  isRequired: boolean;
  isRemovable: boolean;
}

export interface BlockRequirementCheck {
  marketPackId: string;
  collateralType: CollateralType;
  requirements: BlockRequirement[];
  requiredBlockIds: string[];
  nonRemovableBlockIds: string[];
}

// ============================================================================
// Block Registry Class
// ============================================================================

export class BlockRegistry {
  /**
   * Get all block requirements for a market and collateral type
   */
  getRequirements(marketPackId: string, collateralType: CollateralType): BlockRequirementCheck {
    const allBlocks = getMarketBlocks(marketPackId);
    const requiredBlocks = getRequiredBlocksForType(marketPackId, collateralType);
    const nonRemovableBlocks = getNonRemovableBlocks(marketPackId, collateralType);

    const requirements: BlockRequirement[] = allBlocks.map((block) => ({
      block,
      isRequired: requiredBlocks.some((rb) => rb.id === block.id),
      isRemovable: block.isRemovable,
    }));

    return {
      marketPackId,
      collateralType,
      requirements,
      requiredBlockIds: requiredBlocks.map((b) => b.id),
      nonRemovableBlockIds: nonRemovableBlocks.map((b) => b.id),
    };
  }

  /**
   * Get required blocks for a market and collateral type
   */
  getRequiredBlocks(marketPackId: string, collateralType: CollateralType): ComplianceBlock[] {
    return getRequiredBlocksForType(marketPackId, collateralType);
  }

  /**
   * Get non-removable blocks for a market and collateral type
   */
  getNonRemovableBlocks(marketPackId: string, collateralType: CollateralType): ComplianceBlock[] {
    return getNonRemovableBlocks(marketPackId, collateralType);
  }

  /**
   * Check if all non-removable blocks are present in a list of block IDs
   */
  validateBlockPresence(
    marketPackId: string,
    collateralType: CollateralType,
    presentBlockIds: string[]
  ): { valid: boolean; missingBlocks: ComplianceBlock[] } {
    const nonRemovable = this.getNonRemovableBlocks(marketPackId, collateralType);
    const missingBlocks = nonRemovable.filter((block) => !presentBlockIds.includes(block.id));

    return {
      valid: missingBlocks.length === 0,
      missingBlocks,
    };
  }

  /**
   * Check if a block can be removed from a template
   */
  canRemoveBlock(
    blockId: string,
    marketPackId: string,
    collateralType: CollateralType
  ): { canRemove: boolean; reason?: string } {
    const block = getBlockById(blockId);

    if (!block) {
      return { canRemove: true }; // Block doesn't exist, so can "remove"
    }

    if (!block.requiredFor.includes(collateralType)) {
      return { canRemove: true }; // Not required for this collateral type
    }

    if (!block.isRemovable) {
      return {
        canRemove: false,
        reason: `Block "${block.id}" is required for ${collateralType} in market ${marketPackId} and cannot be removed.`,
      };
    }

    return { canRemove: true };
  }

  /**
   * Get blocks grouped by position for rendering
   */
  getBlocksByPosition(
    marketPackId: string,
    collateralType: CollateralType
  ): Record<BlockPosition, ComplianceBlock[]> {
    const blocks = this.getRequiredBlocks(marketPackId, collateralType);
    return groupBlocksByPosition(blocks) as Record<BlockPosition, ComplianceBlock[]>;
  }

  /**
   * Get blocks for a specific position
   */
  getBlocksForPosition(
    marketPackId: string,
    collateralType: CollateralType,
    position: BlockPosition
  ): ComplianceBlock[] {
    const byPosition = this.getBlocksByPosition(marketPackId, collateralType);
    return byPosition[position] ?? [];
  }

  /**
   * Get block by ID
   */
  getBlock(blockId: string): ComplianceBlock | undefined {
    return getBlockById(blockId);
  }

  /**
   * Check if a market pack has any compliance requirements
   */
  hasRequirements(marketPackId: string): boolean {
    const blocks = getMarketBlocks(marketPackId);
    return blocks.length > 0;
  }

  /**
   * Get all supported market packs
   */
  getSupportedMarkets(): string[] {
    return ['NYC_STRICT', 'NYC_STANDARD', 'DEFAULT'];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let registryInstance: BlockRegistry | null = null;

export function getBlockRegistry(): BlockRegistry {
  if (!registryInstance) {
    registryInstance = new BlockRegistry();
  }
  return registryInstance;
}

// ============================================================================
// Convenience Exports
// ============================================================================

export {
  getMarketBlocks,
  getRequiredBlocksForType,
  getNonRemovableBlocks,
  getBlockById,
  groupBlocksByPosition,
} from './compliance-blocks';
