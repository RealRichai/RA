/**
 * Zillow Syndication Adapter
 *
 * Placeholder for Zillow Group API integration.
 * Real implementation requires Zillow Partner API access.
 */

import { getMockSyndicationProvider } from '../mock';
import type { ISyndicationProvider, SyndicationPortal } from '../provider.types';

export interface ZillowAdapterConfig {
  baseUrl: string;
  apiKey: string;
  webhookSecret?: string;
  feedId?: string;
  portal: SyndicationPortal;
}

/**
 * Create Zillow adapter.
 *
 * Currently returns mock provider. When Zillow API access is available,
 * implement real ZillowSyndicationAdapter here.
 */
export function createZillowAdapter(config: ZillowAdapterConfig): ISyndicationProvider {
  // TODO: Implement real Zillow API adapter
  // For now, return mock provider
  return getMockSyndicationProvider(config.portal);
}
