/**
 * Revenue Modules
 *
 * Feature-flagged revenue modules for various product offerings.
 */

import type { ModuleConfig, RevenueModule } from '../types';

// =============================================================================
// Module Configurations
// =============================================================================

export const MODULE_CONFIGS: Record<RevenueModule, ModuleConfig> = {
  deposit_alternatives: {
    module: 'deposit_alternatives',
    featureFlagKey: 'DEPOSIT_ALTERNATIVES_ENABLED',
    providers: ['leaselock', 'rhino', 'jetty'],
    defaultProvider: 'leaselock',
    commissionRates: {
      leaselock: 0.15,
      rhino: 0.12,
      jetty: 0.10,
    },
    isActive: true,
  },

  renters_insurance: {
    module: 'renters_insurance',
    featureFlagKey: 'RENTERS_INSURANCE_ENABLED',
    providers: ['lemonade', 'jetty', 'assurant'],
    defaultProvider: 'lemonade',
    commissionRates: {
      lemonade: 0.20,
      jetty: 0.15,
      assurant: 0.18,
    },
    isActive: true,
  },

  guarantor_products: {
    module: 'guarantor_products',
    featureFlagKey: 'GUARANTOR_PRODUCTS_ENABLED',
    providers: ['the_guarantors', 'insurent', 'rhino_guarantor', 'leap'],
    defaultProvider: 'the_guarantors',
    commissionRates: {
      the_guarantors: 0.10,
      insurent: 0.12,
      rhino_guarantor: 0.08,
      leap: 0.10,
    },
    isActive: true,
  },

  utilities_concierge: {
    module: 'utilities_concierge',
    featureFlagKey: 'UTILITIES_CONCIERGE_ENABLED',
    providers: ['conedison', 'national_grid', 'spectrum', 'verizon'],
    commissionRates: {
      conedison: 25, // Fixed $25 referral
      national_grid: 25,
      spectrum: 50,
      verizon: 75,
    },
    isActive: true,
  },

  moving_services: {
    module: 'moving_services',
    featureFlagKey: 'MOVING_SERVICES_ENABLED',
    providers: ['two_men_truck', 'pods', 'uhaul'],
    commissionRates: {
      two_men_truck: 0.08,
      pods: 0.05,
      uhaul: 0.03,
    },
    isActive: true,
  },

  vendor_marketplace: {
    module: 'vendor_marketplace',
    featureFlagKey: 'VENDOR_MARKETPLACE_ENABLED',
    providers: ['internal'],
    commissionRates: {
      internal: 0.10, // 10% marketplace fee
    },
    isActive: true,
  },
};

// =============================================================================
// Module Manager
// =============================================================================

export interface ModuleStatus {
  module: RevenueModule;
  enabled: boolean;
  availableProviders: string[];
  activeProvider?: string;
}

export class ModuleManager {
  private featureFlagChecker: (key: string) => Promise<boolean>;

  constructor(featureFlagChecker: (key: string) => Promise<boolean>) {
    this.featureFlagChecker = featureFlagChecker;
  }

  /**
   * Check if a module is enabled.
   */
  async isModuleEnabled(module: RevenueModule): Promise<boolean> {
    const config = MODULE_CONFIGS[module];
    if (!config || !config.isActive) return false;

    return this.featureFlagChecker(config.featureFlagKey);
  }

  /**
   * Get module configuration.
   */
  getModuleConfig(module: RevenueModule): ModuleConfig | undefined {
    return MODULE_CONFIGS[module];
  }

  /**
   * Get all module statuses.
   */
  async getAllModuleStatuses(): Promise<ModuleStatus[]> {
    const statuses: ModuleStatus[] = [];

    for (const [module, config] of Object.entries(MODULE_CONFIGS)) {
      const enabled = await this.isModuleEnabled(module as RevenueModule);
      statuses.push({
        module: module as RevenueModule,
        enabled,
        availableProviders: config.providers,
        activeProvider: config.defaultProvider,
      });
    }

    return statuses;
  }

  /**
   * Get commission rate for a provider.
   */
  getCommissionRate(module: RevenueModule, provider: string): number {
    const config = MODULE_CONFIGS[module];
    if (!config) return 0;

    return config.commissionRates[provider] || 0;
  }
}

// =============================================================================
// Default Feature Flag Checker (for development)
// =============================================================================

export function createDefaultFeatureFlagChecker(): (key: string) => Promise<boolean> {
  // In development, all modules are enabled
  const enabledFlags = new Set([
    'DEPOSIT_ALTERNATIVES_ENABLED',
    'RENTERS_INSURANCE_ENABLED',
    'GUARANTOR_PRODUCTS_ENABLED',
    'UTILITIES_CONCIERGE_ENABLED',
    'MOVING_SERVICES_ENABLED',
    'VENDOR_MARKETPLACE_ENABLED',
  ]);

  return (key: string): Promise<boolean> => Promise.resolve(enabledFlags.has(key));
}

// =============================================================================
// Factory
// =============================================================================

export function createModuleManager(
  featureFlagChecker?: (key: string) => Promise<boolean>
): ModuleManager {
  return new ModuleManager(featureFlagChecker || createDefaultFeatureFlagChecker());
}
