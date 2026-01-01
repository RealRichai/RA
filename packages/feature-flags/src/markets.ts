import { z } from 'zod';

import type { FeatureFlag } from './flags';

/**
 * Market Identifiers
 *
 * Standard market codes for geographic targeting
 */
export const Market = {
  NYC: 'NYC',     // New York City
  LA: 'LA',       // Los Angeles
  SF: 'SF',       // San Francisco
  CHI: 'CHI',     // Chicago
  MIA: 'MIA',     // Miami
  ATL: 'ATL',     // Atlanta
  BOS: 'BOS',     // Boston
  SEA: 'SEA',     // Seattle
  DEN: 'DEN',     // Denver
  AUS: 'AUS',     // Austin
  DAL: 'DAL',     // Dallas
  PHX: 'PHX',     // Phoenix
  DC: 'DC',       // Washington DC
} as const;

export type Market = (typeof Market)[keyof typeof Market];

export const MarketSchema = z.enum([
  'NYC', 'LA', 'SF', 'CHI', 'MIA', 'ATL',
  'BOS', 'SEA', 'DEN', 'AUS', 'DAL', 'PHX', 'DC',
]);

/**
 * Market metadata for display and configuration
 */
export interface MarketMetadata {
  code: Market;
  name: string;
  state: string;
  timezone: string;
  enabled: boolean;
}

/**
 * Market registry with metadata
 */
export const MARKET_REGISTRY: Record<Market, MarketMetadata> = {
  NYC: { code: 'NYC', name: 'New York City', state: 'NY', timezone: 'America/New_York', enabled: true },
  LA: { code: 'LA', name: 'Los Angeles', state: 'CA', timezone: 'America/Los_Angeles', enabled: true },
  SF: { code: 'SF', name: 'San Francisco', state: 'CA', timezone: 'America/Los_Angeles', enabled: true },
  CHI: { code: 'CHI', name: 'Chicago', state: 'IL', timezone: 'America/Chicago', enabled: true },
  MIA: { code: 'MIA', name: 'Miami', state: 'FL', timezone: 'America/New_York', enabled: true },
  ATL: { code: 'ATL', name: 'Atlanta', state: 'GA', timezone: 'America/New_York', enabled: true },
  BOS: { code: 'BOS', name: 'Boston', state: 'MA', timezone: 'America/New_York', enabled: false },
  SEA: { code: 'SEA', name: 'Seattle', state: 'WA', timezone: 'America/Los_Angeles', enabled: false },
  DEN: { code: 'DEN', name: 'Denver', state: 'CO', timezone: 'America/Denver', enabled: false },
  AUS: { code: 'AUS', name: 'Austin', state: 'TX', timezone: 'America/Chicago', enabled: false },
  DAL: { code: 'DAL', name: 'Dallas', state: 'TX', timezone: 'America/Chicago', enabled: false },
  PHX: { code: 'PHX', name: 'Phoenix', state: 'AZ', timezone: 'America/Phoenix', enabled: false },
  DC: { code: 'DC', name: 'Washington DC', state: 'DC', timezone: 'America/New_York', enabled: false },
};

/**
 * Rollout Phase Configuration
 *
 * RR-ENG-UPDATE-2026-001: 3D Tour Rollout Phases
 *
 * Phase 1: NYC only (Q1 2026)
 * Phase 2: NYC, LA, SF (Q2 2026)
 * Phase 3: All enabled markets (Q3 2026)
 */
export type RolloutPhaseId = 'PHASE_1' | 'PHASE_2' | 'PHASE_3' | 'GA';

export interface RolloutPhaseConfig {
  id: RolloutPhaseId;
  name: string;
  markets: Market[];
  targetDate: string;
}

export const ROLLOUT_PHASES: Record<RolloutPhaseId, RolloutPhaseConfig> = {
  PHASE_1: {
    id: 'PHASE_1',
    name: 'Phase 1 - NYC Pilot',
    markets: ['NYC'],
    targetDate: '2026-Q1',
  },
  PHASE_2: {
    id: 'PHASE_2',
    name: 'Phase 2 - Major Markets',
    markets: ['NYC', 'LA', 'SF'],
    targetDate: '2026-Q2',
  },
  PHASE_3: {
    id: 'PHASE_3',
    name: 'Phase 3 - Extended Markets',
    markets: ['NYC', 'LA', 'SF', 'CHI', 'MIA', 'ATL'],
    targetDate: '2026-Q3',
  },
  GA: {
    id: 'GA',
    name: 'General Availability',
    markets: Object.keys(MARKET_REGISTRY) as Market[],
    targetDate: '2026-Q4',
  },
};

/**
 * Feature-to-Market mapping
 *
 * Defines which markets have access to which features.
 * Features not in this map are available in all markets.
 */
export interface FeatureMarketConfig {
  flag: FeatureFlag;
  enabledMarkets: Market[];
  currentPhase: RolloutPhaseId;
}

/**
 * Current market configuration for 3D Tour features
 *
 * RR-ENG-UPDATE-2026-001: Phase 1 - NYC enabled
 */
export const TOUR_3DGS_MARKET_CONFIG: FeatureMarketConfig[] = [
  {
    flag: 'TOUR_3DGS_CAPTURE',
    enabledMarkets: ROLLOUT_PHASES.PHASE_1.markets,
    currentPhase: 'PHASE_1',
  },
  {
    flag: 'TOUR_SOG_CONVERSION',
    enabledMarkets: ROLLOUT_PHASES.PHASE_1.markets,
    currentPhase: 'PHASE_1',
  },
  {
    flag: 'TOUR_WEBGPU_VIEWER',
    enabledMarkets: ROLLOUT_PHASES.PHASE_1.markets,
    currentPhase: 'PHASE_1',
  },
  {
    flag: 'TOUR_LOD_STREAMING',
    enabledMarkets: ROLLOUT_PHASES.PHASE_1.markets,
    currentPhase: 'PHASE_1',
  },
];

/**
 * All feature market configurations
 */
export const FEATURE_MARKET_CONFIG: FeatureMarketConfig[] = [
  ...TOUR_3DGS_MARKET_CONFIG,
  // Add other market-gated features here
  {
    flag: 'PAYMENTS_CRYPTO',
    enabledMarkets: ['NYC', 'MIA'], // Crypto-friendly markets
    currentPhase: 'PHASE_1',
  },
  {
    flag: 'PARTNER_UTILITY_CONCIERGE',
    enabledMarkets: ['NYC', 'LA', 'CHI'],
    currentPhase: 'PHASE_2',
  },
];

/**
 * Get enabled markets for a feature flag
 */
export function getEnabledMarketsForFlag(flag: FeatureFlag): Market[] | null {
  const config = FEATURE_MARKET_CONFIG.find((c) => c.flag === flag);
  return config ? config.enabledMarkets : null;
}

/**
 * Get all enabled markets
 */
export function getEnabledMarkets(): MarketMetadata[] {
  return Object.values(MARKET_REGISTRY).filter((m) => m.enabled);
}

/**
 * Check if a market is valid
 */
export function isValidMarket(market: string): market is Market {
  return market in MARKET_REGISTRY;
}
