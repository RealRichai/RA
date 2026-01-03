/**
 * RESO Web API Syndication Adapter
 *
 * Placeholder for MLS RESO Web API integration.
 * Real implementation requires MLS member access and RESO certification.
 */

import { getMockSyndicationProvider } from '../mock';
import type { ISyndicationProvider } from '../provider.types';

export interface ResoAdapterConfig {
  baseUrl: string;
  apiKey: string;
  mlsId: string;
}

/**
 * Create RESO adapter.
 *
 * Currently returns mock provider. When MLS access is available,
 * implement real ResoSyndicationAdapter here following RESO Data Dictionary.
 */
export function createResoAdapter(_config: ResoAdapterConfig): ISyndicationProvider {
  // TODO: Implement real RESO Web API adapter
  // For now, return mock provider
  return getMockSyndicationProvider('mls_reso');
}
