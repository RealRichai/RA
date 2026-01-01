import { z } from 'zod';

/**
 * Standard error codes for partner provider failures
 */
export const ProviderErrorCode = {
  // Authentication & Authorization
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  AUTHORIZATION_DENIED: 'AUTHORIZATION_DENIED',
  INVALID_API_KEY: 'INVALID_API_KEY',

  // Rate Limiting
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Resource Errors
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_EXPIRED: 'RESOURCE_EXPIRED',

  // Provider Errors
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  PROVIDER_REJECTED: 'PROVIDER_REJECTED',

  // Business Logic
  OPERATION_NOT_SUPPORTED: 'OPERATION_NOT_SUPPORTED',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  SERVICE_AREA_NOT_COVERED: 'SERVICE_AREA_NOT_COVERED',

  // Network & Infrastructure
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',
  DNS_RESOLUTION_FAILED: 'DNS_RESOLUTION_FAILED',

  // Unknown
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ProviderErrorCode =
  (typeof ProviderErrorCode)[keyof typeof ProviderErrorCode];

export const ProviderErrorCodeSchema = z.enum([
  'AUTHENTICATION_FAILED',
  'AUTHORIZATION_DENIED',
  'INVALID_API_KEY',
  'RATE_LIMITED',
  'QUOTA_EXCEEDED',
  'VALIDATION_ERROR',
  'INVALID_REQUEST',
  'MISSING_REQUIRED_FIELD',
  'RESOURCE_NOT_FOUND',
  'RESOURCE_ALREADY_EXISTS',
  'RESOURCE_EXPIRED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_TIMEOUT',
  'PROVIDER_ERROR',
  'PROVIDER_REJECTED',
  'OPERATION_NOT_SUPPORTED',
  'INSUFFICIENT_DATA',
  'BUSINESS_RULE_VIOLATION',
  'SERVICE_AREA_NOT_COVERED',
  'NETWORK_ERROR',
  'CONNECTION_REFUSED',
  'DNS_RESOLUTION_FAILED',
  'UNKNOWN_ERROR',
]);

/**
 * Structured error from partner provider
 */
export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  providerCode?: string;
  providerMessage?: string;
  retryable: boolean;
  retryAfterMs?: number;
  context?: Record<string, unknown>;
}

export const ProviderErrorSchema = z.object({
  code: ProviderErrorCodeSchema,
  message: z.string(),
  providerCode: z.string().optional(),
  providerMessage: z.string().optional(),
  retryable: z.boolean(),
  retryAfterMs: z.number().optional(),
  context: z.record(z.unknown()).optional(),
});

/**
 * Create a provider error with defaults
 */
export function createProviderError(
  code: ProviderErrorCode,
  message: string,
  options?: Partial<Omit<ProviderError, 'code' | 'message'>>
): ProviderError {
  return {
    code,
    message,
    retryable: options?.retryable ?? isRetryableError(code),
    ...options,
  };
}

/**
 * Determine if an error code is retryable by default
 */
export function isRetryableError(code: ProviderErrorCode): boolean {
  const retryableCodes: ProviderErrorCode[] = [
    'RATE_LIMITED',
    'PROVIDER_UNAVAILABLE',
    'PROVIDER_TIMEOUT',
    'NETWORK_ERROR',
    'CONNECTION_REFUSED',
    'DNS_RESOLUTION_FAILED',
  ];
  return retryableCodes.includes(code);
}
