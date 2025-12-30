/**
 * Commerce Provider Registry
 *
 * Manages provider instances and selects mock vs real providers
 * based on environment configuration and feature flags.
 *
 * Features:
 * - Automatic fallback to mock when API keys are missing
 * - Feature flag gating for provider enablement
 * - Safe error handling with Result types
 * - Audit logging for provider selection decisions
 */

import { logger } from '@realriches/utils';

import { createLemonadeAdapter, type LemonadeInsuranceAdapter } from './lemonade';
import {
  getMockGuarantorProvider,
  getMockInsuranceProvider,
  getMockMovingProvider,
  getMockUtilitiesProvider,
} from './mock';
import { createTheGuarantorsAdapter, type TheGuarantorsAdapter } from './the-guarantors';
import type {
  IGuarantorProvider,
  IInsuranceProvider,
  IMovingProvider,
  IUtilitiesProvider,
} from './provider.types';

// =============================================================================
// Provider Configuration
// =============================================================================

type InsuranceProviderType = 'mock' | 'lemonade' | 'sure';
type GuarantorProviderType = 'mock' | 'the-guarantors' | 'insurent' | 'rhino';
type UtilitiesProviderType = 'mock' | 'concierge-api';
type MovingProviderType = 'mock' | 'movehq' | 'updater';

interface ProviderConfig {
  utilities: {
    provider: UtilitiesProviderType;
    apiKey?: string;
    apiUrl?: string;
    webhookSecret?: string;
  };
  moving: {
    provider: MovingProviderType;
    apiKey?: string;
    apiUrl?: string;
    webhookSecret?: string;
  };
  insurance: {
    provider: InsuranceProviderType;
    apiKey?: string;
    apiUrl?: string;
    webhookSecret?: string;
  };
  guarantor: {
    provider: GuarantorProviderType;
    apiKey?: string;
    apiUrl?: string;
    webhookSecret?: string;
  };
}

interface ProviderInitResult {
  success: boolean;
  provider: string;
  isMock: boolean;
  reason?: string;
}

function getProviderConfig(): ProviderConfig {
  return {
    utilities: {
      provider: (process.env['UTILITIES_PROVIDER'] as UtilitiesProviderType) || 'mock',
      apiKey: process.env['UTILITIES_API_KEY'],
      apiUrl: process.env['UTILITIES_API_URL'],
      webhookSecret: process.env['UTILITIES_WEBHOOK_SECRET'],
    },
    moving: {
      provider: (process.env['MOVING_PROVIDER'] as MovingProviderType) || 'mock',
      apiKey: process.env['MOVING_API_KEY'],
      apiUrl: process.env['MOVING_API_URL'],
      webhookSecret: process.env['MOVING_WEBHOOK_SECRET'],
    },
    insurance: {
      provider: (process.env['INSURANCE_PROVIDER'] as InsuranceProviderType) || 'mock',
      apiKey: process.env['INSURANCE_API_KEY'],
      apiUrl: process.env['INSURANCE_API_URL'] || 'https://api.lemonade.com',
      webhookSecret: process.env['INSURANCE_WEBHOOK_SECRET'],
    },
    guarantor: {
      provider: (process.env['GUARANTOR_PROVIDER'] as GuarantorProviderType) || 'mock',
      apiKey: process.env['GUARANTOR_API_KEY'],
      apiUrl: process.env['GUARANTOR_API_URL'] || 'https://api.theguarantors.com',
      webhookSecret: process.env['GUARANTOR_WEBHOOK_SECRET'],
    },
  };
}

// =============================================================================
// Feature Flag Check (simplified - would use feature-flags package in production)
// =============================================================================

function isFeatureEnabled(featureKey: string): boolean {
  // Check environment variable for feature flag
  const envKey = `FEATURE_${featureKey.toUpperCase()}`;
  const value = process.env[envKey];

  // Default to enabled if not explicitly disabled
  if (value === 'false' || value === '0') {
    return false;
  }

  return true;
}

// =============================================================================
// Provider Registry
// =============================================================================

class CommerceProviderRegistry {
  private config: ProviderConfig;
  private utilitiesProvider: IUtilitiesProvider | null = null;
  private movingProvider: IMovingProvider | null = null;
  private insuranceProvider: IInsuranceProvider | null = null;
  private guarantorProvider: IGuarantorProvider | null = null;

  // Track provider initialization results for debugging
  private initResults: Map<string, ProviderInitResult> = new Map();

  constructor() {
    this.config = getProviderConfig();
  }

  /**
   * Get the utilities provider instance.
   */
  getUtilitiesProvider(): IUtilitiesProvider {
    if (!this.utilitiesProvider) {
      const result = this.initUtilitiesProvider();
      this.initResults.set('utilities', result);
    }
    return this.utilitiesProvider!;
  }

