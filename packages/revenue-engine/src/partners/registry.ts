/**
 * Provider Registry
 *
 * Central registry for managing partner provider instances.
 */

import type { PartnerProductType, PartnerProvider, QuoteRequest, QuoteResponse } from '../types';

import { AssurantProvider } from './adapters/assurant';
import { InsurentProvider } from './adapters/insurent';
import { JettyProvider } from './adapters/jetty';
import { LeapProvider } from './adapters/leap';
import { LeaseLockProvider } from './adapters/leaselock';
import { LemonadeProvider } from './adapters/lemonade';
import { RhinoProvider } from './adapters/rhino';
import { SureProvider } from './adapters/sure';
import type { IPartnerProvider, ProviderConfig } from './provider-interface';
import { ProviderUnavailableError } from './provider-interface';

// =============================================================================
// Registry Types
// =============================================================================

export interface ProviderRegistryConfig {
  leaselock?: ProviderConfig;
  rhino?: ProviderConfig;
  jetty?: ProviderConfig;
  lemonade?: ProviderConfig;
  assurant?: ProviderConfig;
  sure?: ProviderConfig;
  insurent?: ProviderConfig;
  leap?: ProviderConfig;
  state_farm?: ProviderConfig;
  the_guarantors?: ProviderConfig;
}

export interface QuoteComparison {
  provider: PartnerProvider;
  quote: QuoteResponse | null;
  error?: string;
  responseTimeMs: number;
}

// =============================================================================
// Provider Registry
// =============================================================================

export class ProviderRegistry {
  private providers: Map<PartnerProvider, IPartnerProvider> = new Map();
  private productProviders: Map<PartnerProductType, PartnerProvider[]> = new Map();

  constructor(config: ProviderRegistryConfig = {}) {
    this.initializeProviders(config);
    this.buildProductIndex();
  }

  /**
   * Initialize all configured providers.
   */
  private initializeProviders(config: ProviderRegistryConfig): void {
    // Deposit alternatives
    if (config.leaselock) {
      this.providers.set('leaselock', new LeaseLockProvider(config.leaselock));
    } else {
      // Register with empty config for mock mode
      this.providers.set('leaselock', new LeaseLockProvider({ apiKey: '', apiUrl: '' }));
    }

    if (config.rhino) {
      this.providers.set('rhino', new RhinoProvider(config.rhino));
    } else {
      this.providers.set('rhino', new RhinoProvider({ apiKey: '', apiUrl: '' }));
    }

    if (config.jetty) {
      this.providers.set('jetty', new JettyProvider(config.jetty));
    } else {
      this.providers.set('jetty', new JettyProvider({ apiKey: '', apiUrl: '' }));
    }

    // Insurance
    if (config.lemonade) {
      this.providers.set('lemonade', new LemonadeProvider(config.lemonade));
    } else {
      this.providers.set('lemonade', new LemonadeProvider({ apiKey: '', apiUrl: '' }));
    }

    if (config.assurant) {
      this.providers.set('assurant', new AssurantProvider(config.assurant));
    } else {
      this.providers.set('assurant', new AssurantProvider({ apiKey: '', apiUrl: '' }));
    }

    if (config.sure) {
      this.providers.set('sure', new SureProvider(config.sure));
    } else {
      this.providers.set('sure', new SureProvider({ apiKey: '', apiUrl: '' }));
    }

    // Guarantor providers
    if (config.insurent) {
      this.providers.set('insurent', new InsurentProvider(config.insurent));
    } else {
      this.providers.set('insurent', new InsurentProvider({ apiKey: '', apiUrl: '' }));
    }

    if (config.leap) {
      this.providers.set('leap', new LeapProvider(config.leap));
    } else {
      this.providers.set('leap', new LeapProvider({ apiKey: '', apiUrl: '' }));
    }
  }

  /**
   * Build index of providers by product type.
   */
  private buildProductIndex(): void {
    for (const [providerId, provider] of this.providers.entries()) {
      for (const product of provider.supportedProducts) {
        if (!this.productProviders.has(product)) {
          this.productProviders.set(product, []);
        }
        this.productProviders.get(product)!.push(providerId);
      }
    }
  }

