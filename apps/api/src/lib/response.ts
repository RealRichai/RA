/**
 * Global API Response Envelope
 * 
 * All API responses follow this standard format:
 * - Success: { success: true, data: T, meta?: ResponseMeta }
 * - Error: { success: false, error: { code: string, message: string, details?: any } }
 */

import type { FastifyReply } from 'fastify';

export interface ResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
  requestId?: string;
  timestamp?: string;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  };
  requestId?: string;
  timestamp?: string;
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

/**
 * Create a success response
 */
export function success<T>(data: T, meta?: ResponseMeta): SuccessResponse<T> {
  return {
    success: true,
    data,
    ...(meta && { meta }),
  };
}

/**
 * Create an error response
 */
export function error(
  code: string,
  message: string,
  details?: unknown,
  stack?: string
): ErrorResponse {
  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    timestamp: new Date().toISOString(),
  };

  // Only include stack in development
  if (stack && process.env['NODE_ENV'] === 'development') {
    response.error.stack = stack;
  }

  return response;
}

/**
 * Send a success response with proper status code
 */
export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  statusCode = 200,
  meta?: ResponseMeta
): FastifyReply {
  const response = success(data, {
    ...meta,
    requestId: reply.request.id,
    timestamp: new Date().toISOString(),
  });
  return reply.status(statusCode).send(response);
}

/**
 * Send an error response with proper status code
 */
export function sendError(
  reply: FastifyReply,
  code: string,
  message: string,
  statusCode = 500,
  details?: unknown
): FastifyReply {
  const response = error(code, message, details);
  response.requestId = reply.request.id;
  return reply.status(statusCode).send(response);
}

/**
 * Send a paginated success response
 */
export function sendPaginated<T>(
  reply: FastifyReply,
  items: T[],
  total: number,
  page: number,
  limit: number
): FastifyReply {
  const totalPages = Math.ceil(total / limit);
  return sendSuccess(reply, items, 200, {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  });
}

/**
 * Standard error codes
 */
export const ErrorCodes = {
  // Authentication & Authorization
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  
  // Resources
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  RESOURCE_DELETED: 'RESOURCE_DELETED',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Server Errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  
  // Business Logic
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  COMPLIANCE_VIOLATION: 'COMPLIANCE_VIOLATION',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  MARKET_NOT_ENABLED: 'MARKET_NOT_ENABLED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
