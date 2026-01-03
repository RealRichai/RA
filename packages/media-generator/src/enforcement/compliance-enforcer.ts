/**
 * Compliance Enforcer
 *
 * Runtime enforcement of compliance locks for collateral generation.
 * Ensures required disclosures cannot be removed or hidden in strict markets.
 */

import { createHash } from 'crypto';

import { getBlockRegistry, type BlockRegistry } from '../block-registry';
import type {
  CollateralType,
  ComplianceBlock,
} from '../types';

// ============================================================================
// Types
// ============================================================================

export interface EnforcementResult {
  html: string;
  enforcements: EnforcementRecord[];
  violations: EnforcementViolation[];
}

export interface EnforcementRecord {
  blockId: string;
  action: 'verified' | 'injected' | 'restored';
  reason: string;
  timestamp: Date;
}

export interface EnforcementViolation {
  code: 'BLOCK_HIDDEN' | 'BLOCK_REMOVED' | 'BLOCK_TAMPERED' | 'CSS_VIOLATION';
  blockId?: string;
  message: string;
  severity: 'warning' | 'error' | 'critical';
  autoFixed: boolean;
}

export interface BlockIntegrityCheck {
  valid: boolean;
  tamperedBlocks: string[];
  missingBlocks: string[];
}

export interface StrictMarketConfig {
  marketPackId: string;
  isStrict: boolean;
  lockedBlockIds: string[];
  minFontSizePx: number;
  minContrastRatio: number;
  cssBlacklist: string[];
}

// ============================================================================
// Strict Market Configurations
// ============================================================================

const STRICT_MARKET_CONFIGS: Record<string, StrictMarketConfig> = {
  NYC_STRICT: {
    marketPackId: 'NYC_STRICT',
    isStrict: true,
    lockedBlockIds: [
      'nyc_fare_act_disclosure',
      'nyc_fare_fee_disclosure',
      'lead_paint_disclosure',
      'fair_housing_statement',
    ],
    minFontSizePx: 8,
    minContrastRatio: 4.5, // WCAG AA
    cssBlacklist: [
      'display:\\s*none',
      'visibility:\\s*hidden',
      'opacity:\\s*0',
      'font-size:\\s*0',
      'color:\\s*transparent',
      'height:\\s*0',
      'width:\\s*0',
      'overflow:\\s*hidden',
      'clip:\\s*rect\\(0',
      'position:\\s*absolute.*left:\\s*-\\d+',
    ],
  },
  CA_STANDARD: {
    marketPackId: 'CA_STANDARD',
    isStrict: true,
    lockedBlockIds: [
      'lead_paint_disclosure',
      'fair_housing_statement',
    ],
    minFontSizePx: 8,
    minContrastRatio: 4.5,
    cssBlacklist: [
      'display:\\s*none',
      'visibility:\\s*hidden',
      'opacity:\\s*0',
    ],
  },
};

// Default config for non-strict markets
const DEFAULT_MARKET_CONFIG: StrictMarketConfig = {
  marketPackId: 'DEFAULT',
  isStrict: false,
  lockedBlockIds: ['fair_housing_statement'],
  minFontSizePx: 6,
  minContrastRatio: 3.0,
  cssBlacklist: [],
};

// ============================================================================
// Compliance Enforcer Class
// ============================================================================

export class ComplianceEnforcer {
  private registry: BlockRegistry;

  constructor(registry?: BlockRegistry) {
    this.registry = registry ?? getBlockRegistry();
  }

