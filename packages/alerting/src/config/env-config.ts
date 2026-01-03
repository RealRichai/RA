/**
 * Environment-based Alerting Configuration
 *
 * Loads alerting configuration from environment variables.
 */

import type {
  AlertingConfig,
  SlackProviderConfig,
  PagerDutyProviderConfig,
  OpsGenieProviderConfig,
  AlertProviderType,
} from '../types';
import { DEFAULT_ALERTING_CONFIG } from '../types';
import { SlackProvider } from '../providers/slack';
import { PagerDutyProvider } from '../providers/pagerduty';
import { OpsGenieProvider } from '../providers/opsgenie';
import type { IAlertProvider } from '../providers/provider-interface';
import { AlertRouter } from '../router/alert-router';

// =============================================================================
// Environment Variable Names
// =============================================================================

const ENV_KEYS = {
  // Slack
  SLACK_ENABLED: 'ALERTING_SLACK_ENABLED',
  SLACK_WEBHOOK_URL: 'ALERTING_SLACK_WEBHOOK_URL',
  SLACK_CHANNEL: 'ALERTING_SLACK_CHANNEL',
  SLACK_USERNAME: 'ALERTING_SLACK_USERNAME',
  SLACK_ICON_EMOJI: 'ALERTING_SLACK_ICON_EMOJI',

  // PagerDuty
  PAGERDUTY_ENABLED: 'ALERTING_PAGERDUTY_ENABLED',
  PAGERDUTY_ROUTING_KEY: 'ALERTING_PAGERDUTY_ROUTING_KEY',
  PAGERDUTY_API_URL: 'ALERTING_PAGERDUTY_API_URL',

  // OpsGenie
  OPSGENIE_ENABLED: 'ALERTING_OPSGENIE_ENABLED',
  OPSGENIE_API_KEY: 'ALERTING_OPSGENIE_API_KEY',
  OPSGENIE_API_URL: 'ALERTING_OPSGENIE_API_URL',

  // Global
  COOLDOWN_SECONDS: 'ALERTING_COOLDOWN_SECONDS',
  RETRY_ATTEMPTS: 'ALERTING_RETRY_ATTEMPTS',
  TIMEOUT_MS: 'ALERTING_TIMEOUT_MS',
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

function getEnv(key: string): string | undefined {
  return process.env[key];
}

function getEnvBool(key: string, defaultValue: boolean = false): boolean {
  const value = getEnv(key);
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = getEnv(key);
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// =============================================================================
// Config Loaders
// =============================================================================

/**
 * Load Slack provider config from environment
 */
export function loadSlackConfigFromEnv(): SlackProviderConfig | undefined {
  const enabled = getEnvBool(ENV_KEYS.SLACK_ENABLED);
  const webhookUrl = getEnv(ENV_KEYS.SLACK_WEBHOOK_URL);

  if (!webhookUrl) {
    return undefined;
  }

  return {
    enabled,
    webhookUrl,
    channel: getEnv(ENV_KEYS.SLACK_CHANNEL),
    username: getEnv(ENV_KEYS.SLACK_USERNAME),
    iconEmoji: getEnv(ENV_KEYS.SLACK_ICON_EMOJI),
  };
}

/**
 * Load PagerDuty provider config from environment
 */
export function loadPagerDutyConfigFromEnv(): PagerDutyProviderConfig | undefined {
  const enabled = getEnvBool(ENV_KEYS.PAGERDUTY_ENABLED);
  const routingKey = getEnv(ENV_KEYS.PAGERDUTY_ROUTING_KEY);

  if (!routingKey) {
    return undefined;
  }

  return {
    enabled,
    routingKey,
    apiUrl: getEnv(ENV_KEYS.PAGERDUTY_API_URL),
  };
}

/**
 * Load OpsGenie provider config from environment
 */
export function loadOpsGenieConfigFromEnv(): OpsGenieProviderConfig | undefined {
  const enabled = getEnvBool(ENV_KEYS.OPSGENIE_ENABLED);
  const apiKey = getEnv(ENV_KEYS.OPSGENIE_API_KEY);

  if (!apiKey) {
    return undefined;
  }

  return {
    enabled,
    apiKey,
    apiUrl: getEnv(ENV_KEYS.OPSGENIE_API_URL),
  };
}

/**
 * Load complete alerting config from environment
 */
export function loadAlertingConfigFromEnv(): AlertingConfig {
  return {
    slack: loadSlackConfigFromEnv(),
    pagerduty: loadPagerDutyConfigFromEnv(),
    opsgenie: loadOpsGenieConfigFromEnv(),
    routing: DEFAULT_ALERTING_CONFIG.routing,
    cooldownSeconds: getEnvInt(ENV_KEYS.COOLDOWN_SECONDS, DEFAULT_ALERTING_CONFIG.cooldownSeconds),
    retryAttempts: getEnvInt(ENV_KEYS.RETRY_ATTEMPTS, DEFAULT_ALERTING_CONFIG.retryAttempts),
    timeoutMs: getEnvInt(ENV_KEYS.TIMEOUT_MS, DEFAULT_ALERTING_CONFIG.timeoutMs),
  };
}

// =============================================================================
// Provider Factory
// =============================================================================

/**
 * Create providers from configuration
 */
export function createProvidersFromConfig(
  config: AlertingConfig
): Map<AlertProviderType, IAlertProvider> {
  const providers = new Map<AlertProviderType, IAlertProvider>();

  if (config.slack) {
    providers.set('slack', new SlackProvider(config.slack));
  }

  if (config.pagerduty) {
    providers.set('pagerduty', new PagerDutyProvider(config.pagerduty));
  }

  if (config.opsgenie) {
    providers.set('opsgenie', new OpsGenieProvider(config.opsgenie));
  }

  return providers;
}

// =============================================================================
// Router Factory
// =============================================================================

/**
 * Create an AlertRouter from environment configuration
 */
export function createAlertRouterFromEnv(): AlertRouter {
  const config = loadAlertingConfigFromEnv();
  const providers = createProvidersFromConfig(config);

  return new AlertRouter({
    providers,
    config,
    emitEvidence: true,
  });
}

/**
 * Get configuration summary for logging
 */
export function getConfigSummary(config: AlertingConfig): {
  providers: string[];
  routing: Record<string, string[]>;
  cooldownSeconds: number;
} {
  const providers: string[] = [];

  if (config.slack?.enabled) providers.push('slack');
  if (config.pagerduty?.enabled) providers.push('pagerduty');
  if (config.opsgenie?.enabled) providers.push('opsgenie');

  return {
    providers,
    routing: {
      info: config.routing.info,
      warning: config.routing.warning,
      critical: config.routing.critical,
    },
    cooldownSeconds: config.cooldownSeconds,
  };
}
