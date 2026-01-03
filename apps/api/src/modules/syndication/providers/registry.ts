/**
 * Syndication Provider Registry
 *
 * Singleton registry for syndication provider adapters.
 * Handles feature flags, environment configuration, and mock fallback.
 */

import { logger } from '@realriches/utils';

import { getMockSyndicationProvider } from './mock';
import type { ISyndicationProvider, SyndicationPortal } from './provider.types';

// =============================================================================
// Types
// =============================================================================

interface ProviderConfig {
  provider: SyndicationPortal;
  apiKey?: string;
  apiUrl?: string;
  webhookSecret?: string;
  feedId?: string;
  mlsId?: string;
}

interface ProviderInitResult {
  success: boolean;
  provider: string;
  isMock: boolean;
  reason?: string;
}

// =============================================================================
// Configuration
// =============================================================================

function getProviderConfig(): Map<SyndicationPortal, ProviderConfig> {
  const configs = new Map<SyndicationPortal, ProviderConfig>();

  // Zillow Group (Zillow, Trulia, HotPads share same API)
  if (process.env['ZILLOW_API_KEY']) {
    const zillowConfig: ProviderConfig = {
      provider: 'zillow',
      apiKey: process.env['ZILLOW_API_KEY'],
      apiUrl: process.env['ZILLOW_API_URL'] || 'https://api.zillow.com/syndication',
      webhookSecret: process.env['ZILLOW_WEBHOOK_SECRET'],
      feedId: process.env['ZILLOW_FEED_ID'],
    };
    configs.set('zillow', zillowConfig);
    configs.set('trulia', { ...zillowConfig, provider: 'trulia' });
    configs.set('hotpads', { ...zillowConfig, provider: 'hotpads' });
  }

  // StreetEasy
  if (process.env['STREETEASY_API_KEY']) {
    configs.set('streeteasy', {
      provider: 'streeteasy',
      apiKey: process.env['STREETEASY_API_KEY'],
      apiUrl: process.env['STREETEASY_API_URL'] || 'https://api.streeteasy.com/v1',
      webhookSecret: process.env['STREETEASY_WEBHOOK_SECRET'],
    });
  }

  // MLS RESO
  if (process.env['MLS_RESO_API_KEY']) {
    configs.set('mls_reso', {
      provider: 'mls_reso',
      apiKey: process.env['MLS_RESO_API_KEY'],
      apiUrl: process.env['MLS_RESO_API_URL'],
      mlsId: process.env['MLS_ID'],
    });
  }

  // Realtor.com
  if (process.env['REALTOR_API_KEY']) {
    configs.set('realtor', {
      provider: 'realtor',
      apiKey: process.env['REALTOR_API_KEY'],
      apiUrl: process.env['REALTOR_API_URL'],
      webhookSecret: process.env['REALTOR_WEBHOOK_SECRET'],
    });
  }

  // Apartments.com
  if (process.env['APARTMENTS_API_KEY']) {
    configs.set('apartments', {
      provider: 'apartments',
      apiKey: process.env['APARTMENTS_API_KEY'],
      apiUrl: process.env['APARTMENTS_API_URL'],
    });
  }

  // Facebook Marketplace
  if (process.env['FACEBOOK_API_KEY']) {
    configs.set('facebook', {
      provider: 'facebook',
      apiKey: process.env['FACEBOOK_API_KEY'],
      apiUrl: process.env['FACEBOOK_API_URL'],
    });
  }

  // Rentals.com
  if (process.env['RENTALS_API_KEY']) {
    configs.set('rentals', {
      provider: 'rentals',
      apiKey: process.env['RENTALS_API_KEY'],
      apiUrl: process.env['RENTALS_API_URL'],
    });
  }

  return configs;
}

function isFeatureEnabled(portal: SyndicationPortal): boolean {
  const envKey = `FEATURE_SYNDICATION_${portal.toUpperCase()}`;
  const value = process.env[envKey];
  // Default to enabled if not explicitly disabled
  return value !== 'false' && value !== '0';
}

// =============================================================================
// Registry Implementation
// =============================================================================

