/**
 * Typed HTTP Client for Commerce Provider Adapters
 *
 * Provides:
 * - Configurable timeouts
 * - Exponential backoff retries
 * - Structured logging with PII redaction
 * - Request/response Zod validation
 * - Result-based error handling
 */

import crypto from 'crypto';

import { generatePrefixedId, logger } from '@realriches/utils';
import { z, type ZodType } from 'zod';

// =============================================================================
// Types
// =============================================================================

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  retryMaxDelayMs?: number;
  webhookSecret?: string;
  sandbox?: boolean;
}

export interface RequestOptions<TRequest = unknown, TResponse = unknown> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: TRequest;
  requestSchema?: ZodType<TRequest>;
  responseSchema?: ZodType<TResponse>;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  skipRetry?: boolean;
}

export interface HttpResult<T> {
  ok: true;
  data: T;
  statusCode: number;
  requestId: string;
}

export interface HttpError {
  ok: false;
  code: string;
  message: string;
  statusCode?: number;
  requestId: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export type HttpResponse<T> = HttpResult<T> | HttpError;

// =============================================================================
// PII Redaction
// =============================================================================

const PII_FIELDS = [
  'ssn', 'social_security', 'socialSecurityNumber',
  'password', 'secret', 'apiKey', 'api_key',
  'creditCard', 'credit_card', 'cardNumber', 'card_number',
  'cvv', 'cvc', 'securityCode',
  'accountNumber', 'account_number', 'routingNumber', 'routing_number',
  'dateOfBirth', 'date_of_birth', 'dob',
  'token', 'accessToken', 'access_token', 'refreshToken', 'refresh_token',
];

function redactPII(obj: unknown, depth = 0): unknown {
  if (depth > 10) return '[MAX_DEPTH]';

  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Redact email-like strings in values
    if (obj.includes('@') && obj.includes('.')) {
      const [local, domain] = obj.split('@');
      return `${local.slice(0, 2)}***@${domain}`;
    }
    // Redact phone numbers (10+ digits)
    if (/^\+?\d{10,}$/.test(obj.replace(/\D/g, ''))) {
      return '***PHONE***';
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactPII(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (PII_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactPII(value, depth + 1);
      }
    }
    return redacted;
  }

  return obj;
}

// =============================================================================
// HTTP Client
// =============================================================================

export class TypedHttpClient {
  private config: Required<Omit<HttpClientConfig, 'webhookSecret' | 'sandbox'>> & Pick<HttpClientConfig, 'webhookSecret' | 'sandbox'>;
  private providerName: string;

