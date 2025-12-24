/**
 * Users Routes
 * REST API endpoints for user management
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as usersService from './users.service.js';
import {
  UpdateUserSchema,
  UserFiltersSchema,
  PaginationSchema,
  UpdateStatusSchema,
  UpdateSubscriptionSchema,
} from './users.schemas.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { UserRole } from '@prisma/client';
import { AppError, ErrorCode } from '../../lib/errors.js';

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // ==========================================================================
  // USER PROFILE
  // ==========================================================================

  /**
   * Get current user profile
   */
  app.get(
    '/me',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await usersService.getUser(request.auth!.userId);
      if (result.isErr()) throw result.error;
      return reply.send({ user: result.value });
    }
  );

  /**
   * Update current user profile
   */
  app.patch(
    '/me',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const validation = UpdateUserSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid update data',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await usersService.updateUser(
        request.auth!.userId,
        validation.data,
        request.auth!.userId,
        request.auth!.role
      );

      if (result.isErr()) throw result.error;
      return reply.send({ user: result.value });
    }
  );

  /**
   * Delete current user account
   */
  app.delete(
    '/me',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await usersService.deleteUser(
        request.auth!.userId,
        request.auth!.userId,
        request.auth!.role
      );

      if (result.isErr()) throw result.error;
      return reply.status(204).send();
    }
  );

  // ==========================================================================
  // USER MANAGEMENT (Admin)
  // ==========================================================================

  /**
   * List users (Admin only)
   */
  app.get(
    '/',
    { preHandler: [requireAuth, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filtersValidation = UserFiltersSchema.safeParse(request.query);
      const paginationValidation = PaginationSchema.safeParse(request.query);

      if (!filtersValidation.success || !paginationValidation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid query parameters',
        });
      }

      const result = await usersService.listUsers(
        filtersValidation.data,
        paginationValidation.data
      );

      if (result.isErr()) throw result.error;
      return reply.send(result.value);
    }
  );

  /**
   * Get user by ID (Admin only)
   */
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN])] },
    async (request, reply) => {
      const result = await usersService.getUser(request.params.id);
      if (result.isErr()) throw result.error;
      return reply.send({ user: result.value });
    }
  );

  /**
   * Update user (Admin only)
   */
  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN])] },
    async (request, reply) => {
      const validation = UpdateUserSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid update data',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await usersService.updateUser(
        request.params.id,
        validation.data,
        request.auth!.userId,
        request.auth!.role
      );

      if (result.isErr()) throw result.error;
      return reply.send({ user: result.value });
    }
  );

  /**
   * Update user status (Admin only)
   */
  app.patch<{ Params: { id: string } }>(
    '/:id/status',
    { preHandler: [requireAuth, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN])] },
    async (request, reply) => {
      const validation = UpdateStatusSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid status',
        });
      }

      const result = await usersService.updateUserStatus(
        request.params.id,
        validation.data.status,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({ user: result.value });
    }
  );

  /**
   * Update user subscription (Admin only)
   */
  app.patch<{ Params: { id: string } }>(
    '/:id/subscription',
    { preHandler: [requireAuth, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN])] },
    async (request, reply) => {
      const validation = UpdateSubscriptionSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid subscription data',
        });
      }

      const result = await usersService.updateSubscription(
        request.params.id,
        validation.data.tier,
        validation.data.expiresAt ?? null,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({ user: result.value });
    }
  );

  /**
   * Delete user (Admin only)
   */
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN])] },
    async (request, reply) => {
      const result = await usersService.deleteUser(
        request.params.id,
        request.auth!.userId,
        request.auth!.role
      );

      if (result.isErr()) throw result.error;
      return reply.status(204).send();
    }
  );

  // ==========================================================================
  // VERIFICATION
  // ==========================================================================

  /**
   * Verify email (with token)
   */
  app.post<{ Params: { id: string } }>(
    '/:id/verify-email',
    { preHandler: [requireAuth, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN])] },
    async (request, reply) => {
      const result = await usersService.verifyUserEmail(request.params.id);
      if (result.isErr()) throw result.error;
      return reply.send({ user: result.value, message: 'Email verified' });
    }
  );

  /**
   * Verify phone (with token)
   */
  app.post<{ Params: { id: string } }>(
    '/:id/verify-phone',
    { preHandler: [requireAuth, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN])] },
    async (request, reply) => {
      const result = await usersService.verifyUserPhone(request.params.id);
      if (result.isErr()) throw result.error;
      return reply.send({ user: result.value, message: 'Phone verified' });
    }
  );

  // ==========================================================================
  // ROLE-SPECIFIC QUERIES
  // ==========================================================================

  /**
   * Get agents by state
   */
  app.get<{ Params: { state: string } }>(
    '/agents/state/:state',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paginationValidation = PaginationSchema.safeParse(request.query);
      if (!paginationValidation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid pagination parameters',
        });
      }

      const result = await usersService.getAgentsByState(
        request.params.state.toUpperCase(),
        paginationValidation.data
      );

      if (result.isErr()) throw result.error;
      return reply.send(result.value);
    }
  );

  /**
   * Get accredited investors (Admin/Investor only)
   */
  app.get(
    '/investors/accredited',
    { preHandler: [requireAuth, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.INVESTOR])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paginationValidation = PaginationSchema.safeParse(request.query);
      if (!paginationValidation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid pagination parameters',
        });
      }

      const result = await usersService.getAccreditedInvestors(paginationValidation.data);
      if (result.isErr()) throw result.error;
      return reply.send(result.value);
    }
  );

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get user statistics (Admin only)
   */
  app.get(
    '/statistics',
    { preHandler: [requireAuth, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await usersService.getUserStatistics();
      if (result.isErr()) throw result.error;
      return reply.send(result.value);
    }
  );
}
