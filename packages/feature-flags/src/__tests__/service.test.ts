import { describe, expect, it, beforeEach } from 'vitest';

import { FeatureFlag, FEATURE_FLAG_REGISTRY, getTour3DGSFlags } from '../flags';
import { Market, ROLLOUT_PHASES, getEnabledMarketsForFlag } from '../markets';
import {
  FeatureFlagService,
  resetFeatureFlagService,
  isFeatureEnabled,
  isFeatureEnabledForMarket,
} from '../service';

describe('FeatureFlagService', () => {
  let service: FeatureFlagService;

  beforeEach(() => {
    resetFeatureFlagService();
    service = new FeatureFlagService();
  });

  describe('basic flag evaluation', () => {
    it('returns default enabled state for non-gated flags', () => {
      // AI_VALUATION is defaultEnabled: true, not market-gated
      const result = service.evaluate('AI_VALUATION');

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('DEFAULT_ENABLED');
      expect(result.metadata.key).toBe('AI_VALUATION');
    });

    it('returns default disabled state for non-enabled flags', () => {
      // AI_TENANT_ASSISTANT is defaultEnabled: false
      const result = service.evaluate('AI_TENANT_ASSISTANT');

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('DEFAULT_DISABLED');
    });

    it('throws for unknown flags', () => {
      expect(() => {
        service.evaluate('UNKNOWN_FLAG' as FeatureFlag);
      }).toThrow('Unknown feature flag: UNKNOWN_FLAG');
    });
  });

  describe('market gating', () => {
    it('enables TOUR_3DGS_CAPTURE for NYC (Phase 1 market)', () => {
      const result = service.evaluate('TOUR_3DGS_CAPTURE', { market: 'NYC' });

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('MARKET_ENABLED');
    });

    it('disables TOUR_3DGS_CAPTURE for LA (not in Phase 1)', () => {
      const result = service.evaluate('TOUR_3DGS_CAPTURE', { market: 'LA' });

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('MARKET_DISABLED');
    });

    it('disables TOUR_3DGS_CAPTURE for invalid market', () => {
      const result = service.evaluate('TOUR_3DGS_CAPTURE', { market: 'INVALID' });

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('MARKET_DISABLED');
    });

    it('enables all 3DGS tour flags for NYC', () => {
      const tourFlags = getTour3DGSFlags();

      for (const flagMeta of tourFlags) {
        const result = service.evaluate(flagMeta.key, { market: 'NYC' });
        expect(result.enabled).toBe(true);
        expect(result.reason).toBe('MARKET_ENABLED');
      }
    });

    it('disables all 3DGS tour flags for non-Phase-1 markets', () => {
      const tourFlags = getTour3DGSFlags();
      const nonPhase1Markets: Market[] = ['LA', 'SF', 'CHI', 'MIA', 'ATL'];

      for (const market of nonPhase1Markets) {
        for (const flagMeta of tourFlags) {
          const result = service.evaluate(flagMeta.key, { market });
          expect(result.enabled).toBe(false);
          expect(result.reason).toBe('MARKET_DISABLED');
        }
      }
    });
  });

  describe('convenience functions', () => {
    it('isFeatureEnabled works with default service', () => {
      resetFeatureFlagService();

      expect(isFeatureEnabled('AI_VALUATION')).toBe(true);
      expect(isFeatureEnabled('TOUR_3DGS_CAPTURE', { market: 'NYC' })).toBe(true);
      expect(isFeatureEnabled('TOUR_3DGS_CAPTURE', { market: 'LA' })).toBe(false);
    });

    it('isFeatureEnabledForMarket works correctly', () => {
      expect(isFeatureEnabledForMarket('TOUR_3DGS_CAPTURE', 'NYC')).toBe(true);
      expect(isFeatureEnabledForMarket('TOUR_3DGS_CAPTURE', 'LA')).toBe(false);
      expect(isFeatureEnabledForMarket('TOUR_WEBGPU_VIEWER', 'NYC')).toBe(true);
      expect(isFeatureEnabledForMarket('TOUR_WEBGPU_VIEWER', 'SF')).toBe(false);
    });
  });

  describe('overrides', () => {
    it('global override enables a disabled flag', () => {
      // TOUR_3DGS_CAPTURE is disabled for LA by default
      expect(service.isEnabled('TOUR_3DGS_CAPTURE', { market: 'LA' })).toBe(false);

      // Set global override
      service.setGlobalOverride('TOUR_3DGS_CAPTURE', true);

      // Now it should be enabled
      const result = service.evaluate('TOUR_3DGS_CAPTURE', { market: 'LA' });
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('OVERRIDE_ENABLED');
    });

    it('global override disables an enabled flag', () => {
      service.setGlobalOverride('AI_VALUATION', false);

      const result = service.evaluate('AI_VALUATION');
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('OVERRIDE_DISABLED');
    });

    it('tenant override takes precedence over global', () => {
      service.setGlobalOverride('TOUR_3DGS_CAPTURE', true);
      service.setTenantOverride('tenant_123', 'TOUR_3DGS_CAPTURE', false);

      const result = service.evaluate('TOUR_3DGS_CAPTURE', {
        tenantId: 'tenant_123',
        market: 'LA',
      });

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('OVERRIDE_DISABLED');
    });

    it('user override takes precedence over tenant', () => {
      service.setTenantOverride('tenant_123', 'TOUR_3DGS_CAPTURE', false);
      service.setUserOverride('user_456', 'TOUR_3DGS_CAPTURE', true);

      const result = service.evaluate('TOUR_3DGS_CAPTURE', {
        userId: 'user_456',
        tenantId: 'tenant_123',
        market: 'LA',
      });

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('OVERRIDE_ENABLED');
    });

    it('clearOverrides removes all overrides', () => {
      service.setGlobalOverride('AI_VALUATION', false);
      service.setTenantOverride('tenant_123', 'TOUR_3DGS_CAPTURE', true);
      service.setUserOverride('user_456', 'AI_LEASE_ANALYSIS', false);

      service.clearOverrides();

      expect(service.evaluate('AI_VALUATION').reason).toBe('DEFAULT_ENABLED');
      expect(service.evaluate('AI_LEASE_ANALYSIS').reason).toBe('DEFAULT_ENABLED');
    });
  });

  describe('getEnabledFlags / getDisabledFlags', () => {
    it('getEnabledFlags returns all enabled flags for context', () => {
      const nycFlags = service.getEnabledFlags({ market: 'NYC' });

      // Should include 3DGS flags for NYC
      expect(nycFlags).toContain('TOUR_3DGS_CAPTURE');
      expect(nycFlags).toContain('TOUR_WEBGPU_VIEWER');

      // Should include default enabled flags
      expect(nycFlags).toContain('AI_VALUATION');
    });

    it('getDisabledFlags returns all disabled flags for context', () => {
      const laFlags = service.getDisabledFlags({ market: 'LA' });

      // 3DGS flags should be disabled for LA
      expect(laFlags).toContain('TOUR_3DGS_CAPTURE');
      expect(laFlags).toContain('TOUR_WEBGPU_VIEWER');
    });
  });
});

