// Feature Flags
export {
  FeatureFlag,
  FeatureFlagSchema,
  FEATURE_FLAG_REGISTRY,
  getFlagsByCategory,
  getMarketGatedFlags,
  getTour3DGSFlags,
} from './flags';
export type {
  FeatureFlagMetadata,
  FeatureCategory,
  RolloutPhase,
} from './flags';

// Markets
export {
  Market,
  MarketSchema,
  MARKET_REGISTRY,
  ROLLOUT_PHASES,
  TOUR_3DGS_MARKET_CONFIG,
  FEATURE_MARKET_CONFIG,
  getEnabledMarketsForFlag,
  getEnabledMarkets,
  isValidMarket,
} from './markets';
export type {
  MarketMetadata,
  RolloutPhaseId,
  RolloutPhaseConfig,
  FeatureMarketConfig,
} from './markets';

// Service
export {
  FeatureFlagService,
  getFeatureFlagService,
  resetFeatureFlagService,
  isFeatureEnabled,
  isFeatureEnabledForMarket,
} from './service';
export type {
  FeatureFlagContext,
  FeatureFlagResult,
  FeatureFlagReason,
} from './service';
