/**
 * Auth Routes
 * Fastify REST API routes for authentication
 */

import type { FastifyInstance } from 'fastify';
import * as authService from './auth.service.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  type RegisterInput,
  type LoginInput,
  type RefreshTokenInput,
} from './auth.schemas.js';
import { authenticate } from './auth.middleware.js';
import { AppError, ErrorCode } from '../../lib/errors.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RegisterInput }>(
    '/register',
    { schema: { description: 'Register a new user', tags: ['Auth'] } },
    async (request, reply) => {
      const validation = registerSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid registration data',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await authService.register(validation.data);
      if (result.isErr()) throw result.error;

      return reply.status(201).send(result.value);
    }
  );

  app.post<{ Body: LoginInput }>(
    '/login',
    { schema: { description: 'Login user', tags: ['Auth'] } },
    async (request, reply) => {
      const validation = loginSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid login data',
        });
      }

      const result = await authService.login({
        ...validation.data,
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      });

      if (result.isErr()) throw result.error;
      return reply.send(result.value);
    }
  );

  app.post<{ Body: RefreshTokenInput }>(
    '/refresh',
    { schema: { description: 'Refresh tokens', tags: ['Auth'] } },
    async (request, reply) => {
      const validation = refreshTokenSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid refresh token',
        });
      }

      const result = await authService.refreshTokens(validation.data.refreshToken);
      if (result.isErr()) throw result.error;

      return reply.send(result.value);
    }
  );

  app.post(
    '/logout',
    { preHandler: [authenticate], schema: { description: 'Logout user', tags: ['Auth'], security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      if (!request.auth) {
        throw new AppError({ code: ErrorCode.AUTH_TOKEN_INVALID, message: 'Not authenticated' });
      }

      const result = await authService.logout(request.auth.sessionId);
      if (result.isErr()) throw result.error;

      return reply.send({ message: 'Logged out successfully' });
    }
  );

  app.get(
    '/me',
    { preHandler: [authenticate], schema: { description: 'Get current user', tags: ['Auth'], security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      return reply.send({ user: request.auth });
    }
  );
}
