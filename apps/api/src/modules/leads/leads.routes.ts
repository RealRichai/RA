/**
 * Leads & Tours Routes
 * REST API endpoints for lead management and tour scheduling
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as leadsService from './leads.service.js';
import {
  CreateLeadSchema,
  UpdateLeadSchema,
  ScheduleTourSchema,
  UpdateTourSchema,
  TourFeedbackSchema,
  LeadFiltersSchema,
  TourFiltersSchema,
  PaginationSchema,
} from './leads.schemas.js';
import { requireAuth, optionalAuth, requireRole } from '../auth/auth.middleware.js';
import { UserRole } from '@prisma/client';
import { AppError, ErrorCode } from '../../lib/errors.js';

export async function leadRoutes(app: FastifyInstance): Promise<void> {
  // ==========================================================================
  // LEADS
  // ==========================================================================

  /**
   * Create lead (public - for website inquiries)
   */
  app.post(
    '/',
    { preHandler: [optionalAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const validation = CreateLeadSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid lead data',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await leadsService.createLead(
        validation.data,
        request.auth?.userId
      );

      if (result.isErr()) throw result.error;
      return reply.status(201).send({ lead: result.value });
    }
  );

  /**
   * List leads
   */
  app.get(
    '/',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filtersValidation = LeadFiltersSchema.safeParse(request.query);
      const paginationValidation = PaginationSchema.safeParse(request.query);

      if (!filtersValidation.success || !paginationValidation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid query parameters',
        });
      }

      const result = await leadsService.listLeads(
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
   * Get lead by ID
   */
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await leadsService.getLead(
        request.params.id,
        request.auth!.userId,
        request.auth!.role
      );

      if (result.isErr()) throw result.error;
      return reply.send({ lead: result.value });
    }
  );

  /**
   * Update lead
   */
  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request, reply) => {
      const validation = UpdateLeadSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid update data',
        });
      }

      const result = await leadsService.updateLead(
        request.params.id,
        validation.data,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({ lead: result.value });
    }
  );
}

export async function tourRoutes(app: FastifyInstance): Promise<void> {
  // ==========================================================================
  // TOURS
  // ==========================================================================

  /**
   * Schedule tour
   */
  app.post(
    '/',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const validation = ScheduleTourSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid tour data',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await leadsService.scheduleTour(
        validation.data,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.status(201).send({ tour: result.value });
    }
  );

  /**
   * List tours
   */
  app.get(
    '/',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filtersValidation = TourFiltersSchema.safeParse(request.query);
      const paginationValidation = PaginationSchema.safeParse(request.query);

      if (!filtersValidation.success || !paginationValidation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid query parameters',
        });
      }

      const result = await leadsService.listTours(
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
   * Get upcoming tours
   */
  app.get(
    '/upcoming',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Querystring: { days?: string } }>, reply: FastifyReply) => {
      const days = parseInt(request.query.days || '7', 10);
      const result = await leadsService.getUpcomingTours(request.auth!.userId, days);
      if (result.isErr()) throw result.error;
      return reply.send({ tours: result.value });
    }
  );

  /**
   * Get tour by ID
   */
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await leadsService.getTour(
        request.params.id,
        request.auth!.userId,
        request.auth!.role
      );

      if (result.isErr()) throw result.error;
      return reply.send({ tour: result.value });
    }
  );

  /**
   * Update tour
   */
  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const validation = UpdateTourSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid update data',
        });
      }

      const result = await leadsService.updateTour(
        request.params.id,
        validation.data,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({ tour: result.value });
    }
  );

  /**
   * Record tour feedback
   */
  app.post<{ Params: { id: string } }>(
    '/:id/feedback',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request, reply) => {
      const validation = TourFeedbackSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid feedback data',
        });
      }

      const result = await leadsService.recordTourFeedback(
        request.params.id,
        validation.data,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({ tour: result.value });
    }
  );
}
