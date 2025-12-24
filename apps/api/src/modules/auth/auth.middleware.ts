/**
 * Auth Middleware
 * Fastify authentication and authorization hooks
 */

import type { FastifyInstance, FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { verifyAccessToken, type TokenPayload } from './jwt.service.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import type { UserRole } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: TokenPayload;
  }
}

export function registerAuthHooks(app: FastifyInstance): void {
  app.decorateRequest('auth', null);
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError({
      code: ErrorCode.AUTH_TOKEN_INVALID,
      message: 'Missing or invalid authorization header',
    });
  }

  const token = authHeader.slice(7);
  const result = await verifyAccessToken(token);

  if (result.isErr()) {
    throw result.error;
  }

  request.auth = result.value;
}

export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return;

  const token = authHeader.slice(7);
  const result = await verifyAccessToken(token);
  if (result.isOk()) {
    request.auth = result.value;
  }
}

export function requireRoles(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.auth) {
      throw new AppError({
        code: ErrorCode.AUTH_TOKEN_INVALID,
        message: 'Authentication required',
      });
    }

    if (!roles.includes(request.auth.role)) {
      throw new AppError({
        code: ErrorCode.AUTHZ_FORBIDDEN,
        message: `Access denied. Required roles: ${roles.join(', ')}`,
      });
    }
  };
}

export function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  if (!request.auth) {
    done(new AppError({ code: ErrorCode.AUTH_TOKEN_INVALID, message: 'Authentication required' }));
    return;
  }
  if (request.auth.role !== 'ADMIN' && request.auth.role !== 'SUPER_ADMIN') {
    done(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Admin access required' }));
    return;
  }
  done();
}

// Aliases for route handlers
export const requireAuth = authenticate;
export const requireRole = requireRoles;
