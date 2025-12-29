import { logger } from './logger';

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay between retries in milliseconds */
  initialDelay: number;
  /** Maximum delay between retries in milliseconds */
  maxDelay: number;
  /** Backoff multiplier (e.g., 2 for exponential backoff) */
  backoffMultiplier: number;
  /** Add random jitter to delays */
  jitter: boolean;
  /** Custom function to determine if error is retryable */
  retryable?: (error: Error) => boolean;
  /** Callback on each retry */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

const defaultOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Calculate delay for next retry with exponential backoff
 */
function calculateDelay(
  attempt: number,
  options: RetryOptions
): number {
  let delay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt - 1);
  delay = Math.min(delay, options.maxDelay);

  if (options.jitter) {
    // Add random jitter of +/- 25%
    const jitterRange = delay * 0.25;
    delay = delay + (Math.random() - 0.5) * 2 * jitterRange;
  }

  return Math.round(delay);
}

/**
 * Default retryable error check
 */
function isRetryableError(error: Error): boolean {
  // Network errors
  if (error.message.includes('ECONNREFUSED') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ENOTFOUND')) {
    return true;
  }

  // HTTP errors that are typically retryable
  const httpError = error as Error & { statusCode?: number };
  if (httpError.statusCode) {
    // 429 Too Many Requests, 500+ Server Errors (except 501)
    if (httpError.statusCode === 429 || (httpError.statusCode >= 500 && httpError.statusCode !== 501)) {
      return true;
    }
  }

  return false;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...defaultOptions, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      const isRetryable = opts.retryable
        ? opts.retryable(lastError)
        : isRetryableError(lastError);

      // If not retryable or last attempt, throw
      if (!isRetryable || attempt === opts.maxAttempts) {
        throw lastError;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, opts);

      // Log and callback
      logger.warn(
        { error: lastError.message, attempt, maxAttempts: opts.maxAttempts, delay },
        'Retrying operation after error'
      );

      if (opts.onRetry) {
        opts.onRetry(lastError, attempt, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Retry failed');
}

/**
 * Create a retryable function
 */
export function withRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: Partial<RetryOptions> = {}
): T {
  return (async (...args: Parameters<T>) => {
    return retry(() => fn(...args), options);
  }) as T;
}

/**
 * Retry with circuit breaker pattern
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime: number | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly threshold: number = 5,
    private readonly resetTimeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const now = Date.now();
      if (this.lastFailureTime && now - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();

      // Reset on success
      if (this.state === 'half-open') {
        this.reset();
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
      logger.warn({ failures: this.failures }, 'Circuit breaker opened');
    }
  }

  private reset(): void {
    this.failures = 0;
    this.lastFailureTime = null;
    this.state = 'closed';
    logger.info('Circuit breaker reset');
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }
}
