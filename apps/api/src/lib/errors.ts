import type { FastifyReply } from 'fastify';
import { ErrorCode } from '@realriches/shared';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details: Record<string, unknown> | undefined;

  constructor(
    message: string,
    statusCode: number = 500,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    details: Record<string, unknown> | undefined
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// Common error factories
export const errors = {
  // Auth errors
  unauthorized: (message = 'Unauthorized') =>
    new AppError(message, 401, ErrorCode.UNAUTHORIZED),
  
  forbidden: (message = 'Forbidden') =>
    new AppError(message, 403, ErrorCode.FORBIDDEN),
  
  tokenExpired: () =>
    new AppError('Token has expired', 401, ErrorCode.TOKEN_EXPIRED),
  
  tokenInvalid: () =>
    new AppError('Invalid token', 401, ErrorCode.TOKEN_INVALID),

  // Validation errors
  validation: (message: string, details: Record<string, unknown> | undefined) =>
    new AppError(message, 400, ErrorCode.VALIDATION_ERROR, details),
  
  badRequest: (message: string) =>
    new AppError(message, 400, ErrorCode.VALIDATION_ERROR),

  // Resource errors
  notFound: (resource: string) =>
    new AppError(`${resource} not found`, 404, ErrorCode.NOT_FOUND),
  
  conflict: (message: string) =>
    new AppError(message, 409, ErrorCode.CONFLICT),

  // Rate limiting
  rateLimited: (retryAfter?: number) =>
    new AppError(
      'Too many requests. Please try again later.',
      429,
      ErrorCode.RATE_LIMITED,
      retryAfter ? { retryAfter } : undefined
    ),

  // Compliance errors
  fareActViolation: (message: string, details: Record<string, unknown> | undefined) =>
    new AppError(message, 400, ErrorCode.FARE_ACT_VIOLATION, details),
  
  fchaViolation: (message: string, details: Record<string, unknown> | undefined) =>
    new AppError(message, 400, ErrorCode.FCHA_VIOLATION, details),

  // Payment errors
  paymentFailed: (message: string, details: Record<string, unknown> | undefined) =>
    new AppError(message, 402, ErrorCode.PAYMENT_FAILED, details),
  
  stripeError: (message: string, details: Record<string, unknown> | undefined) =>
    new AppError(message, 400, ErrorCode.STRIPE_ERROR, details),

  // Server errors
  internal: (message = 'Internal server error') =>
    new AppError(message, 500, ErrorCode.INTERNAL_ERROR),
  
  serviceUnavailable: (service: string) =>
    new AppError(`${service} is temporarily unavailable`, 503, ErrorCode.INTERNAL_ERROR),
};

// Error handler for routes
export function handleError(error: unknown, reply: FastifyReply): FastifyReply {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(error.toJSON());
  }

  // Zod validation errors
  if (error && typeof error === 'object' && 'issues' in error) {
    const zodError = error as { issues: Array<{ path: string[]; message: string }> };
    return reply.status(400).send({
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: {
          issues: zodError.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
      },
    });
  }

  // Prisma errors
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaError = error as { code: string; meta?: Record<string, unknown> };
    
    if (prismaError.code === 'P2002') {
      return reply.status(409).send({
        success: false,
        error: {
          code: ErrorCode.CONFLICT,
          message: 'A record with this value already exists',
          details: prismaError.meta,
        },
      });
    }
    
    if (prismaError.code === 'P2025') {
      return reply.status(404).send({
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Record not found',
        },
      });
    }
  }

  // Generic error
  console.error('Unhandled error:', error);
  return reply.status(500).send({
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    },
  });
}


export function errorHandler(error: unknown) {
  // Convenience wrapper for places that only need a serializer
  return handleError(error);
}
