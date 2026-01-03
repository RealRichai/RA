/**
 * Copilot Configuration
 *
 * Environment-based configuration for the Listing Copilot workflow.
 */

import type { CopilotConfig } from '../types';

/**
 * Create configuration from environment variables
 */
export function createCopilotConfigFromEnv(): CopilotConfig {
  return {
    defaultDryRun: process.env.COPILOT_DEFAULT_DRY_RUN !== 'false',
    maxTokensPerCall: parseInt(process.env.COPILOT_MAX_TOKENS_PER_CALL || '4096', 10),
    dailyBudgetLimit: parseInt(process.env.COPILOT_DAILY_BUDGET_LIMIT || '100000', 10),
    defaultTemplatesPath: process.env.COPILOT_DEFAULT_TEMPLATES_PATH ||
      'packages/media-generator/src/__fixtures__/templates',
    artifactsBucket: process.env.COPILOT_ARTIFACTS_BUCKET || 'copilot-artifacts',
    evidenceEnabled: process.env.COPILOT_EVIDENCE_ENABLED !== 'false',
  };
}

/**
 * Default configuration for testing
 */
export const defaultCopilotConfig: CopilotConfig = {
  defaultDryRun: true,
  maxTokensPerCall: 4096,
  dailyBudgetLimit: 100000,
  defaultTemplatesPath: 'packages/media-generator/src/__fixtures__/templates',
  artifactsBucket: 'copilot-artifacts',
  evidenceEnabled: true,
};

/**
 * Validate configuration
 */
export function validateConfig(config: CopilotConfig): void {
  if (config.maxTokensPerCall <= 0) {
    throw new Error('maxTokensPerCall must be positive');
  }
  if (config.dailyBudgetLimit <= 0) {
    throw new Error('dailyBudgetLimit must be positive');
  }
  if (!config.defaultTemplatesPath) {
    throw new Error('defaultTemplatesPath is required');
  }
  if (!config.artifactsBucket) {
    throw new Error('artifactsBucket is required');
  }
}
