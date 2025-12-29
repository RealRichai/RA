/**
 * Base error class for application errors
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode = 500,
    isOperational = true,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  public readonly field?: string;

  constructor(message: string, field?: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, true, details);
    this.field = field;
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', code = 'AUTH_REQUIRED') {
    super(message, code, 401, true);
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Access denied', code = 'FORBIDDEN') {
    super(message, code, 403, true);
  }
}

/**
 * Forbidden error (403) - alias for AuthorizationError
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 'FORBIDDEN', 403, true);
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  public readonly resourceType: string;
  public readonly resourceId?: string;

  constructor(resourceType: string, resourceId?: string) {
    const message = resourceId
      ? `${resourceType} with ID ${resourceId} not found`
      : `${resourceType} not found`;
    super(message, 'RESOURCE_NOT_FOUND', 404, true, { resourceType, resourceId });
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'RESOURCE_CONFLICT', 409, true, details);
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter: number, message = 'Too many requests') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, true, { retryAfter });
    this.retryAfter = retryAfter;
  }
}

/**
 * External service error (502)
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(service: string, message: string, details?: Record<string, unknown>) {
    super(message, 'EXTERNAL_SERVICE_ERROR', 502, true, { service, ...details });
    this.service = service;
  }
}

/**
 * Payment error
 */
export class PaymentError extends AppError {
  public readonly paymentId?: string;
  public readonly providerCode?: string;

  constructor(
    message: string,
    code = 'PAYMENT_FAILED',
    paymentId?: string,
    providerCode?: string
  ) {
    super(message, code, 402, true, { paymentId, providerCode });
    this.paymentId = paymentId;
    this.providerCode = providerCode;
  }
}

/**
 * Compliance error
 */
export class ComplianceError extends AppError {
  public readonly ruleType: string;
  public readonly violations: string[];

  constructor(ruleType: string, violations: string[], message?: string) {
    super(
      message || `Compliance violation: ${ruleType}`,
      'COMPLIANCE_VIOLATION',
      422,
      true,
      { ruleType, violations }
    );
    this.ruleType = ruleType;
    this.violations = violations;
  }
}

/**
 * Feature disabled error
 */
export class FeatureDisabledError extends AppError {
  public readonly feature: string;

  constructor(feature: string) {
    super(`Feature '${feature}' is not enabled`, 'FEATURE_DISABLED', 403, true, { feature });
    this.feature = feature;
  }
}

/**
 * Market not enabled error
 */
export class MarketNotEnabledError extends AppError {
  public readonly marketId: string;

  constructor(marketId: string) {
    super(`Market '${marketId}' is not enabled`, 'MARKET_NOT_ENABLED', 403, true, { marketId });
    this.marketId = marketId;
  }
}

/**
 * Check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Check if an error is operational (expected/handled)
 */
export function isOperationalError(error: unknown): boolean {
  if (isAppError(error)) {
    return error.isOperational;
  }
  return false;
}

/**
 * Wrap an error in an AppError
 */
export function wrapError(error: unknown, defaultMessage = 'An unexpected error occurred'): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(error.message || defaultMessage, 'INTERNAL_ERROR', 500, false, {
      originalError: error.name,
    });
  }

  return new AppError(defaultMessage, 'INTERNAL_ERROR', 500, false);
}
