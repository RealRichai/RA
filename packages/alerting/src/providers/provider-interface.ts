/**
 * Alert Provider Interface
 *
 * Defines the contract for alert providers and provides a base class
 * with common functionality like retry logic and HTTP helpers.
 */

import { type Result, success, failure, logger } from '@realriches/utils';

import type { AlertRequest, AlertResponse, AlertProviderType } from '../types';

// =============================================================================
// Provider Interface
// =============================================================================

export interface IAlertProvider {
  /** Provider identifier */
  readonly providerId: AlertProviderType;

  /** Check if provider is configured and available */
  isAvailable(): boolean;

  /** Validate provider credentials/config */
  validateCredentials(): Promise<boolean>;

  /** Send an alert */
  send(alert: AlertRequest): Promise<Result<AlertResponse, Error>>;
}

// =============================================================================
// Base Provider Config
// =============================================================================

export interface BaseProviderConfig {
  enabled: boolean;
  timeoutMs?: number;
  retryAttempts?: number;
}

// =============================================================================
// Provider Errors
// =============================================================================

export class AlertProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: AlertProviderType,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'AlertProviderError';
    Object.setPrototypeOf(this, AlertProviderError.prototype);
  }
}

export class AlertRateLimitError extends AlertProviderError {
  constructor(
    provider: AlertProviderType,
    public readonly retryAfterMs?: number
  ) {
    super(`Rate limit exceeded for ${provider}`, 'RATE_LIMIT', provider, true);
    this.name = 'AlertRateLimitError';
  }
}

export class AlertTimeoutError extends AlertProviderError {
  constructor(provider: AlertProviderType, timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`, 'TIMEOUT', provider, true);
    this.name = 'AlertTimeoutError';
  }
}

export class AlertAuthenticationError extends AlertProviderError {
  constructor(provider: AlertProviderType) {
    super(`Authentication failed for ${provider}`, 'AUTHENTICATION_FAILED', provider, false);
    this.name = 'AlertAuthenticationError';
  }
}

// =============================================================================
// Base Alert Provider
// =============================================================================

export abstract class BaseAlertProvider implements IAlertProvider {
  abstract readonly providerId: AlertProviderType;

  protected timeoutMs: number;
  protected retryAttempts: number;
  protected isConfigured: boolean = false;

  constructor(config: BaseProviderConfig) {
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.retryAttempts = config.retryAttempts ?? 3;
  }

  isAvailable(): boolean {
    return this.isConfigured;
  }

  abstract validateCredentials(): Promise<boolean>;
  abstract send(alert: AlertRequest): Promise<Result<AlertResponse, Error>>;

  /**
   * Make HTTP request with timeout
   */
  protected async makeRequest<T>(
    method: 'POST',
    url: string,
    body: unknown,
    headers: Record<string, string> = {}
  ): Promise<T> {
    const startTime = Date.now();

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const durationMs = Date.now() - startTime;

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new AlertRateLimitError(
        this.providerId,
        retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new AlertAuthenticationError(this.providerId);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new AlertProviderError(
        `HTTP ${response.status}: ${errorText}`,
        'HTTP_ERROR',
        this.providerId,
        response.status >= 500
      );
    }

    this.log('Request completed', { url, durationMs, status: response.status });

    return response.json() as Promise<T>;
  }

  /**
   * Execute with retry logic
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry non-retryable errors
        if (error instanceof AlertProviderError && !error.retryable) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === this.retryAttempts) {
          throw error;
        }

        // Exponential backoff with jitter
        const baseDelay = 1000 * Math.pow(2, attempt);
        const jitter = Math.random() * 0.1 * baseDelay;
        const delay = baseDelay + jitter;

        this.log('Retrying after error', {
          context,
          attempt: attempt + 1,
          maxAttempts: this.retryAttempts,
          delayMs: delay,
          error: lastError.message,
        });

        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Log provider activity
   */
  protected log(message: string, data?: Record<string, unknown>): void {
    logger.debug({
      msg: `[${this.providerId}] ${message}`,
      provider: this.providerId,
      ...data,
    });
  }

  /**
   * Sleep helper
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create success response
   */
  protected successResponse(
    alert: AlertRequest,
    providerAlertId: string | undefined,
    durationMs: number
  ): Result<AlertResponse, Error> {
    return success({
      providerId: this.providerId,
      success: true,
      providerAlertId,
      sentAt: new Date(),
      durationMs,
    });
  }

  /**
   * Create failure response
   */
  protected failureResponse(error: Error): Result<AlertResponse, Error> {
    return failure(error);
  }
}
