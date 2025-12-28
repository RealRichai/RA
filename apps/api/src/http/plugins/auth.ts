import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { errors, handleError } from '../../lib/errors.js';
import type { UserRole, JWTPayload } from '@realriches/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user: JWTPayload;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}

export async function authPlugin(fastify: FastifyInstance): Promise<void> {
  // Register JWT plugin
  await fastify.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET,
    sign: {
      expiresIn: env.JWT_ACCESS_EXPIRY,
    },
  });

  // Authentication decorator
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();

      // Verify user still exists and is active
      const user = await prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { id: true, status: true, role: true },
      });

      if (!user) {
        return handleError(errors.unauthorized('User not found'), reply);
      }

      if (user.status !== 'ACTIVE') {
        return handleError(errors.forbidden('Account is not active'), reply);
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('expired')) {
          return handleError(errors.tokenExpired(), reply);
        }
        if (error.message.includes('invalid') || error.message.includes('malformed')) {
          return handleError(errors.tokenInvalid(), reply);
        }
      }
      return handleError(errors.unauthorized(), reply);
    }
  });

  // Optional authentication (doesn't fail if no token)
  fastify.decorate('optionalAuth', async function (request: FastifyRequest, _reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      // Token is invalid or missing, but we allow the request to continue
      // @ts-expect-error - setting user to undefined for optional auth
      request.user = undefined;
    }
  });

  // Role-based authorization
  fastify.decorate('requireRole', function (...roles: UserRole[]) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.user) {
        return handleError(errors.unauthorized(), reply);
      }

      if (!roles.includes(request.user.role as UserRole)) {
        return handleError(
          errors.forbidden(`This action requires one of these roles: ${roles.join(', ')}`),
          reply
        );
      }
    };
  });
}

// Token generation utilities
export function generateTokenPair(fastify: FastifyInstance, payload: JWTPayload): { accessToken: string; refreshToken: string } {
  const accessToken = fastify.jwt.sign(payload, {
    expiresIn: env.JWT_ACCESS_EXPIRY,
  });

  // Refresh token uses different secret
  const refreshToken = fastify.jwt.sign(
    { userId: payload.userId, sessionId: payload.sessionId },
    { 
      expiresIn: env.JWT_REFRESH_EXPIRY,
      // In production, use a separate secret for refresh tokens
    }
  );

  return { accessToken, refreshToken };
}

export function verifyRefreshToken(fastify: FastifyInstance, token: string): { userId: string; sessionId: string } | null {
  try {
    const decoded = fastify.jwt.verify<{ userId: string; sessionId: string }>(token);
    return decoded;
  } catch {
    return null;
  }
}

// Declare decorators
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
