/**
 * Leases Routes
 * REST API endpoints for lease management
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as leasesService from './leases.service.js';
import {
  CreateLeaseSchema,
  RenewalOfferSchema,
  RenewalResponseSchema,
  TerminationRequestSchema,
  MoveOutInspectionSchema,
  LeaseFiltersSchema,
  LeasePaginationSchema,
} from './leases.schemas.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { UserRole } from '@prisma/client';
import { AppError, ErrorCode } from '../../lib/errors.js';

export async function leaseRoutes(app: FastifyInstance): Promise<void> {
  // ==========================================================================
  // CREATE & LIST
  // ==========================================================================

  /**
   * Create new lease
   */
  app.post(
    '/',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const validation = CreateLeaseSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid lease data',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await leasesService.createLease(validation.data, request.auth!.userId);
      if (result.isErr()) throw result.error;
      return reply.status(201).send({ lease: result.value });
    }
  );

  /**
   * List leases
   */
  app.get(
    '/',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filtersValidation = LeaseFiltersSchema.safeParse(request.query);
      const paginationValidation = LeasePaginationSchema.safeParse(request.query);

      if (!filtersValidation.success || !paginationValidation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid query parameters',
        });
      }

      const result = await leasesService.listLeases(
        filtersValidation.data,
        paginationValidation.data,
        request.auth!.userId,
        request.auth!.role
      );

      if (result.isErr()) throw result.error;
      return reply.send(result.value);
    }
  );

  /**
   * Get my leases (as tenant)
   */
  app.get(
    '/my',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paginationValidation = LeasePaginationSchema.safeParse(request.query);
      if (!paginationValidation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid query parameters',
        });
      }

      const result = await leasesService.listLeases(
        { tenantId: request.auth!.userId },
        paginationValidation.data,
        request.auth!.userId,
        request.auth!.role
      );

      if (result.isErr()) throw result.error;
      return reply.send(result.value);
    }
  );

  /**
   * Get expiring leases
   */
  app.get(
    '/expiring',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request: FastifyRequest<{ Querystring: { days?: string } }>, reply: FastifyReply) => {
      const days = parseInt(request.query.days || '90', 10);
      const landlordId = request.auth!.role === 'LANDLORD' ? request.auth!.userId : undefined;

      const result = await leasesService.getExpiringLeases(days, landlordId);
      if (result.isErr()) throw result.error;
      return reply.send({ leases: result.value });
    }
  );

  // ==========================================================================
  // SINGLE LEASE
  // ==========================================================================

  /**
   * Get lease by ID
   */
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await leasesService.getLease(
        request.params.id,
        request.auth!.userId,
        request.auth!.role
      );

      if (result.isErr()) throw result.error;
      return reply.send({ lease: result.value });
    }
  );

  /**
   * Activate lease (after signatures)
   */
  app.post<{ Params: { id: string } }>(
    '/:id/activate',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request, reply) => {
      const result = await leasesService.activateLease(
        request.params.id,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({ lease: result.value });
    }
  );

  // ==========================================================================
  // RENEWAL
  // ==========================================================================

  /**
   * Send renewal offer
   */
  app.post<{ Params: { id: string } }>(
    '/:id/renewal-offer',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request, reply) => {
      const validation = RenewalOfferSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid renewal offer',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await leasesService.sendRenewalOffer(
        request.params.id,
        validation.data,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({ lease: result.value, message: 'Renewal offer sent' });
    }
  );

  /**
   * Respond to renewal offer (tenant)
   */
  app.post<{ Params: { id: string } }>(
    '/:id/renewal-response',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const validation = RenewalResponseSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid response',
        });
      }

      const result = await leasesService.respondToRenewalOffer(
        request.params.id,
        validation.data,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({ lease: result.value });
    }
  );

  /**
   * Convert to month-to-month
   */
  app.post<{ Params: { id: string } }>(
    '/:id/month-to-month',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request, reply) => {
      const result = await leasesService.convertToMonthToMonth(
        request.params.id,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({ lease: result.value });
    }
  );

  // ==========================================================================
  // TERMINATION
  // ==========================================================================

  /**
   * Request termination
   */
  app.post<{ Params: { id: string } }>(
    '/:id/termination',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const validation = TerminationRequestSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid termination request',
        });
      }

      const result = await leasesService.requestTermination(
        request.params.id,
        validation.data,
        request.auth!.userId,
        request.auth!.role
      );

      if (result.isErr()) throw result.error;
      return reply.send({ lease: result.value });
    }
  );

  // ==========================================================================
  // MOVE OUT
  // ==========================================================================

  /**
   * Record move out inspection
   */
  app.post<{ Params: { id: string } }>(
    '/:id/move-out-inspection',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request, reply) => {
      const validation = MoveOutInspectionSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid inspection data',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await leasesService.recordMoveOutInspection(
        request.params.id,
        validation.data,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({ lease: result.value });
    }
  );
}
