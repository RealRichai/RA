import type { FastifyReply } from 'fastify';
import { ErrorCode } from '@realriches/shared';
export { ErrorCode } from '@realriches/shared';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details: Record<string, unknown> | undefined = undefined;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    details: Record<string, unknown> | undefined = undefined
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
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
    new AppError(ErrorCode.UNAUTHORIZED, message, 401),

  forbidden: (message = 'Forbidden') =>
    new AppError(ErrorCode.FORBIDDEN, message, 403),

  tokenExpired: () =>
    new AppError(ErrorCode.TOKEN_EXPIRED, 'Token has expired', 401),

  tokenInvalid: () =>
    new AppError(ErrorCode.TOKEN_INVALID, 'Invalid token', 401),

  // Validation errors
  validation: (message: string, details: Record<string, unknown> | undefined = undefined) =>
    new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details),

  badRequest: (message: string) =>
    new AppError(ErrorCode.VALIDATION_ERROR, message, 400),

  // Resource errors
  notFound: (resource: string) =>
    new AppError(ErrorCode.NOT_FOUND, `${resource} not found`, 404),

  conflict: (message: string) =>
    new AppError(ErrorCode.CONFLICT, message, 409),

  // Rate limiting
  rateLimited: (retryAfter?: number) =>
    new AppError(
      ErrorCode.RATE_LIMITED,
      'Too many requests. Please try again later.',
      429,
      retryAfter ? { retryAfter } : undefined
    ),

  // Compliance errors
  fareActViolation: (message: string, details: Record<string, unknown> | undefined = undefined) =>
    new AppError(ErrorCode.FARE_ACT_VIOLATION, message, 400, details),

  fchaViolation: (message: string, details: Record<string, unknown> | undefined = undefined) =>
    new AppError(ErrorCode.FCHA_VIOLATION, message, 400, details),

  // Payment errors
  paymentFailed: (message: string, details: Record<string, unknown> | undefined = undefined) =>
    new AppError(ErrorCode.PAYMENT_FAILED, message, 402, details),

  stripeError: (message: string, details: Record<string, unknown> | undefined = undefined) =>
    new AppError(ErrorCode.STRIPE_ERROR, message, 400, details),

  // Server errors
  internal: (message = 'Internal server error') =>
    new AppError(ErrorCode.INTERNAL_ERROR, message, 500),

  serviceUnavailable: (service: string) =>
    new AppError(ErrorCode.INTERNAL_ERROR, `${service} is temporarily unavailable`, 503),
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


export function errorHandler(error: unknown, _req: any, reply: any) {
  return handleError(error, reply);
}
