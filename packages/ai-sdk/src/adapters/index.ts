/**
 * LLM Adapters
 *
 * Provider adapters for different LLM services.
 */

export * from './provider-interface';
export { AnthropicProvider, createAnthropicProvider } from './anthropic';
export { ConsoleLLMProvider, createConsoleProvider } from './console';
export { OpenAIProvider, createOpenAIProvider } from './openai';

import type { LLMProvider, LLMProviderConfig } from '../types';

import { createAnthropicProvider } from './anthropic';
import { createConsoleProvider } from './console';
import { createOpenAIProvider } from './openai';
import type { ILLMProvider } from './provider-interface';

/**
 * Create an LLM provider from configuration.
 */
export function createProvider(
  provider: LLMProvider,
  config: Partial<LLMProviderConfig> = {}
): ILLMProvider {
  if (provider === 'anthropic') {
    return createAnthropicProvider(config);
  }
  if (provider === 'openai') {
    return createOpenAIProvider(config);
  }
  if (provider === 'console') {
    return createConsoleProvider(config);
  }
  throw new Error(`Unknown LLM provider: ${String(provider)}`);
}

/**
 * Create a provider from environment configuration.
 */
export function createProviderFromEnv(): ILLMProvider {
  const provider = (process.env['LLM_PROVIDER'] || 'console') as LLMProvider;
  return createProvider(provider);
}
