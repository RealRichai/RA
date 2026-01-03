/**
 * StreetEasy Syndication Adapter
 *
 * Placeholder for StreetEasy API integration.
 * Real implementation requires StreetEasy Partner API access.
 */

import { getMockSyndicationProvider } from '../mock';
import type { ISyndicationProvider } from '../provider.types';

export interface StreetEasyAdapterConfig {
  baseUrl: string;
  apiKey: string;
  webhookSecret?: string;
}

/**
 * Create StreetEasy adapter.
 *
 * Currently returns mock provider. When StreetEasy API access is available,
 * implement real StreetEasySyndicationAdapter here.
 */
export function createStreetEasyAdapter(_config: StreetEasyAdapterConfig): ISyndicationProvider {
  // TODO: Implement real StreetEasy API adapter
  // For now, return mock provider
  return getMockSyndicationProvider('streeteasy');
}
