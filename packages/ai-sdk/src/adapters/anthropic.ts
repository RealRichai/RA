/**
 * Anthropic LLM Provider
 *
 * Claude implementation using the official Anthropic SDK.
 */

import Anthropic from '@anthropic-ai/sdk';

import type {
  LLMModel,
  LLMProviderConfig,
  CompletionRequest,
  CompletionResponse,
  FinishReason,
} from '../types';
import { calculateCost } from '../types';

import {
  BaseLLMProvider,
  LLMRateLimitError,
  LLMTimeoutError,
  LLMAuthenticationError,
  LLMContentFilteredError,
} from './provider-interface';

// Model ID mapping from our enum to Anthropic's API identifiers
const MODEL_ID_MAP: Record<string, string> = {
  'claude-3-opus': 'claude-3-opus-20240229',
  'claude-3-sonnet': 'claude-3-sonnet-20240229',
  'claude-3-haiku': 'claude-3-haiku-20240307',
  'claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
};

/**
 * Anthropic provider for Claude models.
 */
export class AnthropicProvider extends BaseLLMProvider {
  readonly providerId = 'anthropic' as const;
  readonly supportedModels: readonly LLMModel[] = [
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-haiku',
    'claude-3-5-sonnet',
  ];

  private client: Anthropic;

  constructor(config: LLMProviderConfig) {
    super(config);
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeout || 30000,
      maxRetries: 0, // We handle retries ourselves
    });
  }

  override async validateCredentials(): Promise<boolean> {
    try {
      // Make a minimal request to validate credentials
      await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return true;
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        return false;
      }
      // Other errors might be transient, still consider configured
      return this.isConfigured;
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const config = {
      timeout: this.config.timeout || 30000,
      maxRetries: this.config.maxRetries || 3,
      retryBaseDelay: this.config.retryBaseDelay || 1000,
      ...request.config,
    };

    const startTime = Date.now();

    return this.executeWithRetry(async () => {
      try {
        // Extract system message and user/assistant messages
        const systemMessage = request.messages.find(
          (m: { role: string; content: string }) => m.role === 'system'
        );
        const conversationMessages = request.messages
          .filter((m: { role: string; content: string }) => m.role !== 'system')
          .map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

        // Ensure we have at least one message
        if (conversationMessages.length === 0) {
          conversationMessages.push({ role: 'user', content: '' });
        }

        const response = await this.client.messages.create({
          model: this.mapModelId(request.model),
          max_tokens: config.maxTokens || 4096,
          temperature: config.temperature,
          messages: conversationMessages,
          system: systemMessage?.content,
        });

        // Extract content from response
        const content =
          response.content[0]?.type === 'text'
            ? response.content[0].text
            : '';

        const tokensUsed = {
          prompt: response.usage.input_tokens,
          completion: response.usage.output_tokens,
          total: response.usage.input_tokens + response.usage.output_tokens,
        };

        return {
          content,
          model: request.model,
          tokensUsed,
          cost: calculateCost(request.model, tokensUsed),
          processingTimeMs: Date.now() - startTime,
          providerRequestId: response.id,
          finishReason: this.mapStopReason(response.stop_reason),
        };
      } catch (error) {
        this.handleError(error);
        throw error; // TypeScript needs this even though handleError always throws
      }
    }, config);
  }

  /**
   * Map our model enum to Anthropic's model IDs.
   */
  private mapModelId(model: string): string {
    return MODEL_ID_MAP[model] || model;
  }

  /**
   * Map Anthropic's stop reason to our finish reason enum.
   */
  private mapStopReason(reason: string | null): FinishReason {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
    }
  }

  /**
   * Handle Anthropic SDK errors and convert to our error types.
   */
  private handleError(error: unknown): never {
    if (error instanceof Anthropic.RateLimitError) {
      // Try to extract retry-after from headers if available
      throw new LLMRateLimitError(this.providerId);
    }

    if (error instanceof Anthropic.AuthenticationError) {
      throw new LLMAuthenticationError(this.providerId);
    }

    if (error instanceof Anthropic.APIConnectionError) {
      throw new LLMTimeoutError(this.providerId, this.config.timeout || 30000);
    }

    if (error instanceof Anthropic.BadRequestError) {
      const message = (error as Error).message || '';
      if (message.includes('content') || message.includes('filter')) {
        throw new LLMContentFilteredError(this.providerId, message);
      }
    }

    // Re-throw unknown errors
    throw error;
  }
}

/**
 * Create an Anthropic provider with configuration.
 */
export function createAnthropicProvider(
  config?: Partial<LLMProviderConfig>
): AnthropicProvider {
  return new AnthropicProvider({
    apiKey: config?.apiKey || process.env['ANTHROPIC_API_KEY'] || '',
    timeout: config?.timeout || 30000,
    maxRetries: config?.maxRetries || 3,
    retryBaseDelay: config?.retryBaseDelay || 1000,
    ...config,
  });
}
