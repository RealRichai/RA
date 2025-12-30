/**
 * Marketing Provider Registry
 *
 * Manages provider instances and selects mock vs real providers
 * based on environment configuration.
 */

import {
  getMockAssetProvider,
  getMockVideoProvider,
  getMockThreeDGSProvider,
} from './mock';
import type {
  IAssetGenerationProvider,
  IVideoGenerationProvider,
  IThreeDGSProvider,
} from './provider.types';

// =============================================================================
// Provider Configuration
// =============================================================================

interface ProviderConfig {
  asset: {
    provider: 'mock' | 'puppeteer' | 'cloudinary';
    apiKey?: string;
  };
  video: {
    provider: 'mock' | 'runway' | 'synthesia';
    apiKey?: string;
  };
  threeDGS: {
    provider: 'mock' | 'luma' | 'polycam';
    apiKey?: string;
  };
}

function getProviderConfig(): ProviderConfig {
  return {
    asset: {
      provider: (process.env['ASSET_PROVIDER'] as 'mock' | 'puppeteer' | 'cloudinary') || 'mock',
      apiKey: process.env['ASSET_API_KEY'],
    },
    video: {
      provider: (process.env['VIDEO_PROVIDER'] as 'mock' | 'runway' | 'synthesia') || 'mock',
      apiKey: process.env['VIDEO_API_KEY'],
    },
    threeDGS: {
      provider: (process.env['THREEDGS_PROVIDER'] as 'mock' | 'luma' | 'polycam') || 'mock',
      apiKey: process.env['THREEDGS_API_KEY'],
    },
  };
}

// =============================================================================
// Provider Registry
// =============================================================================

class MarketingProviderRegistry {
  private config: ProviderConfig;
  private assetProvider: IAssetGenerationProvider | null = null;
  private videoProvider: IVideoGenerationProvider | null = null;
  private threeDGSProvider: IThreeDGSProvider | null = null;

  constructor() {
    this.config = getProviderConfig();
  }

  /**
   * Get the asset generation provider instance.
   */
  getAssetProvider(): IAssetGenerationProvider {
    if (!this.assetProvider) {
      // Real providers would be instantiated here based on config
      if (this.config.asset.provider !== 'mock' && this.config.asset.apiKey) {
        // Would instantiate real provider here
        // this.assetProvider = new CloudinaryAssetProvider(this.config.asset.apiKey);
      }
      this.assetProvider = getMockAssetProvider();
    }
    return this.assetProvider;
  }

  /**
   * Get the video generation provider instance.
   */
  getVideoProvider(): IVideoGenerationProvider {
    if (!this.videoProvider) {
      if (this.config.video.provider !== 'mock' && this.config.video.apiKey) {
        // Would instantiate real provider here
        // this.videoProvider = new RunwayVideoProvider(this.config.video.apiKey);
      }
      this.videoProvider = getMockVideoProvider();
    }
    return this.videoProvider;
  }

  /**
   * Get the 3DGS generation provider instance.
   */
  getThreeDGSProvider(): IThreeDGSProvider {
    if (!this.threeDGSProvider) {
      if (this.config.threeDGS.provider !== 'mock' && this.config.threeDGS.apiKey) {
        // Would instantiate real provider here
        // this.threeDGSProvider = new LumaThreeDGSProvider(this.config.threeDGS.apiKey);
      }
      this.threeDGSProvider = getMockThreeDGSProvider();
    }
    return this.threeDGSProvider;
  }

  /**
   * Check if a specific provider is using mock implementation.
   */
  isMockProvider(type: 'asset' | 'video' | 'threeDGS'): boolean {
    const provider = this.config[type];
    return provider.provider === 'mock' || !provider.apiKey;
  }

  /**
   * Get provider status for all types.
   */
  getProviderStatus(): Record<string, { provider: string; isMock: boolean }> {
    return {
      asset: {
        provider: this.config.asset.provider,
        isMock: this.isMockProvider('asset'),
      },
      video: {
        provider: this.config.video.provider,
        isMock: this.isMockProvider('video'),
      },
      threeDGS: {
        provider: this.config.threeDGS.provider,
        isMock: this.isMockProvider('threeDGS'),
      },
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let registry: MarketingProviderRegistry | null = null;

export function getMarketingProviderRegistry(): MarketingProviderRegistry {
  if (!registry) {
    registry = new MarketingProviderRegistry();
  }
  return registry;
}

// Convenience exports
export function getAssetProvider(): IAssetGenerationProvider {
  return getMarketingProviderRegistry().getAssetProvider();
}

export function getVideoProvider(): IVideoGenerationProvider {
  return getMarketingProviderRegistry().getVideoProvider();
}

export function getThreeDGSProvider(): IThreeDGSProvider {
  return getMarketingProviderRegistry().getThreeDGSProvider();
}
