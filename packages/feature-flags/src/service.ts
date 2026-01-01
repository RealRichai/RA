import type { FeatureFlag, FeatureFlagMetadata } from './flags';
import { FEATURE_FLAG_REGISTRY } from './flags';
import type { Market } from './markets';
import { FEATURE_MARKET_CONFIG, getEnabledMarketsForFlag, isValidMarket } from './markets';

/**
 * Context for feature flag evaluation
 */
export interface FeatureFlagContext {
  /** User ID for user-level targeting */
  userId?: string;
  /** Tenant ID for tenant-level targeting */
  tenantId?: string;
  /** Market code for geographic targeting */
  market?: string;
  /** Property ID for property-level targeting */
  propertyId?: string;
  /** Environment override */
  environment?: 'development' | 'staging' | 'production';
  /** Custom attributes for targeting rules */
  attributes?: Record<string, unknown>;
}

/**
 * Feature flag evaluation result
 */
export interface FeatureFlagResult {
  flag: FeatureFlag;
  enabled: boolean;
  reason: FeatureFlagReason;
  metadata: FeatureFlagMetadata;
}

export type FeatureFlagReason =
  | 'DEFAULT_ENABLED'
  | 'DEFAULT_DISABLED'
  | 'MARKET_ENABLED'
  | 'MARKET_DISABLED'
  | 'OVERRIDE_ENABLED'
  | 'OVERRIDE_DISABLED'
  | 'USER_TARGETED'
  | 'TENANT_TARGETED'
  | 'PERCENTAGE_ROLLOUT';

/**
 * Feature flag overrides for testing and gradual rollout
 */
interface FeatureFlagOverrides {
  /** Global flag overrides */
  global: Map<FeatureFlag, boolean>;
  /** Per-tenant overrides */
  tenant: Map<string, Map<FeatureFlag, boolean>>;
  /** Per-user overrides */
  user: Map<string, Map<FeatureFlag, boolean>>;
}

/**
 * Feature Flag Service
 *
 * Provides feature flag evaluation with market gating support.
 * Can be used directly or as a base for external provider integration.
 */
export class FeatureFlagService {
  private overrides: FeatureFlagOverrides = {
    global: new Map(),
    tenant: new Map(),
    user: new Map(),
  };

  /**
   * Check if a feature flag is enabled
   */
  isEnabled(flag: FeatureFlag, context?: FeatureFlagContext): boolean {
    return this.evaluate(flag, context).enabled;
  }

  /**
   * Evaluate a feature flag with full result details
   */
  evaluate(flag: FeatureFlag, context?: FeatureFlagContext): FeatureFlagResult {
    const metadata = FEATURE_FLAG_REGISTRY[flag];

    if (!metadata) {
      throw new Error(`Unknown feature flag: ${flag}`);
    }

    // Check user-level override
    if (context?.userId) {
      const userOverrides = this.overrides.user.get(context.userId);
      if (userOverrides?.has(flag)) {
        return {
          flag,
          enabled: userOverrides.get(flag)!,
          reason: userOverrides.get(flag) ? 'OVERRIDE_ENABLED' : 'OVERRIDE_DISABLED',
          metadata,
        };
      }
    }

    // Check tenant-level override
    if (context?.tenantId) {
      const tenantOverrides = this.overrides.tenant.get(context.tenantId);
      if (tenantOverrides?.has(flag)) {
        return {
          flag,
          enabled: tenantOverrides.get(flag)!,
          reason: tenantOverrides.get(flag) ? 'OVERRIDE_ENABLED' : 'OVERRIDE_DISABLED',
          metadata,
        };
      }
    }

    // Check global override
    if (this.overrides.global.has(flag)) {
      return {
        flag,
        enabled: this.overrides.global.get(flag)!,
        reason: this.overrides.global.get(flag) ? 'OVERRIDE_ENABLED' : 'OVERRIDE_DISABLED',
        metadata,
      };
    }

    // Check market gating
    if (metadata.marketGated && context?.market) {
      const marketEnabled = this.isEnabledForMarket(flag, context.market);
      return {
        flag,
        enabled: marketEnabled,
        reason: marketEnabled ? 'MARKET_ENABLED' : 'MARKET_DISABLED',
        metadata,
      };
    }

    // Return default
    return {
      flag,
      enabled: metadata.defaultEnabled,
      reason: metadata.defaultEnabled ? 'DEFAULT_ENABLED' : 'DEFAULT_DISABLED',
      metadata,
    };
  }

