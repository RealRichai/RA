import { describe, it, expect, beforeEach } from 'vitest';

import {
  FeatureFlagGatingService,
  createGatingService,
  createMockGatingService,
} from '../gating';
import type { TourAccessRequest } from '../types';

describe('Gating Service', () => {
  describe('FeatureFlagGatingService', () => {
    let gatingService: FeatureFlagGatingService;

    beforeEach(() => {
      gatingService = new FeatureFlagGatingService({
        enabledMarkets: ['NYC', 'LA'],
        eligiblePlans: ['pro', 'enterprise'],
        useFeatureFlags: false,
      });
    });

    describe('checkAccess', () => {
      it('allows access for enabled market and eligible plan', async () => {
        const request: TourAccessRequest = {
          tourAssetId: '123e4567-e89b-12d3-a456-426614174000',
          userId: '123e4567-e89b-12d3-a456-426614174001',
          market: 'NYC',
          plan: 'pro',
        };

        const result = await gatingService.checkAccess(request);

        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
        expect(result.market).toBe('NYC');
        expect(result.plan).toBe('pro');
      });

      it('denies access for disabled market', async () => {
        const request: TourAccessRequest = {
          tourAssetId: '123e4567-e89b-12d3-a456-426614174000',
          userId: '123e4567-e89b-12d3-a456-426614174001',
          market: 'CHI', // Not in enabled list
          plan: 'pro',
        };

        const result = await gatingService.checkAccess(request);

        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('market_not_enabled');
        expect(result.market).toBe('CHI');
      });

      it('denies access for ineligible plan', async () => {
        const request: TourAccessRequest = {
          tourAssetId: '123e4567-e89b-12d3-a456-426614174000',
          userId: '123e4567-e89b-12d3-a456-426614174001',
          market: 'NYC',
          plan: 'free', // Not in eligible list
        };

        const result = await gatingService.checkAccess(request);

        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('plan_not_eligible');
        expect(result.plan).toBe('free');
      });

      it('uses default plan when not specified', async () => {
        const request: TourAccessRequest = {
          tourAssetId: '123e4567-e89b-12d3-a456-426614174000',
          userId: '123e4567-e89b-12d3-a456-426614174001',
          market: 'NYC',
          // plan defaults to 'free'
        };

        const result = await gatingService.checkAccess(request);

        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('plan_not_eligible');
        expect(result.plan).toBe('free');
      });
    });

    describe('isMarketEnabled', () => {
      it('returns true for enabled markets', async () => {
        expect(await gatingService.isMarketEnabled('NYC')).toBe(true);
        expect(await gatingService.isMarketEnabled('LA')).toBe(true);
      });

      it('returns false for disabled markets', async () => {
        expect(await gatingService.isMarketEnabled('CHI')).toBe(false);
        expect(await gatingService.isMarketEnabled('SF')).toBe(false);
      });
    });

    describe('isPlanEligible', () => {
      it('returns true for eligible plans', async () => {
        expect(await gatingService.isPlanEligible('pro')).toBe(true);
        expect(await gatingService.isPlanEligible('enterprise')).toBe(true);
      });

      it('returns false for ineligible plans', async () => {
        expect(await gatingService.isPlanEligible('free')).toBe(false);
        expect(await gatingService.isPlanEligible('basic')).toBe(false);
      });
    });

    describe('updateConfig', () => {
      it('updates enabled markets', () => {
        gatingService.updateConfig({ enabledMarkets: ['SF', 'CHI'] });

        expect(gatingService.getConfig().enabledMarkets).toEqual(['SF', 'CHI']);
      });

      it('updates eligible plans', () => {
        gatingService.updateConfig({ eligiblePlans: ['free', 'basic'] });

        expect(gatingService.getConfig().eligiblePlans).toEqual(['free', 'basic']);
      });
    });
  });

  describe('Deny-by-default behavior', () => {
    it('denies all markets when no markets are configured', async () => {
      const gatingService = createGatingService({
        enabledMarkets: [],
        eligiblePlans: ['pro'],
        useFeatureFlags: false,
      });

      const result = await gatingService.checkAccess({
        tourAssetId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        market: 'NYC',
        plan: 'pro',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('market_not_enabled');
    });

    it('denies all plans when no plans are configured', async () => {
      const gatingService = createGatingService({
        enabledMarkets: ['NYC'],
        eligiblePlans: [],
        useFeatureFlags: false,
      });

      const result = await gatingService.checkAccess({
        tourAssetId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        market: 'NYC',
        plan: 'pro',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('plan_not_eligible');
    });
  });

  describe('Feature flag integration', () => {
    it('uses feature flag service when enabled', async () => {
      const mockFeatureFlagService = {
        isEnabled: async (flag: string, context?: Record<string, string>) => {
          if (flag === '3dgs_tours_enabled' && context?.market === 'SF') {
            return true;
          }
          if (flag === '3dgs_plan_eligible' && context?.plan === 'startup') {
            return true;
          }
          return false;
        },
      };

      const gatingService = new FeatureFlagGatingService(
        {
          enabledMarkets: [], // Empty - rely on feature flags
          eligiblePlans: [],
          useFeatureFlags: true,
        },
        mockFeatureFlagService
      );

      // SF market enabled via feature flag
      expect(await gatingService.isMarketEnabled('SF')).toBe(true);
      expect(await gatingService.isMarketEnabled('NYC')).toBe(false);

      // startup plan enabled via feature flag
      expect(await gatingService.isPlanEligible('startup')).toBe(true);
      expect(await gatingService.isPlanEligible('free')).toBe(false);
    });

    it('falls back to static config when feature flag service fails', async () => {
      const mockFeatureFlagService = {
        isEnabled: async () => {
          throw new Error('Service unavailable');
        },
      };

      const gatingService = new FeatureFlagGatingService(
        {
          enabledMarkets: ['NYC'],
          eligiblePlans: ['pro'],
          useFeatureFlags: true,
        },
        mockFeatureFlagService
      );

      // Falls back to deny (not in static config)
      expect(await gatingService.isMarketEnabled('SF')).toBe(false);
      // Uses static config
      expect(await gatingService.isMarketEnabled('NYC')).toBe(true);
    });
  });

  describe('createMockGatingService', () => {
    it('creates a gating service with specified markets', async () => {
      const gatingService = createMockGatingService(['NYC', 'LA']);

      expect(await gatingService.isMarketEnabled('NYC')).toBe(true);
      expect(await gatingService.isMarketEnabled('CHI')).toBe(false);
    });

    it('creates a gating service with default eligible plans', async () => {
      const gatingService = createMockGatingService();

      expect(await gatingService.isPlanEligible('pro')).toBe(true);
      expect(await gatingService.isPlanEligible('enterprise')).toBe(true);
      expect(await gatingService.isPlanEligible('free')).toBe(false);
    });
  });
});