  /**
   * Enforce compliance on rendered HTML
   * Called AFTER rendering, BEFORE output generation
   */
  enforce(
    renderedHtml: string,
    marketPackId: string,
    collateralType: CollateralType
  ): EnforcementResult {
    const config = this.getMarketConfig(marketPackId);
    const enforcements: EnforcementRecord[] = [];
    const violations: EnforcementViolation[] = [];

    let html = renderedHtml;

    // 1. Validate CSS doesn't hide compliance blocks
    const cssViolations = this.validateCssVisibility(html, config);
    violations.push(...cssViolations);

    // 2. Check for missing required blocks and inject if needed
    const { html: injectedHtml, records } = this.injectMissingBlocks(
      html,
      marketPackId,
      collateralType
    );
    html = injectedHtml;
    enforcements.push(...records);

    // 3. Verify block content integrity
    const integrityResult = this.verifyBlockIntegrity(html, marketPackId, collateralType);
    if (!integrityResult.valid) {
      for (const blockId of integrityResult.tamperedBlocks) {
        violations.push({
          code: 'BLOCK_TAMPERED',
          blockId,
          message: `Compliance block "${blockId}" content has been modified`,
          severity: config.isStrict ? 'critical' : 'warning',
          autoFixed: false,
        });
      }
    }

    return {
      html,
      enforcements,
      violations,
    };
  }

  /**
   * Get market configuration
   */
  getMarketConfig(marketPackId: string): StrictMarketConfig {
    return STRICT_MARKET_CONFIGS[marketPackId] || DEFAULT_MARKET_CONFIG;
  }

  /**
   * Check if a market is strict
   */
  isStrictMarket(marketPackId: string): boolean {
    return this.getMarketConfig(marketPackId).isStrict;
  }

  /**
   * Get locked block IDs for a market
   */
  getLockedBlocks(marketPackId: string): string[] {
    return this.getMarketConfig(marketPackId).lockedBlockIds;
  }

