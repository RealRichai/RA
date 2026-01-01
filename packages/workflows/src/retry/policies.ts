/**
 * Declarative Retry Policies
 *
 * Pre-defined retry configurations for different types of activities.
 * These policies are Temporal-compatible and follow best practices
 * for exponential backoff with non-retryable error classification.
 */

import type { RetryPolicy } from '../types';

/**
 * Built-in retry policies for common activity types.
 */
export const RetryPolicies = {
  /**
   * Fast-fail for validation activities.
   * No retries - validation errors are deterministic.
   */
  validation: {
    initialInterval: 100,
    backoffCoefficient: 1,
    maximumInterval: 100,
    maximumAttempts: 1,
    nonRetryableErrors: ['ValidationError', 'ZodError', 'TypeError'],
  } satisfies RetryPolicy,

  /**
   * Standard retry for database operations.
   * Handles transient connection issues with moderate backoff.
   */
  database: {
    initialInterval: 500,
    backoffCoefficient: 2,
    maximumInterval: 10_000,
    maximumAttempts: 5,
    nonRetryableErrors: [
      'UniqueConstraintError',
      'ForeignKeyConstraintError',
      'PrismaClientKnownRequestError',
    ],
  } satisfies RetryPolicy,

  /**
   * Aggressive retry for external service calls.
   * Handles temporary outages with longer backoff.
   */
  externalService: {
    initialInterval: 1_000,
    backoffCoefficient: 2,
    maximumInterval: 60_000,
    maximumAttempts: 10,
    nonRetryableErrors: [
      'AuthenticationError',
      'AuthorizationError',
      'InvalidRequestError',
      'BadRequestError',
      'NotFoundError',
    ],
  } satisfies RetryPolicy,

  /**
   * Long-running background tasks.
   * Very patient retry with extended intervals.
   */
  background: {
    initialInterval: 5_000,
    backoffCoefficient: 2,
    maximumInterval: 300_000, // 5 minutes
    maximumAttempts: 20,
    nonRetryableErrors: [],
  } satisfies RetryPolicy,

  /**
   * Webhook delivery policy.
   * Standard HTTP retry with reasonable limits.
   */
  webhook: {
    initialInterval: 1_000,
    backoffCoefficient: 2,
    maximumInterval: 30_000,
    maximumAttempts: 5,
    nonRetryableErrors: ['BadRequestError', 'UnauthorizedError'],
  } satisfies RetryPolicy,

  /**
   * Email/notification sending.
   * Moderate retry for transient failures.
   */
  notification: {
    initialInterval: 2_000,
    backoffCoefficient: 2,
    maximumInterval: 60_000,
    maximumAttempts: 5,
    nonRetryableErrors: ['InvalidRecipientError', 'TemplateNotFoundError'],
  } satisfies RetryPolicy,

  /**
   * File/document operations.
   * Handle storage service transient errors.
   */
  storage: {
    initialInterval: 1_000,
    backoffCoefficient: 2,
    maximumInterval: 30_000,
    maximumAttempts: 5,
    nonRetryableErrors: ['FileTooLargeError', 'InvalidFileTypeError', 'QuotaExceededError'],
  } satisfies RetryPolicy,

  /**
   * AI/ML service calls.
   * Handle rate limits and temporary unavailability.
   */
  aiService: {
    initialInterval: 2_000,
    backoffCoefficient: 2,
    maximumInterval: 120_000, // 2 minutes
    maximumAttempts: 8,
    nonRetryableErrors: ['InvalidPromptError', 'ContentFilterError', 'ModelNotFoundError'],
  } satisfies RetryPolicy,

  /**
   * Payment processing.
   * Careful retry with strict limits to avoid duplicate charges.
   */
  payment: {
    initialInterval: 2_000,
    backoffCoefficient: 2,
    maximumInterval: 30_000,
    maximumAttempts: 3,
    nonRetryableErrors: [
      'CardDeclinedError',
      'InsufficientFundsError',
      'InvalidCardError',
      'FraudDetectedError',
      'DuplicateTransactionError',
    ],
  } satisfies RetryPolicy,

  /**
   * State transitions.
   * Quick retry for race conditions.
   */
  stateTransition: {
    initialInterval: 100,
    backoffCoefficient: 2,
    maximumInterval: 5_000,
    maximumAttempts: 5,
    nonRetryableErrors: ['InvalidTransitionError', 'StateConflictError'],
  } satisfies RetryPolicy,
} as const;

/**
 * Create a custom retry policy with defaults.
 */
export function createRetryPolicy(overrides: Partial<RetryPolicy>): RetryPolicy {
  return {
    initialInterval: 1_000,
    backoffCoefficient: 2,
    maximumInterval: 60_000,
    maximumAttempts: 5,
    nonRetryableErrors: [],
    ...overrides,
  };
}

/**
 * Calculate the delay for a retry attempt.
 * @param policy The retry policy
 * @param attempt The current attempt number (1-based)
 * @returns Delay in milliseconds
 */
export function calculateRetryDelay(policy: RetryPolicy, attempt: number): number {
  const delay = policy.initialInterval * Math.pow(policy.backoffCoefficient, attempt - 1);
  return Math.min(delay, policy.maximumInterval);
}

/**
 * Add jitter to a delay to prevent thundering herd.
 * @param delayMs Base delay in milliseconds
 * @param jitterPercent Percentage of jitter (0-1)
 * @returns Delay with jitter applied
 */
export function addJitter(delayMs: number, jitterPercent: number = 0.1): number {
  const jitter = delayMs * jitterPercent * (Math.random() * 2 - 1);
  return Math.max(0, delayMs + jitter);
}

/**
 * Check if an error should be retried based on the policy.
 * @param error The error to check
 * @param policy The retry policy
 * @returns True if the error is retryable
 */
export function isRetryableError(error: Error, policy: RetryPolicy): boolean {
  if (!policy.nonRetryableErrors || policy.nonRetryableErrors.length === 0) {
    return true;
  }
  return !policy.nonRetryableErrors.includes(error.name);
}