  /**
   * Check if a feature is enabled for a specific market
   */
  isEnabledForMarket(flag: FeatureFlag, market: string): boolean {
    if (!isValidMarket(market)) {
      return false;
    }

    const enabledMarkets = getEnabledMarketsForFlag(flag);

    // If no market config, feature is not market-gated
    if (enabledMarkets === null) {
      const metadata = FEATURE_FLAG_REGISTRY[flag];
      return metadata?.defaultEnabled ?? false;
    }

    return enabledMarkets.includes(market as Market);
  }

  /**
   * Get all enabled flags for a context
   */
  getEnabledFlags(context?: FeatureFlagContext): FeatureFlag[] {
    return Object.keys(FEATURE_FLAG_REGISTRY)
      .filter((flag) => this.isEnabled(flag as FeatureFlag, context)) as FeatureFlag[];
  }

  /**
   * Get all disabled flags for a context
   */
  getDisabledFlags(context?: FeatureFlagContext): FeatureFlag[] {
    return Object.keys(FEATURE_FLAG_REGISTRY)
      .filter((flag) => !this.isEnabled(flag as FeatureFlag, context)) as FeatureFlag[];
  }

  /**
   * Set a global flag override
   */
  setGlobalOverride(flag: FeatureFlag, enabled: boolean): void {
    this.overrides.global.set(flag, enabled);
  }

  /**
   * Remove a global flag override
   */
  removeGlobalOverride(flag: FeatureFlag): void {
    this.overrides.global.delete(flag);
  }

  /**
   * Set a tenant-level flag override
   */
  setTenantOverride(tenantId: string, flag: FeatureFlag, enabled: boolean): void {
    if (!this.overrides.tenant.has(tenantId)) {
      this.overrides.tenant.set(tenantId, new Map());
    }
    this.overrides.tenant.get(tenantId)!.set(flag, enabled);
  }

  /**
   * Remove a tenant-level flag override
   */
  removeTenantOverride(tenantId: string, flag: FeatureFlag): void {
    this.overrides.tenant.get(tenantId)?.delete(flag);
  }

  /**
   * Set a user-level flag override
   */
  setUserOverride(userId: string, flag: FeatureFlag, enabled: boolean): void {
    if (!this.overrides.user.has(userId)) {
      this.overrides.user.set(userId, new Map());
    }
    this.overrides.user.get(userId)!.set(flag, enabled);
  }

  /**
   * Remove a user-level flag override
   */
  removeUserOverride(userId: string, flag: FeatureFlag): void {
    this.overrides.user.get(userId)?.delete(flag);
  }

  /**
   * Clear all overrides
   */
  clearOverrides(): void {
    this.overrides.global.clear();
    this.overrides.tenant.clear();
    this.overrides.user.clear();
  }

  /**
   * Get market configuration for a flag
   */
  getMarketConfig(flag: FeatureFlag) {
    return FEATURE_MARKET_CONFIG.find((c) => c.flag === flag);
  }
}

/**
 * Default singleton instance
 */
let defaultService: FeatureFlagService | null = null;

export function getFeatureFlagService(): FeatureFlagService {
  if (!defaultService) {
    defaultService = new FeatureFlagService();
  }
  return defaultService;
}

/**
 * Reset the default service (for testing)
 */
export function resetFeatureFlagService(): void {
  defaultService = null;
}

/**
 * Convenience function to check if a flag is enabled
 */
export function isFeatureEnabled(
  flag: FeatureFlag,
  context?: FeatureFlagContext
): boolean {
  return getFeatureFlagService().isEnabled(flag, context);
}

/**
 * Convenience function to check if a flag is enabled for a market
 */
export function isFeatureEnabledForMarket(
  flag: FeatureFlag,
  market: string
): boolean {
  return getFeatureFlagService().isEnabledForMarket(flag, market);
}
