/**
 * @realriches/alerting
 *
 * External alerting system with support for Slack, PagerDuty, and OpsGenie.
 */

// Types
export * from './types';

// Providers
export {
  type IAlertProvider,
  type BaseProviderConfig,
  BaseAlertProvider,
  AlertProviderError,
  AlertRateLimitError,
  AlertTimeoutError,
  AlertAuthenticationError,
} from './providers';

export { SlackProvider, createSlackProvider } from './providers/slack';
export { PagerDutyProvider, createPagerDutyProvider } from './providers/pagerduty';
export { OpsGenieProvider, createOpsGenieProvider } from './providers/opsgenie';

// Router
export {
  AlertRouter,
  type AlertRouterOptions,
  createAlertRouter,
  getAlertRouter,
  setAlertRouter,
  resetAlertRouter,
} from './router';

// Evidence
export {
  emitAlertEvidence,
  buildAlertEvidenceId,
  type AlertEvidenceInput,
  type AlertEvidenceRecord,
} from './evidence/alert-evidence';

// Config
export {
  loadAlertingConfigFromEnv,
  loadSlackConfigFromEnv,
  loadPagerDutyConfigFromEnv,
  loadOpsGenieConfigFromEnv,
  createProvidersFromConfig,
  createAlertRouterFromEnv,
  getConfigSummary,
} from './config/env-config';