  /**
   * Validate CSS doesn't hide compliance blocks
   */
  validateCssVisibility(html: string, config: StrictMarketConfig): EnforcementViolation[] {
    const violations: EnforcementViolation[] = [];

    if (!config.isStrict || config.cssBlacklist.length === 0) {
      return violations;
    }

    // Extract style tags and inline styles
    const stylePattern = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    const inlineStylePattern = /style\s*=\s*["']([^"']+)["']/gi;

    const allStyles: string[] = [];

    // Extract <style> contents
    let match;
    while ((match = stylePattern.exec(html)) !== null) {
      if (match[1]) allStyles.push(match[1]);
    }

    // Extract inline styles
    while ((match = inlineStylePattern.exec(html)) !== null) {
      if (match[1]) allStyles.push(match[1]);
    }

    // Check for blacklisted CSS patterns
    for (const style of allStyles) {
      for (const pattern of config.cssBlacklist) {
        const regex = new RegExp(pattern, 'gi');
        if (regex.test(style)) {
          violations.push({
            code: 'CSS_VIOLATION',
            message: `Potentially hiding content with CSS: "${pattern}"`,
            severity: 'warning',
            autoFixed: false,
          });
        }
      }
    }

    // Check for small font sizes on compliance blocks
    const fontSizePattern = /\.compliance-block[^{]*\{[^}]*font-size:\s*(\d+)px/gi;
    while ((match = fontSizePattern.exec(html)) !== null) {
      const fontSizeStr = match[1];
      if (!fontSizeStr) continue;
      const fontSize = parseInt(fontSizeStr, 10);
      if (fontSize < config.minFontSizePx) {
        violations.push({
          code: 'CSS_VIOLATION',
          message: `Compliance block font size (${fontSize}px) is below minimum (${config.minFontSizePx}px)`,
          severity: 'error',
          autoFixed: false,
        });
      }
    }

    return violations;
  }

  /**
   * Inject missing required compliance blocks
   */
  injectMissingBlocks(
    html: string,
    marketPackId: string,
    collateralType: CollateralType
  ): { html: string; records: EnforcementRecord[] } {
    const records: EnforcementRecord[] = [];
    let modifiedHtml = html;

    // Get required non-removable blocks
    const requiredBlocks = this.registry.getNonRemovableBlocks(marketPackId, collateralType);

    for (const block of requiredBlocks) {
      // Check if block is present in HTML (by ID or data attribute)
      const blockPattern = new RegExp(
        `(data-compliance-block=["']${block.id}["']|id=["']${block.id}["'])`,
        'i'
      );

      if (!blockPattern.test(modifiedHtml)) {
        // Inject the block at the appropriate position
        modifiedHtml = this.injectBlock(modifiedHtml, block);

        records.push({
          blockId: block.id,
          action: 'injected',
          reason: `Required compliance block was missing from rendered output`,
          timestamp: new Date(),
        });
      } else {
        records.push({
          blockId: block.id,
          action: 'verified',
          reason: 'Compliance block present in output',
          timestamp: new Date(),
        });
      }
    }

    return { html: modifiedHtml, records };
  }

  /**
   * Inject a single compliance block into HTML
   */
  private injectBlock(html: string, block: ComplianceBlock): string {
    const blockHtml = this.wrapBlockHtml(block);

    switch (block.position) {
      case 'header':
        // Inject after <body> opening tag
        return html.replace(/<body[^>]*>/i, `$&\n${blockHtml}`);

      case 'footer':
        // Inject before </body> closing tag
        return html.replace(/<\/body>/i, `${blockHtml}\n$&`);

      case 'dedicated_page':
        // Inject as a page break section at the end
        return html.replace(
          /<\/body>/i,
          `<div class="compliance-page" style="page-break-before: always;">${blockHtml}</div>\n$&`
        );

      default:
        // Default: inject before </body>
        return html.replace(/<\/body>/i, `${blockHtml}\n$&`);
    }
  }

  /**
   * Wrap block HTML with compliance markers
   */
  private wrapBlockHtml(block: ComplianceBlock): string {
    const contentHash = createHash('sha256')
      .update(block.htmlContent)
      .digest('hex')
      .substring(0, 16);

    return `
<!-- COMPLIANCE_BLOCK_START: ${block.id} v${block.version} -->
<div class="compliance-block compliance-block--${block.type}"
     data-compliance-block="${block.id}"
     data-compliance-version="${block.version}"
     data-compliance-hash="${contentHash}"
     data-compliance-removable="false"
     style="min-font-size: 10px; color: inherit;">
  ${block.htmlContent}
</div>
<!-- COMPLIANCE_BLOCK_END: ${block.id} -->
`;
  }

  /**
   * Verify block content hasn't been tampered with
   */
  verifyBlockIntegrity(
    html: string,
    marketPackId: string,
    collateralType: CollateralType
  ): BlockIntegrityCheck {
    const tamperedBlocks: string[] = [];
    const missingBlocks: string[] = [];

    const requiredBlocks = this.registry.getNonRemovableBlocks(marketPackId, collateralType);

    for (const block of requiredBlocks) {
      // Look for block with hash
      const hashPattern = new RegExp(
        `data-compliance-block="${block.id}"[^>]*data-compliance-hash="([a-f0-9]+)"`,
        'i'
      );
      const match = hashPattern.exec(html);

      if (!match) {
        // Block not found or no hash
        const blockPresent = html.includes(`data-compliance-block="${block.id}"`);
        if (!blockPresent) {
          missingBlocks.push(block.id);
        }
        continue;
      }

      const embeddedHash = match[1];
      const expectedHash = createHash('sha256')
        .update(block.htmlContent)
        .digest('hex')
        .substring(0, 16);

      if (embeddedHash !== expectedHash) {
        tamperedBlocks.push(block.id);
      }
    }

    return {
      valid: tamperedBlocks.length === 0 && missingBlocks.length === 0,
      tamperedBlocks,
      missingBlocks,
    };
  }

  /**
   * Check if a block can be removed
   */
  canRemoveBlock(blockId: string, marketPackId: string): boolean {
    const config = this.getMarketConfig(marketPackId);
    return !config.lockedBlockIds.includes(blockId);
  }

  /**
   * Get all locked blocks for a template in a market
   */
  getLockedBlocksForTemplate(
    marketPackId: string,
    collateralType: CollateralType
  ): ComplianceBlock[] {
    const config = this.getMarketConfig(marketPackId);
    const allBlocks = this.registry.getRequiredBlocks(marketPackId, collateralType);

    return allBlocks.filter((block: ComplianceBlock) =>
      config.lockedBlockIds.includes(block.id) || !block.isRemovable
    );
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let enforcerInstance: ComplianceEnforcer | null = null;

export function getComplianceEnforcer(): ComplianceEnforcer {
  if (!enforcerInstance) {
    enforcerInstance = new ComplianceEnforcer();
  }
  return enforcerInstance;
}
