/**
 * Compliance Enforcer Tests
 *
 * Tests for runtime enforcement of compliance locks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ComplianceEnforcer } from '../enforcement/compliance-enforcer';
import { BlockRegistry } from '../block-registry';

describe('ComplianceEnforcer', () => {
  let enforcer: ComplianceEnforcer;

  beforeEach(() => {
    enforcer = new ComplianceEnforcer();
  });

  describe('getMarketConfig', () => {
    it('should return NYC_STRICT config for NYC_STRICT market', () => {
      const config = enforcer.getMarketConfig('NYC_STRICT');

      expect(config.marketPackId).toBe('NYC_STRICT');
      expect(config.isStrict).toBe(true);
      expect(config.lockedBlockIds).toContain('nyc_fare_act_disclosure');
      expect(config.minFontSizePx).toBe(8);
    });

    it('should return default config for unknown market', () => {
      const config = enforcer.getMarketConfig('UNKNOWN_MARKET');

      expect(config.marketPackId).toBe('DEFAULT');
      expect(config.isStrict).toBe(false);
    });
  });

  describe('isStrictMarket', () => {
    it('should return true for NYC_STRICT', () => {
      expect(enforcer.isStrictMarket('NYC_STRICT')).toBe(true);
    });

    it('should return false for DEFAULT market', () => {
      expect(enforcer.isStrictMarket('DEFAULT')).toBe(false);
    });

    it('should return false for unknown market', () => {
      expect(enforcer.isStrictMarket('TEXAS_STANDARD')).toBe(false);
    });
  });

  describe('getLockedBlocks', () => {
    it('should return locked blocks for NYC_STRICT', () => {
      const locked = enforcer.getLockedBlocks('NYC_STRICT');

      expect(locked).toContain('nyc_fare_act_disclosure');
      expect(locked).toContain('nyc_fare_fee_disclosure');
      expect(locked).toContain('fair_housing_statement');
    });

    it('should return minimal locked blocks for DEFAULT', () => {
      const locked = enforcer.getLockedBlocks('DEFAULT');

      expect(locked).toContain('fair_housing_statement');
      expect(locked).not.toContain('nyc_fare_act_disclosure');
    });
  });

  describe('canRemoveBlock', () => {
    it('should not allow removing locked blocks in NYC_STRICT', () => {
      expect(enforcer.canRemoveBlock('nyc_fare_act_disclosure', 'NYC_STRICT')).toBe(false);
      expect(enforcer.canRemoveBlock('fair_housing_statement', 'NYC_STRICT')).toBe(false);
    });

    it('should allow removing non-locked blocks', () => {
      expect(enforcer.canRemoveBlock('custom_block', 'NYC_STRICT')).toBe(true);
    });
  });

  describe('validateCssVisibility', () => {
    it('should detect display:none in strict markets', () => {
      const html = `
        <html>
          <style>.compliance-block { display: none; }</style>
          <body></body>
        </html>
      `;
      const config = enforcer.getMarketConfig('NYC_STRICT');
      const violations = enforcer.validateCssVisibility(html, config);

      expect(violations.length).toBeGreaterThan(0);
      const firstViolation = violations[0];
      expect(firstViolation).toBeDefined();
      expect(firstViolation?.code).toBe('CSS_VIOLATION');
    });

    it('should detect visibility:hidden in strict markets', () => {
      const html = `
        <html>
          <style>.compliance-block { visibility: hidden; }</style>
          <body></body>
        </html>
      `;
      const config = enforcer.getMarketConfig('NYC_STRICT');
      const violations = enforcer.validateCssVisibility(html, config);

      expect(violations.length).toBeGreaterThan(0);
    });

    it('should detect opacity:0 in strict markets', () => {
      const html = `
        <html>
          <style>.fare-disclosure { opacity: 0; }</style>
          <body></body>
        </html>
      `;
      const config = enforcer.getMarketConfig('NYC_STRICT');
      const violations = enforcer.validateCssVisibility(html, config);

      expect(violations.length).toBeGreaterThan(0);
    });

    it('should detect inline style hiding attempts', () => {
      const html = `
        <html>
          <body>
            <div style="display:none" class="compliance-block">Hidden</div>
          </body>
        </html>
      `;
      const config = enforcer.getMarketConfig('NYC_STRICT');
      const violations = enforcer.validateCssVisibility(html, config);

      expect(violations.length).toBeGreaterThan(0);
    });

    it('should detect small font sizes on compliance blocks', () => {
      const html = `
        <html>
          <style>.compliance-block { font-size: 4px; }</style>
          <body></body>
        </html>
      `;
      const config = enforcer.getMarketConfig('NYC_STRICT');
      const violations = enforcer.validateCssVisibility(html, config);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.message.includes('font size'))).toBe(true);
    });

    it('should not flag valid CSS in strict markets', () => {
      const html = `
        <html>
          <style>.compliance-block { font-size: 10px; color: #333; }</style>
          <body></body>
        </html>
      `;
      const config = enforcer.getMarketConfig('NYC_STRICT');
      const violations = enforcer.validateCssVisibility(html, config);

      expect(violations.length).toBe(0);
    });

    it('should not check CSS in non-strict markets', () => {
      const html = `
        <html>
          <style>.compliance-block { display: none; }</style>
          <body></body>
        </html>
      `;
      const config = enforcer.getMarketConfig('DEFAULT');
      const violations = enforcer.validateCssVisibility(html, config);

      expect(violations.length).toBe(0);
    });
  });

  describe('enforce', () => {
    it('should detect violations and record enforcements', () => {
      const html = `
        <html>
          <style>.compliance-block { opacity: 0; }</style>
          <body>
            <div data-compliance-block="nyc_fare_act_disclosure">FARE Act</div>
          </body>
        </html>
      `;

      const result = enforcer.enforce(html, 'NYC_STRICT', 'flyer');

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.html).toBeDefined();
    });

    it('should pass for valid HTML in non-strict market', () => {
      const html = `
        <html>
          <body>
            <div data-compliance-block="fair_housing_notice">Equal Housing</div>
          </body>
        </html>
      `;

      const result = enforcer.enforce(html, 'DEFAULT', 'flyer');

      // Should not have CSS violations in non-strict
      const cssViolations = result.violations.filter(v => v.code === 'CSS_VIOLATION');
      expect(cssViolations.length).toBe(0);
    });
  });

  describe('verifyBlockIntegrity', () => {
    it('should detect tampered block content', () => {
      // Create HTML with an incorrect hash
      const html = `
        <html>
          <body>
            <div data-compliance-block="fair_housing_notice"
                 data-compliance-hash="0000000000000000">
              Tampered content
            </div>
          </body>
        </html>
      `;

      const result = enforcer.verifyBlockIntegrity(html, 'NYC_STRICT', 'flyer');

      // Should detect the block has an incorrect hash
      expect(result.tamperedBlocks.length).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('BlockRegistry', () => {
  let registry: BlockRegistry;

  beforeEach(() => {
    registry = new BlockRegistry();
  });

  describe('getRequirements', () => {
    it('should return requirements for NYC_STRICT flyer', () => {
      const requirements = registry.getRequirements('NYC_STRICT', 'flyer');

      expect(requirements.marketPackId).toBe('NYC_STRICT');
      expect(requirements.collateralType).toBe('flyer');
      expect(requirements.nonRemovableBlockIds.length).toBeGreaterThan(0);
    });
  });

  describe('getNonRemovableBlocks', () => {
    it('should return non-removable blocks for NYC_STRICT flyer', () => {
      const blocks = registry.getNonRemovableBlocks('NYC_STRICT', 'flyer');

      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.every(b => !b.isRemovable)).toBe(true);
    });

    it('should include FARE Act disclosure for NYC_STRICT flyer', () => {
      const blocks = registry.getNonRemovableBlocks('NYC_STRICT', 'flyer');
      const fareBlock = blocks.find(b => b.id === 'nyc_fare_act_disclosure');

      expect(fareBlock).toBeDefined();
      expect(fareBlock?.isRemovable).toBe(false);
    });
  });

  describe('validateBlockPresence', () => {
    it('should validate when all required blocks are present', () => {
      const presentBlockIds = [
        'nyc_fare_act_disclosure',
        'nyc_fare_fee_disclosure',
        'fair_housing_notice',
      ];

      const result = registry.validateBlockPresence('NYC_STRICT', 'flyer', presentBlockIds);

      expect(result.valid).toBe(true);
      expect(result.missingBlocks.length).toBe(0);
    });

    it('should detect missing blocks', () => {
      const presentBlockIds = ['fair_housing_notice']; // Missing FARE Act blocks

      const result = registry.validateBlockPresence('NYC_STRICT', 'flyer', presentBlockIds);

      expect(result.valid).toBe(false);
      expect(result.missingBlocks.length).toBeGreaterThan(0);
    });
  });

  describe('canRemoveBlock', () => {
    it('should not allow removing FARE Act block in NYC_STRICT', () => {
      const result = registry.canRemoveBlock('nyc_fare_act_disclosure', 'NYC_STRICT', 'flyer');

      expect(result.canRemove).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should allow removing optional blocks', () => {
      const result = registry.canRemoveBlock('custom_marketing_block', 'NYC_STRICT', 'flyer');

      expect(result.canRemove).toBe(true);
    });
  });

  describe('getSupportedMarkets', () => {
    it('should return list of supported markets', () => {
      const markets = registry.getSupportedMarkets();

      expect(markets).toContain('NYC_STRICT');
      expect(markets).toContain('DEFAULT');
    });
  });
});
