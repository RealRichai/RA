/**
 * Upsell Module
 *
 * Market-gated upsell triggers for missing vault documents.
 */

export * from './types';
export {
  UpsellTriggerService,
  getUpsellTriggerService,
  detectUpsellTriggers,
  isUpsellEnabledForMarket,
} from './triggers';
