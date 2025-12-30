/**
 * OpenAI LLM Provider
 *
 * GPT implementation using the official OpenAI SDK.
 * Used as fallback when Anthropic is unavailable.
 */

import OpenAI from 'openai';

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

// Model ID mapping from our enum to OpenAI's API identifiers
const MODEL_ID_MAP: Record<string, string> = {
  'gpt-4-turbo': 'gpt-4-turbo-preview',
  'gpt-4': 'gpt-4',
  'gpt-3.5-turbo': 'gpt-3.5-turbo',
};

/**
 * OpenAI provider for GPT models.
 */
export class OpenAIProvider extends BaseLLMProvider {
  readonly providerId = 'openai' as const;
  readonly supportedModels: readonly LLMModel[] = [
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
  ];

  private client: OpenAI;

  constructor(config: LLMProviderConfig) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeout || 30000,
      maxRetries: 0, // We handle retries ourselves
    });
  }

  override async validateCredentials(): Promise<boolean> {
    try {
      // Make a minimal request to validate credentials
      await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return true;
    } catch (error) {
      if (error instanceof OpenAI.AuthenticationError) {
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
        // Convert messages to OpenAI format
        const messages = request.messages.map(
          (m: { role: string; content: string }) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
          })
        );

        const response = await this.client.chat.completions.create({
          model: this.mapModelId(request.model),
          max_tokens: config.maxTokens || 4096,
          temperature: config.temperature,
          messages,
        });

        // Extract content from response
        const choice = response.choices[0];
        const content = choice?.message?.content || '';

        const tokensUsed = {
          prompt: response.usage?.prompt_tokens || 0,
          completion: response.usage?.completion_tokens || 0,
          total: response.usage?.total_tokens || 0,
        };

        return {
          content,
          model: request.model,
          tokensUsed,
          cost: calculateCost(request.model, tokensUsed),
          processingTimeMs: Date.now() - startTime,
          providerRequestId: response.id,
          finishReason: this.mapFinishReason(choice?.finish_reason),
        };
      } catch (error) {
        this.handleError(error);
        throw error; // TypeScript needs this even though handleError always throws
      }
    }, config);
  }

  /**
   * Map our model enum to OpenAI's model IDs.
   */
  private mapModelId(model: string): string {
    return MODEL_ID_MAP[model] || model;
  }

  /**
   * Map OpenAI's finish reason to our finish reason enum.
   */
  private mapFinishReason(reason: string | null | undefined): FinishReason {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  /**
   * Handle OpenAI SDK errors and convert to our error types.
   */
  private handleError(error: unknown): never {
    if (error instanceof OpenAI.RateLimitError) {
      throw new LLMRateLimitError(this.providerId);
    }

    if (error instanceof OpenAI.AuthenticationError) {
      throw new LLMAuthenticationError(this.providerId);
    }

    if (error instanceof OpenAI.APIConnectionError) {
      throw new LLMTimeoutError(this.providerId, this.config.timeout || 30000);
    }

    if (error instanceof OpenAI.BadRequestError) {
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
 * Create an OpenAI provider with configuration.
 */
export function createOpenAIProvider(
  config?: Partial<LLMProviderConfig>
): OpenAIProvider {
  return new OpenAIProvider({
    apiKey: config?.apiKey || process.env['OPENAI_API_KEY'] || '',
    timeout: config?.timeout || 30000,
    maxRetries: config?.maxRetries || 3,
    retryBaseDelay: config?.retryBaseDelay || 1000,
    ...config,
  });
}
