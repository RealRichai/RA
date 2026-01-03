/**
 * Market Gating Tests
 *
 * Tests for market pack GDPR compliance and locale functionality.
 */

import { describe, it, expect } from 'vitest';

import {
  gateGdprDataOperation,
  isGdprMarket,
  getMarketDefaultLocale,
  getMarketSupportedLocales,
} from '../gates';
import { getMarketPack, getMarketPackIdFromMarket, MARKET_PACKS } from '../market-packs';

describe('Market Packs', () => {
  describe('EU_GDPR Market Pack', () => {
    it('should exist in MARKET_PACKS registry', () => {
      expect(MARKET_PACKS.EU_GDPR).toBeDefined();
      expect(MARKET_PACKS.EU_GDPR.id).toBe('EU_GDPR');
    });

    it('should have gdprMode enabled', () => {
      const pack = getMarketPack('EU_GDPR');
      expect(pack.gdprMode).toBe(true);
    });

    it('should have GDPR rules enabled', () => {
      const pack = getMarketPack('EU_GDPR');
      expect(pack.rules.gdpr?.enabled).toBe(true);
    });

    it('should have consent required for GDPR', () => {
      const pack = getMarketPack('EU_GDPR');
      expect(pack.rules.gdpr?.consentRequired).toBe(true);
    });

    it('should have data retention limits', () => {
      const pack = getMarketPack('EU_GDPR');
      expect(pack.rules.gdpr?.dataRetentionDays).toBeDefined();
      expect(pack.rules.gdpr?.dataRetentionDays).toBeLessThanOrEqual(365);
    });

    it('should support multiple locales including es', () => {
      const pack = getMarketPack('EU_GDPR');
      expect(pack.supportedLocales).toContain('en');
      expect(pack.supportedLocales).toContain('es');
    });

    it('should have English as default locale', () => {
      const pack = getMarketPack('EU_GDPR');
      expect(pack.defaultLocale).toBe('en');
    });
  });

  describe('LATAM_STANDARD Market Pack', () => {
    it('should exist in MARKET_PACKS registry', () => {
      expect(MARKET_PACKS.LATAM_STANDARD).toBeDefined();
      expect(MARKET_PACKS.LATAM_STANDARD.id).toBe('LATAM_STANDARD');
    });

    it('should have gdprMode disabled', () => {
      const pack = getMarketPack('LATAM_STANDARD');
      expect(pack.gdprMode).toBe(false);
    });

    it('should have Spanish as default locale', () => {
      const pack = getMarketPack('LATAM_STANDARD');
      expect(pack.defaultLocale).toBe('es');
    });

    it('should support Spanish and English', () => {
      const pack = getMarketPack('LATAM_STANDARD');
      expect(pack.supportedLocales).toContain('es');
      expect(pack.supportedLocales).toContain('en');
    });
  });

  describe('Market Pack ID Resolution', () => {
    it('should resolve EU markets to EU_GDPR', () => {
      expect(getMarketPackIdFromMarket('france')).toBe('EU_GDPR');
      expect(getMarketPackIdFromMarket('germany')).toBe('EU_GDPR');
      expect(getMarketPackIdFromMarket('spain')).toBe('EU_GDPR');
      expect(getMarketPackIdFromMarket('paris')).toBe('EU_GDPR');
      expect(getMarketPackIdFromMarket('berlin')).toBe('EU_GDPR');
    });

    it('should resolve LATAM markets to LATAM_STANDARD', () => {
      expect(getMarketPackIdFromMarket('mexico')).toBe('LATAM_STANDARD');
      expect(getMarketPackIdFromMarket('colombia')).toBe('LATAM_STANDARD');
      expect(getMarketPackIdFromMarket('argentina')).toBe('LATAM_STANDARD');
      expect(getMarketPackIdFromMarket('bogota')).toBe('LATAM_STANDARD');
      expect(getMarketPackIdFromMarket('buenos_aires')).toBe('LATAM_STANDARD');
    });

    it('should resolve US markets to correct packs', () => {
      expect(getMarketPackIdFromMarket('nyc')).toBe('NYC_STRICT');
      expect(getMarketPackIdFromMarket('california')).toBe('CA_STANDARD');
      expect(getMarketPackIdFromMarket('texas')).toBe('TX_STANDARD');
    });
  });

  describe('All markets have required base rules', () => {
    const allMarkets = Object.keys(MARKET_PACKS);

    it.each(allMarkets)('market %s should have brokerFee rules', (marketId) => {
      const pack = MARKET_PACKS[marketId as keyof typeof MARKET_PACKS];
      expect(pack.rules.brokerFee).toBeDefined();
    });

    it.each(allMarkets)('market %s should have securityDeposit rules', (marketId) => {
      const pack = MARKET_PACKS[marketId as keyof typeof MARKET_PACKS];
      expect(pack.rules.securityDeposit).toBeDefined();
    });

    it.each(allMarkets)('market %s should have rentIncrease rules', (marketId) => {
      const pack = MARKET_PACKS[marketId as keyof typeof MARKET_PACKS];
      expect(pack.rules.rentIncrease).toBeDefined();
    });
  });
});

