import { Prisma } from '@realriches/database';
import {
  AppError,
  isAppError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from '@realriches/utils';
import { generateId } from '@realriches/utils';
import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    stack?: string;
  };
  requestId: string;
  traceId?: string;
  timestamp: string;
}

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): FastifyReply {
  const requestId = request.id || generateId();
  const trace = request.trace;
  const traceId = trace?.traceId;
  const timestamp = new Date().toISOString();
  const isDev = process.env['NODE_ENV'] === 'development';

  let response: ErrorResponse;
  let statusCode = 500;

  // Handle our custom AppError types
  if (isAppError(error)) {
    statusCode = error.statusCode;
    response = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        stack: isDev ? error.stack : undefined,
      },
      requestId,
      ...(traceId && { traceId }),
      timestamp,
    };
  }
  // Handle Zod validation errors
  else if (error instanceof ZodError) {
    statusCode = 400;
    response = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: {
          errors: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
          })),
        },
        stack: isDev ? error.stack : undefined,
      },
      requestId,
      ...(traceId && { traceId }),
      timestamp,
    };
  }
  // Handle Prisma errors
  else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': // Unique constraint violation
        statusCode = 409;
        const target = (error.meta?.['target'] as string[])?.join(', ');
        response = {
          success: false,
          error: {
            code: 'RESOURCE_ALREADY_EXISTS',
            message: `A record with this ${target || 'value'} already exists`,
            details: { target },
            stack: isDev ? error.stack : undefined,
          },
          requestId,
          ...(traceId && { traceId }),
          timestamp,
        };
        break;

      case 'P2025': // Record not found
        statusCode = 404;
        response = {
          success: false,
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'The requested resource was not found',
            stack: isDev ? error.stack : undefined,
          },
          requestId,
          ...(traceId && { traceId }),
          timestamp,
        };
        break;

      case 'P2003': // Foreign key constraint violation
        statusCode = 400;
        response = {
          success: false,
          error: {
            code: 'INVALID_REFERENCE',
            message: 'Referenced record does not exist',
            stack: isDev ? error.stack : undefined,
          },
          requestId,
          ...(traceId && { traceId }),
          timestamp,
        };
        break;

      default:
        response = {
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: isDev ? error.message : 'A database error occurred',
            details: isDev ? { prismaCode: error.code } : undefined,
            stack: isDev ? error.stack : undefined,
          },
          requestId,
          ...(traceId && { traceId }),
          timestamp,
        };
    }
  }
  // Handle Prisma validation errors
  else if (error instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    response = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid data provided',
        details: isDev ? { message: error.message } : undefined,
        stack: isDev ? error.stack : undefined,
      },
      requestId,
      ...(traceId && { traceId }),
      timestamp,
    };
  }
  // Handle Fastify built-in errors
  else if (error.statusCode) {
    statusCode = error.statusCode;
    response = {
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message,
        stack: isDev ? error.stack : undefined,
      },
      requestId,
      ...(traceId && { traceId }),
      timestamp,
    };
  }
  // Handle unknown errors
  else {
    request.log.error({ error }, 'Unhandled error');

    response = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: isDev ? error.message : 'An unexpected error occurred',
        stack: isDev ? error.stack : undefined,
      },
      requestId,
      ...(traceId && { traceId }),
      timestamp,
    };
  }

  // Log errors with trace context
  if (statusCode >= 500) {
    request.log.error({
      msg: 'error_response',
      error: {
        message: error.message,
        stack: error.stack,
        code: 'code' in error ? error.code : undefined,
      },
      statusCode,
      requestId,
      ...(traceId && { traceId }),
    });
  } else if (statusCode >= 400) {
    request.log.warn({
      msg: 'client_error',
      error: {
        message: error.message,
        code: 'code' in error ? error.code : undefined,
      },
      statusCode,
      requestId,
      ...(traceId && { traceId }),
    });
  }

  return reply.status(statusCode).send(response);
}
