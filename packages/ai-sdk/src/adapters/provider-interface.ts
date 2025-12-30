/**
 * LLM Provider Interface
 *
 * Defines the contract for LLM provider adapters and provides
 * a base class with common functionality like retry logic.
 */

import type {
  LLMProvider,
  LLMModel,
  LLMProviderConfig,
  LLMRequestConfig,
  CompletionRequest,
  CompletionResponse,
} from '../types';

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Interface that all LLM provider adapters must implement.
 */
export interface ILLMProvider {
  /** Unique identifier for this provider */
  readonly providerId: LLMProvider;

  /** Models supported by this provider */
  readonly supportedModels: readonly LLMModel[];

  /** Check if the provider is properly configured and available */
  isAvailable(): Promise<boolean>;

  /** Validate credentials by making a test API call */
  validateCredentials(): Promise<boolean>;

  /** Execute a completion request */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /** Get current rate limit status (if supported) */
  getRateLimitStatus?(): Promise<{
    remainingRequests: number;
    remainingTokens: number;
    resetAt: Date;
  }>;
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Base error class for LLM provider errors.
 */
export class LLMProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: LLMProvider,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'LLMProviderError';
  }
}

/**
 * Error thrown when rate limit is exceeded.
 */
export class LLMRateLimitError extends LLMProviderError {
  constructor(
    provider: LLMProvider,
    public readonly retryAfterMs?: number
  ) {
    super(`Rate limit exceeded for ${provider}`, 'RATE_LIMIT', provider, true);
    this.name = 'LLMRateLimitError';
  }
}

/**
 * Error thrown when request times out.
 */
export class LLMTimeoutError extends LLMProviderError {
  constructor(provider: LLMProvider, timeoutMs: number) {
    super(
      `Request timed out after ${timeoutMs}ms`,
      'TIMEOUT',
      provider,
      true
    );
    this.name = 'LLMTimeoutError';
  }
}

/**
 * Error thrown when budget limit is exceeded.
 */
export class LLMBudgetExceededError extends LLMProviderError {
  constructor(
    provider: LLMProvider,
    public readonly budgetType: 'request' | 'user' | 'org' | 'global',
    public readonly limit: number,
    public readonly current: number
  ) {
    super(
      `Budget limit exceeded: ${budgetType} (${current}/${limit} cents)`,
      'BUDGET_EXCEEDED',
      provider,
      false
    );
    this.name = 'LLMBudgetExceededError';
  }
}

/**
 * Error thrown when content is filtered by the provider.
 */
export class LLMContentFilteredError extends LLMProviderError {
  constructor(provider: LLMProvider, reason?: string) {
    super(
      `Content filtered by provider: ${reason || 'unknown reason'}`,
      'CONTENT_FILTERED',
      provider,
      false
    );
    this.name = 'LLMContentFilteredError';
  }
}

/**
 * Error thrown when authentication fails.
 */
export class LLMAuthenticationError extends LLMProviderError {
  constructor(provider: LLMProvider) {
    super(
      `Authentication failed for ${provider}`,
      'AUTHENTICATION_FAILED',
      provider,
      false
    );
    this.name = 'LLMAuthenticationError';
  }
}

// =============================================================================
// Base Provider Class
// =============================================================================

/**
 * Abstract base class for LLM providers with common functionality.
 */
export abstract class BaseLLMProvider implements ILLMProvider {
  abstract readonly providerId: LLMProvider;
  abstract readonly supportedModels: readonly LLMModel[];

  protected config: LLMProviderConfig;
  protected isConfigured: boolean = false;

  constructor(config: LLMProviderConfig) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryBaseDelay: 1000,
      ...config,
    };
    this.isConfigured = this.validateConfig();
  }

  /**
   * Validate the provider configuration.
   */
  protected validateConfig(): boolean {
    return Boolean(this.config.apiKey);
  }

  /**
   * Check if the provider is available (configured).
   */
  isAvailable(): Promise<boolean> {
    return Promise.resolve(this.isConfigured);
  }

  /**
   * Validate credentials. Override in subclasses for actual validation.
   */
  validateCredentials(): Promise<boolean> {
    return Promise.resolve(this.isConfigured);
  }

  /**
   * Execute an operation with retry logic and exponential backoff.
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<LLMRequestConfig> = {}
  ): Promise<T> {
    const maxRetries = config.maxRetries ?? this.config.maxRetries ?? 3;
    const retryBaseDelay = config.retryBaseDelay ?? this.config.retryBaseDelay ?? 1000;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry if not retryable or if we've exhausted retries
        if (!this.isRetryableError(error) || attempt === maxRetries) {
          throw error;
        }

        // Calculate delay with exponential backoff + jitter
        const delay = retryBaseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 0.1 * delay; // 10% jitter
        await this.sleep(delay + jitter);
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Determine if an error is retryable.
   */
  protected isRetryableError(error: unknown): boolean {
    // Rate limit errors are retryable
    if (error instanceof LLMRateLimitError) {
      return true;
    }

    // Timeout errors are retryable
    if (error instanceof LLMTimeoutError) {
      return true;
    }

    // Check for common transient error patterns
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('rate limit') ||
        message.includes('503') ||
        message.includes('429') ||
        message.includes('connection') ||
        message.includes('econnreset') ||
        message.includes('socket hang up')
      );
    }

    return false;
  }

  /**
   * Sleep for a specified duration.
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute a completion request. Must be implemented by subclasses.
   */
  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;
}
