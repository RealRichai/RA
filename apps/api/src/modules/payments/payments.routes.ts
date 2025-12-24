/**
 * Payments Routes
 * REST API endpoints for payment processing
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as paymentsService from './payments.service.js';
import {
  CreatePaymentSchema,
  RecordPaymentSchema,
  SchedulePaymentsSchema,
  RefundSchema,
  PaymentFiltersSchema,
  PaymentPaginationSchema,
} from './payments.schemas.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { UserRole } from '@prisma/client';
import { AppError, ErrorCode } from '../../lib/errors.js';

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  // ==========================================================================
  // CREATE & LIST
  // ==========================================================================

  /**
   * Create payment
   */
  app.post(
    '/',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const validation = CreatePaymentSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid payment data',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await paymentsService.createPayment(validation.data, request.auth!.userId);
      if (result.isErr()) throw result.error;
      return reply.status(201).send({ payment: result.value });
    }
  );

  /**
   * Schedule recurring payments
   */
  app.post(
    '/schedule',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const validation = SchedulePaymentsSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid schedule data',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await paymentsService.schedulePayments(validation.data, request.auth!.userId);
      if (result.isErr()) throw result.error;
      return reply.status(201).send({ payments: result.value });
    }
  );

  /**
   * List payments
   */
  app.get(
    '/',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filtersValidation = PaymentFiltersSchema.safeParse(request.query);
      const paginationValidation = PaymentPaginationSchema.safeParse(request.query);

      if (!filtersValidation.success || !paginationValidation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid query parameters',
        });
      }

      const result = await paymentsService.listPayments(
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
   * Get my payments (as tenant)
   */
  app.get(
    '/my',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paginationValidation = PaymentPaginationSchema.safeParse(request.query);
      if (!paginationValidation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid query parameters',
        });
      }

      const result = await paymentsService.listPayments(
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
   * Get overdue payments
   */
  app.get(
    '/overdue',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const landlordId = request.auth!.role === 'LANDLORD' ? request.auth!.userId : undefined;
      const result = await paymentsService.getOverduePayments(landlordId);
      if (result.isErr()) throw result.error;
      return reply.send({ payments: result.value });
    }
  );

  // ==========================================================================
  // SINGLE PAYMENT
  // ==========================================================================

  /**
   * Get payment by ID
   */
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await paymentsService.getPayment(
        request.params.id,
        request.auth!.userId,
        request.auth!.role
      );

      if (result.isErr()) throw result.error;
      return reply.send({ payment: result.value });
    }
  );

  /**
   * Record payment
   */
  app.post<{ Params: { id: string } }>(
    '/:id/record',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const validation = RecordPaymentSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid payment record',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await paymentsService.recordPayment(
        request.params.id,
        validation.data,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({ payment: result.value });
    }
  );

  /**
   * Process refund
   */
  app.post<{ Params: { id: string } }>(
    '/:id/refund',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.AGENT, UserRole.ADMIN])] },
    async (request, reply) => {
      const validation = RefundSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid refund data',
        });
      }

      const result = await paymentsService.processRefund(
        request.params.id,
        validation.data,
        request.auth!.userId
      );

      if (result.isErr()) throw result.error;
      return reply.send({ payment: result.value });
    }
  );

  // ==========================================================================
  // LEASE PAYMENTS
  // ==========================================================================

  /**
   * Get payment summary for lease
   */
  app.get<{ Params: { leaseId: string } }>(
    '/lease/:leaseId/summary',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await paymentsService.getPaymentSummary(
        request.params.leaseId,
        request.auth!.userId,
        request.auth!.role
      );

      if (result.isErr()) throw result.error;
      return reply.send({ summary: result.value });
    }
  );
}