  /**
   * Get a provider by ID.
   */
  getProvider(providerId: PartnerProvider): IPartnerProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get a provider, throwing if not found.
   */
  getProviderOrThrow(providerId: PartnerProvider): IPartnerProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ProviderUnavailableError(providerId);
    }
    return provider;
  }

  /**
   * Get all providers for a product type.
   */
  getProvidersForProduct(productType: PartnerProductType): IPartnerProvider[] {
    const providerIds = this.productProviders.get(productType) || [];
    return providerIds
      .map((id) => this.providers.get(id))
      .filter((p): p is IPartnerProvider => p !== undefined);
  }

  /**
   * Get provider IDs for a product type.
   */
  getProviderIdsForProduct(productType: PartnerProductType): PartnerProvider[] {
    return this.productProviders.get(productType) || [];
  }

  /**
   * Check if a provider is available.
   */
  async isProviderAvailable(providerId: PartnerProvider): Promise<boolean> {
    const provider = this.providers.get(providerId);
    if (!provider) return false;
    return provider.isAvailable();
  }

  /**
   * Get quotes from all providers for a product.
   */
  async getMultiProviderQuotes(
    request: QuoteRequest,
    providerIds?: PartnerProvider[]
  ): Promise<QuoteComparison[]> {
    const providers = providerIds
      ? providerIds.map((id) => this.providers.get(id)).filter((p): p is IPartnerProvider => !!p)
      : this.getProvidersForProduct(request.productType);

    const results: QuoteComparison[] = [];

    await Promise.all(
      providers.map(async (provider) => {
        const startTime = Date.now();
        try {
          const quote = await provider.getQuote(request);
          results.push({
            provider: provider.providerId,
            quote,
            responseTimeMs: Date.now() - startTime,
          });
        } catch (error) {
          results.push({
            provider: provider.providerId,
            quote: null,
            error: (error as Error).message,
            responseTimeMs: Date.now() - startTime,
          });
        }
      })
    );

    // Sort by premium (lowest first) for successful quotes
    return results.sort((a, b) => {
      if (!a.quote && !b.quote) return 0;
      if (!a.quote) return 1;
      if (!b.quote) return -1;
      return (a.quote.premium || 0) - (b.quote.premium || 0);
    });
  }

  /**
   * Get the best quote (lowest premium) from all available providers.
   */
  async getBestQuote(request: QuoteRequest): Promise<QuoteResponse | null> {
    const comparisons = await this.getMultiProviderQuotes(request);
    const successfulQuotes = comparisons.filter((c) => c.quote !== null);

    if (successfulQuotes.length === 0) return null;

    // We've filtered for non-null quotes and checked length, so this is safe
    const bestQuote = successfulQuotes[0];
    return bestQuote?.quote ?? null;
  }

  /**
   * Get list of all registered providers.
   */
  getAllProviders(): Map<PartnerProvider, IPartnerProvider> {
    return new Map(this.providers);
  }

  /**
   * Get all available product types.
   */
  getAvailableProductTypes(): PartnerProductType[] {
    return Array.from(this.productProviders.keys());
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let registryInstance: ProviderRegistry | null = null;

/**
 * Get or create the provider registry singleton.
 */
export function getProviderRegistry(config?: ProviderRegistryConfig): ProviderRegistry {
  if (!registryInstance || config) {
    registryInstance = new ProviderRegistry(config);
  }
  return registryInstance;
}

/**
 * Reset the registry (for testing).
 */
export function resetProviderRegistry(): void {
  registryInstance = null;
}

// =============================================================================
// Helper to create registry from environment
// =============================================================================

export function createRegistryFromEnv(): ProviderRegistry {
  const config: ProviderRegistryConfig = {};

  // LeaseLock
  if (process.env.LEASELOCK_API_KEY && process.env.LEASELOCK_API_URL) {
    config.leaselock = {
      apiKey: process.env.LEASELOCK_API_KEY,
      apiUrl: process.env.LEASELOCK_API_URL,
      webhookSecret: process.env.LEASELOCK_WEBHOOK_SECRET,
    };
  }

  // Rhino
  if (process.env.RHINO_API_KEY && process.env.RHINO_API_URL) {
    config.rhino = {
      apiKey: process.env.RHINO_API_KEY,
      apiUrl: process.env.RHINO_API_URL,
      webhookSecret: process.env.RHINO_WEBHOOK_SECRET,
    };
  }

  // Jetty
  if (process.env.JETTY_API_KEY && process.env.JETTY_API_URL) {
    config.jetty = {
      apiKey: process.env.JETTY_API_KEY,
      apiUrl: process.env.JETTY_API_URL,
    };
  }

  // Lemonade
  if (process.env.LEMONADE_API_KEY) {
    config.lemonade = {
      apiKey: process.env.LEMONADE_API_KEY,
      apiUrl: process.env.LEMONADE_API_URL || 'https://api.lemonade.com',
    };
  }

  // Assurant
  if (process.env.ASSURANT_API_KEY) {
    config.assurant = {
      apiKey: process.env.ASSURANT_API_KEY,
      apiUrl: process.env.ASSURANT_API_URL || 'https://api.assurant.com',
      webhookSecret: process.env.ASSURANT_WEBHOOK_SECRET,
    };
  }

  // Sure
  if (process.env.SURE_API_KEY) {
    config.sure = {
      apiKey: process.env.SURE_API_KEY,
      apiUrl: process.env.SURE_API_URL || 'https://api.sureapp.com',
      webhookSecret: process.env.SURE_WEBHOOK_SECRET,
    };
  }

  // Insurent
  if (process.env.INSURENT_API_KEY) {
    config.insurent = {
      apiKey: process.env.INSURENT_API_KEY,
      apiUrl: process.env.INSURENT_API_URL || 'https://api.insurent.com',
      webhookSecret: process.env.INSURENT_WEBHOOK_SECRET,
    };
  }

  // Leap
  if (process.env.LEAP_API_KEY) {
    config.leap = {
      apiKey: process.env.LEAP_API_KEY,
      apiUrl: process.env.LEAP_API_URL || 'https://api.leapfinance.com',
      webhookSecret: process.env.LEAP_WEBHOOK_SECRET,
    };
  }

  return new ProviderRegistry(config);
}