  constructor(providerName: string, config: HttpClientConfig) {
    this.providerName = providerName;
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''), // Remove trailing slash
      apiKey: config.apiKey,
      timeout: config.timeout ?? 30000,
      retryAttempts: config.retryAttempts ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
      retryMaxDelayMs: config.retryMaxDelayMs ?? 10000,
      webhookSecret: config.webhookSecret,
      sandbox: config.sandbox,
    };
  }

  /**
   * Make an HTTP request with retries, validation, and structured logging
   */
  async request<TRequest, TResponse>(
    options: RequestOptions<TRequest, TResponse>
  ): Promise<HttpResponse<TResponse>> {
    const requestId = generatePrefixedId('http');
    const startTime = Date.now();

    // Validate request body if schema provided
    if (options.body && options.requestSchema) {
      const parseResult = options.requestSchema.safeParse(options.body);
      if (!parseResult.success) {
        logger.warn({
          provider: this.providerName,
          requestId,
          error: 'Request validation failed',
          issues: parseResult.error.issues,
        });
        return {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: `Request validation failed: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
          requestId,
          retryable: false,
        };
      }
    }

    const url = `${this.config.baseUrl}${options.path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'X-Request-ID': requestId,
      ...options.headers,
    };

    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    // Log request (with redacted body)
    logger.info({
      msg: 'provider_request',
      provider: this.providerName,
      requestId,
      method: options.method,
      url: url.replace(this.config.apiKey, '[REDACTED]'),
      hasBody: !!options.body,
      body: options.body ? redactPII(options.body) : undefined,
    });

    let lastError: HttpError | null = null;
    const maxAttempts = options.skipRetry ? 1 : this.config.retryAttempts;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          method: options.method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const duration = Date.now() - startTime;

        // Handle non-2xx responses
        if (!response.ok) {
          let errorBody: unknown;
          try {
            errorBody = await response.json();
          } catch {
            errorBody = await response.text();
          }

          const retryable = response.status >= 500 || response.status === 429;

          logger.warn({
            msg: 'provider_error',
            provider: this.providerName,
            requestId,
            statusCode: response.status,
            attempt,
            duration,
            retryable,
            error: redactPII(errorBody),
          });

          lastError = {
            ok: false,
            code: `HTTP_${response.status}`,
            message: typeof errorBody === 'object' && errorBody !== null && 'message' in errorBody
              ? String((errorBody as Record<string, unknown>).message)
              : `Provider returned ${response.status}`,
            statusCode: response.status,
            requestId,
            retryable,
            details: typeof errorBody === 'object' ? (errorBody as Record<string, unknown>) : { raw: errorBody },
          };

          if (!retryable || attempt === maxAttempts) {
            return lastError;
          }

          // Calculate exponential backoff delay
          const delay = Math.min(
            this.config.retryDelayMs * Math.pow(2, attempt - 1),
            this.config.retryMaxDelayMs
          );
          await this.sleep(delay);
          continue;
        }

        // Parse successful response
        const responseBody = await response.json() as unknown;

        // Validate response if schema provided
        if (options.responseSchema) {
          const parseResult = options.responseSchema.safeParse(responseBody);
          if (!parseResult.success) {
            logger.error({
              msg: 'provider_response_validation_failed',
              provider: this.providerName,
              requestId,
              duration,
              issues: parseResult.error.issues,
              response: redactPII(responseBody),
            });
            return {
              ok: false,
              code: 'RESPONSE_VALIDATION_ERROR',
              message: `Response validation failed: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
              statusCode: response.status,
              requestId,
              retryable: false,
            };
          }

          logger.info({
            msg: 'provider_response',
            provider: this.providerName,
            requestId,
            statusCode: response.status,
            duration,
            response: redactPII(parseResult.data),
          });

          return {
            ok: true,
            data: parseResult.data,
            statusCode: response.status,
            requestId,
          };
        }

        logger.info({
          msg: 'provider_response',
          provider: this.providerName,
          requestId,
          statusCode: response.status,
          duration,
          response: redactPII(responseBody),
        });

        return {
          ok: true,
          data: responseBody as TResponse,
          statusCode: response.status,
          requestId,
        };

      } catch (error) {
        const duration = Date.now() - startTime;
        const isTimeout = error instanceof Error && error.name === 'AbortError';
        const isNetworkError = error instanceof TypeError;
        const retryable = isTimeout || isNetworkError;

        logger.error({
          msg: 'provider_request_failed',
          provider: this.providerName,
          requestId,
          attempt,
          duration,
          isTimeout,
          isNetworkError,
          retryable,
          error: error instanceof Error ? error.message : String(error),
        });

        lastError = {
          ok: false,
          code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: isTimeout
            ? `Request timed out after ${this.config.timeout}ms`
            : `Network error: ${error instanceof Error ? error.message : 'Unknown'}`,
          requestId,
          retryable,
        };

        if (!retryable || attempt === maxAttempts) {
          return lastError;
        }

        const delay = Math.min(
          this.config.retryDelayMs * Math.pow(2, attempt - 1),
          this.config.retryMaxDelayMs
        );
        await this.sleep(delay);
      }
    }

    return lastError!;
  }

  /**
   * Verify webhook signature (provider-specific implementation needed)
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) {
      logger.warn({
        msg: 'webhook_secret_not_configured',
        provider: this.providerName,
      });
      return false;
    }

    // Simple HMAC verification - provider-specific implementations may override
    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Error Helpers
// =============================================================================

export function isHttpError(response: HttpResponse<unknown>): response is HttpError {
  return !response.ok;
}

export function isHttpResult<T>(response: HttpResponse<T>): response is HttpResult<T> {
  return response.ok;
}

/**
 * Map HTTP error to safe error code for client consumption
 */
export function toSafeErrorCode(error: HttpError): string {
  switch (error.code) {
    case 'HTTP_400':
      return 'INVALID_REQUEST';
    case 'HTTP_401':
      return 'PROVIDER_AUTH_ERROR';
    case 'HTTP_403':
      return 'PROVIDER_ACCESS_DENIED';
    case 'HTTP_404':
      return 'PROVIDER_RESOURCE_NOT_FOUND';
    case 'HTTP_422':
      return 'PROVIDER_VALIDATION_ERROR';
    case 'HTTP_429':
      return 'PROVIDER_RATE_LIMITED';
    case 'HTTP_500':
    case 'HTTP_502':
    case 'HTTP_503':
    case 'HTTP_504':
      return 'PROVIDER_UNAVAILABLE';
    case 'TIMEOUT':
      return 'PROVIDER_TIMEOUT';
    case 'NETWORK_ERROR':
      return 'PROVIDER_UNREACHABLE';
    case 'VALIDATION_ERROR':
    case 'RESPONSE_VALIDATION_ERROR':
      return 'PROVIDER_RESPONSE_INVALID';
    default:
      return 'PROVIDER_ERROR';
  }
}
