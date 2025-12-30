/* eslint-disable no-console */
/**
 * Console LLM Provider
 *
 * A mock provider for development and testing that logs to console
 * and tracks all completions for assertions.
 */

import type {
  LLMModel,
  LLMProviderConfig,
  CompletionRequest,
  CompletionResponse,
} from '../types';
import { calculateCost } from '../types';

import { BaseLLMProvider } from './provider-interface';

/**
 * Console provider for development and testing.
 */
export class ConsoleLLMProvider extends BaseLLMProvider {
  readonly providerId = 'console' as const;
  readonly supportedModels: readonly LLMModel[] = [
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-haiku',
    'claude-3-5-sonnet',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
  ];

  private completions: Array<{
    request: CompletionRequest;
    response: CompletionResponse;
  }> = [];
  private mockResponse: string =
    'This is a mock response from ConsoleLLMProvider.';
  private shouldFail: boolean = false;
  private failureMessage: string = '';
  private failureError: Error | null = null;

  constructor(config: Partial<LLMProviderConfig> = {}) {
    super({ apiKey: 'console-mock', ...config });
  }

  override isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  override validateCredentials(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (this.shouldFail) {
      if (this.failureError) {
        throw this.failureError;
      }
      throw new Error(this.failureMessage || 'Simulated failure');
    }

    const startTime = Date.now();

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 50));

    const promptTokens = this.estimateTokens(
      request.messages
        .map((m: { role: string; content: string }) => m.content)
        .join(' ')
    );
    const completionTokens = this.estimateTokens(this.mockResponse);

    const response: CompletionResponse = {
      content: this.mockResponse,
      model: request.model,
      tokensUsed: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
      },
      cost: calculateCost(request.model, {
        prompt: promptTokens,
        completion: completionTokens,
      }),
      processingTimeMs: Date.now() - startTime,
      providerRequestId: `console_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      finishReason: 'stop',
    };

    this.completions.push({ request, response });

    // Log to console in development
    if (process.env['NODE_ENV'] === 'development') {
      console.log('────────────────────────────────────────────────────────────');
      console.log('📤 LLM COMPLETION (Console Provider)');
      console.log('────────────────────────────────────────────────────────────');
      console.log(`Model:    ${request.model}`);
      console.log(`Messages: ${request.messages.length}`);
      console.log(`Tokens:   ${response.tokensUsed.prompt} prompt, ${response.tokensUsed.completion} completion`);
      console.log(`Cost:     ${response.cost} cents`);
      console.log(`Time:     ${response.processingTimeMs}ms`);
      console.log('────────────────────────────────────────────────────────────');
    }

    return response;
  }

  // =========================================================================
  // Test Helpers
  // =========================================================================

  /**
   * Set the mock response to return.
   */
  setMockResponse(response: string): void {
    this.mockResponse = response;
  }

  /**
   * Configure the provider to simulate failures.
   */
  setShouldFail(shouldFail: boolean, message?: string): void {
    this.shouldFail = shouldFail;
    this.failureMessage = message || '';
    this.failureError = null;
  }

  /**
   * Configure the provider to throw a specific error.
   */
  setFailureError(error: Error): void {
    this.shouldFail = true;
    this.failureError = error;
  }

  /**
   * Get all completions made through this provider.
   */
  getCompletions(): Array<{
    request: CompletionRequest;
    response: CompletionResponse;
  }> {
    return [...this.completions];
  }

  /**
   * Get the last completion made.
   */
  getLastCompletion():
    | { request: CompletionRequest; response: CompletionResponse }
    | undefined {
    return this.completions[this.completions.length - 1];
  }

  /**
   * Get the last request made.
   */
  getLastRequest(): CompletionRequest | undefined {
    return this.completions[this.completions.length - 1]?.request;
  }

  /**
   * Get the number of completions made.
   */
  getCompletionCount(): number {
    return this.completions.length;
  }

  /**
   * Clear all tracked completions and reset state.
   */
  clear(): void {
    this.completions = [];
    this.shouldFail = false;
    this.failureMessage = '';
    this.failureError = null;
    this.mockResponse = 'This is a mock response from ConsoleLLMProvider.';
  }

  /**
   * Estimate token count for text (rough approximation).
   * Approximately 4 characters per token for English text.
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Create a console provider with optional configuration.
 */
export function createConsoleProvider(
  config?: Partial<LLMProviderConfig>
): ConsoleLLMProvider {
  return new ConsoleLLMProvider(config);
}