describe('Market Configuration', () => {
  describe('Phase 1 rollout', () => {
    it('Phase 1 includes only NYC', () => {
      expect(ROLLOUT_PHASES.PHASE_1.markets).toEqual(['NYC']);
    });

    it('all 3DGS flags are in Phase 1', () => {
      const tourFlags = getTour3DGSFlags();

      for (const flagMeta of tourFlags) {
        const enabledMarkets = getEnabledMarketsForFlag(flagMeta.key);
        expect(enabledMarkets).toEqual(['NYC']);
      }
    });
  });

  describe('future phases', () => {
    it('Phase 2 includes NYC, LA, SF', () => {
      expect(ROLLOUT_PHASES.PHASE_2.markets).toEqual(['NYC', 'LA', 'SF']);
    });

    it('Phase 3 includes 6 markets', () => {
      expect(ROLLOUT_PHASES.PHASE_3.markets).toHaveLength(6);
      expect(ROLLOUT_PHASES.PHASE_3.markets).toContain('CHI');
    });

    it('GA includes all markets', () => {
      expect(ROLLOUT_PHASES.GA.markets.length).toBeGreaterThan(10);
    });
  });
});

describe('Feature Flag Registry', () => {
  it('has all 3DGS tour flags defined', () => {
    expect(FEATURE_FLAG_REGISTRY.TOUR_3DGS_CAPTURE).toBeDefined();
    expect(FEATURE_FLAG_REGISTRY.TOUR_SOG_CONVERSION).toBeDefined();
    expect(FEATURE_FLAG_REGISTRY.TOUR_WEBGPU_VIEWER).toBeDefined();
    expect(FEATURE_FLAG_REGISTRY.TOUR_LOD_STREAMING).toBeDefined();
  });

  it('all 3DGS flags are market-gated', () => {
    const tourFlags = getTour3DGSFlags();

    for (const flagMeta of tourFlags) {
      expect(flagMeta.marketGated).toBe(true);
    }
  });

  it('all 3DGS flags are in BETA phase', () => {
    const tourFlags = getTour3DGSFlags();

    for (const flagMeta of tourFlags) {
      expect(flagMeta.rolloutPhase).toBe('BETA');
    }
  });

  it('all 3DGS flags are in TOUR category', () => {
    const tourFlags = getTour3DGSFlags();

    for (const flagMeta of tourFlags) {
      expect(flagMeta.category).toBe('TOUR');
    }
  });

  it('all 3DGS flags are default disabled', () => {
    const tourFlags = getTour3DGSFlags();

    for (const flagMeta of tourFlags) {
      expect(flagMeta.defaultEnabled).toBe(false);
    }
  });
});