describe('GDPR Gate', () => {
  describe('Non-GDPR Markets', () => {
    it('should allow data operations without consent in US markets', async () => {
      const result = await gateGdprDataOperation({
        operation: 'collect',
        marketId: 'texas',
        hasConsent: false,
        dataSubjectId: 'user_123',
        dataTypes: ['email', 'phone'],
      });

      expect(result.allowed).toBe(true);
      expect(result.decision.metadata?.gdprEnabled).toBe(false);
    });

    it('should allow data operations in LATAM markets without GDPR checks', async () => {
      const result = await gateGdprDataOperation({
        operation: 'process',
        marketId: 'mexico',
        hasConsent: false,
        dataSubjectId: 'user_456',
        dataTypes: ['name', 'address'],
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('GDPR Markets', () => {
    it('should require consent for data collection in EU', async () => {
      const result = await gateGdprDataOperation({
        operation: 'collect',
        marketId: 'germany',
        hasConsent: false,
        dataSubjectId: 'user_789',
        dataTypes: ['email'],
      });

      expect(result.allowed).toBe(false);
      expect(result.decision.violations.length).toBeGreaterThan(0);
      expect(result.decision.violations[0]?.code).toBe('GDPR_CONSENT_MISSING');
    });

    it('should allow data collection with consent in EU', async () => {
      const result = await gateGdprDataOperation({
        operation: 'collect',
        marketId: 'france',
        hasConsent: true,
        dataSubjectId: 'user_123',
        dataTypes: ['email', 'phone'],
      });

      expect(result.allowed).toBe(true);
    });

    it('should allow data deletion (right to erasure) in EU', async () => {
      const result = await gateGdprDataOperation({
        operation: 'delete',
        marketId: 'spain',
        hasConsent: false,
        dataSubjectId: 'user_456',
        dataTypes: ['all'],
      });

      expect(result.allowed).toBe(true);
      expect(result.decision.checksPerformed).toContain('gdpr_data_subject_rights');
    });

    it('should allow data export (data portability) in EU', async () => {
      const result = await gateGdprDataOperation({
        operation: 'export',
        marketId: 'germany',
        hasConsent: false,
        dataSubjectId: 'user_789',
        dataTypes: ['personal_data'],
      });

      expect(result.allowed).toBe(true);
      expect(result.decision.checksPerformed).toContain('gdpr_data_subject_rights');
    });

    it('should warn about excessive data retention in EU', async () => {
      const result = await gateGdprDataOperation({
        operation: 'process',
        marketId: 'france',
        hasConsent: true,
        dataSubjectId: 'user_123',
        dataTypes: ['email'],
        retentionDays: 1000, // Exceeds EU_GDPR limit of 365
      });

      expect(result.allowed).toBe(true); // Warning, not blocking
      expect(result.decision.violations.some((v) => v.code === 'GDPR_DATA_RETENTION_EXCEEDED')).toBe(true);
    });
  });
});

describe('Market Locale Helpers', () => {
  describe('isGdprMarket', () => {
    it('should return true for EU markets', () => {
      expect(isGdprMarket('france')).toBe(true);
      expect(isGdprMarket('germany')).toBe(true);
      expect(isGdprMarket('spain')).toBe(true);
    });

    it('should return true for UK', () => {
      expect(isGdprMarket('uk')).toBe(true);
      expect(isGdprMarket('london')).toBe(true);
    });

    it('should return false for US markets', () => {
      expect(isGdprMarket('texas')).toBe(false);
      expect(isGdprMarket('nyc')).toBe(false);
      expect(isGdprMarket('california')).toBe(false);
    });

    it('should return false for LATAM markets', () => {
      expect(isGdprMarket('mexico')).toBe(false);
      expect(isGdprMarket('colombia')).toBe(false);
    });
  });

  describe('getMarketDefaultLocale', () => {
    it('should return es for LATAM markets', () => {
      expect(getMarketDefaultLocale('mexico')).toBe('es');
      expect(getMarketDefaultLocale('colombia')).toBe('es');
      expect(getMarketDefaultLocale('argentina')).toBe('es');
    });

    it('should return en for US markets', () => {
      expect(getMarketDefaultLocale('nyc')).toBe('en');
      expect(getMarketDefaultLocale('texas')).toBe('en');
    });

    it('should return en for EU markets', () => {
      expect(getMarketDefaultLocale('france')).toBe('en');
      expect(getMarketDefaultLocale('germany')).toBe('en');
    });
  });

  describe('getMarketSupportedLocales', () => {
    it('should return multiple locales for EU', () => {
      const locales = getMarketSupportedLocales('france');
      expect(locales).toContain('en');
      expect(locales).toContain('es');
      expect(locales).toContain('fr');
      expect(locales).toContain('de');
    });

    it('should return es and en for LATAM', () => {
      const locales = getMarketSupportedLocales('mexico');
      expect(locales).toContain('es');
      expect(locales).toContain('en');
    });
  });
});
