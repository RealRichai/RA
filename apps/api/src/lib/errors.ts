/**
 * Error Codes and Application Error Class
 */

export const ErrorCode = {
  // Authentication (1000-1099)
  AUTH_INVALID_CREDENTIALS: 'AUTH_1001',
  AUTH_TOKEN_EXPIRED: 'AUTH_1002',
  AUTH_TOKEN_INVALID: 'AUTH_1003',
  AUTH_TOKEN_REVOKED: 'AUTH_1004',
  AUTH_REFRESH_TOKEN_EXPIRED: 'AUTH_1005',
  AUTH_REFRESH_TOKEN_INVALID: 'AUTH_1006',
  AUTH_SESSION_EXPIRED: 'AUTH_1007',
  AUTH_MFA_REQUIRED: 'AUTH_1008',
  AUTH_PASSWORD_WEAK: 'AUTH_1010',
  AUTH_EMAIL_NOT_VERIFIED: 'AUTH_1012',
  AUTH_ACCOUNT_LOCKED: 'AUTH_1014',
  AUTH_ACCOUNT_SUSPENDED: 'AUTH_1015',

  // Authorization (1100-1199)
  AUTHZ_FORBIDDEN: 'AUTHZ_1101',
  AUTHZ_INSUFFICIENT_PERMISSIONS: 'AUTHZ_1102',
  AUTHZ_ROLE_REQUIRED: 'AUTHZ_1103',

  // Validation (2000-2099)
  VALIDATION_FAILED: 'VAL_2001',
  VALIDATION_REQUIRED_FIELD: 'VAL_2002',
  VALIDATION_INVALID_FORMAT: 'VAL_2003',

  // User (3000-3099)
  USER_NOT_FOUND: 'USER_3001',
  USER_ALREADY_EXISTS: 'USER_3002',
  USER_EMAIL_TAKEN: 'USER_3003',
  USER_PHONE_TAKEN: 'USER_3004',

  // Listing (4000-4099)
  LISTING_NOT_FOUND: 'LIST_4001',
  LISTING_NOT_AVAILABLE: 'LIST_4003',
  LISTING_FARE_ACT_VIOLATION: 'LIST_4010',
  LISTING_INCOMPLETE: 'LIST_4015',

  // Application (5000-5099)
  APPLICATION_NOT_FOUND: 'APP_5001',
  APPLICATION_DUPLICATE: 'APP_5017',
  APPLICATION_NOT_APPROVED: 'APP_5016',
  APPLICATION_FAIR_CHANCE_VIOLATION: 'APP_5015',

  // Lease (6000-6099)
  LEASE_NOT_FOUND: 'LEASE_6001',
  LEASE_ALREADY_SIGNED: 'LEASE_6013',

  // Payment (7000-7099)
  PAYMENT_NOT_FOUND: 'PAY_7001',
  PAYMENT_INVALID_STATUS: 'PAY_7015',

  // System (9000-9099)
  SYSTEM_ERROR: 'SYS_9001',
  DB_QUERY_FAILED: 'DB_9102',
  CACHE_OPERATION_FAILED: 'CACHE_9202',
  RATE_LIMIT_EXCEEDED: 'RATE_9401',

  // Integration (9300-9399)
  INTEGRATION_NOT_CONFIGURED: 'INT_9310',
  INTEGRATION_EMAIL_FAILED: 'INT_9311',
  INTEGRATION_SMS_FAILED: 'INT_9312',
  INTEGRATION_VOICE_FAILED: 'INT_9313',
  INTEGRATION_IMESSAGE_FAILED: 'INT_9314',
  INTEGRATION_SMART_LOCK_FAILED: 'INT_9315',
  INTEGRATION_GUARANTOR_FAILED: 'INT_9316',
  INTEGRATION_AI_FAILED: 'INT_9317',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

const httpStatusMap: Record<string, number> = {
  AUTH_: 401,
  AUTHZ_: 403,
  VAL_: 400,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  DUPLICATE: 409,
  RATE_: 429,
  SYS_: 500,
  DB_: 500,
  INT_: 502,
};

function getHttpStatus(code: string): number {
  for (const [pattern, status] of Object.entries(httpStatusMap)) {
    if (code.includes(pattern)) return status;
  }
  return 500;
}

export interface AppErrorOptions {
  code: ErrorCodeType;
  message: string;
  details?: Record<string, unknown>;
  cause?: Error;
}

export class AppError extends Error {
  public readonly code: ErrorCodeType;
  public readonly httpStatus: number;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: string;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.httpStatus = getHttpStatus(options.code);
    this.details = options.details;
    this.timestamp = new Date().toISOString();
    if (options.cause) this.cause = options.cause;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp,
      },
    };
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError({ code: ErrorCode.AUTH_INVALID_CREDENTIALS, message });
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message });
  }

  static notFound(entity: string): AppError {
    return new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: `${entity} not found` });
  }

  static validation(message: string, details?: Record<string, unknown>): AppError {
    return new AppError({ code: ErrorCode.VALIDATION_FAILED, message, details });
  }
}
