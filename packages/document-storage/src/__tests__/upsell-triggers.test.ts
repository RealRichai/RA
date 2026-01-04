/**
 * Upsell Triggers Tests
 *
 * Tests for market-gated upsell trigger detection.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { DocumentCategory } from '../vault-onboarding/types';
import {
  detectUpsellTriggers,
  isUpsellEnabledForMarket,
  UPSELL_PARTNER_MAP,
  TRIGGER_PARTNER_MAP,
  MARKET_UPSELL_CONFIGS,
  type UpsellTriggerType,
  type PartnerType,
} from '../upsell';

describe('Upsell Triggers', () => {
  const propertyId = '550e8400-e29b-41d4-a716-446655440000';
  const vaultId = '550e8400-e29b-41d4-a716-446655440001';

  describe('detectUpsellTriggers', () => {
    it('should detect missing insurance trigger', () => {
      const missingCategories: DocumentCategory[] = ['PROPERTY_INSURANCE', 'LIABILITY'];

      const triggers = detectUpsellTriggers(
        propertyId,
        vaultId,
        missingCategories,
        'NYC'
      );

      expect(triggers.some((t) => t.triggerType === 'MISSING_INSURANCE')).toBe(true);
      const insuranceTrigger = triggers.find(
        (t) => t.triggerType === 'MISSING_INSURANCE'
      );
      expect(insuranceTrigger?.missingCategories).toContain('PROPERTY_INSURANCE');
    });

    it('should detect missing guarantor trigger from lease docs', () => {
      const missingCategories: DocumentCategory[] = ['ACTIVE_LEASES'];

      const triggers = detectUpsellTriggers(
        propertyId,
        vaultId,
        missingCategories,
        'NYC'
      );

      expect(triggers.some((t) => t.triggerType === 'MISSING_GUARANTOR')).toBe(true);
    });

    it('should detect missing deed trigger', () => {
      const missingCategories: DocumentCategory[] = ['DEED'];

      const triggers = detectUpsellTriggers(
        propertyId,
        vaultId,
        missingCategories,
        'NYC'
      );

      expect(triggers.some((t) => t.triggerType === 'MISSING_DEED')).toBe(true);
    });

    it('should not detect triggers for uploaded docs', () => {
      const missingCategories: DocumentCategory[] = [];

      const triggers = detectUpsellTriggers(
        propertyId,
        vaultId,
        missingCategories,
        'NYC'
      );

      expect(triggers).toHaveLength(0);
    });

    it('should respect market-disabled triggers', () => {
      // LA has MISSING_GUARANTOR disabled
      const missingCategories: DocumentCategory[] = ['ACTIVE_LEASES'];

      const triggers = detectUpsellTriggers(
        propertyId,
        vaultId,
        missingCategories,
        'LA'
      );

      expect(triggers.some((t) => t.triggerType === 'MISSING_GUARANTOR')).toBe(false);
    });

    it('should include all missing categories in trigger', () => {
      const missingCategories: DocumentCategory[] = [
        'PROPERTY_INSURANCE',
        'LIABILITY',
        'FLOOD',
      ];

      const triggers = detectUpsellTriggers(
        propertyId,
        vaultId,
        missingCategories,
        'NYC'
      );

      const insuranceTrigger = triggers.find(
        (t) => t.triggerType === 'MISSING_INSURANCE'
      );
      expect(insuranceTrigger?.missingCategories).toHaveLength(3);
    });
  });

  describe('isUpsellEnabledForMarket', () => {
    it('should return true for enabled triggers in NYC', () => {
      expect(isUpsellEnabledForMarket('MISSING_INSURANCE', 'NYC')).toBe(true);
      expect(isUpsellEnabledForMarket('MISSING_GUARANTOR', 'NYC')).toBe(true);
    });

    it('should return false for disabled triggers in LA', () => {
      expect(isUpsellEnabledForMarket('MISSING_GUARANTOR', 'LA')).toBe(false);
    });

    it('should return true for enabled triggers in LA', () => {
      expect(isUpsellEnabledForMarket('MISSING_INSURANCE', 'LA')).toBe(true);
    });

    it('should use DEFAULT config for unknown markets', () => {
      expect(isUpsellEnabledForMarket('MISSING_INSURANCE', 'UNKNOWN_MARKET')).toBe(true);
    });
  });

  describe('UPSELL_PARTNER_MAP', () => {
    it('should have insurance partners for property insurance', () => {
      const partners = UPSELL_PARTNER_MAP.PROPERTY_INSURANCE;
      expect(partners).toContain('LEMONADE');
      expect(partners).toContain('ASSURANT');
      expect(partners).toContain('SURE');
    });

    it('should have guarantor partners for active leases', () => {
      const partners = UPSELL_PARTNER_MAP.ACTIVE_LEASES;
      expect(partners).toContain('LEASELOCK');
      expect(partners).toContain('RHINO');
      expect(partners).toContain('JETTY');
      expect(partners).toContain('INSURENT');
      expect(partners).toContain('LEAP');
    });

    it('should have flood insurance partners', () => {
      const partners = UPSELL_PARTNER_MAP.FLOOD;
      expect(partners).toContain('ASSURANT');
    });
  });

  describe('TRIGGER_PARTNER_MAP', () => {
    it('should map MISSING_INSURANCE to insurance providers', () => {
      const partners = TRIGGER_PARTNER_MAP.MISSING_INSURANCE;
      expect(partners).toContain('LEMONADE');
      expect(partners).toContain('ASSURANT');
      expect(partners).toContain('SURE');
    });

    it('should map MISSING_GUARANTOR to guarantor providers', () => {
      const partners = TRIGGER_PARTNER_MAP.MISSING_GUARANTOR;
      expect(partners).toContain('LEASELOCK');
      expect(partners).toContain('RHINO');
      expect(partners).toContain('JETTY');
    });

    it('should have empty array for MISSING_DEED', () => {
      expect(TRIGGER_PARTNER_MAP.MISSING_DEED).toHaveLength(0);
    });
  });

  describe('MARKET_UPSELL_CONFIGS', () => {
    it('should have NYC configuration', () => {
      const config = MARKET_UPSELL_CONFIGS.NYC;
      expect(config.market).toBe('NYC');
      expect(config.enabledPartners).toContain('LEASELOCK');
      expect(config.enabledPartners).toContain('RHINO');
      expect(config.disabledTriggers).toHaveLength(0);
    });

    it('should have LA configuration with disabled guarantor', () => {
      const config = MARKET_UPSELL_CONFIGS.LA;
      expect(config.market).toBe('LA');
      expect(config.disabledTriggers).toContain('MISSING_GUARANTOR');
    });

    it('should have CHICAGO configuration', () => {
      const config = MARKET_UPSELL_CONFIGS.CHICAGO;
      expect(config.market).toBe('CHICAGO');
      expect(config.enabledPartners.length).toBeGreaterThan(0);
    });

    it('should have MIAMI configuration', () => {
      const config = MARKET_UPSELL_CONFIGS.MIAMI;
      expect(config.market).toBe('MIAMI');
    });

    it('should have BOSTON configuration', () => {
      const config = MARKET_UPSELL_CONFIGS.BOSTON;
      expect(config.market).toBe('BOSTON');
    });

    it('should have DEFAULT configuration for fallback', () => {
      const config = MARKET_UPSELL_CONFIGS.DEFAULT;
      expect(config.market).toBe('DEFAULT');
      expect(config.enabledPartners.length).toBeGreaterThan(0);
    });
  });

  describe('Partner filtering by market', () => {
    it('should filter partners based on market config', () => {
      // NYC enables LEASELOCK, RHINO, INSURENT for guarantor
      const nycPartners = MARKET_UPSELL_CONFIGS.NYC.enabledPartners;
      const guarantorPartners = TRIGGER_PARTNER_MAP.MISSING_GUARANTOR;

      const eligibleNYC = guarantorPartners.filter((p) =>
        nycPartners.includes(p)
      );

      expect(eligibleNYC).toContain('LEASELOCK');
      expect(eligibleNYC).toContain('RHINO');
      expect(eligibleNYC).toContain('INSURENT');
    });

    it('should exclude partners not enabled in market', () => {
      // LA enables JETTY but not LEASELOCK
      const laPartners = MARKET_UPSELL_CONFIGS.LA.enabledPartners;

      expect(laPartners).toContain('JETTY');
      expect(laPartners).not.toContain('LEASELOCK');
    });
  });
});