class SyndicationProviderRegistry {
  private providers: Map<SyndicationPortal, ISyndicationProvider> = new Map();
  private configs: Map<SyndicationPortal, ProviderConfig>;
  private initResults: Map<SyndicationPortal, ProviderInitResult> = new Map();

  constructor() {
    this.configs = getProviderConfig();
  }

  getProvider(portal: SyndicationPortal): ISyndicationProvider {
    if (!this.providers.has(portal)) {
      const result = this.initProvider(portal);
      this.initResults.set(portal, result);
    }
    return this.providers.get(portal)!;
  }

  private initProvider(portal: SyndicationPortal): ProviderInitResult {
    // Check feature flag
    if (!isFeatureEnabled(portal)) {
      this.providers.set(portal, getMockSyndicationProvider(portal));
      return {
        success: true,
        provider: 'mock',
        isMock: true,
        reason: `Feature flag SYNDICATION_${portal.toUpperCase()} is disabled`,
      };
    }

    const config = this.configs.get(portal);

    if (!config?.apiKey) {
      this.providers.set(portal, getMockSyndicationProvider(portal));
      return {
        success: true,
        provider: 'mock',
        isMock: true,
        reason: `API key not configured for ${portal}`,
      };
    }

    try {
      let provider: ISyndicationProvider;

      switch (portal) {
        case 'zillow':
        case 'trulia':
        case 'hotpads':
          // TODO: Use real Zillow adapter when implemented
          provider = getMockSyndicationProvider(portal);
          break;

        case 'streeteasy':
          // TODO: Use real StreetEasy adapter when implemented
          provider = getMockSyndicationProvider(portal);
          break;

        case 'mls_reso':
          // TODO: Use real RESO adapter when implemented
          provider = getMockSyndicationProvider(portal);
          break;

        default:
          // Use mock for unimplemented portals
          this.providers.set(portal, getMockSyndicationProvider(portal));
          return {
            success: true,
            provider: 'mock',
            isMock: true,
            reason: `Provider ${portal} not yet implemented`,
          };
      }

      this.providers.set(portal, provider);

      logger.info({
        msg: 'syndication_provider_init',
        portal,
        provider: portal,
        isMock: true, // TODO: Change when real adapters are added
      });

      return { success: true, provider: portal, isMock: true };

    } catch (error) {
      logger.error({
        msg: 'syndication_provider_init_failed',
        portal,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      this.providers.set(portal, getMockSyndicationProvider(portal));
      return {
        success: false,
        provider: 'mock',
        isMock: true,
        reason: `Failed to initialize: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }
  }

  getAllProviders(): Map<SyndicationPortal, ISyndicationProvider> {
    const allPortals: SyndicationPortal[] = [
      'zillow', 'trulia', 'realtor', 'apartments',
      'streeteasy', 'hotpads', 'rentals', 'facebook', 'mls_reso',
    ];

    for (const portal of allPortals) {
      this.getProvider(portal);
    }

    return this.providers;
  }

  getProviderStatus(): Record<SyndicationPortal, { provider: string; isMock: boolean; reason?: string }> {
    this.getAllProviders();

    const status: Record<string, { provider: string; isMock: boolean; reason?: string }> = {};
    for (const [portal, result] of this.initResults) {
      status[portal] = {
        provider: result.provider,
        isMock: result.isMock,
        reason: result.reason,
      };
    }
    return status as Record<SyndicationPortal, { provider: string; isMock: boolean; reason?: string }>;
  }

  isMockProvider(portal: SyndicationPortal): boolean {
    return this.initResults.get(portal)?.isMock ?? true;
  }

  hasRealProvider(portal: SyndicationPortal): boolean {
    const config = this.configs.get(portal);
    return !!(config?.apiKey && isFeatureEnabled(portal));
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

let registry: SyndicationProviderRegistry | null = null;

export function getSyndicationProviderRegistry(): SyndicationProviderRegistry {
  if (!registry) {
    registry = new SyndicationProviderRegistry();
  }
  return registry;
}

export function getSyndicationProvider(portal: SyndicationPortal): ISyndicationProvider {
  return getSyndicationProviderRegistry().getProvider(portal);
}

export function resetSyndicationRegistry(): void {
  registry = null;
}
