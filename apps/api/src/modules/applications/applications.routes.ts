/**
 * Applications Routes
 * REST API endpoints with Fair Chance Housing Act compliance
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as applicationsService from './applications.service.js';
import {
  CreateApplicationSchema,
  ApplicationDecisionSchema,
  IndividualAssessmentSchema,
  GuarantorReferralSchema,
  ApplicationFiltersSchema,
  ApplicationPaginationSchema,
} from './applications.schemas.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { UserRole } from '@prisma/client';
import { AppError, ErrorCode } from '../../lib/errors.js';

export async function applicationRoutes(app: FastifyInstance): Promise<void> {
  // ==========================================================================
  // CREATE & LIST
  // ==========================================================================

  /**
   * Create new application
   */
  app.post(
    '/',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const validation = CreateApplicationSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid application data',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await applicationsService.createApplication(
        request.auth!.userId,
        validation.data
      );

      if (result.isErr()) throw result.error;
      return reply.status(201).send({
        application: result.value,
        fairChanceNotice: result.value.fairChanceStatus.applies
          ? 'Per NYC Fair Chance Housing Act, criminal history inquiry is deferred until after a conditional offer is made.'
          : null,
      });
    }
  );

  /**
   * List applications
   */
  app.get(
    '/',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filtersValidation = ApplicationFiltersSchema.safeParse(request.query);
      const paginationValidation = ApplicationPaginationSchema.safeParse(request.query);

      if (!filtersValidation.success || !paginationValidation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid query parameters',
        });
      }

      const result = await applicationsService.listApplications(
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
   * Get my applications
   */
  app.get(
    '/my',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paginationValidation = ApplicationPaginationSchema.safeParse(request.query);
      if (!paginationValidation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid query parameters',
        });
      }

      const result = await applicationsService.listApplications(
        { applicantId: request.auth!.userId },
        paginationValidation.data,
        request.auth!.userId,
        request.auth!.role
      );

      if (result.isErr()) throw result.error;
      return reply.send(result.value);
    }
  );

  // ==========================================================================
  // SINGLE APPLICATION
  // ==========================================================================

  /**
   * Get application by ID
   */
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await applicationsService.getApplication(
        request.params.id,
        request.auth!.userId,
        request.auth!.role
      );

      if (result.isErr()) throw result.error;
      return reply.send({ application: result.value });
    }
  );

  /**
   * Withdraw application
   */
  app.post<{ Params: { id: string } }>(
    '/:id/withdraw',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await applicationsService.withdrawApplication(
        request.params.id,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({ message: 'Application withdrawn' });
    }
  );

  // ==========================================================================
  // DECISION MAKING (Landlord/Agent)
  // ==========================================================================

  /**
   * Make decision on application
   */
  app.post<{ Params: { id: string } }>(
    '/:id/decision',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request, reply) => {
      const validation = ApplicationDecisionSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid decision data',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await applicationsService.makeDecision(
        request.params.id,
        validation.data,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({
        application: result.value,
        nextSteps: result.value.fairChanceStatus.applies && result.value.status === 'CONDITIONAL_OFFER'
          ? 'Per Fair Chance Housing Act, you may now conduct criminal history inquiry. If criminal history is disclosed, individual assessment is required before final decision.'
          : null,
      });
    }
  );

  // ==========================================================================
  // FAIR CHANCE HOUSING ACT
  // ==========================================================================

  /**
   * Conduct individual assessment (Fair Chance Housing Act)
   */
  app.post<{ Params: { id: string } }>(
    '/:id/individual-assessment',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request, reply) => {
      const validation = IndividualAssessmentSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid assessment data',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await applicationsService.conductIndividualAssessment(
        request.params.id,
        validation.data,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({
        application: result.value,
        message: 'Individual assessment completed per Fair Chance Housing Act',
      });
    }
  );

  // ==========================================================================
  // GUARANTOR (TheGuarantors Integration)
  // ==========================================================================

  /**
   * Send guarantor referral
   */
  app.post<{ Params: { id: string } }>(
    '/:id/guarantor-referral',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request, reply) => {
      const validation = GuarantorReferralSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid referral data',
        });
      }

      const result = await applicationsService.sendGuarantorReferral(
        request.params.id,
        validation.data,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({
        application: result.value,
        message: 'Guarantor referral sent',
      });
    }
  );
}
