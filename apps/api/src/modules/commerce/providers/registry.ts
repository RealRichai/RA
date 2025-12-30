/**
 * Commerce Provider Registry
 *
 * Manages provider instances and selects mock vs real providers
 * based on environment configuration.
 */

import {
  getMockGuarantorProvider,
  getMockInsuranceProvider,
  getMockMovingProvider,
  getMockUtilitiesProvider,
} from './mock';
import type {
  IGuarantorProvider,
  IInsuranceProvider,
  IMovingProvider,
  IUtilitiesProvider,
} from './provider.types';

// =============================================================================
// Provider Configuration
// =============================================================================

interface ProviderConfig {
  utilities: {
    provider: 'mock' | 'concierge-api';
    apiKey?: string;
  };
  moving: {
    provider: 'mock' | 'movehq' | 'updater';
    apiKey?: string;
  };
  insurance: {
    provider: 'mock' | 'lemonade' | 'sure';
    apiKey?: string;
  };
  guarantor: {
    provider: 'mock' | 'the-guarantors' | 'insurent' | 'rhino';
    apiKey?: string;
  };
}

function getProviderConfig(): ProviderConfig {
  return {
    utilities: {
      provider: process.env['UTILITIES_PROVIDER'] as 'mock' | 'concierge-api' || 'mock',
      apiKey: process.env['UTILITIES_API_KEY'],
    },
    moving: {
      provider: process.env['MOVING_PROVIDER'] as 'mock' | 'movehq' | 'updater' || 'mock',
      apiKey: process.env['MOVING_API_KEY'],
    },
    insurance: {
      provider: process.env['INSURANCE_PROVIDER'] as 'mock' | 'lemonade' | 'sure' || 'mock',
      apiKey: process.env['INSURANCE_API_KEY'],
    },
    guarantor: {
      provider: process.env['GUARANTOR_PROVIDER'] as 'mock' | 'the-guarantors' | 'insurent' | 'rhino' || 'mock',
      apiKey: process.env['GUARANTOR_API_KEY'],
    },
  };
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

  constructor() {
    this.config = getProviderConfig();
  }

  /**
   * Get the utilities provider instance.
   */
  getUtilitiesProvider(): IUtilitiesProvider {
    if (!this.utilitiesProvider) {
      // Real providers would be instantiated here based on config
      // For now, always use mock (real providers require business contracts)
      if (this.config.utilities.provider !== 'mock' && this.config.utilities.apiKey) {
        // Would instantiate real provider here
        // this.utilitiesProvider = new ConciergeApiProvider(this.config.utilities.apiKey);
      }
      this.utilitiesProvider = getMockUtilitiesProvider();
    }
    return this.utilitiesProvider;
  }

  /**
   * Get the moving provider instance.
   */
  getMovingProvider(): IMovingProvider {
    if (!this.movingProvider) {
      if (this.config.moving.provider !== 'mock' && this.config.moving.apiKey) {
        // Would instantiate real provider here
        // this.movingProvider = new MoveHQProvider(this.config.moving.apiKey);
      }
      this.movingProvider = getMockMovingProvider();
    }
    return this.movingProvider;
  }

  /**
   * Get the insurance provider instance.
   */
  getInsuranceProvider(): IInsuranceProvider {
    if (!this.insuranceProvider) {
      if (this.config.insurance.provider !== 'mock' && this.config.insurance.apiKey) {
        // Would instantiate real provider here
        // this.insuranceProvider = new LemonadeProvider(this.config.insurance.apiKey);
      }
      this.insuranceProvider = getMockInsuranceProvider();
    }
    return this.insuranceProvider;
  }

  /**
   * Get the guarantor provider instance.
   */
  getGuarantorProvider(): IGuarantorProvider {
    if (!this.guarantorProvider) {
      if (this.config.guarantor.provider !== 'mock' && this.config.guarantor.apiKey) {
        // Would instantiate real provider here
        // this.guarantorProvider = new TheGuarantorsProvider(this.config.guarantor.apiKey);
      }
      this.guarantorProvider = getMockGuarantorProvider();
    }
    return this.guarantorProvider;
  }

  /**
   * Check if a specific provider is using mock implementation.
   */
  isMockProvider(type: 'utilities' | 'moving' | 'insurance' | 'guarantor'): boolean {
    const provider = this.config[type];
    return provider.provider === 'mock' || !provider.apiKey;
  }

  /**
   * Get provider status for all types.
   */
  getProviderStatus(): Record<string, { provider: string; isMock: boolean }> {
    return {
      utilities: {
        provider: this.config.utilities.provider,
        isMock: this.isMockProvider('utilities'),
      },
      moving: {
        provider: this.config.moving.provider,
        isMock: this.isMockProvider('moving'),
      },
      insurance: {
        provider: this.config.insurance.provider,
        isMock: this.isMockProvider('insurance'),
      },
      guarantor: {
        provider: this.config.guarantor.provider,
        isMock: this.isMockProvider('guarantor'),
      },
    };
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