  private initUtilitiesProvider(): ProviderInitResult {
    const { provider, apiKey } = this.config.utilities;

    // Check feature flag
    if (!isFeatureEnabled('UTILITIES_CONCIERGE')) {
      this.utilitiesProvider = getMockUtilitiesProvider();
      return {
        success: true,
        provider: 'mock',
        isMock: true,
        reason: 'Feature flag UTILITIES_CONCIERGE is disabled',
      };
    }

    // Check if real provider is configured
    if (provider !== 'mock' && apiKey) {
      // Real provider would be instantiated here
      // For now, fall back to mock
      logger.info({
        msg: 'utilities_provider_fallback',
        configuredProvider: provider,
        reason: 'Real utilities provider not yet implemented',
      });
    }

    this.utilitiesProvider = getMockUtilitiesProvider();
    return {
      success: true,
      provider: 'mock',
      isMock: true,
      reason: apiKey ? 'Real provider not implemented' : 'API key not configured',
    };
  }

  /**
   * Get the moving provider instance.
   */
  getMovingProvider(): IMovingProvider {
    if (!this.movingProvider) {
      const result = this.initMovingProvider();
      this.initResults.set('moving', result);
    }
    return this.movingProvider!;
  }

  private initMovingProvider(): ProviderInitResult {
    const { provider, apiKey } = this.config.moving;

    // Check feature flag
    if (!isFeatureEnabled('MOVING_SERVICES')) {
      this.movingProvider = getMockMovingProvider();
      return {
        success: true,
        provider: 'mock',
        isMock: true,
        reason: 'Feature flag MOVING_SERVICES is disabled',
      };
    }

    // Check if real provider is configured
    if (provider !== 'mock' && apiKey) {
      // Real provider would be instantiated here
      logger.info({
        msg: 'moving_provider_fallback',
        configuredProvider: provider,
        reason: 'Real moving provider not yet implemented',
      });
    }

    this.movingProvider = getMockMovingProvider();
    return {
      success: true,
      provider: 'mock',
      isMock: true,
      reason: apiKey ? 'Real provider not implemented' : 'API key not configured',
    };
  }

  /**
   * Get the insurance provider instance.
   * Supports Lemonade adapter with automatic fallback to mock.
   */
  getInsuranceProvider(): IInsuranceProvider {
    if (!this.insuranceProvider) {
      const result = this.initInsuranceProvider();
      this.initResults.set('insurance', result);
    }
    return this.insuranceProvider!;
  }

