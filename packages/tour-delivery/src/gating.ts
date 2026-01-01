/**
 * Tour Access Gating
 *
 * Enforces market + plan gating with deny-by-default policy.
 * Uses feature flags for dynamic configuration.
 * Integrates kill switch for emergency market disabling.
 *
 * @see RR-ENG-UPDATE-2026-002 - Kill switch integration
 */

import type { GatingConfig, TourAccessRequest } from './types';
import { DEFAULT_GATING_CONFIG } from './types';

export interface GatingResult {
  allowed: boolean;
  reason?: 'market_not_enabled' | 'plan_not_eligible' | 'market_disabled';
  market: string;
  plan: string;
  /** True if kill switch is active for this market */
  killSwitchActive?: boolean;
  /** Kill switch ID if blocked by kill switch */
  killSwitchId?: string;
  /** Kill switch reason if blocked */
  killSwitchReason?: string;
}

/**
 * Kill switch check interface
 * Allows injection of agent-governance KillSwitchManager
 */
export interface KillSwitchChecker {
  isBlocked(context: {
    market?: string;
    toolName?: string;
  }): { blocked: boolean; reason?: string; killSwitchId?: string };
}

export interface GatingService {
  /** Check if a tour access request is allowed */
  checkAccess(request: TourAccessRequest): Promise<GatingResult>;

  /** Check if a market has 3DGS tours enabled */
  isMarketEnabled(market: string): Promise<boolean>;

  /** Check if a plan can access 3DGS tours */
  isPlanEligible(plan: string): Promise<boolean>;

  /** Get current gating configuration */
  getConfig(): GatingConfig;

  /** Update gating configuration */
  updateConfig(config: Partial<GatingConfig>): void;
}

/**
 * Feature flag-based gating service with kill switch integration
 */
export class FeatureFlagGatingService implements GatingService {
  private config: GatingConfig;
  private featureFlagService?: {
    isEnabled: (flag: string, context?: Record<string, string>) => Promise<boolean>;
  };
  private killSwitchChecker?: KillSwitchChecker;

  constructor(
    config: Partial<GatingConfig> = {},
    featureFlagService?: {
      isEnabled: (flag: string, context?: Record<string, string>) => Promise<boolean>;
    },
    killSwitchChecker?: KillSwitchChecker
  ) {
    this.config = { ...DEFAULT_GATING_CONFIG, ...config };
    this.featureFlagService = featureFlagService;
    this.killSwitchChecker = killSwitchChecker;
  }

  /**
   * Set the kill switch checker (for late binding)
   */
  setKillSwitchChecker(checker: KillSwitchChecker): void {
    this.killSwitchChecker = checker;
  }

  async checkAccess(request: TourAccessRequest): Promise<GatingResult> {
    const { market, plan = 'free' } = request;

    // Check kill switch FIRST (emergency override - RR-ENG-UPDATE-2026-002)
    if (this.killSwitchChecker) {
      const killSwitchCheck = this.killSwitchChecker.isBlocked({
        market,
        toolName: '3dgs_tours',
      });

      if (killSwitchCheck.blocked) {
        return {
          allowed: false,
          reason: 'market_disabled',
          market,
          plan,
          killSwitchActive: true,
          killSwitchId: killSwitchCheck.killSwitchId,
          killSwitchReason: killSwitchCheck.reason,
        };
      }
    }

    // Check market (deny by default)
    const marketEnabled = await this.isMarketEnabled(market);
    if (!marketEnabled) {
      return {
        allowed: false,
        reason: 'market_not_enabled',
        market,
        plan,
      };
    }

    // Check plan eligibility
    const planEligible = await this.isPlanEligible(plan);
    if (!planEligible) {
      return {
        allowed: false,
        reason: 'plan_not_eligible',
        market,
        plan,
      };
    }

    return {
      allowed: true,
      market,
      plan,
    };
  }

  async isMarketEnabled(market: string): Promise<boolean> {
    // First check static configuration
    if (this.config.enabledMarkets.includes(market)) {
      return true;
    }

    // If feature flags are enabled, check dynamically
    if (this.config.useFeatureFlags && this.featureFlagService) {
      try {
        return await this.featureFlagService.isEnabled('3dgs_tours_enabled', { market });
      } catch {
        // Fall back to static config on error
        return false;
      }
    }

    // Deny by default
    return false;
  }

  async isPlanEligible(plan: string): Promise<boolean> {
    // Check static configuration
    if (this.config.eligiblePlans.includes(plan)) {
      return true;
    }

    // If feature flags are enabled, check dynamically
    if (this.config.useFeatureFlags && this.featureFlagService) {
      try {
        return await this.featureFlagService.isEnabled('3dgs_plan_eligible', { plan });
      } catch {
        // Fall back to static config on error
        return false;
      }
    }

    // Deny by default
    return false;
  }

  getConfig(): GatingConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<GatingConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a gating service with default configuration
 */
export function createGatingService(
  config?: Partial<GatingConfig>,
  featureFlagService?: {
    isEnabled: (flag: string, context?: Record<string, string>) => Promise<boolean>;
  },
  killSwitchChecker?: KillSwitchChecker
): GatingService {
  return new FeatureFlagGatingService(config, featureFlagService, killSwitchChecker);
}

/**
 * Create a mock gating service for testing
 */
export function createMockGatingService(
  enabledMarkets: string[] = [],
  eligiblePlans: string[] = ['pro', 'enterprise']
): GatingService {
  return new FeatureFlagGatingService({
    enabledMarkets,
    eligiblePlans,
    useFeatureFlags: false,
  });
}