  private initInsuranceProvider(): ProviderInitResult {
    const { provider, apiKey, apiUrl, webhookSecret } = this.config.insurance;

    // Check feature flag
    if (!isFeatureEnabled('RENTERS_INSURANCE')) {
      this.insuranceProvider = getMockInsuranceProvider();
      logger.info({
        msg: 'insurance_provider_init',
        provider: 'mock',
        reason: 'Feature flag RENTERS_INSURANCE is disabled',
      });
      return {
        success: true,
        provider: 'mock',
        isMock: true,
        reason: 'Feature flag RENTERS_INSURANCE is disabled',
      };
    }

    // Try to initialize real provider if configured
    if (provider === 'lemonade' && apiKey) {
      try {
        this.insuranceProvider = createLemonadeAdapter({
          baseUrl: apiUrl || 'https://api.lemonade.com',
          apiKey,
          webhookSecret,
          timeout: 30000,
          retryAttempts: 3,
          sandbox: process.env['NODE_ENV'] !== 'production',
        });

        logger.info({
          msg: 'insurance_provider_init',
          provider: 'lemonade',
          sandbox: process.env['NODE_ENV'] !== 'production',
        });

        return {
          success: true,
          provider: 'lemonade',
          isMock: false,
        };
      } catch (error) {
        logger.error({
          msg: 'insurance_provider_init_failed',
          provider: 'lemonade',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Fall through to mock
      }
    }

    // Fall back to mock
    this.insuranceProvider = getMockInsuranceProvider();

    const reason = !apiKey
      ? 'INSURANCE_API_KEY not configured'
      : provider === 'mock'
        ? 'Mock provider explicitly configured'
        : `Provider ${provider} not supported, falling back to mock`;

    logger.info({
      msg: 'insurance_provider_init',
      provider: 'mock',
      configuredProvider: provider,
      reason,
    });

    return {
      success: true,
      provider: 'mock',
      isMock: true,
      reason,
    };
  }

  /**
   * Get the guarantor provider instance.
   * Supports The Guarantors adapter with automatic fallback to mock.
   */
  getGuarantorProvider(): IGuarantorProvider {
    if (!this.guarantorProvider) {
      const result = this.initGuarantorProvider();
      this.initResults.set('guarantor', result);
    }
    return this.guarantorProvider!;
  }

  private initGuarantorProvider(): ProviderInitResult {
    const { provider, apiKey, apiUrl, webhookSecret } = this.config.guarantor;

    // Check feature flag
    if (!isFeatureEnabled('GUARANTOR_PRODUCTS')) {
      this.guarantorProvider = getMockGuarantorProvider();
      logger.info({
        msg: 'guarantor_provider_init',
        provider: 'mock',
        reason: 'Feature flag GUARANTOR_PRODUCTS is disabled',
      });
      return {
        success: true,
        provider: 'mock',
        isMock: true,
        reason: 'Feature flag GUARANTOR_PRODUCTS is disabled',
      };
    }

    // Try to initialize real provider if configured
    if (provider === 'the-guarantors' && apiKey) {
      try {
        this.guarantorProvider = createTheGuarantorsAdapter({
          baseUrl: apiUrl || 'https://api.theguarantors.com',
          apiKey,
          webhookSecret,
          timeout: 30000,
          retryAttempts: 3,
          sandbox: process.env['NODE_ENV'] !== 'production',
        });

        logger.info({
          msg: 'guarantor_provider_init',
          provider: 'the-guarantors',
          sandbox: process.env['NODE_ENV'] !== 'production',
        });

        return {
          success: true,
          provider: 'the-guarantors',
          isMock: false,
        };
      } catch (error) {
        logger.error({
          msg: 'guarantor_provider_init_failed',
          provider: 'the-guarantors',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Fall through to mock
      }
    }

    // Fall back to mock
    this.guarantorProvider = getMockGuarantorProvider();

    const reason = !apiKey
      ? 'GUARANTOR_API_KEY not configured'
      : provider === 'mock'
        ? 'Mock provider explicitly configured'
        : `Provider ${provider} not supported, falling back to mock`;

    logger.info({
      msg: 'guarantor_provider_init',
      provider: 'mock',
      configuredProvider: provider,
      reason,
    });

    return {
      success: true,
      provider: 'mock',
      isMock: true,
      reason,
    };
  }

  /**
   * Check if a specific provider is using mock implementation.
   */
  isMockProvider(type: 'utilities' | 'moving' | 'insurance' | 'guarantor'): boolean {
    const result = this.initResults.get(type);
    if (result) {
      return result.isMock;
    }

    // Trigger initialization if not done
    switch (type) {
      case 'utilities':
        this.getUtilitiesProvider();
        break;
      case 'moving':
        this.getMovingProvider();
        break;
      case 'insurance':
        this.getInsuranceProvider();
        break;
      case 'guarantor':
        this.getGuarantorProvider();
        break;
    }

    return this.initResults.get(type)?.isMock ?? true;
  }

  /**
   * Get provider status for all types.
   */
  getProviderStatus(): Record<string, { provider: string; isMock: boolean; reason?: string }> {
    // Ensure all providers are initialized
    this.getUtilitiesProvider();
    this.getMovingProvider();
    this.getInsuranceProvider();
    this.getGuarantorProvider();

    return {
      utilities: {
        provider: this.initResults.get('utilities')?.provider || 'mock',
        isMock: this.initResults.get('utilities')?.isMock ?? true,
        reason: this.initResults.get('utilities')?.reason,
      },
      moving: {
        provider: this.initResults.get('moving')?.provider || 'mock',
        isMock: this.initResults.get('moving')?.isMock ?? true,
        reason: this.initResults.get('moving')?.reason,
      },
      insurance: {
        provider: this.initResults.get('insurance')?.provider || 'mock',
        isMock: this.initResults.get('insurance')?.isMock ?? true,
        reason: this.initResults.get('insurance')?.reason,
      },
      guarantor: {
        provider: this.initResults.get('guarantor')?.provider || 'mock',
        isMock: this.initResults.get('guarantor')?.isMock ?? true,
        reason: this.initResults.get('guarantor')?.reason,
      },
    };
  }

  /**
   * Get the underlying Lemonade adapter if configured (for webhooks).
   */
  getLemonadeAdapter(): LemonadeInsuranceAdapter | null {
    if (this.insuranceProvider && 'processWebhook' in this.insuranceProvider) {
      return this.insuranceProvider as LemonadeInsuranceAdapter;
    }
    return null;
  }

  /**
   * Get the underlying The Guarantors adapter if configured (for webhooks).
   */
  getTheGuarantorsAdapter(): TheGuarantorsAdapter | null {
    if (this.guarantorProvider && 'processWebhook' in this.guarantorProvider) {
      return this.guarantorProvider as TheGuarantorsAdapter;
    }
    return null;
  }

  /**
   * Reset all providers (useful for testing).
   */
  reset(): void {
    this.utilitiesProvider = null;
    this.movingProvider = null;
    this.insuranceProvider = null;
    this.guarantorProvider = null;
    this.initResults.clear();
    this.config = getProviderConfig();
  }
}

// Singleton instance
let registry: CommerceProviderRegistry | null = null;

export function getCommerceProviderRegistry(): CommerceProviderRegistry {
  if (!registry) {
    registry = new CommerceProviderRegistry();
  }
  return registry;
}

// Reset registry (for testing)
export function resetCommerceProviderRegistry(): void {
  if (registry) {
    registry.reset();
  }
  registry = null;
}

// Convenience exports
export function getUtilitiesProvider(): IUtilitiesProvider {
  return getCommerceProviderRegistry().getUtilitiesProvider();
}

export function getMovingProvider(): IMovingProvider {
  return getCommerceProviderRegistry().getMovingProvider();
}

export function getInsuranceProvider(): IInsuranceProvider {
  return getCommerceProviderRegistry().getInsuranceProvider();
}

export function getGuarantorProvider(): IGuarantorProvider {
  return getCommerceProviderRegistry().getGuarantorProvider();
}
